import { segment, words as wordTokens } from "./tokenize";
import { CONTRACTION_RE, FIRST_PERSON, HEDGES, IRREGULAR_PARTICIPLES, TRANSITION_OPENERS } from "./lexicon";
import { findFormulaicPatterns, type PatternMatch } from "./patterns";

/**
 * TextAnalysis contains only quantities that can be computed from the text
 * itself. Nothing here is a model judgement or an "AI score".
 */
export interface TextAnalysis {
  counts: { characters: number; words: number; sentences: number; paragraphs: number };
  sentenceLength: { mean: number; stdDev: number; min: number; max: number; /** stdDev / mean */ variation: number };
  paragraphLength: { meanSentences: number; /** coefficient of variation of paragraph word counts; low = uniform blocks */ variation: number };
  vocabulary: { meanWordLength: number; longWordRate: number; lexicalVariety: number };
  /** Per 100 words. */
  rates: { contractions: number; firstPerson: number; hedges: number };
  /** Per 100 words. */
  punctuation: { commas: number; dashes: number; semicolons: number; colons: number; parentheses: number; exclamations: number; questions: number };
  /** Share of sentences (0–1). */
  sentenceShares: { questions: number; fragments: number; transitionOpeners: number; likelyPassive: number };
  openers: string[];
  formulaic: PatternMatch[];
}

const round = (n: number, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const per100 = (count: number, totalWords: number) => (totalWords ? (count / totalWords) * 100 : 0);
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** Moving-average type/token ratio over a 50-word window: stable across lengths. */
export function lexicalVariety(tokens: string[], window = 50): number {
  const lower = tokens.map((t) => t.toLowerCase());
  if (lower.length === 0) return 0;
  if (lower.length <= window) return new Set(lower).size / lower.length;
  let total = 0;
  const n = lower.length - window + 1;
  for (let i = 0; i < n; i++) total += new Set(lower.slice(i, i + window)).size / window;
  return total / n;
}

export function sentenceOpener(sentence: string): string | null {
  const s = sentence.toLowerCase().replace(/^["'“‘(\[]+/, "");
  for (const t of TRANSITION_OPENERS) if (s.startsWith(t + ",") || s.startsWith(t + " ")) return t;
  return null;
}

/** be-verb + (adverb)? + participle. A heuristic, so it is reported as "likely". */
const PASSIVE_RE = /\b(?:is|are|was|were|be|been|being|get|gets|got)\s+(?:\w+ly\s+)?(\w+)\b/gi;
export function isLikelyPassive(sentence: string): boolean {
  for (const m of sentence.matchAll(PASSIVE_RE)) {
    const w = m[1].toLowerCase();
    if ((w.endsWith("ed") && w.length > 4) || IRREGULAR_PARTICIPLES.has(w)) return true;
  }
  return false;
}

function countHedges(lower: string): number {
  let n = 0;
  for (const h of HEDGES) n += count(lower, new RegExp(`\\b${h.replace(/ /g, "\\s+")}\\b`, "g"));
  return n;
}

export function analyzeText(text: string): TextAnalysis {
  const seg = segment(text);
  const toks = seg.words;
  const totalWords = toks.length;
  const sentenceWords = seg.sentences.map((s) => wordTokens(s).length).filter((n) => n > 0);
  const paragraphWords = seg.paragraphs.map((p) => wordTokens(p.join(" ")).length).filter((n) => n > 0);
  const lower = text.toLowerCase();
  const sMean = mean(sentenceWords);
  const sentences = seg.sentences;
  const nS = sentences.length || 1;

  const openerCounts = new Map<string, number>();
  let transitionOpeners = 0;
  for (const s of sentences) {
    const t = sentenceOpener(s);
    if (t) transitionOpeners++;
    const first = wordTokens(s)[0]?.toLowerCase();
    if (first) openerCounts.set(first, (openerCounts.get(first) ?? 0) + 1);
  }

  return {
    counts: { characters: text.length, words: totalWords, sentences: sentences.length, paragraphs: seg.paragraphs.length },
    sentenceLength: {
      mean: round(sMean, 1),
      stdDev: round(stdDev(sentenceWords), 1),
      min: sentenceWords.length ? Math.min(...sentenceWords) : 0,
      max: sentenceWords.length ? Math.max(...sentenceWords) : 0,
      variation: round(sMean ? stdDev(sentenceWords) / sMean : 0),
    },
    paragraphLength: {
      meanSentences: round(mean(seg.paragraphs.map((p) => p.length)), 1),
      variation: round(mean(paragraphWords) ? stdDev(paragraphWords) / mean(paragraphWords) : 0),
    },
    vocabulary: {
      meanWordLength: round(mean(toks.map((t) => t.replace(/['’-]/g, "").length)), 1),
      longWordRate: round(totalWords ? toks.filter((t) => t.replace(/['’-]/g, "").length >= 7).length / totalWords : 0),
      lexicalVariety: round(lexicalVariety(toks)),
    },
    rates: {
      contractions: round(per100(count(text, CONTRACTION_RE), totalWords), 1),
      firstPerson: round(per100(toks.filter((t) => FIRST_PERSON.has(t.toLowerCase().replace(/’/g, "'"))).length, totalWords), 1),
      hedges: round(per100(countHedges(lower), totalWords), 1),
    },
    punctuation: {
      commas: round(per100(count(text, /,/g), totalWords), 1),
      dashes: round(per100(count(text, /—|–|\s-\s|--/g), totalWords), 1),
      semicolons: round(per100(count(text, /;/g), totalWords), 1),
      colons: round(per100(count(text, /:(?!\/\/)/g), totalWords), 1),
      parentheses: round(per100(count(text, /\(/g), totalWords), 1),
      exclamations: round(per100(count(text, /!/g), totalWords), 1),
      questions: round(per100(count(text, /\?/g), totalWords), 1),
    },
    sentenceShares: {
      questions: round(sentences.filter((s) => /\?["'”’)]*$/.test(s)).length / nS),
      fragments: round(sentenceWords.filter((n) => n < 4).length / nS),
      transitionOpeners: round(transitionOpeners / nS),
      likelyPassive: round(sentences.filter(isLikelyPassive).length / nS),
    },
    openers: [...openerCounts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w),
    formulaic: findFormulaicPatterns(text),
  };
}
