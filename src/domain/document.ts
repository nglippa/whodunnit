import { z } from "zod";
import { styleProfileSchema } from "./style";
import { refinementSchema } from "./refinement";
import { verificationResultSchema } from "./verification";
import { voiceprintSchema } from "./voiceprint";
import { DIMENSIONS } from "./writing-rules";

/**
 * Documents, revisions and the request that produces a revision.
 * A Document keeps the author's source text untouched; every reconstruction
 * or refinement becomes a Revision that points back at it.
 */

export const userSchema = z
  .object({ id: z.string().min(1), email: z.email().nullable(), createdAt: z.string() })
  .strict();
export type User = z.infer<typeof userSchema>;

export const MAX_SOURCE_CHARS = 20_000;

export const styleTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), presetId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("voiceprint"), voiceprintId: z.string().min(1) }).strict(),
]);
export type StyleTarget = z.infer<typeof styleTargetSchema>;

export const reconstructionRequestSchema = z
  .object({
    source: z.string().trim().min(1, { error: "There is no text to reconstruct." }).max(MAX_SOURCE_CHARS),
    profile: styleProfileSchema,
    /**
     * The Voiceprint behind a voiceprint target: measured statistics and short
     * observations only. Writing samples never leave the browser.
     */
    voiceprint: voiceprintSchema.optional(),
    /** Present when refining: the current result is transformed, the source stays the anchor. */
    refinement: z
      .object({ current: z.string().min(1).max(MAX_SOURCE_CHARS * 2), change: refinementSchema })
      .strict()
      .optional(),
  })
  .strict();
export type ReconstructionRequest = z.infer<typeof reconstructionRequestSchema>;

export const engineInfoSchema = z
  .object({ mode: z.enum(["live", "demo"]), provider: z.string(), model: z.string().nullable() })
  .strict();
export type EngineInfo = z.infer<typeof engineInfoSchema>;

const patternCountSchema = z.object({ ruleId: z.string(), name: z.string(), count: z.number().int().nonnegative() }).strict();

/** Rule patterns before vs after a reconstruction. Counts, not a quality score. */
export const patternComparisonSchema = z
  .object({
    before: z.number().int().nonnegative(),
    after: z.number().int().nonnegative(),
    resolved: z.array(patternCountSchema),
    remaining: z.array(patternCountSchema),
    introduced: z.array(patternCountSchema.extend({ deterministic: z.boolean() })),
    targets: z.array(
      z
        .object({
          dimension: z.enum(DIMENSIONS),
          label: z.string(),
          unit: z.string(),
          before: z.number(),
          after: z.number(),
          min: z.number(),
          max: z.number(),
          origin: z.string(),
          met: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type PatternComparison = z.infer<typeof patternComparisonSchema>;

/** How many protected facts of each kind the source had and the result kept. */
export const preservedSchema = z
  .object({
    numbers: z.number().int().nonnegative(),
    dates: z.number().int().nonnegative(),
    names: z.number().int().nonnegative(),
    quotations: z.number().int().nonnegative(),
    links: z.number().int().nonnegative(),
  })
  .strict();
export type Preserved = z.infer<typeof preservedSchema>;

export const reconstructionResultSchema = z
  .object({
    text: z.string(),
    verification: verificationResultSchema,
    attempts: z.number().int().min(1),
    engine: engineInfoSchema,
    promptVersion: z.string(),
    /** Planner intentions derived from measurements (never the source text). */
    plan: z.array(z.string().max(200)).max(8),
    /** What the engine reports it changed in expression. */
    changes: z.array(z.string().max(200)).max(8),
    patterns: patternComparisonSchema,
    preserved: preservedSchema,
  })
  .strict();
export type ReconstructionResult = z.infer<typeof reconstructionResultSchema>;

export const revisionSchema = z
  .object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    parentRevisionId: z.string().nullable(),
    text: z.string(),
    target: styleTargetSchema,
    profileLabel: z.string(),
    /** The effective style profile that produced this revision (provenance and refinement base). */
    profile: styleProfileSchema,
    refinement: refinementSchema.nullable(),
    verification: verificationResultSchema,
    engine: engineInfoSchema,
    promptVersion: z.string(),
    /** Rule patterns before vs after, when the revision came from the engine. */
    patterns: patternComparisonSchema.optional(),
    preserved: preservedSchema.optional(),
    /** true once the author edits the reconstructed text by hand. */
    editedByAuthor: z.boolean(),
    createdAt: z.string(),
  })
  .strict();
export type Revision = z.infer<typeof revisionSchema>;

export const documentSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().max(120),
    source: z.string().max(MAX_SOURCE_CHARS),
    target: styleTargetSchema,
    revisionIds: z.array(z.string()),
    currentRevisionId: z.string().nullable(),
    /** The author's unsaved hand edits to the current revision, if any. */
    resultDraft: z.string().max(MAX_SOURCE_CHARS * 2).nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type WhodunnitDocument = z.infer<typeof documentSchema>;
