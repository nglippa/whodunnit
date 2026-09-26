import type { StyleProfile } from "@/domain/style";
import type { Refinement } from "@/domain/refinement";
import { REFINEMENT_LABELS } from "@/domain/refinement";
import type { TextAnalysis } from "../analysis/analyze";

/**
 * The rewrite planner compares what was measured in the source with what the
 * target asks for and produces concrete, checkable intentions. Each line is
 * derived from a measurement, so the plan explains itself.
 */
export function planReconstruction(a: TextAnalysis, p: StyleProfile, refinement?: Refinement): string[] {
  const plan: string[] = [];

  if (refinement) {
    const asks = refinement.directives.map((d) => REFINEMENT_LABELS[d].toLowerCase());
    if (refinement.note) asks.push(`“${refinement.note.slice(0, 80)}”`);
    plan.push(`Refine the current version: ${asks.join(", ")}; keep your original as the reference for meaning`);
  }

  for (const f of a.formulaic.slice(0, 3)) {
    plan.push(`Remove stock phrasing: ${f.label}${f.count > 1 ? ` (${f.count}×)` : ""}`);
  }

  if (a.counts.sentences >= 3) {
    const targetHigh = p.sentenceLengthVariation === "high";
    if (targetHigh && a.sentenceLength.variation < 0.35) {
      plan.push(`Vary sentence rhythm: lengths are unusually even (variation ${a.sentenceLength.variation})`);
    }
    if (a.sentenceLength.mean > p.sentenceLengthMean + 6) {
      plan.push(`Shorten sentences: average ${a.sentenceLength.mean} words, target about ${p.sentenceLengthMean}`);
    } else if (a.sentenceLength.mean < p.sentenceLengthMean - 7) {
      plan.push(`Combine choppy sentences: average ${a.sentenceLength.mean} words, target about ${p.sentenceLengthMean}`);
    }
  }

  if (a.sentenceShares.transitionOpeners >= 0.25) {
    plan.push(`Cut stock connectives: ${Math.round(a.sentenceShares.transitionOpeners * 100)}% of sentences open with one`);
  }
  if (a.counts.paragraphs >= 3 && a.paragraphLength.variation < 0.2) {
    plan.push("Break the uniform paragraph blocks");
  }
  if (p.contractions === "prefer" && a.rates.contractions < 1) plan.push("Use contractions where speech would");
  if (p.contractions === "avoid" && a.rates.contractions > 0) plan.push("Write out contractions");
  if (p.firstPerson === "prefer" && a.rates.firstPerson < 1) plan.push("Let the author speak in the first person where the text implies it");
  if (a.sentenceShares.likelyPassive >= 0.3 && p.register !== "formal") plan.push("Prefer active voice where the actor is known");
  if (p.lengthRatio.max < 0.95) plan.push(`Tighten to roughly ${Math.round(((p.lengthRatio.min + p.lengthRatio.max) / 2) * 100)}% of the original length`);
  if (p.wordingRetention === "high") plan.push("Keep as much of the author's own wording as the target allows");

  if (plan.length === 0) plan.push(`Adjust expression toward ${p.label}; the source already avoids the common stock patterns`);
  return plan.slice(0, 8);
}
