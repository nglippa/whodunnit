import type { Refinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { Measured, Voiceprint } from "@/domain/voiceprint";
import { RULE_LAYERS, type Dimension, type RuleFinding, type RuleLayer } from "@/domain/writing-rules";
import { round, type WritingMetrics } from "./metrics";
import { STRONG_SOURCE_VOICE, type SourceVoiceProfile } from "../semantics/voice-devices";

/**
 * Target ranges on measurable dimensions, and the precedence model that
 * decides which pressure wins when two disagree.
 *
 * Precedence (highest first):
 *   1. semantic-safety   meaning checks; never overridden
 *   2. user-instruction  an explicit refinement ("more casual")
 *   3. voiceprint        measured author habits, only with strong evidence (≥ 0.6)
 *   4. style             the selected style target
 *   5. general           Core Whodunnit + Anti-Slop pattern rules
 *      (weak Voiceprint evidence, 0.35–0.6, ranks here: it can shape a target
 *       range nobody else claims, but it never excuses a pattern)
 *   6. advisory          editorial guidance with no detector
 *
 * A general rule that pushes on a dimension is suppressed when a higher layer
 * claims that dimension AND the text already sits inside that layer's range:
 * an author whose voiceprint shows heavy dash use is not told to cut dashes.
 */

export interface TargetConstraint {
  dimension: Dimension;
  min: number;
  max: number;
  layer: RuleLayer;
  /** 0–1: how hard this constraint should pull. Voiceprints use measurement confidence. */
  strength: number;
  /** Where it came from, for display: "Natural style", "Voiceprint “My voice”", "Your request". */
  origin: string;
  unit: string;
}

export const STRONG_VOICEPRINT = 0.6;
export const MIN_VOICEPRINT = 0.35;

const layerRank = (c: Pick<TargetConstraint, "layer" | "strength">) => {
  const base = RULE_LAYERS.indexOf(c.layer);
  // Weak evidence of the author's habits (saved Voiceprint or the source itself) ranks below the general rules.
  if (c.layer === "voiceprint" && c.strength < STRONG_VOICEPRINT) return RULE_LAYERS.indexOf("general") + 0.5;
  // Source-local evidence is strong at the same confidence the voice check treats erasing the habit as major damage,
  // so the plan never asks the model to remove what the evaluation would then call damage.
  if (c.layer === "source-voice" && c.strength < STRONG_SOURCE_VOICE) return RULE_LAYERS.indexOf("general") + 0.5;
  return base;
};

export const DIMENSION_LABELS: Record<Dimension, { label: string; unit: string }> = {
  "rhythm.sentence-length": { label: "average sentence length", unit: "words" },
  "rhythm.sentence-variation": { label: "sentence-length variation (CV)", unit: "cv" },
  "rhythm.paragraph-variation": { label: "paragraph-length variation (CV)", unit: "cv" },
  "punctuation.dashes": { label: "dashes", unit: "per 100 words" },
  "punctuation.semicolons": { label: "semicolons", unit: "per 100 words" },
  "voice.contractions": { label: "contractions", unit: "per 100 words" },
  "voice.first-person": { label: "first-person words", unit: "per 100 words" },
  "voice.hedging": { label: "hedges", unit: "per 100 words" },
  "voice.questions": { label: "questions", unit: "share of sentences" },
  "voice.fragments": { label: "short fragments", unit: "share of sentences" },
  "lexical.intensifiers": { label: "intensifiers", unit: "per 100 words" },
  "transition.openers": { label: "sentences opening with a stock connective", unit: "share of sentences" },
};

export function dimensionValue(m: WritingMetrics, d: Dimension): number {
  switch (d) {
    case "rhythm.sentence-length":
      return m.sentenceLength.mean;
    case "rhythm.sentence-variation":
      return m.sentenceLength.cv;
    case "rhythm.paragraph-variation":
      return m.paragraphLength.cv;
    case "punctuation.dashes":
      return m.per100.dashes;
    case "punctuation.semicolons":
      return m.per100.semicolons;
    case "voice.contractions":
      return m.per100.contractions;
    case "voice.first-person":
      return m.per100.firstPerson;
    case "voice.hedging":
      return m.per100.hedges;
    case "voice.questions":
      return m.shares.questions;
    case "voice.fragments":
      return m.shares.fragments;
    case "lexical.intensifiers":
      return m.per100.intensifiers;
    case "transition.openers":
      return m.shares.transitionOpeners;
  }
}

const make = (dimension: Dimension, min: number, max: number, layer: RuleLayer, strength: number, origin: string): TargetConstraint => ({
  dimension,
  min: round(Math.max(0, min), 2),
  max: round(Math.max(min, max), 2),
  layer,
  strength: round(strength, 2),
  origin,
  unit: DIMENSION_LABELS[dimension].unit,
});

/** A style preset (or a Voiceprint-derived profile) as target ranges. */
export function constraintsFromProfile(p: StyleProfile): TargetConstraint[] {
  if (p.kind === "voiceprint") return []; // Voiceprints contribute through constraintsFromVoiceprint, with confidences.
  const origin = `${p.label} style`;
  const s = 0.6;
  const out: TargetConstraint[] = [make("rhythm.sentence-length", p.sentenceLengthMean - 5, p.sentenceLengthMean + 5, "style", s, origin)];
  const cv = { low: [0.15, 0.35], medium: [0.3, 0.55], high: [0.45, 0.95] }[p.sentenceLengthVariation];
  out.push(make("rhythm.sentence-variation", cv[0], cv[1], "style", s, origin));
  if (p.contractions === "avoid") out.push(make("voice.contractions", 0, 0.2, "style", s, origin));
  if (p.contractions === "prefer") out.push(make("voice.contractions", 1, 8, "style", s, origin));
  if (p.firstPerson === "prefer") out.push(make("voice.first-person", 1, 10, "style", s, origin));
  if (p.firstPerson === "avoid") out.push(make("voice.first-person", 0, 0.5, "style", s, origin));
  if (p.hedging === "minimal") out.push(make("voice.hedging", 0, 1.5, "style", s, origin));
  if (p.hedging === "moderate") out.push(make("voice.hedging", 0.5, 3, "style", s, origin));
  if (p.rhetoricalQuestions === "avoid") out.push(make("voice.questions", 0, 0.02, "style", s, origin));
  if (p.rhetoricalQuestions === "prefer") out.push(make("voice.questions", 0.04, 0.2, "style", s, origin));
  if (p.fragments === "avoid") out.push(make("voice.fragments", 0, 0.03, "style", s, origin));
  if (p.fragments === "prefer") out.push(make("voice.fragments", 0.03, 0.2, "style", s, origin));
  return out;
}

/**
 * Measured Voiceprint habits as ranges. Tolerance widens as confidence falls,
 * and measurements below MIN_VOICEPRINT confidence exert no pressure at all.
 */
export function constraintsFromVoiceprint(vp: Voiceprint): TargetConstraint[] {
  const s = vp.stats;
  if (!s) return [];
  const origin = `Voiceprint “${vp.name}”`;
  const out: TargetConstraint[] = [];
  const range = (dimension: Dimension, m: Measured, rel: number, floor: number, transform = (v: number) => v) => {
    if (m.confidence < MIN_VOICEPRINT) return;
    const value = transform(m.value);
    const tol = Math.max(floor, Math.abs(value) * rel) * (1 + (1 - m.confidence));
    out.push(make(dimension, value - tol, value + tol, "voiceprint", m.confidence, origin));
  };
  range("rhythm.sentence-length", s.sentences.meanLength, 0.2, 2);
  if (s.sentences.meanLength.value > 0) {
    const cvMeasured: Measured = {
      value: s.sentences.lengthStdDev.value / s.sentences.meanLength.value,
      confidence: Math.min(s.sentences.lengthStdDev.confidence, s.sentences.meanLength.confidence),
    };
    range("rhythm.sentence-variation", cvMeasured, 0.25, 0.08);
  }
  range("voice.contractions", s.vocabulary.contractionRate, 0.35, 0.5);
  range("voice.first-person", s.vocabulary.firstPersonRate, 0.35, 0.5);
  range("voice.hedging", s.vocabulary.hedgeRate, 0.35, 0.5);
  range("voice.questions", s.sentences.questionRate, 0.35, 0.03);
  range("voice.fragments", s.sentences.fragmentRate, 0.35, 0.03);
  range("punctuation.dashes", s.punctuation.dashesPer100, 0.35, 0.3);
  range("punctuation.semicolons", s.punctuation.semicolonsPer100, 0.35, 0.2);
  range("transition.openers", s.structure.transitionOpenerRate, 0.35, 0.03);
  return out;
}

/**
 * The source text's own deliberate habits as ranges around its measured
 * values, so a generic rule does not tell the model to remove what the author
 * evidently does on purpose. Only devices judged deliberate (repeated, and not
 * inside slop-heavy text) produce a constraint; strength is the evidence
 * confidence, so short texts exert little or no pressure.
 */
export function constraintsFromSourceVoice(profile: SourceVoiceProfile, m: WritingMetrics): TargetConstraint[] {
  const origin = "Your own text";
  const out: TargetConstraint[] = [];
  const s = profile.confidence;
  // A short passage can still establish a device through repetition. Keep
  // strong local evidence while retaining the wider sample requirement for
  // weaker habits.
  const strongFragments = profile.devices.fragments >= 3 && profile.devices.fragmentShare >= 0.7 ||
    profile.devices.fragments >= 2 && profile.devices.sentences >= 5 && profile.devices.fragmentShare >= 0.3;
  const strongDashes = profile.devices.dashes >= 4 && profile.devices.pairedDashes >= 2;
  if (s < MIN_VOICEPRINT && !strongFragments && !strongDashes) return out;
  const around = (d: Dimension, v: number, floor: number, repeatedEvidence = false) => out.push(make(d, v - Math.max(floor, v * 0.4), v + Math.max(floor, v * 0.6), "source-voice", repeatedEvidence ? Math.max(s, STRONG_SOURCE_VOICE) : s, origin));
  if (profile.deliberate.dashes && (s >= MIN_VOICEPRINT || strongDashes)) around("punctuation.dashes", m.per100.dashes, 0.3, strongDashes);
  if (profile.deliberate.fragments && (s >= MIN_VOICEPRINT || strongFragments)) around("voice.fragments", m.shares.fragments, 0.05, strongFragments);
  if (profile.deliberate.semicolons && s >= MIN_VOICEPRINT) around("punctuation.semicolons", m.per100.semicolons, 0.2);
  return out;
}

/** Explicit refinement directives outrank style and Voiceprint pressure. */
export function constraintsFromRefinement(r: Refinement | undefined): TargetConstraint[] {
  if (!r) return [];
  const origin = "Your request";
  const out: TargetConstraint[] = [];
  if (r.directives.includes("more_casual")) out.push(make("voice.contractions", 1, 8, "user-instruction", 1, origin));
  if (r.directives.includes("more_formal")) out.push(make("voice.contractions", 0, 0.2, "user-instruction", 1, origin));
  if (r.directives.includes("less_polished")) out.push(make("rhythm.sentence-variation", 0.5, 1, "user-instruction", 1, origin));
  return out;
}

/** One winning constraint per dimension; the losers are reported, not discarded silently. */
export function resolveConstraints(all: TargetConstraint[]): { active: TargetConstraint[]; overridden: { constraint: TargetConstraint; by: TargetConstraint }[] } {
  const byDim = new Map<Dimension, TargetConstraint[]>();
  for (const c of all) byDim.set(c.dimension, [...(byDim.get(c.dimension) ?? []), c]);
  const active: TargetConstraint[] = [];
  const overridden: { constraint: TargetConstraint; by: TargetConstraint }[] = [];
  for (const list of byDim.values()) {
    const sorted = [...list].sort((a, b) => layerRank(a) - layerRank(b) || b.strength - a.strength);
    active.push(sorted[0]);
    for (const c of sorted.slice(1)) overridden.push({ constraint: c, by: sorted[0] });
  }
  return { active, overridden };
}

/** Mark findings that a higher-precedence constraint deliberately permits. */
export function applyPrecedence(findings: RuleFinding[], constraints: TargetConstraint[], metrics: WritingMetrics): RuleFinding[] {
  const { active } = resolveConstraints(constraints);
  return findings.map((f) => {
    const dim = f.rule.dimension;
    if (!dim || f.rule.layer === "semantic-safety") return f;
    const c = active.find((x) => x.dimension === dim);
    if (!c || layerRank(c) >= RULE_LAYERS.indexOf(f.rule.layer)) return f;
    const value = dimensionValue(metrics, dim);
    if (value < c.min || value > c.max) return f;
    const { label, unit } = DIMENSION_LABELS[dim];
    return {
      ...f,
      suppressedBy: { layer: c.layer, reason: `${c.origin} accepts ${label} of ${c.min}–${c.max} ${unit}; this text has ${round(value, 2)}.` },
    };
  });
}
