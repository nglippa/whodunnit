import type { z } from "zod";
import type { EngineInfo } from "@/domain/document";
import type { RewriteStrategy } from "@/domain/strategy";
import type { Refinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import type { TextAnalysis } from "../analysis/analyze";
import type { Candidate, DiscourseAnalysis } from "./schemas";
import type { RewritePlan } from "../reconstruction/rewrite-plan";

/**
 * The only surface the rest of the app sees. Implementations live server-side
 * and can be swapped without touching the pipeline or the UI.
 */
export interface ReconstructInput {
  source: string;
  /** Present for refinements: the text being revised. */
  current?: string;
  profile: StyleProfile;
  /** The compiled reconstruction contract (preserve, targets, patterns, prohibitions). */
  plan: RewritePlan;
  /** Claims identified in the source that the rewrite must keep. */
  claims?: string[];
  refinement?: Refinement;
  retryFeedback?: string[];
  /** The strategy in force: selects the prompt version and intensity handling. Absent = reconstruction-v1. */
  strategy?: RewriteStrategy;
}

/** Transport metadata for one model call. Never contains text. */
export interface CallMeta {
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string | null;
  requestId?: string | null;
  httpStatus?: number | null;
}

export interface AIProvider {
  readonly info: EngineInfo;
  /** Model-assisted discourse analysis. May return null when unsupported. */
  analyzeText(text: string, analysis: TextAnalysis): Promise<DiscourseAnalysis | null>;
  reconstructText(input: ReconstructInput): Promise<Candidate & { meta?: CallMeta }>;
  /** Model-assisted meaning comparison. null means "this provider cannot check meaning". */
  verifyMeaning(source: string, candidate: string): Promise<Finding[] | null>;
  /** Model-assisted Voiceprint observations. Empty when unsupported. */
  analyzeVoiceprint(samples: string[]): Promise<Observation[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "invalid_output" | "rate_limited" | "upstream",
    readonly meta?: CallMeta,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Generation settings for reproducible evaluation. Only what a provider
 * actually supports is sent; everything else is reported as unsupported
 * rather than silently dropped. Nothing here is tuned: absent means the
 * provider's or server's default.
 */
export interface GenerationSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  maxTokens?: number;
  /** Thinking/reasoning token budget. */
  reasoningBudget?: number;
  /**
   * request: sent per request (OpenAI-compatible servers, as `reasoningParam`).
   * server-declared: set on the server (e.g. llama-server --reasoning-budget); recorded, not sent.
   */
  reasoningControl?: "request" | "server-declared";
  /** Request field for the budget; llama-server uses thinking_budget_tokens, the MLX server thinking_budget. */
  reasoningParam?: string;
  reasoningEffort?: string;
}

export interface GenerationReport {
  /** Settings sent with every request. */
  applied: string[];
  /** Settings requested but not supported by this provider (not sent). */
  unsupported: string[];
  /** Settings recorded as configured elsewhere (e.g. on the server). */
  declared: string[];
}

export function reportGeneration(g: GenerationSettings | undefined, supported: (keyof GenerationSettings)[]): GenerationReport {
  const r: GenerationReport = { applied: [], unsupported: [], declared: [] };
  if (!g) return r;
  for (const [k, v] of Object.entries(g) as [keyof GenerationSettings, unknown][]) {
    if (v === undefined || k === "reasoningControl" || k === "reasoningParam") continue;
    if (k === "reasoningBudget" && g.reasoningControl === "server-declared") r.declared.push(`${k}=${v}`);
    else if (supported.includes(k)) r.applied.push(`${k}=${v}`);
    else r.unsupported.push(`${k}=${v}`);
  }
  return r;
}

/** A provider that can return any schema-validated structure (used by the semantic judge). */
export interface StructuredCaller {
  readonly info: EngineInfo;
  callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string): Promise<{ data: T; meta: CallMeta }>;
  generationReport(): GenerationReport;
}
