import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL } from "./openai-compatible-provider";

/**
 * Which provider the configuration asks for, and its key. Pure: reads only
 * the env object it is given, so it is testable and shared by the web app and
 * the evaluation CLI.
 *
 *   WHODUNNIT_AI_PROVIDER = auto (default) | anthropic | gemini | openai-compatible | demo
 *   openai-compatible: any OpenAI-format server (a local llama.cpp/Bonsai
 *         server, Ollama, Groq...) at WHODUNNIT_OPENAI_BASE_URL, with optional
 *         WHODUNNIT_OPENAI_API_KEY. Never chosen by auto.
 *   auto: Anthropic if ANTHROPIC_API_KEY is set, else Gemini if GEMINI_API_KEY
 *         (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) is set, else none.
 */

export type ProviderChoice =
  | { provider: "anthropic" | "gemini"; key: string }
  | { provider: "openai-compatible"; baseUrl: string; key?: string }
  | { provider: "demo"; reason: "requested" | "no-key" | "unknown-provider"; requested: string };

type Env = Record<string, string | undefined>;

export const anthropicKey = (env: Env) => env.ANTHROPIC_API_KEY?.trim() || undefined;
export const GEMINI_KEY_NAMES = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;
export const geminiKey = (env: Env) => GEMINI_KEY_NAMES.map((k) => env[k]?.trim()).find(Boolean) || undefined;

export function selectProvider(env: Env): ProviderChoice {
  const requested = (env.WHODUNNIT_AI_PROVIDER ?? "auto").trim().toLowerCase() || "auto";
  const a = anthropicKey(env);
  const g = geminiKey(env);
  if (requested === "demo") return { provider: "demo", reason: "requested", requested };
  if (requested === "anthropic") return a ? { provider: "anthropic", key: a } : { provider: "demo", reason: "no-key", requested };
  if (requested === "gemini") return g ? { provider: "gemini", key: g } : { provider: "demo", reason: "no-key", requested };
  if (requested === "openai-compatible" || requested === "local")
    return { provider: "openai-compatible", baseUrl: env.WHODUNNIT_OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL, key: env.WHODUNNIT_OPENAI_API_KEY?.trim() || undefined };
  if (requested === "auto") {
    if (a) return { provider: "anthropic", key: a };
    if (g) return { provider: "gemini", key: g };
    return { provider: "demo", reason: "no-key", requested };
  }
  return { provider: "demo", reason: "unknown-provider", requested };
}
