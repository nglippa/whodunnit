import { z } from "zod";
import { FINDING_KINDS } from "@/domain/verification";

/**
 * Schemas for everything a model returns. Model output is untrusted input:
 * it is parsed against these before any other code touches it.
 */

export const discourseAnalysisSchema = z
  .object({
    argumentShape: z.string().max(300),
    claims: z.array(z.string().max(300)).max(20),
    styleIssues: z.array(z.string().max(200)).max(10),
  })
  .strict();
export type DiscourseAnalysis = z.infer<typeof discourseAnalysisSchema>;

export const candidateSchema = z
  .object({
    text: z.string().min(1).max(60_000),
    changes: z.array(z.string().max(200)).max(8),
  })
  .strict();
export type Candidate = z.infer<typeof candidateSchema>;

export const meaningCheckSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            kind: z.enum(FINDING_KINDS),
            severity: z.enum(["blocking", "warning"]),
            message: z.string().min(1).max(400),
            source: z.string().max(300).optional(),
            candidate: z.string().max(300).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type MeaningCheck = z.infer<typeof meaningCheckSchema>;

export const voiceprintObservationsSchema = z
  .object({
    observations: z
      .array(z.object({ text: z.string().min(1).max(200), confidence: z.number().min(0).max(1) }).strict())
      .max(8),
  })
  .strict();
export type VoiceprintObservations = z.infer<typeof voiceprintObservationsSchema>;

/** Parse untrusted JSON-ish model output; returns null instead of throwing. */
export function parseModelJson<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    try {
      value = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "Model output was not valid JSON." };
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) return { ok: false, error: `Model output failed validation (${result.error.issues.length} issue${result.error.issues.length === 1 ? "" : "s"}).` };
  return { ok: true, data: result.data };
}
