import { evaluationConfigSchema, type EvaluationConfig, type GenerationSettingsConfig } from "@/domain/evaluation";
import type { JudgeConfig } from "@/domain/judge";
import { AnthropicProvider } from "../ai/anthropic-provider";
import { DemoProvider } from "../ai/demo";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "../ai/gemini-provider";
import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL, OpenAICompatibleProvider } from "../ai/openai-compatible-provider";
import type { AIProvider, StructuredCaller } from "../ai/provider";
import { ModelSemanticJudge, type JudgeCache, type SemanticJudge } from "./judge";
import { anthropicKey, geminiKey, groqKey } from "../ai/select";
import { createGroqProvider } from "../ai/groq";
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
  generation?: GenerationSettingsConfig;
  judge?: { provider?: string; model?: string; baseUrl?: string; reasoningEffort?: string; promptVersion?: string };
  /** Diagnostic only: disable the planner's minimal-change bypass. */
  forceModel?: boolean;
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
  const generation = flags.generation && Object.values(flags.generation).some((v) => v !== undefined) ? flags.generation : undefined;
  if (generation && provider === "demo") throw new EvaluationConfigError("The demo engine has no generation settings.");
  if (generation?.reasoningControl && generation.reasoningBudget === undefined) throw new EvaluationConfigError("--reasoning-control needs --reasoning-budget.");
  let judge: JudgeConfig | undefined;
  if (flags.judge?.provider) {
    const jp = alias(flags.judge.provider);
    if (jp !== "anthropic" && jp !== "gemini" && jp !== "openai-compatible" && jp !== "groq") throw new EvaluationConfigError(`Unknown judge provider "${flags.judge.provider}". Use anthropic, gemini, groq or local.`);
    // Groq's catalogue changes: its model id is always explicit.
    if (jp === "groq" && !flags.judge.model?.trim()) throw new EvaluationConfigError("--judge-provider groq needs --judge-model (check the current catalogue: GET https://api.groq.com/openai/v1/models).");
    const effort = flags.judge.reasoningEffort?.trim();
    if (effort && effort !== "low" && effort !== "medium" && effort !== "high") throw new EvaluationConfigError("--judge-reasoning-effort is low, medium or high.");
    const pv = flags.judge.promptVersion?.trim();
    if (pv && pv !== "1" && pv !== "2") throw new EvaluationConfigError("--judge-prompt is 1 or 2.");
    judge = {
      provider: jp,
      model: flags.judge.model?.trim() || DEFAULT_MODELS[jp as keyof typeof DEFAULT_MODELS],
      ...(jp === "openai-compatible" ? { baseUrl: flags.judge.baseUrl?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL } : {}),
      ...(effort ? { reasoningEffort: effort as "low" | "medium" | "high" } : {}),
      ...(pv ? { promptVersion: Number(pv) as 1 | 2 } : {}),
    };
  } else if (flags.judge?.model || flags.judge?.baseUrl || flags.judge?.reasoningEffort || flags.judge?.promptVersion)
    throw new EvaluationConfigError("--judge-model, --judge-base-url, --judge-reasoning-effort and --judge-prompt need --judge-provider.");
  // A forced run must actually differ from a normal one; on a strategy that never bypasses the model it would be mislabelled.
  if (flags.forceModel && getStrategy(strategy).minimalChange !== "unchanged")
    throw new EvaluationConfigError(`--force-model has no effect on ${strategy}: that strategy always calls the model. Use it with a strategy whose minimal-change policy can return text unchanged (e.g. reconstruction-v3).`);
  const parsed = evaluationConfigSchema.safeParse({ provider, model, strategy, ...(baseUrl ? { baseUrl } : {}), ...(generation ? { generation } : {}), ...(judge ? { judge } : {}), ...(flags.forceModel ? { forceModel: true } : {}) });
  if (!parsed.success) throw new EvaluationConfigError(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

function modelCaller(p: { provider: EvaluationConfig["provider"] | JudgeConfig["provider"]; model: string; baseUrl?: string }, env: Record<string, string | undefined>, generation?: GenerationSettingsConfig): AIProvider & StructuredCaller {
  if (p.provider === "groq") {
    const key = groqKey(env);
    if (!key)
      throw new EvaluationConfigError("GROQ_API_KEY is not set, so the Groq judge cannot run. Nothing was executed. Set it in your shell or .env.local; the run will not fall back to another judge.");
    return createGroqProvider(key, p.model, generation);
  }
  const noKey = (name: string) =>
    new EvaluationConfigError(
      `${name} is not set, so a real-model evaluation cannot run. Nothing was executed. Set it in your shell or .env.local, or pass --demo to evaluate the deterministic demo engine (records will say mode: demo, realModel: false).`,
    );
  if (p.provider === "openai-compatible")
    return new OpenAICompatibleProvider(p.model, { baseUrl: p.baseUrl, apiKey: env.WHODUNNIT_OPENAI_API_KEY?.trim() || undefined, generation });
  if (p.provider === "gemini") {
    const key = geminiKey(env);
    if (!key) throw noKey("GEMINI_API_KEY");
    // Evaluation batches are more patient than the web app: more retries, server-hinted backoff.
    return new GeminiProvider(key, p.model, { maxRetries: 5, retryDelayMs: 2000, generation });
  }
  if (p.provider !== "anthropic") throw new EvaluationConfigError(`No model provider "${p.provider}".`);
  const key = anthropicKey(env);
  if (!key) throw noKey("ANTHROPIC_API_KEY");
  return new AnthropicProvider(key, p.model, generation);
}

export function createEvaluationProvider(config: EvaluationConfig, env: Record<string, string | undefined>): AIProvider & Partial<StructuredCaller> {
  if (config.provider === "demo") return new DemoProvider();
  return modelCaller({ provider: config.provider, model: config.model!, baseUrl: config.baseUrl }, env, config.generation);
}

/** The independent judge, or null when none is configured. Missing credentials are an error, never a silent skip. */
export function createJudge(config: EvaluationConfig, env: Record<string, string | undefined>, options: { cache?: JudgeCache | null } = {}): SemanticJudge | null {
  if (!config.judge) return null;
  const caller = modelCaller(config.judge, env, config.judge.reasoningEffort ? { reasoningEffort: config.judge.reasoningEffort } : undefined);
  return new ModelSemanticJudge(
    caller,
    { provider: config.provider === "openai-compatible" ? `openai-compatible@${new URL(config.baseUrl!).host}` : config.provider, model: config.model },
    { promptVersion: config.judge.promptVersion, cache: options.cache ?? null },
  );
}
