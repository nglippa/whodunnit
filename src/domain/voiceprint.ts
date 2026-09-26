import { z } from "zod";

/**
 * A Voiceprint is a structured record of an author's *observed* tendencies,
 * measured from genuine samples. Every tendency carries a confidence so the
 * product never presents a guess as a fact. It is deliberately not a prompt.
 */

export const writingSampleSchema = z
  .object({
    id: z.string().min(1),
    voiceprintId: z.string().min(1),
    title: z.string().max(120),
    text: z.string().min(1).max(40_000),
    wordCount: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .strict();
export type WritingSample = z.infer<typeof writingSampleSchema>;

/** A measured value plus how much we trust it (0–1). */
export const measuredSchema = z.object({ value: z.number(), confidence: z.number().min(0).max(1) }).strict();
export type Measured = z.infer<typeof measuredSchema>;

export const observationSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1),
    source: z.enum(["measured", "model"]),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;

export const voiceprintStatsSchema = z
  .object({
    sentences: z
      .object({
        meanLength: measuredSchema,
        lengthStdDev: measuredSchema,
        questionRate: measuredSchema, // share of sentences that are questions
        fragmentRate: measuredSchema, // share of sentences under 4 words
      })
      .strict(),
    vocabulary: z
      .object({
        meanWordLength: measuredSchema,
        longWordRate: measuredSchema, // share of words with 7+ letters
        lexicalVariety: measuredSchema, // moving-average type/token ratio
        contractionRate: measuredSchema, // per 100 words
        firstPersonRate: measuredSchema, // per 100 words
        hedgeRate: measuredSchema, // per 100 words
      })
      .strict(),
    punctuation: z
      .object({
        commasPer100: measuredSchema,
        dashesPer100: measuredSchema,
        semicolonsPer100: measuredSchema,
        parenthesesPer100: measuredSchema,
        exclamationsPer100: measuredSchema,
      })
      .strict(),
    structure: z
      .object({
        meanParagraphSentences: measuredSchema,
        transitionOpenerRate: measuredSchema, // share of sentences opening with a stock transition
      })
      .strict(),
    /** Openers and short phrases that recur across more than one sample. */
    recurringOpeners: z.array(z.string()).max(8),
    recurringPhrases: z.array(z.string()).max(8),
  })
  .strict();
export type VoiceprintStats = z.infer<typeof voiceprintStatsSchema>;

export const voiceprintSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(60),
    description: z.string().max(240),
    sampleCount: z.number().int().nonnegative(),
    totalWords: z.number().int().nonnegative(),
    /** null until at least one sample has been analysed. */
    stats: voiceprintStatsSchema.nullable(),
    observations: z.array(observationSchema).max(20),
    /** Overall confidence that the profile reflects the author (0–1). */
    confidence: z.number().min(0).max(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Voiceprint = z.infer<typeof voiceprintSchema>;

/** Minimum words before a Voiceprint is usable as a style target. */
export const VOICEPRINT_MIN_WORDS = 300;
