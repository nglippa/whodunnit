import { z } from "zod";

/**
 * VerificationResult describes how faithfully a candidate preserves the
 * source's meaning. Deterministic checks and model-assisted checks produce the
 * same Finding shape so the pipeline can gate on either.
 */

export const FINDING_KINDS = [
  "altered_number",
  "altered_date",
  "altered_name",
  "altered_quotation",
  "altered_link",
  "negation_changed",
  "missing_claim",
  "added_claim",
  "changed_assertion",
  "meaning_drift",
  "length_out_of_range",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const findingSchema = z
  .object({
    kind: z.enum(FINDING_KINDS),
    severity: z.enum(["blocking", "warning"]),
    /** Human-readable explanation; never contains more than a short excerpt. */
    message: z.string().min(1).max(400),
    /** The source fragment involved, if any (short). */
    source: z.string().max(300).optional(),
    /** The candidate fragment involved, if any (short). */
    candidate: z.string().max(300).optional(),
    origin: z.enum(["deterministic", "model"]),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;

export const verificationResultSchema = z
  .object({
    status: z.enum(["preserved", "review", "rejected"]),
    findings: z.array(findingSchema),
    /** Which checks actually ran, so the UI never implies a check that didn't happen. */
    checks: z.array(z.enum(["protected_spans", "negation", "length", "lexical_coverage", "model_meaning"])),
    /** Share of the source's content words still present (0–1). Deterministic. */
    lexicalCoverage: z.number().min(0).max(1).optional(),
  })
  .strict();
export type VerificationResult = z.infer<typeof verificationResultSchema>;

export function statusFromFindings(findings: Finding[]): VerificationResult["status"] {
  if (findings.some((f) => f.severity === "blocking")) return "rejected";
  if (findings.length > 0) return "review";
  return "preserved";
}
