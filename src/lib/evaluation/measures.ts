import { createHash } from "node:crypto";
import type { MetricDelta, Retention, RuleDiff, SemanticGate, VoiceComparison } from "@/domain/evaluation";
import type { VerificationResult } from "@/domain/verification";
import type { Voiceprint } from "@/domain/voiceprint";
import type { Dimension } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import { DIMENSION_LABELS, constraintsFromVoiceprint, dimensionValue } from "../rules/constraints";
import type { WritingAnalysis } from "../rules/engine";
import { round, type WritingMetrics } from "../rules/metrics";
import { volumeConfidence } from "../voiceprints/aggregate";

/**
 * Descriptive measurements for evaluation. None of them is a quality score,
 * and none is a proxy for meaning: retention says how much wording survived,
 * not whether the meaning did; a metric delta says what moved, not whether
 * moving was good.
 */

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// ---------------------------------------------------------------- retention

const tokens = (t: string) => words(t).map((w) => w.toLowerCase().replace(/[’]/g, "'"));

function multiset<T>(xs: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Share of `a`'s items (with multiplicity) that also occur in `b`. 1 when `a` is empty. */
function multisetRetention<T>(a: T[], b: T[]): number {
  if (a.length === 0) return 1;
  const mb = multiset(b);
  let kept = 0;
  for (const [k, n] of multiset(a)) kept += Math.min(n, mb.get(k) ?? 0);
  return kept / a.length;
}

const ngrams = (ts: string[], n: number) => {
  const out: string[] = [];
  for (let i = 0; i + n <= ts.length; i++) out.push(ts.slice(i, i + n).join(" "));
  return out;
};

/** Word-level Levenshtein distance, normalised by the longer length. null beyond `limit` cells. */
export function wordEditDistance(a: string[], b: string[], limit = 4_000_000): number | null {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length * b.length > limit) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / Math.max(a.length, b.length);
}

export function wordingRetention(source: string, output: string): Retention {
  const s = tokens(source);
  const o = tokens(output);
  const srcSet = new Set(s);
  const ed = wordEditDistance(s, o);
  return {
    sourceWords: s.length,
    outputWords: o.length,
    lengthRatio: round(s.length ? o.length / s.length : 1, 3),
    tokenRetention: round(multisetRetention(s, o), 3),
    bigramRetention: round(multisetRetention(ngrams(s, 2), ngrams(o, 2)), 3),
    trigramRetention: round(multisetRetention(ngrams(s, 3), ngrams(o, 3)), 3),
    wordEditDistance: ed === null ? null : round(ed, 3),
    novelTokenShare: round(o.length ? o.filter((t) => !srcSet.has(t)).length / o.length : 0, 3),
  };
}

// ------------------------------------------------------------ metric deltas

const METRICS: { metric: string; label: string; unit: string; get: (m: WritingMetrics) => number }[] = [
  { metric: "words", label: "words", unit: "count", get: (m) => m.words },
  { metric: "sentences", label: "sentences", unit: "count", get: (m) => m.sentences },
  { metric: "paragraphs", label: "paragraphs", unit: "count", get: (m) => m.paragraphs },
  { metric: "sentence.mean", label: "mean sentence length", unit: "words", get: (m) => m.sentenceLength.mean },
  { metric: "sentence.median", label: "median sentence length", unit: "words", get: (m) => m.sentenceLength.median },
  { metric: "sentence.cv", label: "sentence-length CV", unit: "cv", get: (m) => m.sentenceLength.cv },
  { metric: "paragraph.cv", label: "paragraph-length CV", unit: "cv", get: (m) => m.paragraphLength.cv },
  { metric: "transitions.per100", label: "stock transitions", unit: "per 100 words", get: (m) => (m.words ? (Object.values(m.transitions).reduce((a, b) => a + b, 0) / m.words) * 100 : 0) },
  { metric: "openers.stock", label: "stock-connective openers", unit: "share of sentences", get: (m) => m.shares.transitionOpeners },
  { metric: "openers.repeated", label: "sentences with a repeated opener", unit: "count", get: (m) => m.repeatedOpeners.reduce((a, o) => a + o.count, 0) },
  { metric: "hedges.per100", label: "hedges", unit: "per 100 words", get: (m) => m.per100.hedges },
  { metric: "intensifiers.per100", label: "intensifiers", unit: "per 100 words", get: (m) => m.per100.intensifiers },
  { metric: "contractions.per100", label: "contractions", unit: "per 100 words", get: (m) => m.per100.contractions },
  { metric: "firstPerson.per100", label: "first-person words", unit: "per 100 words", get: (m) => m.per100.firstPerson },
  { metric: "dashes.per100", label: "dashes", unit: "per 100 words", get: (m) => m.per100.dashes },
  { metric: "semicolons.per100", label: "semicolons", unit: "per 100 words", get: (m) => m.per100.semicolons },
  { metric: "questions.share", label: "questions", unit: "share of sentences", get: (m) => m.shares.questions },
  { metric: "fragments.share", label: "short fragments", unit: "share of sentences", get: (m) => m.shares.fragments },
  { metric: "passive.share", label: "likely passives", unit: "share of sentences", get: (m) => m.shares.likelyPassive },
  { metric: "lexicalVariety", label: "lexical variety (MATTR)", unit: "ratio", get: (m) => m.lexicalVariety },
];

/** Raw before/after values and their difference. No direction is labelled better. */
export function metricDeltas(before: WritingMetrics, after: WritingMetrics): MetricDelta[] {
  return METRICS.map(({ metric, label, unit, get }) => {
    const b = round(get(before), 3);
    const a = round(get(after), 3);
    return { metric, label, unit, before: b, after: a, delta: round(a - b, 3) };
  });
}

// ------------------------------------------------------- voice comparison

/** Tolerances mirror constraintsFromVoiceprint: relative width, absolute floor. */
const SOURCE_TOLERANCE: [Dimension, number, number][] = [
  ["rhythm.sentence-length", 0.2, 2],
  ["rhythm.sentence-variation", 0.25, 0.08],
  ["rhythm.paragraph-variation", 0.3, 0.1],
  ["voice.contractions", 0.35, 0.5],
  ["voice.first-person", 0.35, 0.5],
  ["voice.hedging", 0.35, 0.5],
  ["voice.questions", 0.35, 0.03],
  ["voice.fragments", 0.35, 0.03],
  ["punctuation.dashes", 0.35, 0.3],
  ["punctuation.semicolons", 0.35, 0.2],
  ["transition.openers", 0.35, 0.03],
];

/**
 * Where the output sits against the author's tendencies, per dimension.
 * With a Voiceprint the ranges are exactly the ones the rewrite was given;
 * without one, ranges are built around the source text itself and widen as
 * the source gets shorter (less evidence). No overall percentage.
 */
export function compareVoice(source: WritingMetrics, output: WritingMetrics, voiceprint?: Voiceprint): VoiceComparison {
  const ranges: { dimension: Dimension; min: number; max: number; confidence: number }[] = voiceprint
    ? constraintsFromVoiceprint(voiceprint).map((c) => ({ dimension: c.dimension, min: c.min, max: c.max, confidence: c.strength }))
    : SOURCE_TOLERANCE.map(([dimension, rel, floor]) => {
        const c = volumeConfidence(source.words);
        const v = dimensionValue(source, dimension);
        const tol = Math.max(floor, Math.abs(v) * rel) * (1 + (1 - c));
        return { dimension, min: round(Math.max(0, v - tol), 3), max: round(v + tol, 3), confidence: c };
      });
  const dimensions = ranges.map((r) => {
    const src = round(dimensionValue(source, r.dimension), 3);
    const act = round(dimensionValue(output, r.dimension), 3);
    const inside = (x: number) => x >= r.min && x <= r.max;
    return {
      dimension: r.dimension,
      label: DIMENSION_LABELS[r.dimension].label,
      unit: DIMENSION_LABELS[r.dimension].unit,
      expected: { min: r.min, max: r.max },
      source: src,
      actual: act,
      confidence: round(r.confidence, 2),
      withinRange: inside(act),
      sourceWithinRange: inside(src),
    };
  });
  return {
    reference: voiceprint ? "voiceprint" : "source",
    referenceName: voiceprint ? voiceprint.name : "the source text",
    dimensions,
    movedOut: dimensions.filter((d) => d.sourceWithinRange && !d.withinRange).map((d) => d.dimension),
    movedIn: dimensions.filter((d) => !d.sourceWithinRange && d.withinRange).map((d) => d.dimension),
  };
}

// ----------------------------------------------------------- semantic gate

const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ");

/** A case anchor may list alternatives separated by "|" (e.g. "does not delete|doesn't delete"). */
export function anchorPresent(text: string, anchor: string): boolean {
  const t = norm(text);
  return anchor.split("|").some((alt) => t.includes(norm(alt.trim())));
}

/**
 * Meaning is a hard gate. Deterministic and model findings are reported
 * separately, and a deterministic failure fails the gate whatever the model
 * says: a model's "looks equivalent" never hides a changed figure.
 */
export function semanticGate(v: VerificationResult, output: string, caseAnchors: string[] = []): SemanticGate {
  const lite = (f: { kind: string; message: string }) => ({ kind: f.kind, message: f.message });
  const det = v.findings.filter((f) => f.origin === "deterministic");
  const mod = v.findings.filter((f) => f.origin === "model");
  // A changed negation count is a warning in the product (it has false alarms, e.g. "not unlike");
  // in evaluation it fails the gate, because a missed flip costs far more than a reviewed false alarm.
  const detFail = det.filter((f) => f.severity === "blocking" || f.kind === "negation_changed");
  const modFail = mod.filter((f) => f.severity === "blocking");
  const ranModel = v.checks.includes("model_meaning");
  const caseAnchorsLost = caseAnchors.filter((a) => !anchorPresent(output, a));
  const failed = detFail.length > 0 || modFail.length > 0 || caseAnchorsLost.length > 0;
  return {
    verdict: failed ? "FAIL" : "PASS",
    deterministic: {
      verdict: detFail.length > 0 || caseAnchorsLost.length > 0 ? "FAIL" : "PASS",
      failures: detFail.map(lite),
      warnings: det.filter((f) => f.severity === "warning" && f.kind !== "negation_changed").map(lite),
    },
    model: {
      status: !ranModel ? "not-run" : modFail.length ? "fail" : "pass",
      failures: modFail.map(lite),
      warnings: mod.filter((f) => f.severity === "warning").map(lite),
    },
    lexicalCoverage: v.lexicalCoverage ?? null,
    caseAnchorsLost,
  };
}

// --------------------------------------------------------------- rule diff

const active = (a: WritingAnalysis) =>
  a.findings
    .filter((f) => !f.suppressedBy && f.rule.severity !== "info")
    .map((f) => ({ ruleId: f.rule.id, name: f.rule.name, count: f.matches.length, determinism: f.rule.determinism }));

export function ruleDiff(before: WritingAnalysis, after: WritingAnalysis): RuleDiff {
  const b = active(before);
  const a = active(after);
  const bIds = new Set(b.map((x) => x.ruleId));
  const aIds = new Set(a.map((x) => x.ruleId));
  const introduced = a.filter((x) => !bIds.has(x.ruleId));
  return {
    before: b,
    after: a,
    resolved: b.filter((x) => !aIds.has(x.ruleId)).map((x) => x.ruleId),
    remaining: b.filter((x) => aIds.has(x.ruleId)).map((x) => x.ruleId),
    introduced: introduced.map((x) => x.ruleId),
    introducedDeterministic: introduced.filter((x) => x.determinism === "deterministic").map((x) => x.ruleId),
  };
}
