import type { Preserved, ReconstructionRequest, ReconstructionResult, PatternComparison } from "@/domain/document";
import { applyRefinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import { promptKey, type RewriteStrategy } from "@/domain/strategy";
import type { VerificationResult } from "@/domain/verification";
import { analyzeText } from "../analysis/analyze";
import type { AIProvider, CallMeta } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { words } from "../analysis/tokenize";
import { rulesForProfile } from "../rules/packs";
import { mergeVerification, verifyDeterministic } from "../verification/verify";
import { comparePatterns } from "./postcheck";
import { buildRewritePlan, summarizePlan, type RewritePlan } from "./rewrite-plan";
import { DEFAULT_STRATEGY } from "./strategies";
import { auditWording, type WordingAudit } from "./wording-audit";
import { buildSemanticPlan, type SemanticReviewClient, type SemanticPlanningResult } from "./semantic-review";

/**
 * SOURCE → RULE ANALYSIS → REWRITE PLAN → CANDIDATE → MEANING CHECKS → RULE POST-CHECK → (retry) → RESULT
 *
 * Every candidate, including refinements, is verified against the original
 * source, so repeated refinement cannot compound drift. Retries happen for
 * two reasons only: a blocking meaning finding, or a newly introduced
 * deterministic pattern. Remaining patterns never trigger a retry: rules can
 * conflict, and natural writing is not rule perfection. If every attempt
 * fails, the best candidate is returned with its findings visible.
 */

export interface PipelineOptions {
  maxAttempts?: number;
  /** Defaults to the production strategy (reconstruction-v1). */
  strategy?: RewriteStrategy;
  /**
   * Receives one record per attempt as it happens, so a caller keeps the log
   * even when a later attempt throws. Records carry hashes and counts, never text.
   */
  onAttempt?: (record: AttemptRecord) => void;
  /** Experimental timing hook; metadata only. */
  onPlanReady?: (analysisMs: number) => void;
  /**
   * EVALUATION ONLY (`pnpm eval:run --force-model`): call the model even when
   * the strategy would return the source unchanged, to measure what the model
   * does with text the planner considers finished. Production callers never
   * set it; the web route has no way to.
   */
  forceModel?: boolean;
  /** Experimental v6 only. Absence leaves the v5 deterministic decision intact. */
  semanticReviewer?: SemanticReviewClient;
  semanticReviewMode?: "selective" | "all";
  onSemanticPlan?: (record: SemanticPlanningResult["telemetry"]) => void;
}

/** One provider attempt, for observability. No text: hashes, counts, reasons and transport metadata only. */
export interface AttemptRecord {
  attempt: number;
  /** Why this attempt ran: "initial", or the reasons the previous candidate was retried. */
  trigger: "initial" | "retry";
  retryBecause: string[];
  outcome: "candidate" | "provider-error" | "empty-output";
  errorCode?: string;
  verificationStatus?: VerificationResult["status"];
  semanticFailures: { kind: string; severity: "blocking" | "warning"; origin: "deterministic" | "model" }[];
  introducedDeterministic: string[];
  modelMeaning: "ran" | "skipped-by-policy" | "skipped-after-rejection" | "unavailable";
  outputHash?: string;
  outputWords?: number;
  /** Advisory counts only; no raw wording and no retry authority. */
  wordingAudit?: WordingAudit;
  /** Wall-clock for the whole attempt (rewrite + checks). */
  latencyMs: number;
  provider: CallMeta | null;
}

/** cyrb53: a fast, stable, non-cryptographic hash for identifying outputs in logs without storing them. */
export function textHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export interface DetailedPipelineResult {
  result: PipelineResult;
  plan: RewritePlan;
  strategy: RewriteStrategy;
  attempts: AttemptRecord[];
  /** The strategy's minimal-change policy would have returned the source without a model call. */
  plannerWouldBypass: boolean;
}

export interface PipelineResult extends ReconstructionResult {
  /** The effective profile after applying any refinement; the client keeps it for the next pass. */
  profile: StyleProfile;
}

interface Attempt {
  text: string;
  verification: VerificationResult;
  patterns: PatternComparison;
  changes: string[];
}

const blockingCount = (v: VerificationResult) => v.findings.filter((f) => f.severity === "blocking").length;
const introducedDeterministic = (p: PatternComparison) => p.introduced.filter((x) => x.deterministic);

/** Meaning first; then fewer newly introduced patterns; then fewer findings overall. */
function better(a: Attempt, b: Attempt) {
  const d = blockingCount(a.verification) - blockingCount(b.verification);
  if (d !== 0) return d < 0;
  const i = introducedDeterministic(a.patterns).length - introducedDeterministic(b.patterns).length;
  if (i !== 0) return i < 0;
  return a.verification.findings.length <= b.verification.findings.length;
}

function preservedCounts(v: VerificationResult, plan: ReturnType<typeof buildRewritePlan>): Preserved {
  const lost = (kind: string) => v.findings.filter((f) => f.kind === kind && f.source).length;
  return {
    numbers: Math.max(0, plan.preserve.numbers.length - lost("altered_number")),
    dates: Math.max(0, plan.preserve.dates.length - lost("altered_date")),
    names: Math.max(0, plan.preserve.names.length - lost("altered_name")),
    quotations: Math.max(0, plan.preserve.quotations.length - lost("altered_quotation")),
    links: Math.max(0, plan.preserve.links.length - lost("altered_link")),
  };
}

export async function runReconstruction(request: ReconstructionRequest, provider: AIProvider, options: PipelineOptions = {}): Promise<PipelineResult> {
  return (await runReconstructionDetailed(request, provider, options)).result;
}

/** The pipeline with its plan, strategy and per-attempt log exposed (for evaluation). */
export async function runReconstructionDetailed(request: ReconstructionRequest, provider: AIProvider, options: PipelineOptions = {}): Promise<DetailedPipelineResult> {
  const analysisStarted = Date.now();
  const strategy = options.strategy ?? DEFAULT_STRATEGY;
  if (strategy.id === "reconstruction" && strategy.version === 4 && provider.info.provider !== "orchestrated")
    throw new Error("reconstruction-v4 requires the experimental orchestrator runner");
  const source = request.source;
  const refinement = request.refinement;
  const profile = refinement ? applyRefinement(request.profile, refinement.change) : request.profile;
  const planInput = { source, profile, refinement: refinement?.change, voiceprint: request.voiceprint, current: refinement?.current, protectedPhrases: request.protectedPhrases };
  const semanticPlan = strategy.version === 6 && strategy.id === "reconstruction"
    ? await buildSemanticPlan(planInput, options.semanticReviewer ?? null, { mode: options.semanticReviewMode })
    : null;
  if (semanticPlan) options.onSemanticPlan?.(semanticPlan.telemetry);
  const plan = semanticPlan?.plan ?? buildRewritePlan(planInput, strategy);
  options.onPlanReady?.(Date.now() - analysisStarted);
  // Meaning checks get the same context the plan used: filler the rewrite may drop, what the author licensed, what is protected.
  const verifyContext = { removableSpans: plan.removableSpans, licenses: plan.refinementDelta?.licenses, protectedPhrases: plan.protectedPhrases };

  // Minimal change as an invariant: good text that needs nothing comes back as it is.
  const plannerWouldBypass = strategy.minimalChange === "unchanged" && plan.minimalChange.unchangedPreferred;
  if (plannerWouldBypass && !options.forceModel) {
    const verification = verifyDeterministic(source, source, profile, verifyContext);
    const result: PipelineResult = {
      text: source,
      verification,
      attempts: 0,
      engine: provider.info,
      promptVersion: promptKey(strategy.prompt),
      plan: summarizePlan(plan),
      changes: ["Left unchanged: no catalogued patterns, nothing requested, and the register already fits."],
      patterns: comparePatterns(plan, source, rulesForProfile(profile)),
      preserved: preservedCounts(verification, plan),
      profile,
    };
    return { result, plan, strategy, attempts: [], plannerWouldBypass };
  }
  const rules = rulesForProfile(profile);
  const retry = strategy.retryPolicy;
  const maxAttempts = options.maxAttempts ?? (provider.info.mode === "live" ? retry.maxAttemptsLive : retry.maxAttemptsDemo);
  // Model-assisted discourse analysis: an explicit list of claims that must survive.
  const legacy = analyzeText(source);
  const minWords = strategy.postCheckPolicy.claimsExtractionMinWords;
  const discourse = minWords !== null && legacy.counts.words >= minWords ? await provider.analyzeText(source, legacy).catch(() => null) : null;

  const log: AttemptRecord[] = [];
  const record = (r: AttemptRecord) => {
    log.push(r);
    options.onAttempt?.(r);
  };
  let best: Attempt | null = null;
  let feedback: string[] | undefined;
  let retryBecause: string[] = [];
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const started = Date.now();
    const base = { attempt: attempts, trigger: attempts === 1 ? ("initial" as const) : ("retry" as const), retryBecause };
    let candidate: Awaited<ReturnType<AIProvider["reconstructText"]>>;
    try {
      candidate = await provider.reconstructText({
        source,
        current: refinement?.current,
        profile,
        plan,
        claims: discourse?.claims,
        refinement: refinement?.change,
        retryFeedback: feedback,
        strategy,
      });
    } catch (err) {
      record({ ...base, outcome: "provider-error", errorCode: err instanceof ProviderError ? err.code : "unknown", semanticFailures: [], introducedDeterministic: [], modelMeaning: "unavailable", latencyMs: Date.now() - started, provider: err instanceof ProviderError ? (err.meta ?? null) : null });
      throw err;
    }
    const text = candidate.text.trim();
    if (!text) {
      record({ ...base, outcome: "empty-output", semanticFailures: [], introducedDeterministic: [], modelMeaning: "unavailable", latencyMs: Date.now() - started, provider: candidate.meta ?? null });
      throw new ProviderError("The writing model returned an empty rewrite.", "invalid_output");
    }

    let verification = verifyDeterministic(source, text, profile, verifyContext);
    let modelMeaning: AttemptRecord["modelMeaning"] = "skipped-by-policy";
    // Only spend a model call on meaning when the cheap checks passed.
    if (strategy.postCheckPolicy.modelMeaning === "when-deterministic-passes") {
      if (verification.status === "rejected") modelMeaning = "skipped-after-rejection";
      else {
        // A failed model check is reported as "not run", never as "passed".
        const findings = await provider.verifyMeaning(source, text).catch(() => null);
        modelMeaning = findings ? "ran" : "unavailable";
        verification = mergeVerification(verification, findings);
      }
    }
    const patterns = comparePatterns(plan, text, rules);

    const current: Attempt = { text, verification, patterns, changes: candidate.changes };
    if (!best || better(current, best)) best = current;
    const introduced = introducedDeterministic(patterns);
    const blocking = verification.findings.filter((f) => f.severity === "blocking");
    record({
      ...base,
      outcome: "candidate",
      verificationStatus: verification.status,
      semanticFailures: verification.findings.map((f) => ({ kind: f.kind, severity: f.severity, origin: f.origin })),
      introducedDeterministic: introduced.map((x) => x.ruleId),
      modelMeaning,
      outputHash: textHash(text),
      outputWords: words(text).length,
      wordingAudit: auditWording(source, text, plan),
      latencyMs: Date.now() - started,
      provider: candidate.meta ?? null,
    });

    const reasons = [
      ...(retry.retryOn.includes("blocking-meaning") ? blocking.map((f) => `blocking:${f.kind}`) : []),
      ...(retry.retryOn.includes("introduced-deterministic-pattern") ? introduced.map((x) => `introduced:${x.ruleId}`) : []),
    ];
    if (reasons.length === 0) break;
    retryBecause = reasons;
    feedback = [
      ...(retry.retryOn.includes("blocking-meaning") ? blocking.map((f) => f.message) : []),
      ...(retry.retryOn.includes("introduced-deterministic-pattern") ? introduced.map((x) => `You introduced a pattern that was not in the source: ${x.name}.`) : []),
    ];
  }

  if (!best) throw new ProviderError("No rewrite was produced.", "invalid_output");
  const result: PipelineResult = {
    text: best.text,
    verification: best.verification,
    attempts,
    engine: provider.info,
    promptVersion: promptKey(strategy.prompt),
    plan: summarizePlan(plan),
    changes: best.changes.map((c) => c.slice(0, 200)).slice(0, 8),
    patterns: best.patterns,
    preserved: preservedCounts(best.verification, plan),
    profile,
  };
  return { result, plan, strategy, attempts: log, plannerWouldBypass };
}
