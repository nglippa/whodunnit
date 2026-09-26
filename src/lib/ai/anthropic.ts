import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import {
  ANALYZE_SYSTEM,
  RECONSTRUCT_SYSTEM,
  VERIFY_SYSTEM,
  VOICEPRINT_SYSTEM,
  reconstructUserPrompt,
  verifyUserPrompt,
} from "../prompts";
import type { AIProvider, ReconstructInput } from "./provider";
import { ProviderError } from "./provider";
import { candidateSchema, discourseAnalysisSchema, meaningCheckSchema, parseModelJson, voiceprintObservationsSchema } from "./schemas";
import type { TextAnalysis } from "../analysis/analyze";

/**
 * Anthropic implementation. Uses structured outputs so responses arrive as
 * JSON matching our Zod schemas, then re-validates them anyway.
 */
export class AnthropicProvider implements AIProvider {
  readonly info;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
    this.info = { mode: "live" as const, provider: "anthropic", model };
  }

  private async structured<T>(schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<T> {
    try {
      const message = await this.client.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema as z.ZodType<T> & z.ZodObject) },
      });
      const parsed = parseModelJson(schema, message.parsed_output ?? null);
      if (!parsed.ok) throw new ProviderError(parsed.error, "invalid_output");
      return parsed.data;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError("The writing model is busy. Try again in a moment.", "rate_limited");
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
        throw new ProviderError("The writing model rejected this server's credentials. Check ANTHROPIC_API_KEY.", "unavailable");
      if (err instanceof Anthropic.APIError) throw new ProviderError(`The writing model returned an error (${err.status ?? "network"}).`, "upstream");
      throw new ProviderError("The writing model could not be reached.", "upstream");
    }
  }

  async analyzeText(text: string, analysis: TextAnalysis) {
    const hints = `Measured: ${analysis.counts.sentences} sentences, mean ${analysis.sentenceLength.mean} words (variation ${analysis.sentenceLength.variation}).`;
    return this.structured(discourseAnalysisSchema, ANALYZE_SYSTEM, `${hints}\n\n<source>\n${text}\n</source>`, 1500);
  }

  async reconstructText(input: ReconstructInput) {
    const budget = Math.min(16_000, Math.max(1024, Math.ceil((input.current ?? input.source).length / 2.5)));
    return this.structured(candidateSchema, RECONSTRUCT_SYSTEM, reconstructUserPrompt(input), budget);
  }

  async verifyMeaning(source: string, candidate: string): Promise<Finding[]> {
    const out = await this.structured(meaningCheckSchema, VERIFY_SYSTEM, verifyUserPrompt(source, candidate), 2000);
    return out.findings.map((f) => ({ ...f, origin: "model" as const }));
  }

  async analyzeVoiceprint(samples: string[]): Promise<Observation[]> {
    const body = samples.map((s, i) => `<samples index="${i + 1}">\n${s}\n</samples>`).join("\n\n");
    const out = await this.structured(voiceprintObservationsSchema, VOICEPRINT_SYSTEM, body, 1200);
    return out.observations.map((o, i) => ({ id: `model-${i}`, text: o.text, confidence: o.confidence, source: "model" as const }));
  }
}
