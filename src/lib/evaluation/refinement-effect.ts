import type { RefinementEffect } from "@/domain/evaluation";
import type { Refinement } from "@/domain/refinement";
import type { WritingMetrics } from "../rules/metrics";
import { wordingRetention } from "./measures";

/**
 * INSTRUCTION FOLLOWING, measured separately from meaning: did the refinement
 * the author asked for visibly happen? A stage can be semantically perfect
 * and still ignore "Shorter" (the output is the current revision, unchanged).
 *
 * Every measure is a coarse, text-supported signal, not a quality score:
 *
 *   shorter        word count vs the CURRENT revision
 *   keep_wording   token/bigram retention of the ORIGINAL, before vs after
 *   more_casual    contractions up, or sentences shorter, vs the CURRENT revision
 *   more_formal    contractions down, vs the CURRENT revision
 *   less_polished  fewer transition openers / colons / semicolons, or more
 *                  varied sentence length, vs the CURRENT revision
 *   note           free text: NOT_MEASURABLE unless nothing changed at all
 *
 * Byte-identical output is NOT_APPLIED for every directive, except "Keep more
 * of my wording" when the current revision already keeps nearly all of it.
 */

export interface RefinementEffectInput {
  refinement: Refinement;
  original: string;
  /** The revision the refinement was asked to change. */
  current: string;
  output: string;
  currentMetrics: WritingMetrics;
  outputMetrics: WritingMetrics;
}

type Directive = RefinementEffect["directives"][number];
type Status = RefinementEffect["status"];

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Share of the current revision's words kept verbatim at or above which "nothing happened". */
const NEAR_IDENTICAL = 0.98;
export const KEEP_WORDING_SATURATED = 0.95;

function shorter(i: RefinementEffectInput, identical: boolean): Directive {
  const before = i.currentMetrics.words;
  const after = i.outputMetrics.words;
  const ratio = before ? after / before : 1;
  const status: Status = identical || ratio > 0.98 ? "NOT_APPLIED" : ratio <= 0.92 ? "APPLIED" : "PARTIAL";
  return { id: "shorter", status, reference: "current", measure: "words", before, after, detail: `${before} → ${after} words (${Math.round((1 - ratio) * 100)}% shorter)` };
}

function keepWording(i: RefinementEffectInput, identical: boolean): Directive {
  const b = wordingRetention(i.original, i.current);
  const a = identical ? b : wordingRetention(i.original, i.output);
  const gain = Math.max(a.tokenRetention - b.tokenRetention, a.bigramRetention - b.bigramRetention);
  const status: Status =
    b.tokenRetention >= KEEP_WORDING_SATURATED && a.tokenRetention >= b.tokenRetention - 0.01
      ? "ALREADY_SATISFIED"
      : identical
        ? "NOT_APPLIED"
        : gain >= 0.02
          ? "APPLIED"
          : gain > 0
            ? "PARTIAL"
            : "NOT_APPLIED";
  return {
    id: "keep_wording",
    status,
    reference: "original",
    measure: "tokenRetention",
    before: b.tokenRetention,
    after: a.tokenRetention,
    detail: `original wording kept: tokens ${b.tokenRetention} → ${a.tokenRetention}, bigrams ${b.bigramRetention} → ${a.bigramRetention}`,
  };
}

function casual(i: RefinementEffectInput, identical: boolean): Directive {
  const c0 = i.currentMetrics.per100.contractions;
  const c1 = i.outputMetrics.per100.contractions;
  const l0 = i.currentMetrics.sentenceLength.mean;
  const l1 = i.outputMetrics.sentenceLength.mean;
  const signals = [c1 - c0 >= 0.5, l0 > 0 && l1 <= l0 * 0.9].filter(Boolean).length;
  const status: Status = identical ? "NOT_APPLIED" : signals >= 1 ? "APPLIED" : "NOT_MEASURABLE";
  return { id: "more_casual", status, reference: "current", measure: "contractions/100", before: r2(c0), after: r2(c1), detail: `contractions ${r2(c0)} → ${r2(c1)} per 100 words; mean sentence ${r2(l0)} → ${r2(l1)} words` };
}

function formal(i: RefinementEffectInput, identical: boolean): Directive {
  const c0 = i.currentMetrics.per100.contractions;
  const c1 = i.outputMetrics.per100.contractions;
  const status: Status = identical ? "NOT_APPLIED" : c0 - c1 >= 0.5 ? "APPLIED" : c0 < 0.5 ? "NOT_MEASURABLE" : c1 < c0 ? "PARTIAL" : "NOT_APPLIED";
  return { id: "more_formal", status, reference: "current", measure: "contractions/100", before: r2(c0), after: r2(c1), detail: `contractions ${r2(c0)} → ${r2(c1)} per 100 words` };
}

function lessPolished(i: RefinementEffectInput, identical: boolean): Directive {
  const m0 = i.currentMetrics;
  const m1 = i.outputMetrics;
  const polish = (m: WritingMetrics) => m.shares.transitionOpeners * 100 + m.per100.colons + m.per100.semicolons;
  const p0 = polish(m0);
  const p1 = polish(m1);
  const signals = [p0 - p1 >= 0.5, m1.sentenceLength.cv - m0.sentenceLength.cv >= 0.05].filter(Boolean).length;
  const status: Status = identical ? "NOT_APPLIED" : signals >= 1 ? "APPLIED" : "NOT_MEASURABLE";
  return {
    id: "less_polished",
    status,
    reference: "current",
    measure: "polish markers",
    before: r2(p0),
    after: r2(p1),
    detail: `transition openers + colons + semicolons ${r2(p0)} → ${r2(p1)}; sentence-length CV ${r2(m0.sentenceLength.cv)} → ${r2(m1.sentenceLength.cv)}`,
  };
}

const RANK: Record<Status, number> = { NOT_APPLIED: 4, PARTIAL: 3, APPLIED: 2, ALREADY_SATISFIED: 1, NOT_MEASURABLE: 0 };

export function refinementEffect(i: RefinementEffectInput): RefinementEffect {
  const identical = i.output === i.current;
  // Nearly identical (a stray space or quote) counts as not applied for register directives.
  const kept = wordingRetention(i.current, i.output);
  const unchanged = identical || (kept.tokenRetention >= NEAR_IDENTICAL && kept.novelTokenShare === 0 && kept.lengthRatio === 1);
  const directives: Directive[] = i.refinement.directives.map((d) => {
    switch (d) {
      case "shorter":
        return shorter(i, identical);
      case "keep_wording":
        return keepWording(i, identical);
      case "more_casual":
        return casual(i, unchanged);
      case "more_formal":
        return formal(i, unchanged);
      case "less_polished":
        return lessPolished(i, unchanged);
    }
  });
  if (i.refinement.note)
    directives.push({ id: "note", status: unchanged ? "NOT_APPLIED" : "NOT_MEASURABLE", reference: "current", measure: "none", before: null, after: null, detail: unchanged ? "the output did not change" : "free-text request: not measured automatically" });
  const measurable = directives.filter((d) => d.status !== "NOT_MEASURABLE");
  const status: Status = !directives.length || !measurable.length ? "NOT_MEASURABLE" : measurable.reduce((w, d) => (RANK[d.status] > RANK[w] ? d.status : w), "ALREADY_SATISFIED" as Status);
  return { status, identicalToCurrent: identical, directives };
}
