import type { Detection, RuleMatch, WritingRule } from "@/domain/writing-rules";
import { countLexicon, metricValue, round, type WritingMetrics } from "./metrics";
import { excerptAround, type TextIndex } from "./text-index";
import { runBuiltin } from "./builtins";
import { checkPattern } from "./regex-safety";

/**
 * Declarative detectors. Each returns matches with offsets into the original
 * text; lexical detectors search the masked copy so quotations and code are
 * never flagged.
 */

export interface DetectionContext {
  ix: TextIndex;
  metrics: WritingMetrics;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseSource = (p: string) =>
  `(?<![\\p{L}\\p{N}])${escapeRe(p.replace(/[’']/g, "'")).replace(/'/g, "['’]").replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`;

const compiled = new Map<string, RegExp>();
function cachedRegex(source: string, flags: string): RegExp {
  const key = `${flags}/${source}`;
  let re = compiled.get(key);
  if (!re) {
    re = new RegExp(source, flags);
    compiled.set(key, re);
  }
  re.lastIndex = 0;
  return re;
}

function match(ctx: DetectionContext, ruleId: string, start: number, end: number, evidence: string, confidence = 1): RuleMatch {
  return { ruleId, start, end, excerpt: excerptAround(ctx.ix.text, start, end), confidence, evidence };
}

function isSentenceStart(ix: TextIndex, offset: number): boolean {
  return ix.sentences.some((s) => {
    const lead = ix.text.slice(s.start, offset);
    return offset >= s.start && offset < s.end && /^["'“‘(\[*_]*$/.test(lead);
  });
}

function detectPhrase(rule: WritingRule, d: Extract<Detection, { kind: "phrase" }>, ctx: DetectionContext): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const phrase of d.phrases) {
    const re = cachedRegex(phraseSource(phrase), "giu");
    for (const m of ctx.ix.masked.matchAll(re)) {
      const start = m.index ?? 0;
      if (d.sentenceStart && !isSentenceStart(ctx.ix, start)) continue;
      out.push(match(ctx, rule.id, start, start + m[0].length, `contains “${phrase}”`));
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out.length >= d.minOccurrences ? out : [];
}

function detectRegex(rule: WritingRule, d: Extract<Detection, { kind: "regex" }>, ctx: DetectionContext): RuleMatch[] {
  if (!checkPattern(d.pattern, d.flags).ok) return []; // unsafe patterns never run
  const flags = `${d.flags}g`;
  const out: RuleMatch[] = [];
  if (d.scope === "sentence") {
    for (const s of ctx.ix.sentences) {
      const slice = ctx.ix.masked.slice(s.start, s.end);
      for (const m of slice.matchAll(cachedRegex(d.pattern, flags))) {
        const start = s.start + (m.index ?? 0);
        out.push(match(ctx, rule.id, start, start + Math.max(1, m[0].length), "matches the pattern"));
      }
    }
  } else {
    for (const m of ctx.ix.masked.matchAll(cachedRegex(d.pattern, flags))) {
      const start = m.index ?? 0;
      out.push(match(ctx, rule.id, start, start + Math.max(1, m[0].length), "matches the pattern"));
    }
  }
  if (out.length < d.minOccurrences) return [];
  const rate = ctx.ix.wordCount ? (out.length / ctx.ix.wordCount) * 100 : 0;
  if (d.minPer100Words > 0 && rate < d.minPer100Words) return [];
  if (d.minPer100Words > 0) for (const m of out) m.evidence = `${out.length} occurrences (${round(rate, 1)} per 100 words)`;
  return out;
}

function detectDensity(rule: WritingRule, d: Extract<Detection, { kind: "density" }>, ctx: DetectionContext): RuleMatch[] {
  if (ctx.ix.wordCount < d.minWords) return [];
  const lower = ctx.ix.masked.toLowerCase();
  const n = countLexicon(lower, d.lexicon);
  const rate = (n / ctx.ix.wordCount) * 100;
  if (n < d.minOccurrences || rate < d.per100Words) return [];
  const out: RuleMatch[] = [];
  for (const item of d.lexicon) {
    for (const m of lower.matchAll(cachedRegex(phraseSource(item), "giu"))) {
      const start = m.index ?? 0;
      out.push(match(ctx, rule.id, start, start + m[0].length, `${n} occurrences, ${round(rate, 1)} per 100 words (threshold ${d.per100Words})`));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function detectMetric(rule: WritingRule, d: Extract<Detection, { kind: "metric" }>, ctx: DetectionContext): RuleMatch[] {
  if (ctx.metrics.sentences < d.minSentences || ctx.metrics.paragraphs < d.minParagraphs || ctx.ix.wordCount < d.minWords) return [];
  const value = metricValue(ctx.metrics, d.metric);
  const fires = d.op === "lt" ? value < d.threshold : value > d.threshold;
  if (!fires) return [];
  const distance = Math.abs(value - d.threshold) / Math.max(Math.abs(d.threshold), 0.01);
  // Heuristic confidence: barely over the line is weak evidence.
  const confidence = round(Math.min(0.9, 0.45 + distance), 2);
  return [match(ctx, rule.id, 0, ctx.ix.text.length, `${d.metric} ${value} ${d.op === "lt" ? "<" : ">"} ${d.threshold}`, confidence)];
}

export function detect(rule: WritingRule, ctx: DetectionContext): RuleMatch[] {
  const d = rule.detection;
  switch (d.kind) {
    case "phrase":
      return detectPhrase(rule, d, ctx);
    case "regex":
      return detectRegex(rule, d, ctx);
    case "density":
      return detectDensity(rule, d, ctx);
    case "metric":
      return detectMetric(rule, d, ctx);
    case "builtin":
      return runBuiltin(d.detector, d.params, rule.id, ctx);
    case "comparison":
    case "none":
      return [];
  }
}
