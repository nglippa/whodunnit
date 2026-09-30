import { z } from "zod";

/**
 * A RewriteStrategy is the complete, versioned policy for one way of
 * reconstructing text: which prompt, how the plan is compiled, when to retry,
 * what runs after each candidate. Everything that changes rewrite behaviour
 * lives here rather than in a route handler or a provider, so an evaluation
 * record can name exactly what produced an output.
 *
 * Strategies are immutable: changing any field means a new version.
 */

export const PROMPT_IDS = ["reconstruct", "verify", "analyze", "voiceprint", "compile", "judge", "orchestrate", "repair", "local-alternative"] as const;
export type PromptId = (typeof PROMPT_IDS)[number];

export const promptRefSchema = z.object({ id: z.enum(PROMPT_IDS), version: z.number().int().min(1) }).strict();
export type PromptRef = z.infer<typeof promptRefSchema>;
export const promptKey = (p: PromptRef) => `${p.id}.v${p.version}`;

export const RETRY_TRIGGERS = ["blocking-meaning", "introduced-deterministic-pattern"] as const;
export type RetryTrigger = (typeof RETRY_TRIGGERS)[number];

export const REWRITE_INTENSITIES = ["minimal", "normal", "substantial"] as const;
export type RewriteIntensity = (typeof REWRITE_INTENSITIES)[number];

export const rewriteStrategySchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.number().int().min(1),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(600),
    status: z.enum(["production", "experimental", "retired"]),
    prompt: promptRefSchema.refine((p) => p.id === "reconstruct", { error: "A rewrite strategy uses a reconstruct prompt" }),
    planning: z
      .object({
        /** full-contract: every active constraint and prohibition. prioritized: budgeted by priority and relevance. */
        mode: z.enum(["full-contract", "prioritized"]),
        /** record-only: intensity is computed and stored, not sent. enforce: the contract tells the model how much to change. */
        intensity: z.enum(["record-only", "enforce"]),
        /**
         * Let habits the SOURCE demonstrates (deliberate dashes, fragments,
         * semicolons) outrank the style preset, without a saved Voiceprint.
         * Absent = off: strategies published before it keep their plans.
         */
        sourceVoice: z.boolean().optional(),
      })
      .strict(),
    constraintPolicy: z
      .object({
        /** Caps apply only in prioritized mode; null = no cap. Semantic anchors are never capped. */
        maxPatterns: z.number().int().min(1).nullable(),
        maxProhibited: z.number().int().min(0).nullable(),
        maxAdvisory: z.number().int().min(0).nullable(),
        advisory: z.enum(["always", "unless-minimal", "never"]),
        /** Whether ranges the text already satisfies are restated to the model. */
        restateSatisfiedStyleRanges: z.boolean(),
      })
      .strict(),
    retryPolicy: z
      .object({
        maxAttemptsLive: z.number().int().min(1).max(5),
        maxAttemptsDemo: z.number().int().min(1).max(5),
        retryOn: z.array(z.enum(RETRY_TRIGGERS)),
      })
      .strict(),
    /**
     * Minimal change. "prompt-only" (absent = v1/v2): the contract may ask for
     * restraint. "unchanged": when the plan's minimal-change decision holds,
     * the source is returned as it is, without a model call.
     */
    minimalChange: z.enum(["prompt-only", "unchanged"]).optional(),
    /**
     * Refinement. "legacy" (absent = v1/v2): the model revises the current
     * text with the source attached. "delta": the contract carries an explicit
     * refinement delta (objectives, restorations toward the original, claim
     * triage for shortening, licences from the author's own words).
     */
    refinement: z.enum(["legacy", "delta"]).optional(),
    postCheckPolicy: z
      .object({
        /** Model meaning check: skipped when deterministic checks already rejected the candidate. */
        modelMeaning: z.enum(["when-deterministic-passes", "never"]),
        /** Minimum source words before a model claim-extraction call is made. null = never. */
        claimsExtractionMinWords: z.number().int().min(1).nullable(),
      })
      .strict(),
  })
  .strict();
export type RewriteStrategy = z.infer<typeof rewriteStrategySchema>;
export const strategyKey = (s: Pick<RewriteStrategy, "id" | "version">) => `${s.id}-v${s.version}`;
