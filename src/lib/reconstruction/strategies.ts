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

export const STRATEGIES: readonly RewriteStrategy[] = [RECONSTRUCTION_V1, RECONSTRUCTION_V2];
export const DEFAULT_STRATEGY = RECONSTRUCTION_V1;

export function getStrategy(key: string): RewriteStrategy {
  const s = STRATEGIES.find((x) => strategyKey(x) === key);
  if (!s) throw new Error(`Unknown rewrite strategy "${key}". Known: ${STRATEGIES.map(strategyKey).join(", ")}`);
  return s;
}
