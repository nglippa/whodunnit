import type { ClaimChange, IntegritySeverity, Quantity, QuantityBound } from "@/domain/semantics";
import { STOPWORDS } from "../analysis/lexicon";
import { blankDates } from "./dates";
import { POST_QUALIFIERS, PRE_QUALIFIERS, UNIT_WORDS } from "./lexicon";

/**
 * Quantities with their bounds. "It took an hour. Maybe more." is one hour,
 * at least; "most of an hour" is below one hour. Comparing bounds, not just
 * values, is what catches a rewrite that keeps the number and changes the fact.
 */

export const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", million: "1000000", billion: "1000000000", dozen: "12",
};

const SINGLE_UNITS = "hour|minute|second|day|week|month|year|decade|fortnight|mile|foot|metre|meter|inch|kilometre|kilogram|pound|dollar|euro|dozen|hundred|thousand|million";
const NUM_RE = new RegExp(
  [
    String.raw`([$£€¥])?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|percent\b)?`,
    String.raw`\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen)\b(\s+percent\b)?`,
    String.raw`\b(one)\s+(?=(?:${SINGLE_UNITS})s?\b)`,
    String.raw`\b(half)\s+(?:an?\s+)?(?=(?:${SINGLE_UNITS})\b)`,
    String.raw`\b(an?)\s+(?=(?:${SINGLE_UNITS})\b)`,
  ].join("|"),
  "gi",
);

export interface LocatedQuantity extends Quantity {
  index: number;
  end: number;
}

function canonical(m: RegExpMatchArray): string {
  if (m[2]) return (m[1] ?? "") + m[2].replace(/,/g, "").replace(/^0+(?=\d)/, "") + (m[3] ?? "") + (m[4] ? "%" : "");
  if (m[5]) return NUMBER_WORDS[m[5].toLowerCase()] + (m[6] ? "%" : "");
  if (m[7]) return "1";
  if (m[8]) return "0.5";
  return "1"; // "a" / "an" before a unit
}

function unitAfter(text: string, end: number, value: string): { unit: string | null; end: number } {
  if (value.endsWith("%")) return { unit: "percent", end };
  const m = text.slice(end).match(/^\s*(?:-\s*)?([\p{L}%]+)/u);
  if (!m) return { unit: null, end };
  const w = m[1].toLowerCase();
  const unitEnd = end + m[0].length;
  if (UNIT_WORDS[w]) return { unit: UNIT_WORDS[w], end: unitEnd };
  if (w === "of") {
    // "most of an hour" is handled before the number; "two of the four bearings" has no unit.
    return { unit: null, end };
  }
  if (STOPWORDS.has(w) || w.length < 3) return { unit: null, end };
  return { unit: w.replace(/(?:es|s)$/, ""), end: unitEnd };
}

const NEGATED_BEFORE = /\b(?:not|never|no|n['’]t|hardly)\b(?:\s+[\p{L}'’]+){0,2}\s*$/iu;

function boundBefore(text: string, start: number): { bound: QuantityBound; qualifier: string } | null {
  // Only look inside the current clause.
  const window = text.slice(Math.max(0, start - 60), start);
  const clause = window.slice(Math.max(window.lastIndexOf("."), window.lastIndexOf(";"), window.lastIndexOf("?"), window.lastIndexOf("!")) + 1);
  for (const [re, bound] of PRE_QUALIFIERS) {
    const m = clause.match(re);
    if (!m) continue;
    const qualifier = m[0].trim().toLowerCase();
    const before = clause.slice(0, clause.length - m[0].length);
    // "never got more than five" is at most five; "not less than" is at least.
    if (NEGATED_BEFORE.test(before) && !/^(?:no|not|never)\b/.test(qualifier)) {
      if (bound === "above") return { bound: "at-most", qualifier: `${before.match(NEGATED_BEFORE)![0].trim()} ${qualifier}` };
      if (bound === "below") return { bound: "at-least", qualifier: `${before.match(NEGATED_BEFORE)![0].trim()} ${qualifier}` };
    }
    return { bound, qualifier };
  }
  return null;
}

function boundAfter(text: string, end: number): { bound: QuantityBound; qualifier: string } | null {
  const after = text.slice(end, end + 40);
  for (const [re, bound] of POST_QUALIFIERS) {
    const m = after.match(re);
    if (m) return { bound, qualifier: m[0].replace(/^[\s,.;:—–-]+/, "").trim().toLowerCase() };
  }
  return null;
}

export function extractQuantities(text: string): LocatedQuantity[] {
  const masked = blankDates(text);
  const out: LocatedQuantity[] = [];
  for (const m of masked.matchAll(NUM_RE)) {
    const index = (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
    const value = canonical(m);
    let end = (m.index ?? 0) + m[0].trimEnd().length;
    // Years and times of day are not quantities with bounds.
    if (/^\d{4}$/.test(value) && Number(value) > 1800 && Number(value) < 2200) continue;
    if (masked[end] === ":" && /\d/.test(masked[end + 1] ?? "")) continue;
    if (masked[index - 1] === ":" && /\d/.test(masked[index - 2] ?? "")) continue;
    // "$1.4 million": the scale word is the unit.
    const u = unitAfter(masked, end, value);
    end = u.end;
    const pre = boundBefore(masked, index);
    const post = boundAfter(masked, end);
    let bound: QuantityBound = "exact";
    const qualifiers: string[] = [];
    if (pre) {
      bound = pre.bound;
      qualifiers.push(pre.qualifier);
    }
    if (post && (bound === "exact" || bound === "approximate")) {
      bound = post.bound === "approximate" ? "approximate" : post.bound;
      qualifiers.push(post.qualifier);
    }
    out.push({ value, unit: u.unit, bound, qualifiers, text: text.slice(index, end).trim(), index, end });
  }
  return out;
}

/**
 * How two bounds on the same value relate, as sets around the value v:
 *   exact {v} · approximate ≈v · below <v · at-most ≤v · above >v · at-least ≥v
 * Disjoint sets are a contradiction ("almost three weeks" vs "three weeks");
 * a subset is a strengthening, a superset a weakening; a partial overlap
 * ("closer to nine" vs "up to nine") changes the claim in a way that is
 * neither, and is reported as such.
 */
type Rel = { relation: ClaimChange["relation"]; severity: IntegritySeverity } | null;
const REL: Record<QuantityBound, Partial<Record<QuantityBound, Rel>>> = {
  exact: { approximate: { relation: "weakened", severity: "major" }, below: { relation: "contradicted", severity: "blocking" }, "at-most": { relation: "weakened", severity: "major" }, above: { relation: "contradicted", severity: "blocking" }, "at-least": { relation: "weakened", severity: "major" } },
  approximate: { exact: { relation: "strengthened", severity: "major" }, below: { relation: "uncertain", severity: "major" }, "at-most": { relation: "uncertain", severity: "major" }, above: { relation: "uncertain", severity: "major" }, "at-least": { relation: "uncertain", severity: "major" } },
  below: { exact: { relation: "contradicted", severity: "blocking" }, approximate: { relation: "uncertain", severity: "major" }, "at-most": { relation: "weakened", severity: "minor" }, above: { relation: "contradicted", severity: "blocking" }, "at-least": { relation: "contradicted", severity: "blocking" } },
  "at-most": { exact: { relation: "strengthened", severity: "major" }, approximate: { relation: "uncertain", severity: "major" }, below: { relation: "strengthened", severity: "minor" }, above: { relation: "contradicted", severity: "blocking" }, "at-least": { relation: "contradicted", severity: "blocking" } },
  above: { exact: { relation: "contradicted", severity: "blocking" }, approximate: { relation: "uncertain", severity: "major" }, below: { relation: "contradicted", severity: "blocking" }, "at-most": { relation: "contradicted", severity: "blocking" }, "at-least": { relation: "weakened", severity: "minor" } },
  "at-least": { exact: { relation: "strengthened", severity: "major" }, approximate: { relation: "uncertain", severity: "major" }, below: { relation: "contradicted", severity: "blocking" }, "at-most": { relation: "contradicted", severity: "blocking" }, above: { relation: "strengthened", severity: "minor" } },
};

export function boundRelation(source: QuantityBound, output: QuantityBound): Rel {
  return source === output ? null : (REL[source][output] ?? null);
}

const BOUND_WORDS: Record<QuantityBound, string> = {
  exact: "exactly",
  approximate: "approximately",
  below: "just under",
  "at-most": "at most",
  above: "more than",
  "at-least": "at least",
};
const describe = (q: Quantity) => `${q.qualifiers.length ? `“${q.qualifiers.join(" … ")}” ` : ""}${q.value}${q.unit ? ` ${q.unit}` : ""} (${BOUND_WORDS[q.bound]})`;

const MEASURE_UNITS = new Set(Object.values(UNIT_WORDS));

/** Compare every source quantity with the output quantity of the same value and unit. */
export function compareQuantities(source: LocatedQuantity[], output: LocatedQuantity[]): ClaimChange[] {
  const changes: ClaimChange[] = [];
  const used = new Set<number>();
  for (const s of source) {
    const sameValue = output.map((o, i) => ({ o, i })).filter(({ o }) => o.value === s.value);
    if (!sameValue.length) continue; // a missing value is the protected-span check's job
    const compatible = sameValue.filter(({ o }) => !s.unit || !o.unit || o.unit === s.unit);
    if (!compatible.length) {
      const other = sameValue.find(({ o }) => o.unit && s.unit && MEASURE_UNITS.has(o.unit) && MEASURE_UNITS.has(s.unit));
      if (other && !source.some((x) => x.value === s.value && x.unit === other.o.unit))
        changes.push({ relation: "contradicted", aspect: "quantity", severity: "blocking", sourceClaimId: null, outputClaimId: null, source: s.text, output: other.o.text, detail: `The unit changed: ${s.value} ${s.unit} became ${other.o.value} ${other.o.unit}.`, licensedBy: null });
      continue;
    }
    const pick = compatible.find(({ o, i }) => !used.has(i) && o.bound === s.bound) ?? compatible.find(({ i }) => !used.has(i)) ?? compatible[0];
    used.add(pick.i);
    const rel = boundRelation(s.bound, pick.o.bound);
    if (!rel) continue;
    changes.push({
      relation: rel.relation,
      aspect: "quantity",
      severity: rel.severity,
      sourceClaimId: null,
      outputClaimId: null,
      source: s.text,
      output: pick.o.text,
      detail: `The quantity's bound changed: ${describe(s)} became ${describe(pick.o)}.`,
      licensedBy: null,
    });
  }
  return changes;
}
