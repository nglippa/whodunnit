import type { Preserved, ReconstructionRequest, ReconstructionResult, PatternComparison } from "@/domain/document";
import { applyRefinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { VerificationResult } from "@/domain/verification";
import { analyzeText } from "../analysis/analyze";
import type { AIProvider } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { PROMPT_VERSIONS } from "../prompts";
import { rulesForProfile } from "../rules/packs";
import { mergeVerification, verifyDeterministic } from "../verification/verify";
import { comparePatterns } from "./postcheck";
import { buildRewritePlan, summarizePlan } from "./rewrite-plan";

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
  const source = request.source;
  const refinement = request.refinement;
  const profile = refinement ? applyRefinement(request.profile, refinement.change) : request.profile;
  const plan = buildRewritePlan({ source, profile, refinement: refinement?.change, voiceprint: request.voiceprint });
  const rules = rulesForProfile(profile);
  const maxAttempts = options.maxAttempts ?? (provider.info.mode === "live" ? 3 : 1);
  // Model-assisted discourse analysis: an explicit list of claims that must survive.
  const legacy = analyzeText(source);
  const discourse = legacy.counts.words >= 60 ? await provider.analyzeText(source, legacy).catch(() => null) : null;

  let best: Attempt | null = null;
  let feedback: string[] | undefined;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const candidate = await provider.reconstructText({
      source,
      current: refinement?.current,
      profile,
      plan,
      claims: discourse?.claims,
      refinement: refinement?.change,
      retryFeedback: feedback,
    });
    const text = candidate.text.trim();
    if (!text) throw new ProviderError("The writing model returned an empty rewrite.", "invalid_output");

    let verification = verifyDeterministic(source, text, profile);
    // Only spend a model call on meaning when the cheap checks passed.
    if (verification.status !== "rejected") {
      // A failed model check is reported as "not run", never as "passed".
      verification = mergeVerification(verification, await provider.verifyMeaning(source, text).catch(() => null));
    }
    const patterns = comparePatterns(plan, text, rules);

    const current: Attempt = { text, verification, patterns, changes: candidate.changes };
    if (!best || better(current, best)) best = current;
    const introduced = introducedDeterministic(patterns);
    if (verification.status !== "rejected" && introduced.length === 0) break;
    feedback = [
      ...verification.findings.filter((f) => f.severity === "blocking").map((f) => f.message),
      ...introduced.map((x) => `You introduced a pattern that was not in the source: ${x.name}.`),
    ];
  }

  if (!best) throw new ProviderError("No rewrite was produced.", "invalid_output");
  return {
    text: best.text,
    verification: best.verification,
    attempts,
    engine: provider.info,
    promptVersion: PROMPT_VERSIONS.reconstruct,
    plan: summarizePlan(plan),
    changes: best.changes.map((c) => c.slice(0, 200)).slice(0, 8),
    patterns: best.patterns,
    preserved: preservedCounts(best.verification, plan),
    profile,
  };
}
