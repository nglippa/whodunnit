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
