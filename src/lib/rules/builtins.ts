import type { BuiltinDetectorId, RuleMatch } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import { HEDGES } from "../analysis/lexicon";
import { sentenceOpener } from "../analysis/analyze";
import { countLexicon, round, type WritingMetrics } from "./metrics";
import { excerptAround, proseParagraphs, type SentenceSpan, type TextIndex } from "./text-index";

/**
 * Structural detectors. Each is deliberately conservative: it needs repetition,
 * density or a minimum amount of text before it fires, because one instance of
 * almost any construction is ordinary writing.
 */

interface Ctx {
  ix: TextIndex;
  metrics: WritingMetrics;
}
type Params = Record<string, number>;
type Detector = (ruleId: string, ctx: Ctx, p: Params) => RuleMatch[];

const m = (ctx: Ctx, ruleId: string, start: number, end: number, evidence: string, confidence: number): RuleMatch => ({
  ruleId,
  start,
  end,
  excerpt: excerptAround(ctx.ix.text, start, end),
  confidence,
  evidence,
});
const firstWord = (s: string) => words(s)[0]?.toLowerCase() ?? "";
const firstTwo = (s: string) => words(s).slice(0, 2).join(" ").toLowerCase();
const COMMON_OPENERS = new Set(["the", "a", "an", "i", "we", "it", "this", "you", "he", "she", "they"]);
const ADDITIVE = new Set(["additionally", "furthermore", "moreover", "in addition"]);

/** Consecutive sentences sharing a first word. */
const repeatedSentenceOpeners: Detector = (id, ctx, p) => {
  const run = p.run ?? 3;
  const runCommon = p.runCommon ?? 4;
  const out: RuleMatch[] = [];
  const s = ctx.ix.sentences;
  let i = 0;
  while (i < s.length) {
    const w = firstWord(s[i].text);
    let j = i + 1;
    while (j < s.length && w && firstWord(s[j].text) === w) j++;
    const need = COMMON_OPENERS.has(w) ? runCommon : run;
    if (w && j - i >= need) {
      for (let k = i; k < j; k++) out.push(m(ctx, id, s[k].start, s[k].start + w.length, `${j - i} consecutive sentences open with “${w}”`, 0.8));
    }
    i = j;
  }
  // The same two-word opener used across a fifth or more of a longer text.
  if (s.length >= (p.minSentences ?? 8)) {
    const counts = new Map<string, SentenceSpan[]>();
    for (const x of s) {
      const two = firstTwo(x.text);
      if (two.split(" ").length === 2) counts.set(two, [...(counts.get(two) ?? []), x]);
    }
    for (const [two, spans] of counts) {
      if (spans.length >= (p.twoWord ?? 3) && spans.length / s.length >= 0.2) {
        for (const x of spans) {
          if (!out.some((o) => o.start === x.start)) out.push(m(ctx, id, x.start, x.start + two.length, `“${two}” opens ${spans.length} of ${s.length} sentences`, 0.7));
        }
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
};

/** Consecutive paragraphs sharing an opening word. */
const repeatedParagraphOpeners: Detector = (id, ctx, p) => {
  const paras = proseParagraphs(ctx.ix);
  const need = p.run ?? 3;
  const out: RuleMatch[] = [];
  let i = 0;
  while (i < paras.length) {
    const w = firstWord(paras[i].text);
    let j = i + 1;
    while (j < paras.length && w && firstWord(paras[j].text) === w) j++;
    if (w && j - i >= need) for (let k = i; k < j; k++) out.push(m(ctx, id, paras[k].start, paras[k].start + w.length, `${j - i} consecutive paragraphs open with “${w}”`, 0.8));
    i = j;
  }
  return out;
};

/** The same stock transition reused, or additive connectives chained. */
const repeatedTransitions: Detector = (id, ctx, p) => {
  const s = ctx.ix.sentences;
  const out: RuleMatch[] = [];
  const openers = s.map((x) => sentenceOpener(x.text));
  const byWord = new Map<string, number[]>();
  openers.forEach((t, i) => t && byWord.set(t, [...(byWord.get(t) ?? []), i]));
  for (const [t, idx] of byWord) {
    if (idx.length >= (p.sameWord ?? 3)) for (const i of idx) out.push(m(ctx, id, s[i].start, s[i].start + t.length, `“${t}” opens ${idx.length} sentences`, 0.9));
  }
  let chain: number[] = [];
  const flush = () => {
    if (chain.length >= (p.additiveChain ?? 2)) {
      for (const i of chain) {
        if (!out.some((o) => o.start === s[i].start)) out.push(m(ctx, id, s[i].start, s[i].start + (openers[i]?.length ?? 1), `${chain.length} additive connectives within a few sentences`, 0.85));
      }
    }
    chain = [];
  };
  openers.forEach((t, i) => {
    if (t && ADDITIVE.has(t)) {
      if (chain.length && i - chain[chain.length - 1] > 2) flush();
      chain.push(i);
    }
  });
  flush();
  return out.sort((a, b) => a.start - b.start);
};

const TRIAD_RE = /\b[\p{L}'’-]+(?: [\p{L}'’-]+){0,2}, [\p{L}'’-]+(?: [\p{L}'’-]+){0,2},? (?:and|or) [\p{L}'’-]+/gu;
/** Lists of exactly three, used as a default rhythm. Needs several, and density. */
const triadOveruse: Detector = (id, ctx, p) => {
  const hits: { start: number; end: number }[] = [];
  for (const s of ctx.ix.sentences) {
    const slice = ctx.ix.masked.slice(s.start, s.end);
    for (const x of slice.matchAll(TRIAD_RE)) {
      // A fourth item means a longer list, not a triad.
      const before = slice.slice(0, x.index ?? 0);
      if (/,\s*$/.test(before)) continue;
      hits.push({ start: s.start + (x.index ?? 0), end: s.start + (x.index ?? 0) + x[0].length });
    }
  }
  const per150 = ctx.ix.wordCount ? (hits.length / ctx.ix.wordCount) * 150 : 0;
  if (hits.length < (p.min ?? 3) || per150 < (p.per150 ?? 1)) return [];
  return hits.map((h) => m(ctx, id, h.start, h.end, `${hits.length} three-item lists in ${ctx.ix.wordCount} words`, 0.6));
};

/** Every paragraph the same number of sentences. */
const symmetricalParagraphs: Detector = (id, ctx, p) => {
  const paras = proseParagraphs(ctx.ix);
  if (paras.length < (p.minParagraphs ?? 4)) return [];
  const n = paras[0].sentences.length;
  if (n < 2 || !paras.every((x) => x.sentences.length === n)) return [];
  return [m(ctx, id, paras[0].start, paras[paras.length - 1].end, `all ${paras.length} paragraphs have exactly ${n} sentences`, 0.6)];
};

/** A long passage with no short and no long sentences at all. */
const noSentenceExtremes: Detector = (id, ctx, p) => {
  const s = ctx.ix.sentences;
  if (s.length < (p.minSentences ?? 12) || ctx.ix.wordCount < (p.minWords ?? 200)) return [];
  const short = p.short ?? 8;
  const long = p.long ?? 30;
  if (s.some((x) => x.wordCount < short || x.wordCount > long)) return [];
  return [m(ctx, id, s[0].start, s[s.length - 1].end, `${s.length} sentences, none under ${short} or over ${long} words`, 0.55)];
};

/** "Not a X. Not a Y. A Z." */
const negativeListing: Detector = (id, ctx) => {
  const s = ctx.ix.sentences;
  const out: RuleMatch[] = [];
  const isNeg = (x: SentenceSpan) => /^(?:not (?:a|an|the|just|only|some)|no)\b/i.test(x.text) && x.wordCount <= 7;
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && isNeg(s[j])) j++;
    if (j - i >= 2) out.push(m(ctx, id, s[i].start, s[Math.min(j, s.length - 1)].end, `${j - i} short “Not a …” sentences in a row`, 0.85));
    i = Math.max(j, i + 1);
  }
  return out;
};

/** Runs of clipped, dramatic fragments. */
const dramaticFragments: Detector = (id, ctx, p) => {
  const s = ctx.ix.sentences;
  const out: RuleMatch[] = [];
  const maxWords = p.maxWords ?? 5;
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && s[j].wordCount <= maxWords && s[j].paragraph === s[i].paragraph) j++;
    const run = s.slice(i, j);
    const andRun = run.filter((x) => /^(?:and|but)\s/i.test(x.text)).length >= 2;
    if (run.length >= (p.run ?? 3) || (run.length >= 2 && andRun)) {
      out.push(m(ctx, id, run[0].start, run[run.length - 1].end, `${run.length} consecutive sentences of ${maxWords} words or fewer`, 0.5));
    }
    i = Math.max(j, i + 1);
  }
  return out;
};

/** "The result? Chaos." used as a repeated device. */
const selfAnsweredQuestions: Detector = (id, ctx, p) => {
  const s = ctx.ix.sentences;
  const hits: RuleMatch[] = [];
  for (let i = 0; i + 1 < s.length; i++) {
    if (/\?["'”’)]*$/.test(s[i].text) && s[i].wordCount <= 8 && s[i + 1].wordCount <= 7 && s[i + 1].paragraph === s[i].paragraph) {
      hits.push(m(ctx, id, s[i].start, s[i + 1].end, "short question answered immediately by the writer", 0.6));
    }
  }
  return hits.length >= (p.min ?? 2) ? hits : [];
};

const PROFOUND_SHAPES = [
  /^(?:and )?(?:that['’]s|this is|that is) (?:what|the (?:real|whole|true)|where|why|how)\b/i,
  /^(?:in the end|at the end of the day|ultimately),/i,
  /^[\p{L}-]+ is the new [\p{L}-]+/iu,
  /\b(?:makes?|made) all the difference\b/i,
  /^(?:the|a) (?:future|real question|real lesson|lesson) is\b/i,
  /^(?:and )?(?:that|this) changes everything\b/i,
];
/** A short aphorism tacked onto the very end. Only the final sentence is checked. */
const fakeProfoundEnding: Detector = (id, ctx, p) => {
  const s = ctx.ix.sentences;
  const last = s[s.length - 1];
  if (!last || s.length < (p.minSentences ?? 3) || last.wordCount > (p.maxWords ?? 12)) return [];
  const clean = last.text.replace(/^["'“‘]+/, "");
  return PROFOUND_SHAPES.some((re) => re.test(clean)) ? [m(ctx, id, last.start, last.end, "final sentence is a short aphorism", 0.55)] : [];
};

/** A final paragraph that opens by announcing a summary. */
const recapEnding: Detector = (id, ctx, p) => {
  const paras = proseParagraphs(ctx.ix);
  if (paras.length < (p.minParagraphs ?? 2)) return [];
  const last = paras[paras.length - 1];
  // “In conclusion / In summary” are reported by slop.summary-openers (which can also remove them).
  const hit = /^(?:all in all|overall|ultimately|in short)\b,?/i.exec(last.text);
  return hit ? [m(ctx, id, last.start, last.start + hit[0].length, `final paragraph opens with “${hit[0].replace(/,$/, "")}”`, 0.9)] : [];
};

const SYNONYM_CLUSTERS = [
  ["tool", "platform", "solution", "system", "product", "software", "app", "application"],
  ["company", "firm", "organization", "organisation", "business", "enterprise"],
  ["agent", "assistant", "model", "bot"],
  ["approach", "method", "strategy", "technique", "methodology"],
  ["study", "research", "paper", "analysis"],
];
/** Rotating near-synonyms as the subject of consecutive sentences. */
const synonymCycling: Detector = (id, ctx) => {
  const out: RuleMatch[] = [];
  for (const para of proseParagraphs(ctx.ix)) {
    for (const cluster of SYNONYM_CLUSTERS) {
      const used = new Map<string, SentenceSpan>();
      for (const sent of para.sentences) {
        const two = words(sent.text).slice(0, 2).map((w) => w.toLowerCase());
        if (two[0] === "the" && cluster.includes(two[1])) used.set(two[1], used.get(two[1]) ?? sent);
      }
      if (used.size >= 3) {
        for (const [word, sent] of used) out.push(m(ctx, id, sent.start, sent.start + 4 + word.length, `subject rotates between ${[...used.keys()].map((w) => `“the ${w}”`).join(", ")}`, 0.5));
      }
    }
  }
  return out;
};

const DRAMATIC_HEADING = [
  /\p{Extended_Pictographic}/u,
  /!\s*$/,
  /^the (?:hidden|silent|secret|real|ultimate|dark|deadly|untold|surprising|shocking) [\p{L}-]+$/iu,
  /\b(?:trap|killer|paradox|myth|secret)\s*$/i,
];
/** Markdown headings written as teasers. */
const dramaticHeadings: Detector = (id, ctx) =>
  ctx.ix.paragraphs
    .filter((p) => p.isHeading)
    .filter((p) => DRAMATIC_HEADING.some((re) => re.test(p.text.replace(/^#+\s*/, "").trim())))
    .map((p) => m(ctx, id, p.start, p.end, "heading teases instead of describing", 0.7));

/** Bold emphasis scattered through prose. */
const emphasisSprinkling: Detector = (id, ctx, p) => {
  const hits: RuleMatch[] = [];
  for (const para of proseParagraphs(ctx.ix)) {
    for (const x of ctx.ix.text.slice(para.start, para.end).matchAll(/(?<!^)\*\*[^*\n]{2,60}\*\*/gm)) {
      const start = para.start + (x.index ?? 0);
      hits.push(m(ctx, id, start, start + x[0].length, "bold emphasis inside a sentence", 0.8));
    }
  }
  return hits.length >= (p.min ?? 3) ? hits : [];
};

/** One paragraph carrying many qualifiers. */
const paragraphHedgeCluster: Detector = (id, ctx, p) => {
  const out: RuleMatch[] = [];
  for (const para of proseParagraphs(ctx.ix)) {
    if (para.wordCount < (p.minWords ?? 40)) continue;
    const n = countLexicon(ctx.ix.masked.slice(para.start, para.end).toLowerCase(), HEDGES);
    if (n > (p.max ?? 3) && (n / para.wordCount) * 100 >= (p.per100 ?? 5)) {
      out.push(m(ctx, id, para.start, para.end, `${n} hedges in one ${para.wordCount}-word paragraph (${round((n / para.wordCount) * 100, 1)} per 100 words)`, 0.6));
    }
  }
  return out;
};

const REGISTRY: Record<BuiltinDetectorId, Detector> = {
  "repeated-sentence-openers": repeatedSentenceOpeners,
  "repeated-paragraph-openers": repeatedParagraphOpeners,
  "repeated-transitions": repeatedTransitions,
  "triad-overuse": triadOveruse,
  "symmetrical-paragraphs": symmetricalParagraphs,
  "no-sentence-extremes": noSentenceExtremes,
  "negative-listing": negativeListing,
  "dramatic-fragments": dramaticFragments,
  "self-answered-questions": selfAnsweredQuestions,
  "fake-profound-ending": fakeProfoundEnding,
  "recap-ending": recapEnding,
  "synonym-cycling": synonymCycling,
  "dramatic-headings": dramaticHeadings,
  "emphasis-sprinkling": emphasisSprinkling,
  "paragraph-hedge-cluster": paragraphHedgeCluster,
};

export function runBuiltin(id: BuiltinDetectorId, params: Params, ruleId: string, ctx: Ctx): RuleMatch[] {
  return REGISTRY[id](ruleId, ctx, params);
}
