import type { Measured, Observation, Voiceprint, VoiceprintStats, WritingSample } from "@/domain/voiceprint";
import { analyzeText, type TextAnalysis } from "../analysis/analyze";
import { words } from "../analysis/tokenize";
import { STOPWORDS } from "../analysis/lexicon";

/**
 * Builds a Voiceprint's statistics from genuine samples. Each measurement's
 * confidence combines how much text we have with how consistent the author is
 * across samples: a habit seen in one sample only is reported cautiously.
 */

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** 0 with no text, ~0.5 around 600 words, ~0.94 at 2,500, never 1. */
export function volumeConfidence(totalWords: number): number {
  // Capped below 1: no amount of text makes a style measurement certain.
  return Math.min(0.99, round(1 - Math.exp(-totalWords / 900)));
}

/** Consistency across samples: 1 when identical, falling as spread grows. One sample gets 0.5. */
export function consistency(values: number[]): number {
  if (values.length < 2) return 0.5;
  const m = mean(values);
  if (m === 0) return values.every((v) => v === 0) ? 1 : 0.5;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
  return round(Math.max(0, 1 - sd / Math.abs(m) / 1.5));
}

function measure(values: number[], weights: number[], volume: number): Measured {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const value = values.reduce((a, v, i) => a + v * weights[i], 0) / total;
  return { value: round(value), confidence: round(volume * (0.4 + 0.6 * consistency(values))) };
}

function ngrams(text: string, n: number): Set<string> {
  const toks = words(text).map((w) => w.toLowerCase());
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) {
    const gram = toks.slice(i, i + n);
    if (gram.every((g) => STOPWORDS.has(g))) continue;
    if (gram.filter((g) => !STOPWORDS.has(g)).length < 1) continue;
    out.add(gram.join(" "));
  }
  return out;
}

/** Phrases (3–4 words) that occur in at least two different samples. */
export function recurringPhrases(samples: string[], limit = 8): string[] {
  if (samples.length < 2) return [];
  const counts = new Map<string, number>();
  for (const s of samples) for (const g of new Set([...ngrams(s, 3), ...ngrams(s, 4)])) counts.set(g, (counts.get(g) ?? 0) + 1);
  const shared = [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  // Skip fragments of an already-picked phrase (sharing two or more words in sequence).
  const overlaps = (a: string, b: string) => {
    const aw = a.split(" ");
    for (let i = 0; i + 2 <= aw.length; i++) if (` ${b} `.includes(` ${aw.slice(i, i + 2).join(" ")} `)) return true;
    return false;
  };
  const picked: string[] = [];
  for (const [g] of shared) if (!picked.some((p) => overlaps(p, g))) picked.push(g);
  return picked.slice(0, limit);
}

export function computeVoiceprintStats(samples: Pick<WritingSample, "text">[]): { stats: VoiceprintStats; analyses: TextAnalysis[]; totalWords: number } | null {
  const texts = samples.map((s) => s.text).filter((t) => words(t).length > 0);
  if (texts.length === 0) return null;
  const analyses = texts.map(analyzeText);
  const w = analyses.map((a) => a.counts.words);
  const totalWords = w.reduce((a, b) => a + b, 0);
  const vol = volumeConfidence(totalWords);
  const m = (pick: (a: TextAnalysis) => number) => measure(analyses.map(pick), w, vol);

  const openerCounts = new Map<string, number>();
  for (const a of analyses) for (const o of a.openers) openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);

  const stats: VoiceprintStats = {
    sentences: {
      meanLength: m((a) => a.sentenceLength.mean),
      lengthStdDev: m((a) => a.sentenceLength.stdDev),
      questionRate: m((a) => a.sentenceShares.questions),
      fragmentRate: m((a) => a.sentenceShares.fragments),
    },
    vocabulary: {
      meanWordLength: m((a) => a.vocabulary.meanWordLength),
      longWordRate: m((a) => a.vocabulary.longWordRate),
      lexicalVariety: m((a) => a.vocabulary.lexicalVariety),
      contractionRate: m((a) => a.rates.contractions),
      firstPersonRate: m((a) => a.rates.firstPerson),
      hedgeRate: m((a) => a.rates.hedges),
    },
    punctuation: {
      commasPer100: m((a) => a.punctuation.commas),
      dashesPer100: m((a) => a.punctuation.dashes),
      semicolonsPer100: m((a) => a.punctuation.semicolons),
      parenthesesPer100: m((a) => a.punctuation.parentheses),
      exclamationsPer100: m((a) => a.punctuation.exclamations),
    },
    structure: {
      meanParagraphSentences: m((a) => a.paragraphLength.meanSentences),
      transitionOpenerRate: m((a) => a.sentenceShares.transitionOpeners),
    },
    recurringOpeners: [...openerCounts.entries()]
      .filter(([o, c]) => c >= Math.min(2, texts.length) && !["the", "a", "an"].includes(o))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([o]) => o),
    recurringPhrases: recurringPhrases(texts),
  };
  return { stats, analyses, totalWords };
}

/**
 * Observations are sentences a person can check against their own writing.
 * They are only produced when the measurement clears both a threshold and a
 * minimum confidence, and they carry that confidence.
 */
export function describeStats(stats: VoiceprintStats): Observation[] {
  const out: Observation[] = [];
  const add = (id: string, text: string, m: Measured, minConfidence = 0.25) => {
    if (m.confidence >= minConfidence) out.push({ id, text, confidence: m.confidence, source: "measured" });
  };
  const s = stats.sentences;
  const v = stats.vocabulary;
  const p = stats.punctuation;

  if (s.meanLength.value <= 13) add("short-sentences", `Writes in short sentences (about ${Math.round(s.meanLength.value)} words on average).`, s.meanLength);
  else if (s.meanLength.value >= 22) add("long-sentences", `Favours long, built-up sentences (about ${Math.round(s.meanLength.value)} words on average).`, s.meanLength);
  else add("mid-sentences", `Sentences average about ${Math.round(s.meanLength.value)} words.`, s.meanLength);

  if (s.meanLength.value > 0 && s.lengthStdDev.value / s.meanLength.value >= 0.6) add("varied-rhythm", "Mixes very short sentences with long ones.", s.lengthStdDev);
  else if (s.meanLength.value > 0 && s.lengthStdDev.value / s.meanLength.value <= 0.3) add("even-rhythm", "Keeps sentence lengths fairly even.", s.lengthStdDev);

  if (v.contractionRate.value >= 2) add("contractions", "Uses contractions freely.", v.contractionRate);
  else if (v.contractionRate.value < 0.3) add("no-contractions", "Rarely uses contractions.", v.contractionRate);

  if (v.firstPersonRate.value >= 3) add("first-person", "Writes in the first person often.", v.firstPersonRate);
  if (s.questionRate.value >= 0.08) add("questions", "Asks the reader questions.", s.questionRate);
  if (s.fragmentRate.value >= 0.08) add("fragments", "Uses deliberate fragments.", s.fragmentRate);
  if (p.dashesPer100.value >= 0.8) add("dashes", "Reaches for dashes to add asides.", p.dashesPer100);
  if (p.parenthesesPer100.value >= 0.5) add("parentheses", "Puts asides in parentheses.", p.parenthesesPer100);
  if (p.semicolonsPer100.value >= 0.4) add("semicolons", "Joins related clauses with semicolons.", p.semicolonsPer100);
  if (p.exclamationsPer100.value >= 0.5) add("exclamations", "Uses exclamation marks.", p.exclamationsPer100);
  if (v.hedgeRate.value >= 2) add("hedges", "Qualifies claims often (maybe, probably, I think).", v.hedgeRate);
  else if (v.hedgeRate.value < 0.4) add("direct", "States things directly, with few qualifiers.", v.hedgeRate);
  if (v.longWordRate.value >= 0.3) add("long-words", "Leans on longer, more technical words.", v.longWordRate);
  if (stats.structure.transitionOpenerRate.value < 0.03) add("few-connectives", "Rarely opens sentences with stock connectives like “Furthermore”.", stats.structure.transitionOpenerRate);
  return out;
}

export function overallConfidence(sampleCount: number, totalWords: number): number {
  const sampleFactor = Math.min(1, sampleCount / 3);
  return round(volumeConfidence(totalWords) * (0.5 + 0.5 * sampleFactor));
}

/** Pure: recompute a Voiceprint from its samples. Model observations are kept as-is. */
export function rebuildVoiceprint(vp: Voiceprint, samples: WritingSample[], now: string): Voiceprint {
  const computed = computeVoiceprintStats(samples);
  const modelObservations = vp.observations.filter((o) => o.source === "model");
  if (!computed) {
    return { ...vp, sampleCount: 0, totalWords: 0, stats: null, observations: modelObservations, confidence: 0, updatedAt: now };
  }
  return {
    ...vp,
    sampleCount: samples.length,
    totalWords: computed.totalWords,
    stats: computed.stats,
    observations: [...describeStats(computed.stats), ...modelObservations].slice(0, 20),
    confidence: overallConfidence(samples.length, computed.totalWords),
    updatedAt: now,
  };
}
