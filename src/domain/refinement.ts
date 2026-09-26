import { z } from "zod";
import type { StyleProfile } from "./style";

/**
 * Refinements are typed transformations of the *current* style profile.
 * The original source stays the semantic anchor for every pass, so a chain of
 * refinements cannot drift further from the author's meaning than one pass can.
 */

export const REFINEMENT_IDS = [
  "more_casual",
  "more_formal",
  "less_polished",
  "shorter",
  "keep_wording",
] as const;
export type RefinementId = (typeof REFINEMENT_IDS)[number];

export const refinementSchema = z
  .object({
    directives: z.array(z.enum(REFINEMENT_IDS)).max(REFINEMENT_IDS.length),
    note: z.string().trim().max(280).optional(),
  })
  .strict()
  .refine((r) => r.directives.length > 0 || (r.note?.length ?? 0) > 0, {
    error: "A refinement needs at least one directive or a note",
  });
export type Refinement = z.infer<typeof refinementSchema>;

export const REFINEMENT_LABELS: Record<RefinementId, string> = {
  more_casual: "More casual",
  more_formal: "More formal",
  less_polished: "Less polished",
  shorter: "Shorter",
  keep_wording: "Keep more of my wording",
};

const REGISTERS = ["casual", "neutral", "formal"] as const;
const LEVELS = ["low", "medium", "high"] as const;

function step<T extends readonly string[]>(scale: T, value: T[number], by: number): T[number] {
  const i = scale.indexOf(value);
  return scale[Math.min(scale.length - 1, Math.max(0, i + by))];
}

/** Pure: returns a new profile with each directive applied in order. */
export function applyRefinement(profile: StyleProfile, refinement: Refinement): StyleProfile {
  let next: StyleProfile = { ...profile, lengthRatio: { ...profile.lengthRatio }, notes: [...profile.notes] };
  for (const d of refinement.directives) {
    switch (d) {
      case "more_casual":
        next = {
          ...next,
          register: step(REGISTERS, next.register, -1),
          contractions: "prefer",
          sentenceLengthMean: Math.max(8, next.sentenceLengthMean - 3),
        };
        break;
      case "more_formal":
        next = {
          ...next,
          register: step(REGISTERS, next.register, 1),
          contractions: next.contractions === "prefer" ? "allow" : "avoid",
          fragments: "avoid",
        };
        break;
      case "less_polished":
        next = {
          ...next,
          sentenceLengthVariation: "high",
          fragments: next.fragments === "avoid" ? "allow" : "prefer",
          notes: [...next.notes, "Let some sentences be plain or slightly uneven; skip decorative transitions"],
        };
        break;
      case "shorter":
        next = {
          ...next,
          lengthRatio: {
            min: Math.max(0.3, +(next.lengthRatio.min * 0.75).toFixed(2)),
            max: Math.max(0.4, +(Math.min(next.lengthRatio.max, 1) * 0.8).toFixed(2)),
          },
        };
        break;
      case "keep_wording":
        next = { ...next, wordingRetention: step(LEVELS, next.wordingRetention, 1) };
        break;
    }
  }
  return next;
}
