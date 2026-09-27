import { z } from "zod";

/**
 * The independent semantic judge: a model other than the one being
 * evaluated, asked specific questions about meaning with the deterministic
 * analysis in hand. Its findings must quote evidence from the source and the
 * output; evidence that cannot be found in the texts is recorded as
 * unverified and cannot fail a case on its own.
 *
 * The judge supplements deterministic checks. It never overrides a
 * deterministic failure.
 */

export const JUDGE_KINDS = [
  "added_claim",
  "dropped_claim",
  "strengthened",
  "weakened",
  "contradiction",
  "causal_change",
  "temporal_change",
  "comparative_change",
  "modality_change",
  "domain_term_substitution",
  "quotation_change",
] as const;
export type JudgeKind = (typeof JUDGE_KINDS)[number];

/** What the judge model must return (validated; never widened to make a response pass). */
export const judgeOutputSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            kind: z.enum(JUDGE_KINDS),
            severity: z.enum(["blocking", "major", "minor"]),
            /** Exact words from the SOURCE ("" when the finding is an addition). */
            sourceEvidence: z.string().max(300),
            /** Exact words from the OUTPUT ("" when the finding is a drop). */
            outputEvidence: z.string().max(300),
            explanation: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export const judgeFindingSchema = judgeOutputSchema.shape.findings.element.extend({
  /** Were the quoted spans actually found in the texts? */
  evidenceVerified: z.boolean(),
  /** Severity after evidence verification (unverified findings are capped at minor). */
  effectiveSeverity: z.enum(["blocking", "major", "minor"]),
});
export type JudgeFinding = z.infer<typeof judgeFindingSchema>;

export const judgeResultSchema = z
  .object({
    provider: z.string(),
    model: z.string().nullable(),
    prompt: z.string(),
    /** true when the judge is the same provider and model as the rewrite under test. */
    selfJudged: z.boolean(),
    status: z.enum(["ran", "failed"]),
    error: z.string().max(400).nullable(),
    verdict: z.enum(["PASS", "NEEDS_REVIEW", "FAIL", "NOT_RUN"]),
    findings: z.array(judgeFindingSchema),
    latencyMs: z.number().min(0).nullable(),
    tokens: z.object({ input: z.number(), output: z.number() }).strict().nullable(),
  })
  .strict();
export type JudgeResult = z.infer<typeof judgeResultSchema>;

export const judgeConfigSchema = z
  .object({
    provider: z.enum(["anthropic", "gemini", "openai-compatible"]),
    model: z.string().min(1),
    baseUrl: z.string().url().optional(),
  })
  .strict();
export type JudgeConfig = z.infer<typeof judgeConfigSchema>;
