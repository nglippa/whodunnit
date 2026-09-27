import { z } from "zod";
import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import type { TextAnalysis } from "../analysis/analyze";
import { ANALYZE_SYSTEM, DEFAULT_RECONSTRUCT_PROMPT, VERIFY_SYSTEM, VOICEPRINT_SYSTEM, getPrompt, reconstructUserPrompt, verifyUserPrompt } from "../prompts";
import type { AIProvider, CallMeta, ReconstructInput } from "./provider";
import { ProviderError } from "./provider";
import { candidateSchema, discourseAnalysisSchema, meaningCheckSchema, parseModelJson, voiceprintObservationsSchema } from "./schemas";

/**
 * Any server that speaks the OpenAI chat-completions format: a local
 * llama.cpp server (e.g. Bonsai), Ollama, LM Studio, Groq, OpenRouter.
 * Output is constrained with response_format json_schema where the server
 * supports it, and always re-validated with our Zod schemas.
 *
 * Reasoning models return their thinking in `reasoning_content`, which is
 * ignored. Sampling is left to the server's configuration.
 *
 * Requests stream (SSE). A local reasoning model can think for many minutes
 * before answering; without streaming no response headers arrive until it
 * finishes, and Node's fetch aborts after five minutes without headers.
 * Servers that ignore `stream` and reply with plain JSON are handled too.
 */

export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://127.0.0.1:8080/v1";

export interface OpenAICompatibleOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  /** Whole-request limit. Local reasoning models can be slow; default 20 minutes. */
  timeoutMs?: number;
  maxTokens?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/** JSON Schema for a Zod schema, in the shape response_format expects. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

interface ChatResponse {
  id?: string;
  choices?: { message?: { content?: string | null }; delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/** Assemble a chat completion from an SSE stream, or read a plain JSON reply. */
export async function readCompletion(res: Response): Promise<{ id?: string; content: string; finishReason: string | null; usage?: ChatResponse["usage"] }> {
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const json = (await res.json().catch(() => null)) as ChatResponse | null;
    const c = json?.choices?.[0];
    return { id: json?.id, content: c?.message?.content ?? "", finishReason: c?.finish_reason ?? null, usage: json?.usage };
  }
  const out: { id?: string; content: string; finishReason: string | null; usage?: ChatResponse["usage"] } = { content: "", finishReason: null };
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: ChatResponse;
    try {
      chunk = JSON.parse(data) as ChatResponse;
    } catch {
      return;
    }
    out.id ??= chunk.id;
    const c = chunk.choices?.[0];
    if (c?.delta?.content) out.content += c.delta.content; // reasoning_content deltas are ignored
    if (c?.finish_reason) out.finishReason = c.finish_reason;
    if (chunk.usage) out.usage = chunk.usage;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl).trimEnd());
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer.trim());
  return out;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly info;
  private readonly baseUrl: string;
  private readonly o: Required<Omit<OpenAICompatibleOptions, "apiKey" | "baseUrl">> & { apiKey?: string };

  constructor(
    private readonly model: string,
    options: OpenAICompatibleOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL).replace(/\/+$/, "");
    const host = (() => {
      try {
        return new URL(this.baseUrl).host;
      } catch {
        throw new ProviderError(`Invalid base URL "${this.baseUrl}".`, "unavailable");
      }
    })();
    this.info = { mode: "live" as const, provider: `openai-compatible@${host}`, model };
    this.o = {
      apiKey: options.apiKey,
      fetch: options.fetch ?? fetch,
      timeoutMs: options.timeoutMs ?? 1_200_000,
      maxTokens: options.maxTokens ?? 16_384,
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 2000,
    };
  }

  private async structured<T>(zod: z.ZodType<T>, name: string, system: string, user: string): Promise<{ data: T; meta: CallMeta }> {
    const started = Date.now();
    const body = JSON.stringify({
      model: this.model,
      max_tokens: this.o.maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema: jsonSchemaFor(zod) } },
      stream: true,
      stream_options: { include_usage: true },
    });
    const signal = AbortSignal.timeout(this.o.timeoutMs);
    const timedOut = () => new ProviderError(`The model did not finish within ${Math.round(this.o.timeoutMs / 60_000)} minutes.`, "upstream", { latencyMs: Date.now() - started, httpStatus: null });
    let res: Response | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await this.o.fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(this.o.apiKey ? { Authorization: `Bearer ${this.o.apiKey}` } : {}) },
          body,
          signal,
        });
      } catch {
        // A timeout is not retried: re-sending would repeat minutes of generation.
        if (signal.aborted) throw timedOut();
        if (attempt < this.o.maxRetries) continue;
        throw new ProviderError(`The model server at ${this.baseUrl} could not be reached. Is it running?`, "unavailable", { latencyMs: Date.now() - started, httpStatus: null });
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.o.maxRetries) {
        const after = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Math.min(60_000, Number.isFinite(after) && after > 0 ? after * 1000 : this.o.retryDelayMs * 2 ** attempt)));
        continue;
      }
      break;
    }
    const status = res.status;
    const failMeta: CallMeta = { latencyMs: Date.now() - started, httpStatus: status };
    if (status === 401 || status === 403) throw new ProviderError("The model server rejected the credentials.", "unavailable", failMeta);
    if (status === 429) throw new ProviderError("The writing model is busy. Try again in a moment.", "rate_limited", failMeta);
    if (!res.ok) throw new ProviderError(`The model server returned an error (${status}).`, "upstream", failMeta);

    let completion: Awaited<ReturnType<typeof readCompletion>>;
    try {
      completion = await readCompletion(res);
    } catch {
      if (signal.aborted) throw timedOut();
      throw new ProviderError("The model server closed the connection mid-answer.", "upstream", { latencyMs: Date.now() - started, httpStatus: status });
    }
    const meta: CallMeta = {
      latencyMs: Date.now() - started,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
      stopReason: completion.finishReason,
      requestId: completion.id ?? null,
      httpStatus: status,
    };
    const text = completion.content;
    if (!text.trim()) throw new ProviderError(completion.finishReason === "length" ? "The model ran out of output tokens before answering." : "The model returned no content.", "invalid_output", meta);
    const parsed = parseModelJson(zod, text);
    if (!parsed.ok) throw new ProviderError(parsed.error, "invalid_output", meta);
    return { data: parsed.data, meta };
  }

  async analyzeText(text: string, analysis: TextAnalysis) {
    const hints = `Measured: ${analysis.counts.sentences} sentences, mean ${analysis.sentenceLength.mean} words (variation ${analysis.sentenceLength.variation}).`;
    return (await this.structured(discourseAnalysisSchema, "discourse", ANALYZE_SYSTEM, `${hints}\n\n<source>\n${text}\n</source>`)).data;
  }

  async reconstructText(input: ReconstructInput) {
    const prompt = input.strategy?.prompt ?? DEFAULT_RECONSTRUCT_PROMPT;
    const { data, meta } = await this.structured(candidateSchema, "candidate", getPrompt(prompt).system, reconstructUserPrompt({ ...input, prompt }));
    return { ...data, meta };
  }

  async verifyMeaning(source: string, candidate: string): Promise<Finding[]> {
    const { data } = await this.structured(meaningCheckSchema, "meaning_check", VERIFY_SYSTEM, verifyUserPrompt(source, candidate));
    return data.findings.map((f) => ({ ...f, origin: "model" as const }));
  }

  async analyzeVoiceprint(samples: string[]): Promise<Observation[]> {
    const body = samples.map((s, i) => `<samples index="${i + 1}">\n${s}\n</samples>`).join("\n\n");
    const { data } = await this.structured(voiceprintObservationsSchema, "observations", VOICEPRINT_SYSTEM, body);
    return data.observations.map((o, i) => ({ id: `model-${i}`, text: o.text, confidence: o.confidence, source: "model" as const }));
  }
}
