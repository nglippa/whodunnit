import { z } from "zod";
import { DETERMINISM_LEVELS, SOURCE_TYPES, writingRuleSchema } from "./writing-rules";

/**
 * Rule sources and rule candidates.
 *
 * SOURCE → NormalizedSource → RuleCandidate[] → (review) → WritingRule
 *
 * A candidate is a proposal. Nothing becomes an active rule without an explicit
 * review step; neither source text nor a model can activate a rule.
 */

export const SOURCE_STATUSES = ["extracted", "compiled", "reviewed", "rejected"] as const;

export const sourceDocumentSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/).max(80),
    type: z.enum(SOURCE_TYPES),
    title: z.string().min(1).max(200),
    url: z.url().optional(),
    author: z.string().max(120).optional(),
    license: z.string().max(120).optional(),
    /** How the source may be used, recorded at ingestion time. */
    usage: z.enum(["adapt-with-attribution", "reference-only", "derived-rules-only"]),
    retrievedAt: z.string().optional(),
    /** sha256 of the normalised body; unchanged hash means unchanged content. */
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(SOURCE_STATUSES),
    notes: z.string().max(600).optional(),
  })
  .strict();
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const sourceSectionSchema = z
  .object({
    /** Stable anchor within the source, e.g. "s3-patterns-to-cut". */
    anchor: z.string().min(1).max(120),
    heading: z.string().max(300),
    level: z.number().int().min(0).max(6),
    text: z.string().max(200_000),
  })
  .strict();
export type SourceSection = z.infer<typeof sourceSectionSchema>;

/**
 * The single interface every extractor produces: a webpage scrape, a local
 * Markdown/text file, or (later) a book-to-skill style chapter set.
 */
export const normalizedSourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/).max(80),
    type: z.enum(SOURCE_TYPES),
    title: z.string().min(1).max(200),
    url: z.url().optional(),
    retrievedAt: z.string(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    sections: z.array(sourceSectionSchema).min(1).max(500),
  })
  .strict();
export type NormalizedSource = z.infer<typeof normalizedSourceSchema>;

/** A short, verbatim pointer into the source. Deliberately short: anchors, not copies. */
export const sourceAnchorSchema = z
  .object({
    sectionAnchor: z.string().min(1).max(120),
    sectionHeading: z.string().max(300),
    excerpt: z.string().min(1).max(280),
  })
  .strict();

export const CANDIDATE_STATUSES = ["candidate", "approved", "rejected"] as const;

export const ruleCandidateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/).max(120),
    sourceDocumentId: z.string().min(1),
    /** A complete proposed rule. Always stored disabled until approved. */
    proposedRule: writingRuleSchema,
    anchor: sourceAnchorSchema,
    /** Plain-language description of how the rule would be detected. */
    detectionStrategy: z.string().min(1).max(400),
    determinism: z.enum(DETERMINISM_LEVELS),
    /** Extractor's confidence that this is a useful, correctly-captured rule (0–1). */
    confidence: z.number().min(0).max(1),
    origin: z.enum(["heuristic-extractor", "model"]),
    warnings: z.array(z.string().max(300)).max(20),
    status: z.enum(CANDIDATE_STATUSES),
  })
  .strict()
  .refine((c) => c.status === "approved" || c.proposedRule.enabled === false, {
    error: "Unreviewed candidates must carry a disabled rule",
  });
export type RuleCandidate = z.infer<typeof ruleCandidateSchema>;
