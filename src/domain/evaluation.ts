import { z } from "zod";
import { refinementSchema } from "./refinement";
import { PRESET_IDS } from "./style";
import { DIMENSIONS } from "./writing-rules";

/**
 * Evaluation of real reconstruction: a versioned corpus, optional human
 * reference rewrites, the configuration under test, and one record per case
 * that is complete enough to reproduce and compare an experiment.
 *
 * Deliberately absent: any composite quality score, any "human percentage",
 * any detector output. Records hold dimensions; people decide.
 *
 * Evaluation data is developer data about fixture texts. Nothing here is fed
 * by, or persisted for, a user's documents.
 */

export const CORPUS_CATEGORIES = {
  formulaic: "A. Formulaic synthetic prose",
  ordinary: "B. Competent ordinary prose",
  casual: "C. Casual conversational prose",
  professional: "D. Professional email/business prose",
  academic: "E. Academic prose",
  stylized: "F. Intentionally stylised prose",
  terse: "G. Terse writing",
  "long-form": "H. Long-form explanatory writing",
  anchors: "I. Figures, dates, quotations, names and URLs",
  repetition: "J. Legitimate repetition",
  voiceprint: "K. Strong Voiceprint characteristics",
  "already-good": "L. Already-good prose that should change very little",
  "formal-appropriate": "M. Formal prose that is appropriate as it is",
  dashes: "N. Intentional em dashes",
  triads: "O. Lists of three that should remain",
  negations: "P. Negations whose meaning must not flip",
  nuance: "Q. Nuance at risk when shortening",
  messy: "R. Messy casual writing whose voice must survive",
  "refinement-chain": "Repeated refinement",
  "constraint-load": "Constraint load (few vs many constraints)",
} as const;
export type CorpusCategory = keyof typeof CORPUS_CATEGORIES;
const categoryKeys = Object.keys(CORPUS_CATEGORIES) as [CorpusCategory, ...CorpusCategory[]];

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export const caseExpectationsSchema = z
  .object({
    /** Meaning-critical literal substrings beyond the automatic anchors (e.g. a negated clause). Losing one fails the semantic gate. */
    anchors: z.array(z.string().min(1)).default([]),
    /** Stylistic features that should survive (e.g. a deliberate triad). Reported as expectations, not meaning failures. */
    keep: z.array(z.string().min(1)).default([]),
    /** For minimal-change cases: the least share of source tokens the output should keep. */
    minTokenRetention: z.number().min(0).max(1).optional(),
    lengthRatio: z.object({ min: z.number().min(0), max: z.number().min(0) }).strict().optional(),
    notes: z.string().max(600).optional(),
  })
  .strict();

export const corpusCaseSchema = z
  .object({
    id: slug,
    version: z.number().int().min(1),
    category: z.enum(categoryKeys),
    title: z.string().min(1).max(120),
    /** Path relative to the repository root. */
    textFile: z.string().min(1),
    style: z.enum(PRESET_IDS),
    /** Id of a Voiceprint fixture in data/evaluation/voiceprints. */
    voiceprint: slug.optional(),
    /** Refinements applied one after another, each anchored to the original source. */
    refinementChain: z.array(refinementSchema).min(1).optional(),
    purpose: z.string().min(1).max(400),
    provenance: z.string().min(1).max(200),
    expectations: caseExpectationsSchema.default({ anchors: [], keep: [] }),
    smoke: z.boolean().default(false),
  })
  .strict();
export type CorpusCase = z.infer<typeof corpusCaseSchema>;

export const corpusManifestSchema = z
  .object({
    version: z.number().int().min(1),
    description: z.string(),
    cases: z.array(corpusCaseSchema).min(1),
  })
  .strict()
  .refine((m) => new Set(m.cases.map((c) => c.id)).size === m.cases.length, { error: "Corpus case ids must be unique" });
export type CorpusManifest = z.infer<typeof corpusManifestSchema>;

/** A human-authored reference rewrite: one valid editorial answer, never the only one. */
export const goldRewriteSchema = z
  .object({
    corpusCaseId: slug,
    text: z.string().min(1),
    author: z.string().min(1),
    provenance: z.string().min(1).max(300),
    notes: z.string().max(600).optional(),
    goals: z.array(z.string().max(200)).max(8).optional(),
  })
  .strict();
export type GoldRewrite = z.infer<typeof goldRewriteSchema>;

export const voiceprintFixtureSchema = z
  .object({
    id: slug,
    name: z.string().min(1).max(60),
    provenance: z.string().min(1).max(300),
    sampleFiles: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type VoiceprintFixture = z.infer<typeof voiceprintFixtureSchema>;

/** What is being evaluated. Only parameters the provider architecture actually supports. */
export const evaluationConfigSchema = z
  .object({
    provider: z.enum(["anthropic", "demo"]),
    model: z.string().min(1).nullable(),
    strategy: z.string().min(1),
  })
  .strict()
  .refine((c) => (c.provider === "demo") === (c.model === null), { error: "The demo engine has no model; a model provider needs one" });
export type EvaluationConfig = z.infer<typeof evaluationConfigSchema>;

const tri = z.enum(["yes", "no", "uncertain"]);
export const humanReviewSchema = z
  .object({
    reviewer: z.string().max(80).optional(),
    reviewedAt: z.string(),
    /** Which stage was reviewed (0-based); defaults to the final stage. */
    stage: z.number().int().min(0).optional(),
    meaningPreserved: tri,
    voicePreserved: tri,
    naturalness: z.enum(["better", "same", "worse"]),
    unnecessaryRewrite: z.enum(["yes", "no"]),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type HumanReview = z.infer<typeof humanReviewSchema>;

export const attemptRecordSchema = z
  .object({
    attempt: z.number().int().min(1),
    trigger: z.enum(["initial", "retry"]),
    retryBecause: z.array(z.string()),
    outcome: z.enum(["candidate", "provider-error", "empty-output"]),
    errorCode: z.string().optional(),
    verificationStatus: z.enum(["preserved", "review", "rejected"]).optional(),
    semanticFailures: z.array(z.object({ kind: z.string(), severity: z.enum(["blocking", "warning"]), origin: z.enum(["deterministic", "model"]) }).strict()),
    introducedDeterministic: z.array(z.string()),
    modelMeaning: z.enum(["ran", "skipped-by-policy", "skipped-after-rejection", "unavailable"]),
    outputHash: z.string().optional(),
    outputWords: z.number().int().optional(),
    latencyMs: z.number().min(0),
    provider: z
      .object({
        latencyMs: z.number().optional(),
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        stopReason: z.string().nullable().optional(),
        requestId: z.string().nullable().optional(),
        httpStatus: z.number().nullable().optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const findingLite = z.object({ kind: z.string(), message: z.string() }).strict();

export const semanticGateSchema = z
  .object({
    /** FAIL if any blocking finding exists, deterministic or model. Deterministic failures are never overridden. */
    verdict: z.enum(["PASS", "FAIL"]),
    deterministic: z.object({ verdict: z.enum(["PASS", "FAIL"]), failures: z.array(findingLite), warnings: z.array(findingLite) }).strict(),
    model: z.object({ status: z.enum(["pass", "fail", "not-run"]), failures: z.array(findingLite), warnings: z.array(findingLite) }).strict(),
    lexicalCoverage: z.number().nullable(),
    /** Case-specific literal anchors (expectations.anchors) that did not survive. */
    caseAnchorsLost: z.array(z.string()),
  })
  .strict();
export type SemanticGate = z.infer<typeof semanticGateSchema>;

export const retentionSchema = z
  .object({
    sourceWords: z.number().int(),
    outputWords: z.number().int(),
    lengthRatio: z.number(),
    /** Share of source tokens (multiset) that appear in the output. */
    tokenRetention: z.number(),
    /** Share of source word bigrams / trigrams that survive. Phrase-level retention. */
    bigramRetention: z.number(),
    trigramRetention: z.number(),
    /** Word-level Levenshtein distance / longer length; null for very long texts. */
    wordEditDistance: z.number().nullable(),
    /** Share of output tokens that are not in the source. */
    novelTokenShare: z.number(),
  })
  .strict();
export type Retention = z.infer<typeof retentionSchema>;

export const metricDeltaSchema = z
  .object({ metric: z.string(), label: z.string(), unit: z.string(), before: z.number(), after: z.number(), delta: z.number() })
  .strict();
export type MetricDelta = z.infer<typeof metricDeltaSchema>;

export const voiceDimensionSchema = z
  .object({
    dimension: z.enum(DIMENSIONS),
    label: z.string(),
    unit: z.string(),
    expected: z.object({ min: z.number(), max: z.number() }).strict(),
    source: z.number(),
    actual: z.number(),
    /** Confidence in the expected range: the Voiceprint measurement's, or the source's volume confidence. */
    confidence: z.number(),
    withinRange: z.boolean(),
    sourceWithinRange: z.boolean(),
  })
  .strict();

export const voiceComparisonSchema = z
  .object({
    /** voiceprint: ranges from the author's Voiceprint. source: ranges around the source text's own tendencies. */
    reference: z.enum(["voiceprint", "source"]),
    referenceName: z.string(),
    dimensions: z.array(voiceDimensionSchema),
    /** Dimensions that moved out of range (in range in the source, out in the output). Not a score. */
    movedOut: z.array(z.string()),
    movedIn: z.array(z.string()),
  })
  .strict();
export type VoiceComparison = z.infer<typeof voiceComparisonSchema>;

const ruleCount = z.object({ ruleId: z.string(), name: z.string(), count: z.number().int(), determinism: z.string() }).strict();
export const ruleDiffSchema = z
  .object({
    before: z.array(ruleCount),
    after: z.array(ruleCount),
    resolved: z.array(z.string()),
    remaining: z.array(z.string()),
    introduced: z.array(z.string()),
    introducedDeterministic: z.array(z.string()),
  })
  .strict();
export type RuleDiff = z.infer<typeof ruleDiffSchema>;

export const expectationResultSchema = z.object({ id: z.string(), description: z.string(), passed: z.boolean(), detail: z.string() }).strict();

export const goldComparisonSchema = z
  .object({
    author: z.string(),
    provenance: z.string(),
    goldRetention: retentionSchema,
    /** Patterns the human editor removed, and whether the output removed them too. */
    removedByGold: z.array(z.string()),
    removedByOutput: z.array(z.string()),
    removedByBoth: z.array(z.string()),
    /** Direction of sentence-length variation change (CV): source → gold vs source → output. */
    sentenceCv: z.object({ source: z.number(), gold: z.number(), output: z.number() }).strict(),
    paragraphs: z.object({ source: z.number(), gold: z.number(), output: z.number() }).strict(),
    goldSemanticVerdict: z.enum(["PASS", "FAIL"]),
  })
  .strict();

export const stageRecordSchema = z
  .object({
    index: z.number().int().min(0),
    label: z.string(),
    refinement: refinementSchema.optional(),
    profileLabel: z.string(),
    plan: z
      .object({
        intensity: z.enum(["minimal", "normal", "substantial"]),
        intensityReasons: z.array(z.string()),
        size: z.record(z.string(), z.number()),
        omitted: z.array(z.object({ section: z.string(), name: z.string(), reason: z.string() }).strict()),
        contractChars: z.number().int(),
      })
      .strict(),
    output: z.object({ text: z.string(), hash: z.string(), words: z.number().int(), changesReported: z.array(z.string()) }).strict(),
    attempts: z.array(attemptRecordSchema),
    retries: z.number().int().min(0),
    latencyMs: z.number().min(0),
    tokens: z.object({ input: z.number(), output: z.number() }).strict().nullable(),
    semantic: semanticGateSchema,
    rules: ruleDiffSchema,
    metricsAfter: z.record(z.string(), z.unknown()),
    /** Against the original source (the anchor), not the previous stage. */
    metricDeltas: z.array(metricDeltaSchema),
    retention: retentionSchema,
    /** Refinement stages only: retention against the previous stage's output. */
    retentionVsPrevious: retentionSchema.nullable(),
    voice: voiceComparisonSchema,
    expectations: z.array(expectationResultSchema),
    gold: goldComparisonSchema.nullable(),
  })
  .strict();
export type StageRecord = z.infer<typeof stageRecordSchema>;

export const evaluationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    runId: z.string().min(1),
    createdAt: z.string(),
    case: z
      .object({ id: z.string(), version: z.number().int(), category: z.enum(categoryKeys), title: z.string(), corpusVersion: z.number().int(), textHash: z.string() })
      .strict(),
    config: z
      .object({
        provider: z.string(),
        mode: z.enum(["live", "demo"]),
        /** true only when a real model produced the output. */
        realModel: z.boolean(),
        model: z.string().nullable(),
        sampling: z.literal("provider-default"),
        strategy: z.object({ key: z.string(), name: z.string(), status: z.string() }).strict(),
        prompt: z.object({ key: z.string(), fingerprint: z.string() }).strict(),
        rulePacks: z.array(z.object({ id: z.string(), version: z.number().int() }).strict()),
        voiceprint: z.object({ id: z.string(), name: z.string(), hash: z.string(), confidence: z.number() }).strict().nullable(),
        style: z.string(),
      })
      .strict(),
    source: z.object({ text: z.string(), words: z.number().int() }).strict(),
    before: z
      .object({
        metrics: z.record(z.string(), z.unknown()),
        triggered: z.array(ruleCount),
        anchors: z
          .object({ numbers: z.array(z.string()), dates: z.array(z.string()), names: z.array(z.string()), quotations: z.array(z.string()), links: z.array(z.string()), negations: z.number().int() })
          .strict(),
      })
      .strict(),
    stages: z.array(stageRecordSchema).min(1),
    review: humanReviewSchema.nullable(),
  })
  .strict();
export type EvaluationRecord = z.infer<typeof evaluationRecordSchema>;

export const evaluationFailureSchema = z
  .object({
    caseId: z.string(),
    stage: z.number().int().nullable(),
    code: z.string(),
    message: z.string().max(400),
    attempts: z.array(attemptRecordSchema),
    at: z.string(),
  })
  .strict();
export type EvaluationFailure = z.infer<typeof evaluationFailureSchema>;

export const runManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    label: z.string().max(80).nullable(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    config: evaluationConfigSchema,
    mode: z.enum(["live", "demo"]),
    realModel: z.boolean(),
    corpusVersion: z.number().int(),
    caseIds: z.array(z.string()),
    completed: z.array(z.string()),
    failed: z.array(z.string()),
    concurrency: z.number().int().min(1).max(2),
    git: z.object({ commit: z.string().nullable(), dirty: z.boolean().nullable() }).strict(),
  })
  .strict();
export type RunManifest = z.infer<typeof runManifestSchema>;
