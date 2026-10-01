import { rewriteStrategySchema, strategyKey, type RewriteStrategy } from "@/domain/strategy";

/**
 * The named rewrite strategies. reconstruction-v1 is exactly the behaviour
 * that shipped before strategies existed; it stays the production default
 * until an evaluation shows another strategy is better on the dimensions that
 * matter. Never edit a published strategy: add a new version.
 */

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

const define = (s: RewriteStrategy) => deepFreeze(rewriteStrategySchema.parse(s));

export const RECONSTRUCTION_V1 = define({
  id: "reconstruction",
  version: 1,
  name: "Reconstruction v1 (full contract)",
  description:
    "Production behaviour as of the knowledge-engine commit: every active constraint, detected pattern and prohibition is sent; retries on blocking meaning findings or newly introduced deterministic patterns; model meaning check when the deterministic checks pass.",
  status: "production",
  prompt: { id: "reconstruct", version: 2 },
  planning: { mode: "full-contract", intensity: "record-only" },
  constraintPolicy: { maxPatterns: null, maxProhibited: null, maxAdvisory: null, advisory: "always", restateSatisfiedStyleRanges: true },
  retryPolicy: { maxAttemptsLive: 3, maxAttemptsDemo: 1, retryOn: ["blocking-meaning", "introduced-deterministic-pattern"] },
  postCheckPolicy: { modelMeaning: "when-deterministic-passes", claimsExtractionMinWords: 60 },
});

export const RECONSTRUCTION_V2 = define({
  id: "reconstruction",
  version: 2,
  name: "Reconstruction v2 (prioritised, minimal-change)",
  description:
    "Same pipeline and post-checks as v1, with a budgeted contract: semantic anchors always, the strongest detected patterns, the prohibitions a rewrite most often introduces, ranges that need to move, and advisory guidance only when the text needs real work. Tells the model how much to change; on text with no catalogued patterns, style-only ranges are not pursued.",
  status: "experimental",
  prompt: { id: "reconstruct", version: 3 },
  planning: { mode: "prioritized", intensity: "enforce" },
  constraintPolicy: { maxPatterns: 8, maxProhibited: 12, maxAdvisory: 2, advisory: "unless-minimal", restateSatisfiedStyleRanges: false },
  retryPolicy: { maxAttemptsLive: 3, maxAttemptsDemo: 1, retryOn: ["blocking-meaning", "introduced-deterministic-pattern"] },
  postCheckPolicy: { modelMeaning: "when-deterministic-passes", claimsExtractionMinWords: 60 },
});

export const RECONSTRUCTION_V3 = define({
  id: "reconstruction",
  version: 3,
  name: "Reconstruction v3 (anchored refinement, minimal change)",
  description:
    "v2's prioritised contract plus: protected phrases and pattern-family guidance in the contract; refinements as explicit deltas anchored to the original (Keep more of my wording restores original phrasing; Shorter carries a MUST KEEP / MAY COMPRESS / MAY REMOVE triage); and text that needs nothing is returned unchanged without a model call. Habits the source demonstrates (deliberate dashes, fragments, semicolons) outrank the style preset without a saved Voiceprint.",
  status: "experimental",
  prompt: { id: "reconstruct", version: 4 },
  planning: { mode: "prioritized", intensity: "enforce", sourceVoice: true },
  constraintPolicy: { maxPatterns: 8, maxProhibited: 12, maxAdvisory: 2, advisory: "unless-minimal", restateSatisfiedStyleRanges: false },
  retryPolicy: { maxAttemptsLive: 3, maxAttemptsDemo: 1, retryOn: ["blocking-meaning", "introduced-deterministic-pattern"] },
  minimalChange: "unchanged",
  refinement: "delta",
  postCheckPolicy: { modelMeaning: "when-deterministic-passes", claimsExtractionMinWords: 60 },
});

/** Experimental cloud orchestration. Uses v3's published planning and prompt contract. */
export const RECONSTRUCTION_V4 = define({
  ...RECONSTRUCTION_V3,
  version: 4,
  name: "Reconstruction v4 (orchestrated cloud experiment)",
  description: "v3 planning with a frontier-owned decision, optional bounded wording assistance, independent verification, and one localized repair. Requires the experimental orchestrator runner.",
});

/** Experimental deterministic discourse evidence. Production v1 is unchanged. */
export const RECONSTRUCTION_V5 = define({
  ...RECONSTRUCTION_V3,
  version: 5,
  name: "Reconstruction v5 (discourse evidence experiment)",
  description: "v3 with conservative document-structure permissions and distributed discourse editing reasons. No model-assisted discourse analysis.",
  prompt: { id: "reconstruct", version: 5 },
  planning: { ...RECONSTRUCTION_V3.planning, discourse: true },
});

/** Experimental scope review. The ordinary production route never opts into this strategy. */
export const RECONSTRUCTION_V6 = define({
  ...RECONSTRUCTION_V5,
  version: 6,
  name: "Reconstruction v6 (bounded semantic planning experiment)",
  description: "v5 deterministic evidence followed by optional schema-validated semantic scope review. Requires an explicitly supplied reviewer; unavailable review preserves the deterministic plan.",
  prompt: { id: "reconstruct", version: 6 },
});

/** Experimental diagnosis/execution separation; v6 remains pinned for comparison. */
export const RECONSTRUCTION_V7 = define({
  ...RECONSTRUCTION_V6,
  version: 7,
  name: "Reconstruction v7 (semantic diagnosis and execution separation)",
  description: "v6 evidence and prompt contract, with a distinct blocked-pending-information decision when substantive editing is diagnosed but source facts are insufficient.",
});

/** Experimental job-level planning only. No production reconstruction route selects this. */
export const RECONSTRUCTION_V8 = define({
  ...RECONSTRUCTION_V7,
  version: 8,
  name: "Reconstruction v8 (objective-conditioned job planning)",
  description: "v7 deterministic evidence with a separate semantic-review.v4 job contract. Editing feasibility is derived per requested job; final rewriting remains outside this experiment.",
});

/** Experimental planning only: adds explicit objective and source-preservation coverage. */
export const RECONSTRUCTION_V9 = define({
  ...RECONSTRUCTION_V8,
  version: 9,
  name: "Reconstruction v9 (source-grounded job planning)",
  description: "v8 deterministic evidence with semantic-review.v5 requirements, preservation constraints, and job-local withholding. No generation route selects it.",
});

/** Experimental candidate-first editing loop; executed only by verified-reconstruction. */
export const RECONSTRUCTION_V10 = define({
  ...RECONSTRUCTION_V5,
  version: 10,
  name: "Reconstruction v10 (verified frontier editing)",
  description: "Frontier editor drafts one candidate; source/candidate checks and an independent verifier accept, locally repair once, or return the source. Explicit runner only.",
  prompt: { id: "reconstruct", version: 7 },
  retryPolicy: { maxAttemptsLive: 1, maxAttemptsDemo: 1, retryOn: [] },
  postCheckPolicy: { modelMeaning: "never", claimsExtractionMinWords: null },
});

/** Experimental V10 editor with objective-aware candidate verification. */
export const RECONSTRUCTION_V11 = define({
  ...RECONSTRUCTION_V10,
  version: 11,
  name: "Reconstruction v11 (objective-aware verification)",
  description: "V10 candidate generation with narrow objective-authorized changes, structural formatting checks, independent review, and honest repair accounting. Explicit runner only.",
});

export const STRATEGIES: readonly RewriteStrategy[] = [RECONSTRUCTION_V1, RECONSTRUCTION_V2, RECONSTRUCTION_V3, RECONSTRUCTION_V4, RECONSTRUCTION_V5, RECONSTRUCTION_V6, RECONSTRUCTION_V7, RECONSTRUCTION_V8, RECONSTRUCTION_V9, RECONSTRUCTION_V10, RECONSTRUCTION_V11];
export const DEFAULT_STRATEGY = RECONSTRUCTION_V1;

export function getStrategy(key: string): RewriteStrategy {
  const s = STRATEGIES.find((x) => strategyKey(x) === key);
  if (!s) throw new Error(`Unknown rewrite strategy "${key}". Known: ${STRATEGIES.map(strategyKey).join(", ")}`);
  return s;
}
