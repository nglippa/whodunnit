import type { Refinement, RefinementId } from "@/domain/refinement";
import type { RuleFinding } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import { removableSpans } from "../rules/families";
import { extractClaims, isHighInformation, type ExtractedClaim } from "../semantics/claims";
import type { Licenses } from "../semantics/compare";

/**
 * A refinement is a requested DELTA, not a fresh reconstruction. Each
 * directive names what should change, and against which text:
 *
 *   more casual / more formal / less polished   edit the CURRENT revision
 *   shorter                                      compress the CURRENT revision;
 *                                                every MUST KEEP claim survives
 *   keep more of my wording                      move toward the ORIGINAL source:
 *                                                restore phrasing that was changed
 *                                                without a reason
 *
 * The original source is always the authority on meaning and authorship.
 * Free text is read narrowly, as one requested change. It can also license
 * changes the meaning checks would otherwise report (e.g. "sound more
 * confident" licenses strengthening; "cut the intro" licenses removal).
 */

export interface RefinementObjective {
  id: RefinementId | "note";
  objective: string;
  reference: "original" | "current";
}

export interface Restoration {
  /** The original wording to bring back. */
  source: string;
  /** What the current revision says instead (if it can be aligned). */
  current: string | null;
  /** Share of the original sentence's words still present in its current counterpart. */
  retained: number;
  /**
   * true when the original sentence contained a catalogued pattern: only the
   * wording around it is offered back (the pattern itself is cut, marked "…").
   */
  partial?: boolean;
}

export interface ClaimTriage {
  mustKeep: string[];
  mayCompress: string[];
  mayRemove: string[];
}

export interface RefinementDelta {
  objectives: RefinementObjective[];
  note: string | null;
  licenses: Licenses;
  restorations: Restoration[];
  triage: ClaimTriage | null;
}

const OBJECTIVES: Record<RefinementId, Omit<RefinementObjective, "id">> = {
  more_casual: { objective: "Lower the register (contractions, plainer words, shorter sentences) without changing any claim.", reference: "current" },
  more_formal: { objective: "Raise the register (fewer contractions, precise wording) without changing any claim.", reference: "current" },
  less_polished: { objective: "Reduce visible polish: fewer decorative transitions, less symmetry. Do not add errors, slang or fragments the author does not use.", reference: "current" },
  shorter: { objective: "Reduce length by compressing wording. Every MUST KEEP claim survives; only MAY REMOVE material may go.", reference: "current" },
  keep_wording: { objective: "Move toward the ORIGINAL wording: restore the phrasing listed under RESTORE unless it contains a listed pattern.", reference: "original" },
};

const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function licensesFrom(note: string | undefined): Licenses {
  if (!note) return {};
  const l: Licenses = {};
  if (/\b(?:more\s+(?:confident|assertive|direct|definite|certain)|less\s+hedg\w*|stronger\s+claims?|sound\s+(?:surer|more\s+sure)|don['’]?t\s+hedge)\b/i.test(note)) l.strengthen = note;
  if (/\b(?:soften|softer|more\s+(?:cautious|tentative|careful)|less\s+(?:certain|assertive|confident)|hedge|tone\s+(?:it\s+)?down)\b/i.test(note)) l.weaken = note;
  if (/\b(?:remove|cut|drop|delete|omit|lose|get\s+rid\s+of|leave\s+out)\b/i.test(note)) l.remove = note;
  return l;
}

/** Claims in the source split by what shortening may do with them. */
export function triageClaims(source: string, findings: RuleFinding[]): ClaimTriage {
  const spans = removableSpans(findings);
  const covered = (c: ExtractedClaim) => {
    const len = c.span.end - c.span.start || 1;
    return spans.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, c.span.end) - Math.max(a, c.span.start)), 0) / len;
  };
  const t: ClaimTriage = { mustKeep: [], mayCompress: [], mayRemove: [] };
  for (const c of extractClaims(source)) {
    if (!c.content.length) continue;
    if (covered(c) >= 0.5) t.mayRemove.push(clip(c.text));
    else if (isHighInformation(c)) t.mustKeep.push(clip(c.text));
    else t.mayCompress.push(clip(c.text));
  }
  return t;
}

const lowerWords = (s: string) => words(s).map((w) => w.toLowerCase());
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const CONTENT_MIN = 3;

/**
 * The restorable part of a source sentence: the sentence minus every
 * catalogued pattern span inside it. Returns null when nothing substantive is
 * left (the whole sentence was the pattern). Pieces are joined with "…" so the
 * model cannot mistake the remainder for a sentence it should quote whole.
 */
export function restorableRemainder(text: string, offset: number, patterned: [number, number][]): string | null {
  const cuts = patterned
    .map(([a, b]) => [Math.max(a, offset) - offset, Math.min(b, offset + text.length) - offset] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const pieces: string[] = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at) pieces.push(text.slice(at, a));
    at = Math.max(at, b);
  }
  pieces.push(text.slice(at));
  const kept = pieces
    .map((p) => p.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, ""))
    .filter((p) => words(p).length > 0);
  if (!kept.length) return null;
  const joined = kept.join(" … ");
  const content = extractClaims(joined).flatMap((c) => c.content);
  return content.length >= CONTENT_MIN ? joined : null;
}

/**
 * Original wording the current revision changed without a pattern to justify
 * it. Sentences free of catalogued patterns are offered back whole; a sentence
 * that contained one is offered back WITHOUT it (the surrounding wording
 * only). A catalogued pattern is never offered back.
 */
export function restorationsFor(source: string, current: string, findings: RuleFinding[], max = 8): Restoration[] {
  const patterned = findings.filter((f) => !f.suppressedBy && f.rule.severity !== "info").flatMap((f) => f.matches.map((m) => [m.start, m.end] as [number, number]));
  const cur = extractClaims(current);
  const src = extractClaims(source);
  // One-to-one alignment: a current sentence identical to an original sentence belongs to that sentence.
  const original = new Set(src.map((s) => squash(s.text)));
  const keptVerbatim = new Set(cur.map((c) => squash(c.text)).filter((t) => original.has(t)));
  const out: Restoration[] = [];
  for (const s of src) {
    if (!s.content.length) continue;
    const hit = patterned.some(([a, b]) => a < s.span.end && b > s.span.start);
    const text = hit ? restorableRemainder(s.text, s.span.start, patterned) : s.text;
    if (!text) continue;
    // Wording still present verbatim needs no restoring (every piece, for a partial).
    const flat = squash(current);
    if (text.split(" … ").every((piece) => flat.includes(squash(piece)))) continue;
    const content = hit ? extractClaims(text).flatMap((c) => c.content) : s.content;
    const sw = lowerWords(text).filter((w) => w !== "…");
    // Align by shared content words, then by how much of the sentence's wording the candidate holds,
    // so a short sentence is not matched to a long one that merely contains its words.
    let best: { c: (typeof cur)[number]; score: number; fit: number } | null = null;
    for (const c of cur) {
      if (keptVerbatim.has(squash(c.text))) continue; // already the counterpart of another original sentence
      const cs = new Set(c.content);
      const score = content.filter((x) => cs.has(x)).length / (content.length || 1);
      const cw = lowerWords(c.text);
      const fit = cw.length ? sw.filter((w) => cw.includes(w)).length / Math.max(sw.length, cw.length) : 0;
      if (!best || score > best.score || (score === best.score && fit > best.fit)) best = { c, score, fit };
    }
    const target = best && best.score >= 0.3 ? best.c.text : null;
    const tw = new Set(lowerWords(target ?? ""));
    const retained = sw.length ? sw.filter((w) => tw.has(w)).length / sw.length : 1;
    if (retained < 0.85) out.push({ source: clip(text), current: target ? clip(target) : null, retained: Math.round(retained * 100) / 100, ...(hit ? { partial: true } : {}) });
  }
  return out.sort((a, b) => a.retained - b.retained).slice(0, max);
}

export function buildRefinementDelta(input: { source: string; current?: string; refinement: Refinement; findings: RuleFinding[] }): RefinementDelta {
  const { source, current, refinement } = input;
  const objectives: RefinementObjective[] = refinement.directives.map((id) => ({ id, ...OBJECTIVES[id] }));
  if (refinement.note) objectives.push({ id: "note", objective: `Apply only this requested change, read narrowly: “${refinement.note}”. Do not reinterpret the rest of the text.`, reference: "current" });
  return {
    objectives,
    note: refinement.note ?? null,
    licenses: licensesFrom(refinement.note),
    restorations: refinement.directives.includes("keep_wording") && current ? restorationsFor(source, current, input.findings) : [],
    triage: refinement.directives.includes("shorter") ? triageClaims(source, input.findings) : null,
  };
}
