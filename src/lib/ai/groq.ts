import type { GenerationSettings } from "./provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";

/**
 * GroqCloud (api.groq.com): used as an independent semantic JUDGE in
 * evaluation, never as the production writer. Groq speaks the OpenAI chat
 * format, so this is the OpenAI-compatible provider with Groq's transport
 * requirements for strict structured output:
 *
 *   - no streaming (Groq does not stream structured output)
 *   - a strict JSON Schema subset (length/size keywords removed; the full Zod
 *     schema still validates the response)
 *   - reasoning text left out of the response (include_reasoning: false); it
 *     is still generated and billed as output tokens
 *   - a moderate max_tokens: free-tier per-minute token limits are small
 *
 * The model id is always explicit: Groq's catalogue changes, so there is no
 * default to go stale.
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function createGroqProvider(apiKey: string, model: string, generation: GenerationSettings = {}, fetchImpl?: typeof fetch): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(model, {
    name: "groq",
    baseUrl: GROQ_BASE_URL,
    apiKey,
    stream: false,
    schemaMode: "strict-subset",
    extraBody: { include_reasoning: false },
    maxRetries: 5,
    retryDelayMs: 5000,
    timeoutMs: 180_000,
    generation: { maxTokens: 4096, ...generation },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}
