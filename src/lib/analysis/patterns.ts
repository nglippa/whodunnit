/**
 * Catalogue of formulaic constructions: stock phrasing that makes prose read as
 * templated. Each entry is a literal pattern with a stated reason. A match means
 * "this phrasing is present", never "a machine wrote this".
 */

export type PatternCategory = "signposting" | "summary" | "inflation" | "contrast" | "enumeration" | "filler";

export interface FormulaicPattern {
  id: string;
  label: string;
  category: PatternCategory;
  re: RegExp;
  why: string;
}

export const FORMULAIC_PATTERNS: FormulaicPattern[] = [
  {
    id: "worth-noting",
    label: "“It is worth noting”",
    category: "signposting",
    re: /\b(?:it['’]s|it is) (?:worth noting|important to note|important to remember|worth mentioning)(?: that)?\b/gi,
    why: "Announces a point instead of making it.",
  },
  {
    id: "in-todays-world",
    label: "“In today's …” opener",
    category: "filler",
    re: /\bin today['’]s (?:fast-paced |ever-changing |rapidly evolving |digital |modern )?(?:world|landscape|environment|age|society)\b/gi,
    why: "A generic scene-setter that could open any text.",
  },
  {
    id: "summary-closer",
    label: "Summary closer",
    category: "summary",
    re: /(?:^|[.!?]\s+)(?:in conclusion|in summary|to sum up|to summarize|overall|ultimately),/gim,
    why: "Restates what the reader just read.",
  },
  {
    id: "not-just-but",
    label: "“Not just X, but Y”",
    category: "contrast",
    re: /\b(?:not (?:just|only|merely) [^.,;]{1,60},? but(?: also)?|it['’]s not (?:just )?(?:about )?[^.,;]{1,40}[,;—–-]\s*it['’]s)\b/gi,
    why: "Manufactured contrast; the plain claim is usually stronger.",
  },
  {
    id: "inflated-vocab",
    label: "Inflated vocabulary",
    category: "inflation",
    re: /\b(?:delve|delves|delving|tapestry|testament to|leverag(?:e|es|ed|ing)|seamless(?:ly)?|robust|elevate[sd]?|unlock(?:s|ing)? the (?:power|potential)|navigate the complexities|in the realm of|pivotal|paramount|multifaceted|ever-evolving|game[- ]changer|transformative)\b/gi,
    why: "Impressive-sounding words standing in for specific ones.",
  },
  {
    id: "ordinal-enumeration",
    label: "Firstly / Secondly enumeration",
    category: "enumeration",
    re: /(?:^|[.!?]\s+)(?:firstly|secondly|thirdly|lastly),/gim,
    why: "Scaffolding that makes paragraphs feel assembled.",
  },
  {
    id: "additive-opener",
    label: "Additionally / Furthermore / Moreover",
    category: "signposting",
    re: /(?:^|[.!?]\s+)(?:additionally|furthermore|moreover),/gim,
    why: "Stock connective at the start of a sentence.",
  },
  {
    id: "plays-a-role",
    label: "“plays a crucial role”",
    category: "inflation",
    re: /\bplays? an? (?:crucial|vital|key|pivotal|significant|important) role\b/gi,
    why: "Vague importance claim; says a thing matters without saying how.",
  },
  {
    id: "whether-youre",
    label: "“Whether you're X or Y”",
    category: "filler",
    re: /\bwhether you['’]re an? [^.,]{1,40} or (?:an? )?[^.,]{1,40}\b/gi,
    why: "Audience-widening boilerplate.",
  },
];

export interface PatternMatch {
  id: string;
  label: string;
  category: PatternCategory;
  why: string;
  count: number;
  examples: string[];
}

export function findFormulaicPatterns(text: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (const p of FORMULAIC_PATTERNS) {
    const matches = [...text.matchAll(new RegExp(p.re.source, p.re.flags))].map((m) => m[0].replace(/^[.!?]\s+/, "").trim());
    if (matches.length) {
      out.push({ id: p.id, label: p.label, category: p.category, why: p.why, count: matches.length, examples: [...new Set(matches)].slice(0, 3) });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
