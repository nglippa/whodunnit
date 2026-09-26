import type { ReconstructionRequest, ReconstructionResult } from "@/domain/document";
import { applyRefinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { VerificationResult } from "@/domain/verification";
import { analyzeText } from "../analysis/analyze";
import type { AIProvider } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { PROMPT_VERSIONS } from "../prompts";
import { mergeVerification, verifyDeterministic } from "../verification/verify";
import { planReconstruction } from "./plan";

/**
 * INPUT → ANALYSIS → STYLE TARGET → PLAN → CANDIDATE → SEMANTIC CHECK → (retry) → OUTPUT
 *
 * Every candidate, including refinements, is verified against the original
 * source, so repeated refinement cannot compound drift. Candidates that fail a
 * blocking check are retried with the findings as feedback; if all attempts
 * fail, the best candidate is returned with its findings visible, never hidden.
 */

export interface PipelineOptions {
  maxAttempts?: number;
}

export interface PipelineResult extends ReconstructionResult {
  /** The effective profile after applying any refinement; the client keeps it for the next pass. */
  profile: StyleProfile;
}

const blockingCount = (v: VerificationResult) => v.findings.filter((f) => f.severity === "blocking").length;

function better(a: { verification: VerificationResult }, b: { verification: VerificationResult }) {
  const d = blockingCount(a.verification) - blockingCount(b.verification);
  return d !== 0 ? d < 0 : a.verification.findings.length <= b.verification.findings.length;
}

export async function runReconstruction(
  request: ReconstructionRequest,
  provider: AIProvider,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const source = request.source;
  const refinement = request.refinement;
  const profile = refinement ? applyRefinement(request.profile, refinement.change) : request.profile;
  const analysis = analyzeText(source);
  const plan = planReconstruction(analysis, profile, refinement?.change);
  const maxAttempts = options.maxAttempts ?? (provider.info.mode === "live" ? 3 : 1);
  // Model-assisted discourse analysis: an explicit list of claims that must survive.
  // Skipped for short texts, where the deterministic checks already cover the ground.
  const discourse = analysis.counts.words >= 60 ? await provider.analyzeText(source, analysis).catch(() => null) : null;

  let best: { text: string; verification: VerificationResult; changes: string[] } | null = null;
  let feedback: string[] | undefined;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const candidate = await provider.reconstructText({
      source,
      current: refinement?.current,
      profile,
      plan,
      analysis,
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

    const current = { text, verification, changes: candidate.changes };
    if (!best || better(current, best)) best = current;
    if (verification.status !== "rejected") break;
    feedback = verification.findings.filter((f) => f.severity === "blocking").map((f) => f.message);
  }

  if (!best) throw new ProviderError("No rewrite was produced.", "invalid_output");
  return {
    text: best.text,
    verification: best.verification,
    attempts,
    engine: provider.info,
    promptVersion: PROMPT_VERSIONS.reconstruct,
    plan,
    changes: best.changes.map((c) => c.slice(0, 200)).slice(0, 8),
    profile,
  };
}
