import "server-only";
import type { EngineInfo } from "@/domain/document";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import { GeminiProvider } from "./gemini";
import { DEFAULT_GEMINI_MODEL } from "./gemini-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { selectProvider } from "./select";

/**
 * Provider selection. Reads configuration on the server only; keys never
 * leave this module. Add a provider by implementing AIProvider, a case in
 * ./select, and a case here.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

let cached: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (cached) return cached;
  const choice = selectProvider(process.env);
  const model = process.env.WHODUNNIT_MODEL?.trim();
  if (choice.provider === "anthropic") cached = new AnthropicProvider(choice.key, model || DEFAULT_ANTHROPIC_MODEL);
  else if (choice.provider === "gemini") cached = new GeminiProvider(choice.key, model || DEFAULT_GEMINI_MODEL);
  else if (choice.provider === "openai-compatible") cached = new OpenAICompatibleProvider(model || "local", { baseUrl: choice.baseUrl, apiKey: choice.key });
  // The web app keeps its long-standing behaviour: unconfigured means demo mode, and the UI says so.
  else cached = new DemoProvider();
  return cached;
}

export function getEngineInfo(): EngineInfo {
  return getProvider().info;
}
