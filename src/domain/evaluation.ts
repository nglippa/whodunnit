import { z } from "zod";
import { judgeConfigSchema, judgeResultSchema } from "./judge";
import { refinementSchema } from "./refinement";
import { claimChangeSchema } from "./semantics";
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

/**
 * Generation settings recorded for reproducibility. Absent fields mean the
 * provider's or server's default. A reasoning budget can be sent per request
 * or declared as configured on the server; either way runs with different
 * budgets are never treated as the same configuration.
 */
export const generationSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).optional(),
    seed: z.number().int().optional(),
    maxTokens: z.number().int().min(1).optional(),
    reasoningBudget: z.number().int().min(0).optional(),
    reasoningControl: z.enum(["request", "server-declared"]).optional(),
    reasoningParam: z.string().regex(/^[a-z_]+$/).optional(),
    reasoningEffort: z.string().max(20).optional(),
  })
  .strict();
export type GenerationSettingsConfig = z.infer<typeof generationSettingsSchema>;

/** What is being evaluated. Only parameters the provider architecture actually supports. */
export const evaluationConfigSchema = z
  .object({
    provider: z.enum(["anthropic", "gemini", "openai-compatible", "demo"]),
    model: z.string().min(1).nullable(),
    strategy: z.string().min(1),
    /** openai-compatible only: the server's base URL (no credentials). */
    baseUrl: z.string().url().optional(),
    generation: generationSettingsSchema.optional(),
    /** An independent semantic judge (evaluation only). */
    judge: judgeConfigSchema.optional(),
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

const VERDICTS = z.enum(["PASS", "NEEDS_REVIEW", "FAIL"]);

export const integritySummarySchema = z
  .object({
    version: z.string(),
    verdict: VERDICTS,
    sourceClaims: z.number().int(),
    outputClaims: z.number().int(),
    aligned: z.number().int(),
    /** Source claims inside removable filler patterns (a rewrite may drop them). */
    removableClaims: z.array(z.string()),
    quotesBalanced: z.object({ source: z.boolean(), output: z.boolean() }).strict(),
    changes: z.array(claimChangeSchema),
  })
  .strict();
export type IntegritySummary = z.infer<typeof integritySummarySchema>;

export const disagreementSchema = z
  .object({
    between: z.tuple([z.enum(["deterministic", "self-check", "judge"]), z.enum(["deterministic", "self-check", "judge"])]),
    verdicts: z.tuple([z.string(), z.string()]),
    note: z.string().max(400),
  })
  .strict();

export const semanticGateSchema = z
  .object({
    /**
     * FAIL if any blocking finding exists (deterministic, self-check, or a judge
     * finding with verified evidence). NEEDS_REVIEW if only major findings.
     * A deterministic FAIL is never overridden by a model's PASS.
     */
    verdict: VERDICTS,
    deterministic: z.object({ verdict: VERDICTS, failures: z.array(findingLite), warnings: z.array(findingLite) }).strict(),
    model: z.object({ status: z.enum(["pass", "fail", "not-run"]), failures: z.array(findingLite), warnings: z.array(findingLite) }).strict(),
    lexicalCoverage: z.number().nullable(),
    /** Case-specific literal anchors (expectations.anchors) that did not survive. */
    caseAnchorsLost: z.array(z.string()),
    /** Claim-level integrity (schema v2). */
    integrity: integritySummarySchema.optional(),
    /** Independent judge (schema v2; absent when no judge was configured). */
    judge: judgeResultSchema.nullable().optional(),
    /** Where the deterministic checks, the model's self-check and the judge disagree. */
    disagreements: z.array(disagreementSchema).optional(),
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
    /** Pattern families (schema v2): a family that persisted may have been reworded, not removed. */
    families: z
      .object({
        resolved: z.array(z.string()),
        persisted: z.array(z.object({ family: z.string(), before: z.array(z.string()), after: z.array(z.string()) }).strict()),
        introduced: z.array(z.string()),
      })
      .strict()
      .optional(),
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
    goldSemanticVerdict: z.enum(["PASS", "NEEDS_REVIEW", "FAIL"]),
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
    /** Schema v2: token retention against the ORIGINAL source (same as retention.tokenRetention, named for clarity). */
    originalWordingRetention: z.number().optional(),
    /** Schema v2: the strategy returned the source unchanged without a model call. */
    unchangedByPolicy: z.boolean().optional(),
    /** Schema v2: the requested refinement delta for this stage. */
    refinementDelta: z
      .object({
        objectives: z.array(z.object({ id: z.string(), reference: z.enum(["original", "current"]) }).strict()),
        licenses: z.array(z.string()),
        restorations: z.array(z.object({ source: z.string(), current: z.string().nullable(), retained: z.number() }).strict()),
        triage: z.object({ mustKeep: z.number().int(), mayCompress: z.number().int(), mayRemove: z.number().int() }).strict().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type StageRecord = z.infer<typeof stageRecordSchema>;

/** Records written by this version. Version 1 files (before claim-level integrity) still load. */
export const EVALUATION_RECORD_VERSION = 2;

export const evaluationRecordSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
        /** Schema v2: requested generation settings, and what the provider actually sent. */
        generation: z
          .object({ requested: generationSettingsSchema, applied: z.array(z.string()), unsupported: z.array(z.string()), declared: z.array(z.string()) })
          .strict()
          .optional(),
        /** Schema v2: the independent judge, if any. */
        judge: z
          .object({
            provider: z.string(),
            model: z.string().nullable(),
            selfJudged: z.boolean(),
            prompt: z.string().optional(),
            /** The judge's generation settings as sent (e.g. reasoningEffort=medium), and any it could not honour. */
            settings: z.object({ applied: z.array(z.string()), unsupported: z.array(z.string()) }).strict().optional(),
          })
          .strict()
          .nullable()
          .optional(),
        /** Schema v2: version of the deterministic meaning analysis. */
        analysisVersion: z.string().optional(),
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
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
