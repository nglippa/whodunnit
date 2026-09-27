import { z } from "zod";
import { FINDING_KINDS, type Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import type { TextAnalysis } from "../analysis/analyze";
import { ANALYZE_SYSTEM, DEFAULT_RECONSTRUCT_PROMPT, VERIFY_SYSTEM, VOICEPRINT_SYSTEM, getPrompt, reconstructUserPrompt, verifyUserPrompt } from "../prompts";
import type { AIProvider, CallMeta, GenerationSettings, ReconstructInput, StructuredCaller } from "./provider";
import { ProviderError, reportGeneration } from "./provider";
import { candidateSchema, discourseAnalysisSchema, meaningCheckSchema, parseModelJson, voiceprintObservationsSchema } from "./schemas";

/**
 * Google Gemini implementation over the REST generateContent endpoint (no
 * SDK dependency). Responses are constrained with a responseSchema and then
 * re-validated with the same Zod schemas as every other provider: model
 * output is untrusted input.
 *
 * No "server-only" guard here so the evaluation CLI can use it; the web app
 * imports it through ./gemini. Sampling parameters are left at the model's
 * defaults. The key is sent in a header, never in the URL.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini's OpenAPI-style schema subset. */
type GSchema =
  | { type: "STRING"; enum?: readonly string[] }
  | { type: "NUMBER" }
  | { type: "INTEGER" }
  | { type: "BOOLEAN" }
  | { type: "ARRAY"; items: GSchema; maxItems?: string }
  | { type: "OBJECT"; properties: Record<string, GSchema>; required: string[]; propertyOrdering?: string[] };

const str: GSchema = { type: "STRING" };
const obj = (properties: Record<string, GSchema>, optional: string[] = []): GSchema => ({
  type: "OBJECT",
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  propertyOrdering: Object.keys(properties),
});
const arr = (items: GSchema, max: number): GSchema => ({ type: "ARRAY", items, maxItems: String(max) });

export const GEMINI_SCHEMAS = {
  candidate: obj({ text: str, changes: arr(str, 8) }),
  discourse: obj({ argumentShape: str, claims: arr(str, 20), styleIssues: arr(str, 10) }),
  meaning: obj({
    findings: arr(obj({ kind: { type: "STRING", enum: FINDING_KINDS }, severity: { type: "STRING", enum: ["blocking", "warning"] }, message: str, source: str, candidate: str }, ["source", "candidate"]), 20),
  }),
  observations: obj({ observations: arr(obj({ text: str, confidence: { type: "NUMBER" } }), 8) }),
} satisfies Record<string, GSchema>;

/** Convert a (Zod-generated) JSON Schema to Gemini's OpenAPI-style subset. */
export function toGeminiSchema(js: Record<string, unknown>): GSchema {
  const t = js.type as string | undefined;
  if (t === "object") {
    const props = (js.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (js.required ?? []) as string[];
    return { type: "OBJECT", properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)])), required, propertyOrdering: Object.keys(props) };
  }
  if (t === "array") return { type: "ARRAY", items: toGeminiSchema((js.items ?? { type: "string" }) as Record<string, unknown>), ...(typeof js.maxItems === "number" ? { maxItems: String(js.maxItems) } : {}) };
  if (t === "number") return { type: "NUMBER" };
  if (t === "integer") return { type: "INTEGER" };
  if (t === "boolean") return { type: "BOOLEAN" };
  return { type: "STRING", ...(Array.isArray(js.enum) ? { enum: js.enum as string[] } : {}) };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  responseId?: string;
}

/**
 * What a 429/5xx says about retrying: the delay the server asked for, and
 * whether the exhausted quota is a daily one (retrying within seconds is
 * pointless then, whatever retryDelay says).
 */
export async function retryHint(res: Response): Promise<{ delayMs: number | null; daily: boolean }> {
  const body = (await res.json().catch(() => null)) as { error?: { details?: { retryDelay?: string; violations?: { quotaId?: string }[] }[] } } | null;
  const details = body?.error?.details ?? [];
  const daily = details.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? "")));
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return { delayMs: header * 1000, daily };
  const m = details.find((d) => typeof d.retryDelay === "string")?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
  return { delayMs: m ? Math.ceil(Number(m[1]) * 1000) : null, daily };
}

export interface GeminiOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Retries on 429 and 5xx, with exponential backoff from retryDelayMs. */
  maxRetries?: number;
  retryDelayMs?: number;
  generation?: GenerationSettings;
}

export class GeminiProvider implements AIProvider, StructuredCaller {
  readonly info;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly generation: GenerationSettings;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    options: GeminiOptions = {},
  ) {
    this.info = { mode: "live" as const, provider: "gemini", model };
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.generation = options.generation ?? {};
  }

  generationReport() {
    // Thinking budgets differ by model generation (budget vs level) and are not wired here.
    return reportGeneration(this.generation, ["temperature", "topP", "topK", "seed", "maxTokens"]);
  }

  callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
    const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
    return this.structured(schema, toGeminiSchema(js), system, user);
  }

  private async structured<T>(zod: z.ZodType<T>, schema: GSchema, system: string, user: string): Promise<{ data: T; meta: CallMeta }> {
    const started = Date.now();
    const g = this.generation;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(g.temperature !== undefined ? { temperature: g.temperature } : {}),
        ...(g.topP !== undefined ? { topP: g.topP } : {}),
        ...(g.topK !== undefined ? { topK: g.topK } : {}),
        ...(g.seed !== undefined ? { seed: g.seed } : {}),
        ...(g.maxTokens !== undefined ? { maxOutputTokens: g.maxTokens } : {}),
      },
    });
    let res: Response | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (attempt < this.maxRetries) continue;
        throw new ProviderError("The writing model could not be reached.", "upstream", { latencyMs: Date.now() - started, httpStatus: null });
      }
      if (res.status === 429 || res.status >= 500) {
        const hint = await retryHint(res);
        if (hint.daily)
          throw new ProviderError(`The daily request quota for ${this.model} is used up. It resets daily; a paid tier or another model has its own quota.`, "rate_limited", { latencyMs: Date.now() - started, httpStatus: res.status });
        if (attempt < this.maxRetries) {
          // Honour the server's requested delay (Retry-After, or RetryInfo.retryDelay in the error body), capped at 60 s.
          await new Promise((r) => setTimeout(r, Math.min(60_000, Math.max(hint.delayMs ?? 0, this.retryDelayMs * 2 ** attempt))));
          continue;
        }
      }
      break;
    }
    const status = res.status;
    const failMeta: CallMeta = { latencyMs: Date.now() - started, httpStatus: status };
    if (status === 401 || status === 403) throw new ProviderError("The writing model rejected this server's credentials. Check GEMINI_API_KEY.", "unavailable", failMeta);
    if (status === 429) throw new ProviderError("The writing model is busy. Try again in a moment.", "rate_limited", failMeta);
    if (status === 404) throw new ProviderError(`The writing model "${this.model}" was not found. Check WHODUNNIT_MODEL.`, "unavailable", failMeta);
    if (!res.ok) throw new ProviderError(`The writing model returned an error (${status}).`, "upstream", failMeta);

    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    const cand = json?.candidates?.[0];
    const u = json?.usageMetadata;
    const meta: CallMeta = {
      latencyMs: Date.now() - started,
      inputTokens: u?.promptTokenCount,
      // Thinking tokens are billed as output, so they are counted here.
      outputTokens: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : undefined,
      stopReason: cand?.finishReason ?? json?.promptFeedback?.blockReason ?? null,
      requestId: json?.responseId ?? null,
      httpStatus: status,
    };
    const text = cand?.content?.parts?.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("") ?? "";
    if (!text) throw new ProviderError(json?.promptFeedback?.blockReason ? "The writing model declined this text." : "The writing model returned no content.", "invalid_output", meta);
    const parsed = parseModelJson(zod, text);
    if (!parsed.ok) throw new ProviderError(parsed.error, "invalid_output", meta);
    return { data: parsed.data, meta };
  }

  async analyzeText(text: string, analysis: TextAnalysis) {
    const hints = `Measured: ${analysis.counts.sentences} sentences, mean ${analysis.sentenceLength.mean} words (variation ${analysis.sentenceLength.variation}).`;
    return (await this.structured(discourseAnalysisSchema, GEMINI_SCHEMAS.discourse, ANALYZE_SYSTEM, `${hints}\n\n<source>\n${text}\n</source>`)).data;
  }

  async reconstructText(input: ReconstructInput) {
    const prompt = input.strategy?.prompt ?? DEFAULT_RECONSTRUCT_PROMPT;
    const { data, meta } = await this.structured(candidateSchema, GEMINI_SCHEMAS.candidate, getPrompt(prompt).system, reconstructUserPrompt({ ...input, prompt }));
    return { ...data, meta };
  }

  async verifyMeaning(source: string, candidate: string): Promise<Finding[]> {
    const { data } = await this.structured(meaningCheckSchema, GEMINI_SCHEMAS.meaning, VERIFY_SYSTEM, verifyUserPrompt(source, candidate));
    return data.findings.map((f) => ({ ...f, origin: "model" as const }));
  }

  async analyzeVoiceprint(samples: string[]): Promise<Observation[]> {
    const body = samples.map((s, i) => `<samples index="${i + 1}">\n${s}\n</samples>`).join("\n\n");
    const { data } = await this.structured(voiceprintObservationsSchema, GEMINI_SCHEMAS.observations, VOICEPRINT_SYSTEM, body);
    return data.observations.map((o, i) => ({ id: `model-${i}`, text: o.text, confidence: o.confidence, source: "model" as const }));
  }
}
