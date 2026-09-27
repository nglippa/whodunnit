/**
 * Date normalisation. "12 March 2026", "March 12, 2026", "March 12th" and
 * "2026-03-12" are the same date written differently; a rewrite that only
 * reformats a date must not look like it changed a number. Each mention is
 * reduced to year-month-day with "?" for parts the text does not give.
 *
 * Numeric slash dates (3/12/2026) are ambiguous between conventions and are
 * left to the ordinary number check.
 */

export interface DateMention {
  /** "2026-03-12", "?-05-18", "2026-09-?" */
  canonical: string;
  start: number;
  end: number;
  text: string;
}

const MONTHS: Record<string, string> = {
  january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03", april: "04", apr: "04", may: "05",
  june: "06", jun: "06", july: "07", jul: "07", august: "08", aug: "08", september: "09", sept: "09", sep: "09",
  october: "10", oct: "10", november: "11", nov: "11", december: "12", dec: "12",
};
const MONTH = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?";
const ORD = "(?:st|nd|rd|th)?";
const pad = (d: string) => d.padStart(2, "0");

const PATTERNS: { re: RegExp; parts: (m: RegExpMatchArray) => { y?: string; m: string; d?: string } | null }[] = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, parts: (m) => ({ y: m[1], m: m[2], d: m[3] }) },
  // 12 March 2026, 12th of March, 2 July
  { re: new RegExp(`\\b(\\d{1,2})${ORD}(?:\\s+of)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?\\b`, "g"), parts: (m) => ({ d: m[1], m: MONTHS[m[2].toLowerCase()], y: m[3] }) },
  // March 12, 2026 / March 12th / Sept. 3
  { re: new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}\\b(?![:.]\\d)(?:,?\\s+(\\d{4})\\b)?`, "g"), parts: (m) => ({ m: MONTHS[m[1].toLowerCase()], d: m[2], y: m[3] }) },
  // March 2026
  { re: new RegExp(`\\b${MONTH}\\s+(\\d{4})\\b`, "g"), parts: (m) => ({ m: MONTHS[m[1].toLowerCase()], y: m[2] }) },
];

export function extractDates(text: string): DateMention[] {
  const out: DateMention[] = [];
  for (const { re, parts } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (out.some((d) => start < d.end && end > d.start)) continue;
      const p = parts(m);
      if (!p || !p.m) continue;
      if (p.d && (Number(p.d) < 1 || Number(p.d) > 31)) continue;
      out.push({ canonical: `${p.y ?? "?"}-${p.m}-${p.d ? pad(p.d) : "?"}`, start, end, text: m[0] });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The text with every date mention blanked (offsets preserved). */
export function blankDates(text: string, dates = extractDates(text)): string {
  let out = text;
  for (const d of dates) out = out.slice(0, d.start) + " ".repeat(d.end - d.start) + out.slice(d.end);
  return out;
}

/** Two canonical dates agree where both are known; the second may be less specific. */
export function datesCompatible(a: string, b: string): boolean {
  const [ay, am, ad] = a.split("-");
  const [by, bm, bd] = b.split("-");
  const ok = (x: string, y: string) => x === "?" || y === "?" || x === y;
  return am === bm && ok(ay, by) && ok(ad, bd);
}
