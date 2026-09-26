import { words } from "../analysis/tokenize";
import { CONTRACTION_RE, FIRST_PERSON, HEDGES, INTENSIFIERS, STOPWORDS } from "../analysis/lexicon";
import { isLikelyPassive, lexicalVariety, sentenceOpener } from "../analysis/analyze";
import type { TextIndex } from "./text-index";
import { proseParagraphs } from "./text-index";

/**
 * Every number here is computed from the text; nothing is estimated by a
 * model. Rates are per 100 words; shares are 0–1 fractions of sentences.
 */
export interface WritingMetrics {
  words: number;
  sentences: number;
  paragraphs: number;
  sentenceLength: { mean: number; median: number; stdDev: number; cv: number; min: number; max: number };
  /** Paragraph word counts over prose paragraphs. */
  paragraphLength: { mean: number; stdDev: number; cv: number };
  per100: {
    contractions: number;
    firstPerson: number;
    hedges: number;
    intensifiers: number;
    commas: number;
    dashes: number;
    semicolons: number;
    colons: number;
    parentheses: number;
    exclamations: number;
    questions: number;
  };
  shares: { questions: number; fragments: number; transitionOpeners: number; likelyPassive: number };
  /** Stock transitions opening sentences, with counts (only those used). */
  transitions: Record<string, number>;
  /** First words that open 3+ sentences. */
  repeatedOpeners: { word: string; count: number }[];
  /** Content words used unusually often (≥4 times and ≥1.5 per 100 words). */
  repeatedWords: { word: string; count: number }[];
  lexicalVariety: number;
}

export const round = (n: number, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Sample standard deviation (n − 1). 0 for fewer than two values. */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
/** Coefficient of variation: stdDev / mean. 0 when the mean is 0. */
export const coefficientOfVariation = (xs: number[]) => {
  const m = mean(xs);
  return m ? stdDev(xs) / m : 0;
};

const per100 = (n: number, total: number) => (total ? (n / total) * 100 : 0);
const countRe = (text: string, re: RegExp) => (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;

export function countLexicon(lowerText: string, lexicon: readonly string[]): number {
  let n = 0;
  for (const item of lexicon) {
    const pattern = item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    n += countRe(lowerText, new RegExp(`(?<![\\p{L}'’])${pattern}(?![\\p{L}'’])`, "gu"));
  }
  return n;
}

export function computeMetrics(ix: TextIndex): WritingMetrics {
  const masked = ix.masked;
  const lower = masked.toLowerCase();
  const toks = words(masked);
  const total = ix.wordCount;
  const sentenceLens = ix.sentences.map((s) => s.wordCount).filter((n) => n > 0);
  const paraLens = proseParagraphs(ix).map((p) => p.wordCount);
  const nS = ix.sentences.length || 1;

  const transitions: Record<string, number> = {};
  const openerCounts = new Map<string, number>();
  let transitionOpeners = 0;
  for (const s of ix.sentences) {
    const t = sentenceOpener(s.text);
    if (t) {
      transitionOpeners++;
      transitions[t] = (transitions[t] ?? 0) + 1;
    }
    const first = words(s.text)[0]?.toLowerCase();
    if (first) openerCounts.set(first, (openerCounts.get(first) ?? 0) + 1);
  }

  const wordCounts = new Map<string, number>();
  for (const t of toks) {
    const w = t.toLowerCase().replace(/’/g, "'");
    if (w.length < 4 || STOPWORDS.has(w.replace(/'/g, ""))) continue;
    wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }

  return {
    words: total,
    sentences: ix.sentences.length,
    paragraphs: proseParagraphs(ix).length,
    sentenceLength: {
      mean: round(mean(sentenceLens), 1),
      median: round(median(sentenceLens), 1),
      stdDev: round(stdDev(sentenceLens), 1),
      cv: round(coefficientOfVariation(sentenceLens)),
      min: sentenceLens.length ? Math.min(...sentenceLens) : 0,
      max: sentenceLens.length ? Math.max(...sentenceLens) : 0,
    },
    paragraphLength: {
      mean: round(mean(paraLens), 1),
      stdDev: round(stdDev(paraLens), 1),
      cv: round(coefficientOfVariation(paraLens)),
    },
    per100: {
      contractions: round(per100(countRe(masked, CONTRACTION_RE), total), 2),
      firstPerson: round(per100(toks.filter((t) => FIRST_PERSON.has(t.toLowerCase().replace(/’/g, "'"))).length, total), 2),
      hedges: round(per100(countLexicon(lower, HEDGES), total), 2),
      intensifiers: round(per100(countLexicon(lower, INTENSIFIERS), total), 2),
      commas: round(per100(countRe(masked, /,/g), total), 2),
      dashes: round(per100(countRe(masked, /—|–|\s-\s|--/g), total), 2),
      semicolons: round(per100(countRe(masked, /;/g), total), 2),
      colons: round(per100(countRe(masked, /:(?!\/\/)/g), total), 2),
      parentheses: round(per100(countRe(masked, /\(/g), total), 2),
      exclamations: round(per100(countRe(masked, /!/g), total), 2),
      questions: round(per100(countRe(ix.text, /\?/g), total), 2),
    },
    shares: {
      questions: round(ix.sentences.filter((s) => /\?["'”’)]*$/.test(s.text)).length / nS),
      fragments: round(sentenceLens.filter((n) => n < 4).length / nS),
      transitionOpeners: round(transitionOpeners / nS),
      likelyPassive: round(ix.sentences.filter((s) => isLikelyPassive(s.text)).length / nS),
    },
    transitions,
    repeatedOpeners: [...openerCounts.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word, count]) => ({ word, count })),
    repeatedWords: [...wordCounts.entries()]
      .filter(([, c]) => c >= 4 && per100(c, total) >= 1.5)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word, count]) => ({ word, count })),
    lexicalVariety: round(lexicalVariety(toks)),
  };
}

/** Values a metric-threshold detector can read, by id. */
export function metricValue(m: WritingMetrics, id: string): number {
  switch (id) {
    case "sentenceCount":
      return m.sentences;
    case "paragraphCount":
      return m.paragraphs;
    case "sentenceLengthCV":
      return m.sentenceLength.cv;
    case "paragraphLengthCV":
      return m.paragraphLength.cv;
    case "transitionOpenerShare":
      return m.shares.transitionOpeners;
    case "likelyPassiveShare":
      return m.shares.likelyPassive;
    case "dashesPer100":
      return m.per100.dashes;
    case "semicolonsPer100":
      return m.per100.semicolons;
    case "hedgesPer100":
      return m.per100.hedges;
    case "intensifiersPer100":
      return m.per100.intensifiers;
    default:
      throw new Error(`Unknown metric ${id}`);
  }
}

