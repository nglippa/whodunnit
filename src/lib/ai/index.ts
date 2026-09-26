import "server-only";
import type { EngineInfo } from "@/domain/document";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";

/**
 * Provider selection. Reads configuration on the server only; keys never
 * leave this module. Add a provider by implementing AIProvider and a case here.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

let cached: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (cached) return cached;
  const requested = (process.env.WHODUNNIT_AI_PROVIDER ?? "auto").toLowerCase();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (requested === "demo" || (requested === "auto" && !key)) {
    cached = new DemoProvider();
  } else if (requested === "anthropic" || requested === "auto") {
    if (!key) {
      // Explicitly requested but unconfigured: fall back rather than crash.
      cached = new DemoProvider();
    } else {
      cached = new AnthropicProvider(key, process.env.WHODUNNIT_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL);
    }
  } else {
    cached = new DemoProvider();
  }
  return cached;
}

export function getEngineInfo(): EngineInfo {
  return getProvider().info;
}
