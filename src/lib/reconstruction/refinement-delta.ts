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

/** Original sentences the current revision reworded without a pattern to justify it. */
export function restorationsFor(source: string, current: string, findings: RuleFinding[], max = 8): Restoration[] {
  const patterned = findings.filter((f) => !f.suppressedBy && f.rule.severity !== "info").flatMap((f) => f.matches.map((m) => [m.start, m.end] as [number, number]));
  const cur = extractClaims(current);
  const out: Restoration[] = [];
  for (const s of extractClaims(source)) {
    if (!s.content.length) continue;
    if (patterned.some(([a, b]) => a < s.span.end && b > s.span.start)) continue; // never restore a pattern
    const sw = lowerWords(s.text);
    let best: { c: (typeof cur)[number]; score: number } | null = null;
    for (const c of cur) {
      const cs = new Set(c.content);
      const score = s.content.filter((x) => cs.has(x)).length / s.content.length;
      if (!best || score > best.score) best = { c, score };
    }
    const target = best && best.score >= 0.3 ? best.c.text : null;
    const tw = new Set(lowerWords(target ?? ""));
    const retained = sw.length ? sw.filter((w) => tw.has(w)).length / sw.length : 1;
    if (retained < 0.85) out.push({ source: clip(s.text), current: target ? clip(target) : null, retained: Math.round(retained * 100) / 100 });
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
