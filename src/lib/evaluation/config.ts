import { evaluationConfigSchema, type EvaluationConfig } from "@/domain/evaluation";
import { AnthropicProvider } from "../ai/anthropic-provider";
import { DemoProvider } from "../ai/demo";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "../ai/gemini-provider";
import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL, OpenAICompatibleProvider } from "../ai/openai-compatible-provider";
import type { AIProvider } from "../ai/provider";
import { anthropicKey, geminiKey } from "../ai/select";
import { DEFAULT_STRATEGY, getStrategy } from "../reconstruction/strategies";
import { strategyKey } from "@/domain/strategy";

/**
 * Evaluation provider selection. Unlike the web app, there is no silent
 * fallback: asking for a real model without a key is an error, because a
 * benchmark must never be mistaken for a model test when it was not one.
 * The demo engine runs only when asked for by name.
 */

export const DEFAULT_EVAL_MODEL = "claude-sonnet-5";
export const DEFAULT_MODELS = { anthropic: DEFAULT_EVAL_MODEL, gemini: DEFAULT_GEMINI_MODEL, "openai-compatible": "local" } as const;

export class EvaluationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationConfigError";
  }
}

export interface ConfigFlags {
  provider?: string;
  demo?: boolean;
  model?: string;
  strategy?: string;
  baseUrl?: string;
}

/**
 * Provider: --demo, else --provider, else WHODUNNIT_AI_PROVIDER (unless it
 * says demo or auto), else whichever model key exists (Anthropic first).
 * With no key at all it resolves to anthropic, and creating the provider
 * then fails clearly rather than switching to the demo engine.
 */
export function resolveConfig(flags: ConfigFlags, env: Record<string, string | undefined>): EvaluationConfig {
  if (flags.demo && flags.provider && flags.provider !== "demo") throw new EvaluationConfigError("--demo conflicts with --provider " + flags.provider);
  const envChoice = env.WHODUNNIT_AI_PROVIDER?.trim().toLowerCase();
  const alias = (p: string | undefined) => (p === "local" ? "openai-compatible" : p);
  const fromEnv = envChoice === "anthropic" || envChoice === "gemini" || envChoice === "openai-compatible" || envChoice === "local" ? alias(envChoice) : undefined;
  const provider = flags.demo ? "demo" : (alias(flags.provider) ?? (flags.baseUrl ? "openai-compatible" : undefined) ?? fromEnv ?? (anthropicKey(env) ? "anthropic" : geminiKey(env) ? "gemini" : "anthropic"));
  if (provider !== "anthropic" && provider !== "gemini" && provider !== "openai-compatible" && provider !== "demo")
    throw new EvaluationConfigError(`Unknown provider "${provider}". Use anthropic, gemini, local (openai-compatible) or demo.`);
  if (provider === "demo" && flags.model) throw new EvaluationConfigError("The demo engine has no model; drop --model or choose a model provider.");
  const strategy = flags.strategy ?? strategyKey(DEFAULT_STRATEGY);
  try {
    getStrategy(strategy);
  } catch (e) {
    throw new EvaluationConfigError((e as Error).message);
  }
  const model = provider === "demo" ? null : flags.model?.trim() || env.WHODUNNIT_MODEL?.trim() || DEFAULT_MODELS[provider];
  const baseUrl = provider === "openai-compatible" ? (flags.baseUrl?.trim() || env.WHODUNNIT_OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL) : undefined;
  if (flags.baseUrl && provider !== "openai-compatible") throw new EvaluationConfigError("--base-url applies only to --provider local / openai-compatible.");
  return evaluationConfigSchema.parse({ provider, model, strategy, ...(baseUrl ? { baseUrl } : {}) });
}

export function createEvaluationProvider(config: EvaluationConfig, env: Record<string, string | undefined>): AIProvider {
  if (config.provider === "demo") return new DemoProvider();
  const noKey = (name: string) =>
    new EvaluationConfigError(
      `${name} is not set, so a real-model evaluation cannot run. Nothing was executed. Set it in your shell or .env.local, or pass --demo to evaluate the deterministic demo engine (records will say mode: demo, realModel: false).`,
    );
  if (config.provider === "openai-compatible")
    return new OpenAICompatibleProvider(config.model!, { baseUrl: config.baseUrl, apiKey: env.WHODUNNIT_OPENAI_API_KEY?.trim() || undefined });
  if (config.provider === "gemini") {
    const key = geminiKey(env);
    if (!key) throw noKey("GEMINI_API_KEY");
    // Evaluation batches are more patient than the web app: more retries, server-hinted backoff.
    return new GeminiProvider(key, config.model!, { maxRetries: 5, retryDelayMs: 2000 });
  }
  const key = anthropicKey(env);
  if (!key) throw noKey("ANTHROPIC_API_KEY");
  return new AnthropicProvider(key, config.model!);
}
