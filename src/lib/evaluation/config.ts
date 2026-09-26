import { evaluationConfigSchema, type EvaluationConfig } from "@/domain/evaluation";
import { AnthropicProvider } from "../ai/anthropic-provider";
import { DemoProvider } from "../ai/demo";
import type { AIProvider } from "../ai/provider";
import { DEFAULT_STRATEGY, getStrategy } from "../reconstruction/strategies";
import { strategyKey } from "@/domain/strategy";

/**
 * Evaluation provider selection. Unlike the web app, there is no silent
 * fallback: asking for a real model without a key is an error, because a
 * benchmark must never be mistaken for a model test when it was not one.
 * The demo engine runs only when asked for by name.
 */

export const DEFAULT_EVAL_MODEL = "claude-sonnet-5";

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
}

export function resolveConfig(flags: ConfigFlags, env: Record<string, string | undefined>): EvaluationConfig {
  const provider = flags.demo ? "demo" : (flags.provider ?? "anthropic");
  if (flags.demo && flags.provider && flags.provider !== "demo") throw new EvaluationConfigError("--demo conflicts with --provider " + flags.provider);
  if (provider !== "anthropic" && provider !== "demo") throw new EvaluationConfigError(`Unknown provider "${provider}". Use anthropic or demo.`);
  if (provider === "demo" && flags.model) throw new EvaluationConfigError("The demo engine has no model; drop --model or use --provider anthropic.");
  const strategy = flags.strategy ?? strategyKey(DEFAULT_STRATEGY);
  try {
    getStrategy(strategy);
  } catch (e) {
    throw new EvaluationConfigError((e as Error).message);
  }
  const model = provider === "demo" ? null : (flags.model ?? env.WHODUNNIT_MODEL?.trim() ?? DEFAULT_EVAL_MODEL) || DEFAULT_EVAL_MODEL;
  return evaluationConfigSchema.parse({ provider, model, strategy });
}

export function createEvaluationProvider(config: EvaluationConfig, env: Record<string, string | undefined>): AIProvider {
  if (config.provider === "demo") return new DemoProvider();
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key)
    throw new EvaluationConfigError(
      "ANTHROPIC_API_KEY is not set, so a real-model evaluation cannot run. Nothing was executed. Set the key in your shell, or pass --demo to evaluate the deterministic demo engine (records will say mode: demo, realModel: false).",
    );
  return new AnthropicProvider(key, config.model!);
}
