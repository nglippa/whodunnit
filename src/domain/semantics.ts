import { z } from "zod";

/**
 * Claim-level meaning. A SemanticClaim is one meaning-bearing assertion in a
 * text (usually a sentence or clause) with the features that decide whether a
 * rewrite still says the same thing: polarity, modality, quantifier strength,
 * quantities with their qualifiers ("almost three weeks", "an hour, maybe
 * more"), causal and comparative markers.
 *
 * Extraction is deterministic and deliberately shallow: it reads markers, not
 * full syntax. What it cannot decide is reported as UNCERTAIN, never as
 * preserved, and is left to a semantic judge.
 */

/** Where a quantity may lie relative to its stated value. */
export const QUANTITY_BOUNDS = [
  "exact", // "three weeks"
  "approximate", // "about / around / roughly / closer to nine"
  "below", // "almost / nearly / most of / just under / less than"
  "at-most", // "up to / at most / no more than"
  "above", // "more than / over"
  "at-least", // "at least / or more / maybe more"
] as const;
export type QuantityBound = (typeof QUANTITY_BOUNDS)[number];

export const quantitySchema = z
  .object({
    /** Canonical value: "1", "3", "12%", "$1.4". */
    value: z.string(),
    /** Normalised unit, if any: "hour", "week", "minute", "percent", "million". */
    unit: z.string().nullable(),
    bound: z.enum(QUANTITY_BOUNDS),
    /** The qualifier words that set the bound, e.g. ["almost"], ["maybe more"]. */
    qualifiers: z.array(z.string()),
    text: z.string(),
  })
  .strict();
export type Quantity = z.infer<typeof quantitySchema>;

/** Epistemic strength of an assertion, lowest first. */
export const MODALITY_LEVELS = ["possible", "probable", "asserted", "emphatic"] as const;
export type ModalityLevel = (typeof MODALITY_LEVELS)[number];

export const scaleMarkerSchema = z
  .object({
    /** Which ordered scale the marker belongs to. */
    scale: z.enum(["modality", "evidence", "causation", "quantifier", "frequency"]),
    /** Position on that scale; higher is stronger. */
    rank: z.number().int(),
    marker: z.string(),
  })
  .strict();
export type ScaleMarker = z.infer<typeof scaleMarkerSchema>;

export const semanticClaimSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    type: z.enum(["assertion", "question", "instruction", "fragment"]),
    polarity: z.enum(["affirmative", "negative"]),
    /** The words that made it negative: explicit ("not") or implicit ("postpone", "without"). */
    negators: z.array(z.string()),
    modality: z.enum(MODALITY_LEVELS),
    /** Markers on ordered scales (may / suggests / helps / some / usually ...). */
    strength: z.array(scaleMarkerSchema),
    quantities: z.array(quantitySchema),
    causal: z.array(z.string()),
    comparative: z.array(z.string()),
    temporal: z.array(z.string()),
    /** Stemmed content words, for alignment. */
    content: z.array(z.string()),
    span: z.object({ start: z.number().int(), end: z.number().int() }).strict(),
  })
  .strict();
export type SemanticClaim = z.infer<typeof semanticClaimSchema>;

export const CLAIM_RELATIONS = ["preserved", "strengthened", "weakened", "contradicted", "dropped", "added", "uncertain"] as const;
export type ClaimRelation = (typeof CLAIM_RELATIONS)[number];

/** blocking: meaning changed. major: likely changed, a person should look. minor: worth noting. */
export const INTEGRITY_SEVERITIES = ["blocking", "major", "minor"] as const;
export type IntegritySeverity = (typeof INTEGRITY_SEVERITIES)[number];

export const CHANGE_ASPECTS = [
  "polarity",
  "quantity",
  "modality",
  "evidence",
  "causation",
  "quantifier",
  "frequency",
  "causal-relation",
  "question",
  "temporal-clause",
  "content",
  "phrase",
  "quotation",
  "mechanics",
] as const;
export type ChangeAspect = (typeof CHANGE_ASPECTS)[number];

export const claimChangeSchema = z
  .object({
    relation: z.enum(CLAIM_RELATIONS),
    aspect: z.enum(CHANGE_ASPECTS),
    severity: z.enum(INTEGRITY_SEVERITIES),
    sourceClaimId: z.string().nullable(),
    outputClaimId: z.string().nullable(),
    /** Short excerpts only. */
    source: z.string().max(300).nullable(),
    output: z.string().max(300).nullable(),
    detail: z.string().max(400),
    /** Set when an explicit user request permits this change (e.g. "shorter" + remove, "more confident"). */
    licensedBy: z.string().nullable(),
  })
  .strict();
export type ClaimChange = z.infer<typeof claimChangeSchema>;

export const claimComparisonSchema = z
  .object({
    sourceClaims: z.number().int(),
    outputClaims: z.number().int(),
    /** Source claims matched to at least one output claim. */
    aligned: z.number().int(),
    changes: z.array(claimChangeSchema),
  })
  .strict();
export type ClaimComparison = z.infer<typeof claimComparisonSchema>;

export const protectedPhraseSchema = z
  .object({
    text: z.string().min(1),
    /** exact: must appear verbatim. close: may move, but a contrasting substitution is a meaning change. */
    mode: z.enum(["exact", "close"]),
    reason: z.enum(["user", "quoted-term", "domain-phrase", "voiceprint"]),
  })
  .strict();
export type ProtectedPhrase = z.infer<typeof protectedPhraseSchema>;
