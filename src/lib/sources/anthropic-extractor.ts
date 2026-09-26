import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SourceSection } from "@/domain/sources";
import { COMPILE_SYSTEM, compileUserPrompt, modelCandidatesSchema, type CandidateExtractor } from "./model-compile";

/**
 * Anthropic-backed candidate extractor for the developer CLI (source:compile
 * --model). Not imported by the web app. Output is re-validated by
 * compileWithModel regardless of what the structured-output mode guarantees.
 */
export class AnthropicCandidateExtractor implements CandidateExtractor {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
    this.name = `anthropic:${model}`;
  }

  async extract(input: { sourceTitle: string; section: SourceSection }): Promise<unknown> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      system: COMPILE_SYSTEM,
      messages: [{ role: "user", content: compileUserPrompt(input.sourceTitle, input.section) }],
      output_config: { format: zodOutputFormat(modelCandidatesSchema) },
    });
    return message.parsed_output ?? null;
  }
}
