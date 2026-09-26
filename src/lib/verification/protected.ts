import { splitSentences, splitParagraphs } from "../analysis/tokenize";
import { HEDGES, STOPWORDS, TRANSITION_OPENERS } from "../analysis/lexicon";

/**
 * Extraction of "protected" information: facts a rewrite must carry over
 * exactly. Everything here is pattern-based and conservative.
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", million: "1000000", billion: "1000000000", half: "0.5", dozen: "12",
};
export const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_ABBR: Record<string, string> = { jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", sept: "september", oct: "october", nov: "november", dec: "december" };
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Canonical numeric values in the text, as a multiset (value -> count). */
export function extractNumbers(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (v: string) => out.set(v, (out.get(v) ?? 0) + 1);
  // Digits, with thousands separators and decimals; % and currency are part of the value.
  for (const m of text.matchAll(/([$£€¥])?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|percent\b)?/gi)) {
    let v = m[2].replace(/,/g, "") + (m[3] ?? "");
    v = v.replace(/^0+(?=\d)/, "");
    add((m[1] ?? "") + v + (m[4] ? "%" : ""));
  }
  // Spelled-out numbers (not "one" when used as a pronoun: "one of", "the one", "no one").
  for (const m of text.toLowerCase().matchAll(/\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen)\b(\s+percent\b)?/g)) {
    add(NUMBER_WORDS[m[1]] + (m[2] ? "%" : ""));
  }
  return out;
}

/** Month and weekday tokens, canonicalised. Day/year digits are covered by extractNumbers. */
export function extractDateWords(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b\.?/g)) {
    // "may" and "march" are also ordinary words: only count them next to a number or capitalised in the source.
    const idx = m.index ?? 0;
    const raw = text.slice(idx, idx + m[1].length);
    const nearNumber = /^\s*\d|\d\s*$/.test(text.slice(idx + m[1].length, idx + m[1].length + 4)) || /\d\s*$/.test(text.slice(Math.max(0, idx - 4), idx));
    if ((m[1] === "may" || m[1] === "march") && !(nearNumber && /^[A-Z]/.test(raw))) continue;
    if (!/^[A-Z]/.test(raw) && !nearNumber) continue;
    const month = MONTH_ABBR[m[1]] ?? m[1];
    out.set(month, (out.get(month) ?? 0) + 1);
  }
  for (const d of WEEKDAYS) {
    const n = (text.match(new RegExp(`\\b${d[0].toUpperCase()}${d.slice(1)}s?\\b`, "g")) ?? []).length;
    if (n) out.set(d, n);
  }
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) out.set(m[0], (out.get(m[0]) ?? 0) + 1);
  return out;
}

/** Text inside straight or curly double quotes, whitespace-normalised. */
export function extractQuotations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"\n]{2,400})"|“([^”\n]{2,400})”/g)) {
    const q = (m[1] ?? m[2]).replace(/\s+/g, " ").trim();
    if (q.split(" ").length >= 2) out.push(q);
  }
  return out;
}

export function extractLinks(text: string): string[] {
  return [...text.matchAll(/\bhttps?:\/\/[^\s)>\]]+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
}

const NON_NAME_CAPS = new Set(["I", "I'm", "I've", "I'll", "I'd", "OK", "TV", "AI"]);

/** Common words that start sentences but are not names. */
const COMMON_STARTERS = new Set(
  (
    "yesterday today tomorrow later then now however meanwhile after before when while since because although though " +
    "also still yet first second third finally next last overall ultimately instead otherwise please thanks hello hi dear " +
    "sometimes often usually perhaps maybe once again even every each most many several some other another please"
  ).split(/\s+/),
);

export interface NameSpan {
  name: string;
  /** strong: seen mid-sentence or multi-word. weak: a lone sentence-initial capitalised word. */
  strength: "strong" | "weak";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CONNECTIVES = new Set([...TRANSITION_OPENERS, ...HEDGES].filter((w) => !w.includes(" ")));
const isCommon = (w: string) => {
  const l = w.toLowerCase();
  return STOPWORDS.has(l) || COMMON_STARTERS.has(l) || CONNECTIVES.has(l);
};

/**
 * Likely proper names. Capitalised runs that appear mid-sentence, or span more
 * than one word, are strong evidence. A single capitalised word at the start of
 * a sentence is weak evidence, kept only if it is not a common word and never
 * appears in lowercase elsewhere in the text.
 */
export function extractNameSpans(text: string): NameSpan[] {
  const found = new Map<string, NameSpan["strength"]>();
  const put = (name: string, strength: NameSpan["strength"]) => {
    if (found.get(name) !== "strong") found.set(name, strength);
  };
  const sentences = splitParagraphs(text).flatMap(splitSentences);
  for (const s of sentences) {
    const tokens = s.match(/[\p{L}][\p{L}'’.-]*/gu) ?? [];
    let run: string[] = [];
    let runStart = -1;
    const flush = () => {
      if (!run.length) return;
      let parts = run;
      if (runStart === 0 && isCommon(parts[0])) parts = parts.slice(1);
      if (parts.length > 1) put(parts.join(" "), "strong");
      else if (parts.length === 1) {
        const w = parts[0];
        const initial = runStart === 0 && parts === run;
        if (!initial) put(w, "strong");
        else if (!isCommon(w) && !new RegExp(`(^|[^\\p{L}])${escapeRe(w.toLowerCase())}(?![\\p{L}])`, "u").test(text)) put(w, "weak");
      }
      run = [];
    };
    tokens.forEach((tok, i) => {
      const clean = tok.replace(/['’]s$/, "").replace(/[.'’-]+$/, "");
      const isCap = /^\p{Lu}/u.test(clean) && !NON_NAME_CAPS.has(clean) && clean.length > 1;
      if (isCap) {
        if (!run.length) runStart = i;
        run.push(clean);
      } else flush();
    });
    flush();
  }
  return [...found.entries()]
    .filter(([n]) => !n.split(" ").some((part) => MONTHS.includes(part.toLowerCase()) || WEEKDAYS.includes(part.toLowerCase())))
    .map(([name, strength]) => ({ name, strength }));
}

export function extractNames(text: string): string[] {
  return extractNameSpans(text).map((n) => n.name);
}

const NEGATORS_RE = /\b(?:not|never|no|none|nothing|nobody|nowhere|neither|nor|without|cannot)\b|n['’]t\b/gi;
export function countNegations(text: string): number {
  return (text.match(NEGATORS_RE) ?? []).length;
}
