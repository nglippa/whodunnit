import { z } from "zod";

/**
 * A StyleProfile is the typed description of *how* text should be expressed.
 * Presets and learned Voiceprints both resolve to this one shape, so the
 * reconstruction pipeline never has to know where a style came from.
 */

export const PRESET_IDS = [
  "natural",
  "casual",
  "professional",
  "academic",
  "concise",
  "personal",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const registerSchema = z.enum(["casual", "neutral", "formal"]);
export const policySchema = z.enum(["avoid", "allow", "prefer"]);
export const levelSchema = z.enum(["low", "medium", "high"]);

export const styleProfileSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(["preset", "voiceprint"]),
    label: z.string().min(1).max(60),
    description: z.string().max(240),
    register: registerSchema,
    contractions: policySchema,
    firstPerson: policySchema,
    rhetoricalQuestions: policySchema,
    fragments: policySchema,
    /** Target mean sentence length in words. */
    sentenceLengthMean: z.number().min(6).max(40),
    /** How much sentence length should vary around the mean. */
    sentenceLengthVariation: levelSchema,
    paragraphLength: z.enum(["short", "medium", "long"]),
    hedging: z.enum(["minimal", "moderate", "natural"]),
    /** Allowed output length relative to the source, in words. */
    lengthRatio: z
      .object({ min: z.number().min(0.2).max(1.5), max: z.number().min(0.3).max(2) })
      .refine((r) => r.min <= r.max, { error: "lengthRatio.min must not exceed max" }),
    /** How much of the author's original wording to keep. */
    wordingRetention: levelSchema,
    /** Short, concrete observations (from a Voiceprint or a preset's intent). */
    notes: z.array(z.string().min(1).max(200)).max(12),
  })
  .strict();

export type StyleProfile = z.infer<typeof styleProfileSchema>;

const base = {
  kind: "preset" as const,
  rhetoricalQuestions: "allow" as const,
  fragments: "allow" as const,
  hedging: "natural" as const,
  lengthRatio: { min: 0.75, max: 1.15 },
  wordingRetention: "medium" as const,
  notes: [] as string[],
};

export const PRESETS: Record<PresetId, StyleProfile> = {
  natural: {
    ...base,
    id: "natural",
    label: "Natural",
    description: "Plain, human rhythm. Keeps your register; removes the polish that makes prose sound manufactured.",
    register: "neutral",
    contractions: "allow",
    firstPerson: "allow",
    sentenceLengthMean: 17,
    sentenceLengthVariation: "high",
    paragraphLength: "medium",
    notes: ["Vary sentence length the way speech does", "Prefer the concrete word over the impressive one"],
  },
  casual: {
    ...base,
    id: "casual",
    label: "Casual",
    description: "Relaxed and conversational, like a note to a colleague you like.",
    register: "casual",
    contractions: "prefer",
    firstPerson: "prefer",
    fragments: "prefer",
    sentenceLengthMean: 13,
    sentenceLengthVariation: "high",
    paragraphLength: "short",
    notes: ["Talk to the reader directly", "Short sentences are fine; so are asides"],
  },
  professional: {
    ...base,
    id: "professional",
    label: "Professional",
    description: "Clear and direct for work. Confident without corporate filler.",
    register: "neutral",
    contractions: "allow",
    firstPerson: "allow",
    rhetoricalQuestions: "avoid",
    fragments: "avoid",
    hedging: "minimal",
    sentenceLengthMean: 17,
    sentenceLengthVariation: "medium",
    paragraphLength: "medium",
    notes: ["Lead with the point", "Name owners, dates and next steps plainly"],
  },
  academic: {
    ...base,
    id: "academic",
    label: "Academic",
    description: "Careful and precise. Qualifies claims where the evidence does, not by reflex.",
    register: "formal",
    contractions: "avoid",
    firstPerson: "allow",
    rhetoricalQuestions: "avoid",
    fragments: "avoid",
    hedging: "moderate",
    sentenceLengthMean: 23,
    sentenceLengthVariation: "medium",
    paragraphLength: "long",
    lengthRatio: { min: 0.85, max: 1.2 },
    notes: ["Keep technical terms exact", "Signal uncertainty only where the source is uncertain"],
  },
  concise: {
    ...base,
    id: "concise",
    label: "Concise",
    description: "Same meaning in fewer words. Cuts restatement and throat-clearing first.",
    register: "neutral",
    contractions: "allow",
    firstPerson: "allow",
    rhetoricalQuestions: "avoid",
    hedging: "minimal",
    sentenceLengthMean: 12,
    sentenceLengthVariation: "medium",
    paragraphLength: "short",
    lengthRatio: { min: 0.45, max: 0.85 },
    notes: ["Remove restatement before removing substance"],
  },
  personal: {
    ...base,
    id: "personal",
    label: "Personal",
    description: "First person and candid, the way someone writes when it is their own story.",
    register: "casual",
    contractions: "prefer",
    firstPerson: "prefer",
    sentenceLengthMean: 15,
    sentenceLengthVariation: "high",
    paragraphLength: "medium",
    notes: ["Own the opinions in the text", "Keep the author's own examples front and centre"],
  },
};

export function getPreset(id: PresetId): StyleProfile {
  return PRESETS[id];
}

export function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}
