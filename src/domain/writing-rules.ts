import { z } from "zod";

/**
 * Writing rules: structured, inspectable knowledge about observable writing
 * patterns. A rule describes WHAT to look for (detection), HOW sure a match is
 * (determinism), WHAT to do about it (remediation), WHERE it came from
 * (source), and HOW it ranks against other pressures (layer).
 *
 * Rules never estimate whether a machine wrote a text. They report patterns a
 * reader can check.
 */

export const RULE_CATEGORIES = [
  "lexical",
  "sentence",
  "paragraph",
  "discourse",
  "punctuation",
  "specificity",
  "repetition",
  "rhythm",
  "transition",
  "voice",
  "formatting",
  "semantic-safety",
  "other",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/**
 * How mechanically a rule can be evaluated.
 * - deterministic: exact, repeatable, low-ambiguity (a listed phrase is present)
 * - heuristic: measurable but interpretive (low sentence-length variation); may misfire
 * - model-assisted: needs a model to judge; no deterministic detector runs
 * - advisory: editorial guidance only; never "detected"
 */
export const DETERMINISM_LEVELS = ["deterministic", "heuristic", "model-assisted", "advisory"] as const;
export type DeterminismLevel = (typeof DETERMINISM_LEVELS)[number];

export const SEVERITIES = ["info", "suggestion", "warning"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Precedence layers, highest first. When two pressures pull on the same
 * dimension, the higher layer wins. Semantic safety is never overridden.
 */
export const RULE_LAYERS = ["semantic-safety", "user-instruction", "voiceprint", "style", "general", "advisory"] as const;
export type RuleLayer = (typeof RULE_LAYERS)[number];

/** Measurable axes that rules and constraints push on. Used to resolve conflicts. */
export const DIMENSIONS = [
  "rhythm.sentence-length",
  "rhythm.sentence-variation",
  "rhythm.paragraph-variation",
  "punctuation.dashes",
  "punctuation.semicolons",
  "voice.contractions",
  "voice.first-person",
  "voice.hedging",
  "voice.questions",
  "voice.fragments",
  "lexical.intensifiers",
  "transition.openers",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Metrics a metric-threshold detector may read. All are computed in lib/rules/metrics. */
export const METRIC_IDS = [
  "sentenceCount",
  "paragraphCount",
  "sentenceLengthCV",
  "paragraphLengthCV",
  "transitionOpenerShare",
  "likelyPassiveShare",
  "dashesPer100",
  "semicolonsPer100",
  "hedgesPer100",
  "intensifiersPer100",
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** Built-in detectors: structural checks too involved for a declarative spec. */
export const BUILTIN_DETECTORS = [
  "repeated-sentence-openers",
  "repeated-paragraph-openers",
  "repeated-transitions",
  "triad-overuse",
  "symmetrical-paragraphs",
  "no-sentence-extremes",
  "negative-listing",
  "dramatic-fragments",
  "self-answered-questions",
  "fake-profound-ending",
  "recap-ending",
  "synonym-cycling",
  "dramatic-headings",
  "emphasis-sprinkling",
  "paragraph-hedge-cluster",
] as const;
export type BuiltinDetectorId = (typeof BUILTIN_DETECTORS)[number];

export const COMPARISON_CHECKS = ["numbers", "dates", "names", "quotations", "links", "negation", "length", "coverage"] as const;
export type ComparisonCheck = (typeof COMPARISON_CHECKS)[number];

const MAX_PATTERN_LENGTH = 400;

export const detectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("phrase"),
      /** Literal phrases, matched case-insensitively on word boundaries. */
      phrases: z.array(z.string().trim().min(2).max(120)).min(1).max(200),
      /** Only match when the phrase opens a sentence. */
      sentenceStart: z.boolean().default(false),
      minOccurrences: z.number().int().min(1).max(50).default(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("regex"),
      pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
      flags: z.string().regex(/^[imsu]*$/, { error: "Only i, m, s, u flags are allowed" }).default("i"),
      /** Evaluate per sentence instead of over the whole text (anchors then apply to the sentence). */
      scope: z.enum(["text", "sentence"]).default("text"),
      minOccurrences: z.number().int().min(1).max(50).default(1),
      /** Minimum matches per 100 words before the rule fires. */
      minPer100Words: z.number().min(0).max(50).default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("density"),
      /** Words or short phrases counted on word boundaries. */
      lexicon: z.array(z.string().trim().min(2).max(60)).min(1).max(300),
      per100Words: z.number().min(0.1).max(50),
      minOccurrences: z.number().int().min(1).max(100).default(3),
      minWords: z.number().int().min(0).max(5000).default(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal("metric"),
      metric: z.enum(METRIC_IDS),
      op: z.enum(["lt", "gt"]),
      threshold: z.number(),
      /** Guards against firing on tiny texts where the statistic is meaningless. */
      minSentences: z.number().int().min(0).max(200).default(6),
      minParagraphs: z.number().int().min(0).max(100).default(0),
    })
    .strict(),
  z.object({ kind: z.literal("builtin"), detector: z.enum(BUILTIN_DETECTORS), params: z.record(z.string(), z.number()).default({}) }).strict(),
  /**
   * A before/after comparison run by the meaning checks (source vs rewrite).
   * Not evaluated when analysing a single text.
   */
  z.object({ kind: z.literal("comparison"), check: z.enum(COMPARISON_CHECKS) }).strict(),
  /** Model-assisted and advisory rules have no deterministic detector. */
  z.object({ kind: z.literal("none") }).strict(),
]);
export type Detection = z.infer<typeof detectionSchema>;

/**
 * Deterministic remediation a transform engine can apply without a model.
 * Only used for meaning-preserving edits; everything else is guidance.
 */
export const transformSchema = z.discriminatedUnion("kind", [
  /** Remove the matched span (and a trailing "that "/comma), then re-capitalise. */
  z.object({ kind: z.literal("delete-match") }).strict(),
  /** Replace matched phrases using a case-preserving map (keys are lowercase phrases). */
  z.object({ kind: z.literal("replace-map"), map: z.record(z.string().min(1), z.string()) }).strict(),
  /** Keep the first stock additive connective as "Also," and drop the rest. */
  z.object({ kind: z.literal("collapse-additive-openers") }).strict(),
]);
export type Transform = z.infer<typeof transformSchema>;

export const remediationSchema = z
  .object({
    guidance: z.string().min(1).max(400),
    transform: transformSchema.optional(),
  })
  .strict();

export const SOURCE_TYPES = ["builtin", "imported-rule-system", "webpage", "markdown", "text", "html", "document", "voiceprint"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const ruleSourceSchema = z
  .object({
    type: z.enum(SOURCE_TYPES),
    title: z.string().max(200).optional(),
    url: z.url().optional(),
    author: z.string().max(120).optional(),
    license: z.string().max(80).optional(),
    /** Id in the source library, when the rule was compiled from a stored source. */
    sourceDocumentId: z.string().max(120).optional(),
    importedAt: z.string().optional(),
    /** How the rule relates to the source text. */
    relation: z.enum(["original", "adapted", "derived"]).default("original"),
  })
  .strict();
export type RuleSource = z.infer<typeof ruleSourceSchema>;

export const RULE_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export const writingRuleSchema = z
  .object({
    id: z.string().regex(RULE_ID_RE, { error: "Rule ids are lowercase, dot/dash separated" }).max(80),
    version: z.number().int().min(1),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    category: z.enum(RULE_CATEGORIES),
    severity: z.enum(SEVERITIES),
    determinism: z.enum(DETERMINISM_LEVELS),
    /** Precedence layer; inherits the pack's layer when omitted. */
    layer: z.enum(RULE_LAYERS).optional(),
    /** The measurable axis this rule pushes on, if any. */
    dimension: z.enum(DIMENSIONS).optional(),
    detection: detectionSchema,
    remediation: remediationSchema,
    source: ruleSourceSchema,
    rationale: z.string().max(600).optional(),
    /** Plausible false positives, written down so the trade-off is explicit. */
    falsePositiveNotes: z.string().max(400).optional(),
    examples: z
      .object({
        problematic: z.array(z.string().max(400)).max(8).default([]),
        preferred: z.array(z.string().max(400)).max(8).default([]),
      })
      .strict()
      .default({ problematic: [], preferred: [] }),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/).max(40)).max(12).default([]),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const detects = rule.detection.kind !== "none";
    if ((rule.determinism === "advisory" || rule.determinism === "model-assisted") && detects) {
      ctx.addIssue({ code: "custom", path: ["detection"], message: `${rule.determinism} rules must not declare a deterministic detector` });
    }
    if ((rule.determinism === "deterministic" || rule.determinism === "heuristic") && !detects) {
      ctx.addIssue({ code: "custom", path: ["detection"], message: `${rule.determinism} rules need a detector` });
    }
    if (rule.remediation.transform && rule.determinism !== "deterministic") {
      ctx.addIssue({ code: "custom", path: ["remediation", "transform"], message: "Automatic transforms are only allowed on deterministic rules" });
    }
  });
export type WritingRule = z.infer<typeof writingRuleSchema>;
export type WritingRuleInput = z.input<typeof writingRuleSchema>;

export const rulePackSchema = z
  .object({
    id: z.string().regex(RULE_ID_RE).max(60),
    name: z.string().min(1).max(80),
    description: z.string().max(400),
    version: z.number().int().min(1),
    /** Which precedence layer this pack's rules belong to unless a rule says otherwise. */
    layer: z.enum(RULE_LAYERS),
    source: ruleSourceSchema,
    rules: z.array(writingRuleSchema),
  })
  .strict();
export type RulePack = z.infer<typeof rulePackSchema>;
export type RulePackInput = z.input<typeof rulePackSchema>;

/** One place a rule fired. Offsets are character positions in the analysed text. */
export interface RuleMatch {
  ruleId: string;
  start: number;
  end: number;
  excerpt: string;
  /** 0–1. Deterministic matches are 1; heuristics report less. */
  confidence: number;
  /** What triggered it, in plain words (e.g. "sentence-length CV 0.14 < 0.25"). */
  evidence: string;
}

/** A rule that fired, with all its matches, ready for display or planning. */
export interface RuleFinding {
  rule: Pick<WritingRule, "id" | "name" | "description" | "category" | "severity" | "determinism" | "dimension" | "source"> & {
    layer: RuleLayer;
    guidance: string;
    packId: string;
  };
  matches: RuleMatch[];
  /** Set when a higher-precedence pressure (e.g. a strong Voiceprint) overrides this rule. */
  suppressedBy?: { layer: RuleLayer; reason: string };
}

/**
 * A rule family groups rules that make the same rhetorical move in different
 * words ("Experts agree" / "Experts confirm"). Determinism stays per rule; the
 * family adds guidance that paraphrasing a member does not remove the
 * pattern, and says whether a sentence consisting only of the pattern may be
 * deleted outright (which the meaning checks then accept).
 */
export const ruleFamilySchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    members: z.array(z.string().min(1)).min(1),
    removable: z.boolean(),
    guidance: z.string().min(1).max(400),
  })
  .strict();
export type RuleFamily = z.infer<typeof ruleFamilySchema>;
export const ruleFamiliesFileSchema = z.object({ version: z.number().int().min(1), description: z.string(), families: z.array(ruleFamilySchema) }).strict();
