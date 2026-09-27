import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import {
  ANALYZE_SYSTEM,
  DEFAULT_RECONSTRUCT_PROMPT,
  VERIFY_SYSTEM,
  getPrompt,
  VOICEPRINT_SYSTEM,
  reconstructUserPrompt,
  verifyUserPrompt,
} from "../prompts";
import type { AIProvider, CallMeta, GenerationSettings, ReconstructInput, StructuredCaller } from "./provider";
import { ProviderError, reportGeneration } from "./provider";
import { candidateSchema, discourseAnalysisSchema, meaningCheckSchema, parseModelJson, voiceprintObservationsSchema } from "./schemas";
import type { TextAnalysis } from "../analysis/analyze";

/**
 * Anthropic implementation. Uses structured outputs so responses arrive as
 * JSON matching our Zod schemas, then re-validates them anyway.
 *
 * This module has no "server-only" guard so the developer evaluation CLI can
 * use it; the web app imports it through ./anthropic, which adds the guard.
 * Sampling parameters are left at the model's defaults.
 */
export class AnthropicProvider implements AIProvider, StructuredCaller {
  readonly info;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly generation: GenerationSettings = {},
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
    this.info = { mode: "live" as const, provider: "anthropic", model };
  }

  generationReport() {
    // Thinking budgets change the response shape and are not wired here; seed is not an API parameter.
    return reportGeneration(this.generation, ["temperature", "topP", "topK", "maxTokens"]);
  }

  callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
    return this.structured(schema, system, user, this.generation.maxTokens ?? 4000);
  }

  private async structured<T>(schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<{ data: T; meta: CallMeta }> {
    const started = Date.now();
    const g = this.generation;
    try {
      const message = await this.client.messages.parse({
        model: this.model,
        max_tokens: g.maxTokens ?? maxTokens,
        ...(g.temperature !== undefined ? { temperature: g.temperature } : {}),
        ...(g.topP !== undefined ? { top_p: g.topP } : {}),
        ...(g.topK !== undefined ? { top_k: g.topK } : {}),
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema as z.ZodType<T> & z.ZodObject) },
      });
      const parsed = parseModelJson(schema, message.parsed_output ?? null);
      const meta: CallMeta = {
        latencyMs: Date.now() - started,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        stopReason: message.stop_reason ?? null,
        requestId: (message as { _request_id?: string | null })._request_id ?? null,
      };
      if (!parsed.ok) throw new ProviderError(parsed.error, "invalid_output", meta);
      return { data: parsed.data, meta };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const meta: CallMeta = { latencyMs: Date.now() - started, httpStatus: err instanceof Anthropic.APIError ? (err.status ?? null) : null };
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError("The writing model is busy. Try again in a moment.", "rate_limited", meta);
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
        throw new ProviderError("The writing model rejected this server's credentials. Check ANTHROPIC_API_KEY.", "unavailable", meta);
      if (err instanceof Anthropic.APIError) throw new ProviderError(`The writing model returned an error (${err.status ?? "network"}).`, "upstream", meta);
      throw new ProviderError("The writing model could not be reached.", "upstream", meta);
    }
  }

  async analyzeText(text: string, analysis: TextAnalysis) {
    const hints = `Measured: ${analysis.counts.sentences} sentences, mean ${analysis.sentenceLength.mean} words (variation ${analysis.sentenceLength.variation}).`;
    return (await this.structured(discourseAnalysisSchema, ANALYZE_SYSTEM, `${hints}\n\n<source>\n${text}\n</source>`, 1500)).data;
  }

  async reconstructText(input: ReconstructInput) {
    const budget = Math.min(16_000, Math.max(1024, Math.ceil((input.current ?? input.source).length / 2.5)));
    const prompt = input.strategy?.prompt ?? DEFAULT_RECONSTRUCT_PROMPT;
    const { data, meta } = await this.structured(candidateSchema, getPrompt(prompt).system, reconstructUserPrompt({ ...input, prompt }), budget);
    return { ...data, meta };
  }

  async verifyMeaning(source: string, candidate: string): Promise<Finding[]> {
    const { data: out } = await this.structured(meaningCheckSchema, VERIFY_SYSTEM, verifyUserPrompt(source, candidate), 2000);
    return out.findings.map((f) => ({ ...f, origin: "model" as const }));
  }

  async analyzeVoiceprint(samples: string[]): Promise<Observation[]> {
    const body = samples.map((s, i) => `<samples index="${i + 1}">\n${s}\n</samples>`).join("\n\n");
    const { data: out } = await this.structured(voiceprintObservationsSchema, VOICEPRINT_SYSTEM, body, 1200);
    return out.observations.map((o, i) => ({ id: `model-${i}`, text: o.text, confidence: o.confidence, source: "model" as const }));
  }
}
