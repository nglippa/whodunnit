import { extractClaims } from "@/lib/semantics/claims";

/** Candidate D's first, deliberately byte-preserving execution surface. */
export type SourceQualityAssessment =
  | { kind: "NO_MATERIAL_DEFECT"; evidence: string }
  | { kind: "MATERIAL_DEFECT"; evidence: string }
  | { kind: "UNKNOWN" };

export interface AuthorizedDelta {
  oldText: string;
  newText: string;
  sourceStart: number;
  sourceEnd: number;
  sourceClaim: string;
  objectiveStart: number;
  objectiveEnd: number;
}

type Base = { source: string; objective: string };
export type ObjectiveState =
  | (Base & { kind: "KEEP"; qualityEvidence: string })
  | (Base & { kind: "REQUIRED_UPDATE"; deltas: readonly AuthorizedDelta[] })
  | (Base & { kind: "EDIT"; qualityEvidence: string | null })
  | (Base & { kind: "CANNOT_SAFELY_COMPLETE"; reason: "MISSING_OR_UNBOUND_REPLACEMENT" | "AMBIGUOUS_REPLACEMENT" });

export type Terminal =
  | { status: "KEEP" | "COMPLETED"; text: string }
  | { status: "NEEDS_EDITOR" | "ABSTAINED"; text: null; reason: string };

type Located = { text: string; start: number; end: number };
type Slot = { family: string; source: Located; objective: Located };
const number = String.raw`(?:\d+(?:\.\d+)?|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?)`;
const weekday = String.raw`(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)`;
const month = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December)`;

function matches(text: string, pattern: RegExp): Located[] {
  return [...text.matchAll(pattern)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

function overlaps(a: Located, b: Located): boolean { return a.start < b.end && b.start < a.end; }
function same(a: string, b: string): boolean { return a.toLowerCase() === b.toLowerCase(); }
function unquote(text: string): string { return text.trim().replace(/^[“"]|[”"]$/g, ""); }

/** Only literal, uniquely occurring "replace X with Y" / "correct X to Y" clauses. */
function explicitReplacementSlots(source: string, objective: string): Slot[] {
  const verbs = [...objective.matchAll(/\b(?:replace|correct)\s+(?:only\s+)?/gi)];
  const slots: Slot[] = [];
  for (let index = 0; index < verbs.length; index++) {
    const start = verbs[index].index! + verbs[index][0].length;
    const end = verbs[index + 1]?.index ?? objective.length;
    const clause = objective.slice(start, end);
    const connector = /\s+(?:with|to)\s+/i.exec(clause);
    if (!connector) continue;
    const old = unquote(clause.slice(0, connector.index));
    if (!old || source.indexOf(old) < 0 || source.indexOf(old) !== source.lastIndexOf(old)) continue;
    const tailStart = start + connector.index + connector[0].length;
    const tail = objective.slice(tailStart, end).trimStart();
    const quoted = /^[“"]([^”"]+)[”"]/.exec(tail);
    const wordCount = old.split(/\s+/).length;
    const plain = tail.match(new RegExp(String.raw`^(?:[^\s,.;!?]+\s*){${wordCount}}`))?.[0].trim();
    const next = quoted?.[1] ?? plain;
    if (!next) continue;
    const objectiveStart = objective.indexOf(next, tailStart);
    if (objectiveStart < 0) continue;
    const sourceStart = source.indexOf(old);
    slots.push({ family: "explicit", source: { text: old, start: sourceStart, end: sourceStart + old.length },
      objective: { text: next, start: objectiveStart, end: objectiveStart + next.length } });
  }
  return slots;
}
function moneyRole(text: string, value: Located): "RATE" | "TOTAL" | null {
  const before = text.slice(Math.max(0, value.start - 35), value.start);
  const after = text.slice(value.end, Math.min(text.length, value.end + 18));
  if (/\b(?:hourly\s+rate|rate)\s+(?:to|of)?\s*$/i.test(before) || /^\s*per\s+hour\b/i.test(after)) return "RATE";
  if (/\btotal(?:\s+(?:charge|amount|of|is|to|at))*\s*$/i.test(before)) return "TOTAL";
  return null;
}

/** A small grammar of independently recognizable value slots, not a semantic classifier. */
function valueSlots(text: string): Map<string, Located[]> {
  const out = new Map<string, Located[]>();
  const add = (family: string, found: Located[]) => out.set(family, found);
  const dates = matches(text, new RegExp(String.raw`\b(?:${weekday},?\s+)?${month}\s+\d{1,2}\b`, "gi"));
  const times = matches(text, /\b(?:\d{1,2}\s+to\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.)/gi);
  const money = matches(text, /[$£€]\d+(?:,\d{3})*(?:\.\d+)?/g);
  add("date", dates); add("time", times); add("money", money);
  const occupied = [...dates, ...times, ...money];
  const quantities = matches(text, new RegExp(String.raw`\b${number}\s+[\p{L}]+(?:\s+[\p{L}]+)?`, "giu"))
    .filter((m) => !occupied.some((span) => overlaps(m, span)));
  for (const item of quantities) {
    const parts = item.text.split(/\s+/);
    const rest = parts.slice(1).map((part) => part.toLowerCase());
    // A one-word shared unit is enough only when it is not connective prose.
    const unit = rest[1] && !/^(?:and|but|with|from|for|the|to|on|in|at|of|per|after|before|during|totaling|which|that|should|may|will)$/i.test(rest[1])
      ? rest.join(" ") : rest[0];
    if (!unit || /^(?:and|but|with|from|for|the|to|on|in|at|of|per|after|before)$/i.test(unit)) continue;
    const value = item.text.slice(0, item.text.toLowerCase().indexOf(unit));
    const located = { text: `${value}${item.text.slice(value.length, value.length + unit.length)}`.trimEnd(),
      start: item.start, end: item.start + value.length + unit.length };
    const key = `quantity:${unit}`;
    out.set(key, [...(out.get(key) ?? []), located]);
  }
  add("prefix", matches(text, /\b(?:filename\s+prefix\s+(?:with\s+)?)([A-Z]{2,})\b/g)
    .map((m) => { const code = m.text.match(/[A-Z]{2,}$/)![0]; return { text: code, start: m.end - code.length, end: m.end }; }));
  add("entrance-street", matches(text, /\b(?:front|side|main|rear)\s+(?:entrance|door)\s+on\s+[\p{L}]+\s+(?:Street|Lane|Road|Avenue)\b/giu));
  add("through", matches(text, /\bthrough\s+the\s+[\p{L}]+(?:\s+[\p{L}]+){0,3}(?=[.;,]|$)/giu)
    .map((m) => ({ ...m, text: m.text.trimEnd(), end: m.start + m.text.trimEnd().length })));
  return out;
}

function bind(source: string, objective: string): { deltas: AuthorizedDelta[]; ambiguous: boolean } {
  const sourceSlots = valueSlots(source);
  const objectiveSlots = valueSlots(objective);
  const candidates: Slot[] = explicitReplacementSlots(source, objective);
  let ambiguous = false;
  for (const [family, desired] of objectiveSlots) {
    const existing = (sourceSlots.get(family) ?? []).filter((item) => !candidates.some((slot) => overlaps(slot.source, item)));
    if (!existing.length) continue;
    const newValues = desired.filter((item) => !existing.some((old) => same(old.text, item.text)));
    // Objectives may quote both the superseded and replacement value.
    const oldValues = existing.filter((item) => !newValues.some((next) => same(item.text, next.text)));
    if (!newValues.length) continue;
    if (oldValues.length !== newValues.length) { ambiguous = true; continue; }
    if (family === "money" && oldValues.length > 1) {
      const used = new Set<number>();
      for (const next of newValues) {
        const role = moneyRole(objective, next);
        const matches = oldValues.map((old, index) => ({ old, index })).filter(({ old, index }) =>
          role !== null && moneyRole(source, old) === role && !used.has(index));
        if (matches.length !== 1) { ambiguous = true; continue; }
        used.add(matches[0].index);
        candidates.push({ family, source: matches[0].old, objective: next });
      }
      continue;
    }
    for (let index = 0; index < newValues.length; index++)
      candidates.push({ family, source: oldValues[index], objective: newValues[index] });
  }
  const unique = candidates.filter((candidate, index) => !candidates.some((other, at) => at !== index &&
    overlaps(candidate.source, other.source)));
  if (unique.length !== candidates.length) ambiguous = true;
  const claims = extractClaims(source);
  const deltas = unique.map(({ source: old, objective: next }) => ({ oldText: old.text, newText: next.text,
    sourceStart: old.start, sourceEnd: old.end, sourceClaim: claims.find((claim) => old.start >= claim.span.start && old.end <= claim.span.end)?.text ?? "",
    objectiveStart: next.start, objectiveEnd: next.end }));
  if (deltas.some((delta) => !delta.sourceClaim)) ambiguous = true;
  for (const delta of deltas) {
    const escaped = delta.oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:keep|preserve|leave)\\b[^.;]{0,80}${escaped}`, "i").test(objective)) ambiguous = true;
  }
  // Each independently commanded replacement needs its own recognized evidence.
  // Anaphoric summaries such as "update those three facts" refer to prior clauses.
  const directives = [...objective.matchAll(/\b(?:update|replace|change|revise|switch|move|correct)\b/gi)];
  for (let index = 0; index < directives.length; index++) {
    const start = directives[index].index!;
    const end = directives[index + 1]?.index ?? objective.length;
    const clause = objective.slice(start, end);
    if (/^(?:update|replace|change|revise|switch|move|correct)\s+(?:those|these|both)\b/i.test(clause)) continue;
    if (!deltas.some((delta) => delta.objectiveStart >= start && delta.objectiveStart < end)) ambiguous = true;
  }
  return { deltas: deltas.sort((a, b) => a.sourceStart - b.sourceStart), ambiguous };
}

export function classifyObjectiveState(source: string, objective: string,
  quality: SourceQualityAssessment = { kind: "UNKNOWN" }): ObjectiveState {
  if (!source.trim() || !objective.trim()) return { kind: "CANNOT_SAFELY_COMPLETE", source, objective, reason: "MISSING_OR_UNBOUND_REPLACEMENT" };
  if (/\b(?:do not|don't|never|avoid)\s+(?:update|replace|change|revise|switch|move|correct)\b/i.test(objective))
    return { kind: "CANNOT_SAFELY_COMPLETE", source, objective, reason: "AMBIGUOUS_REPLACEMENT" };
  const updateRequested = /\bconfirmed (?:changes|specifications)\b/i.test(objective) ||
    /\b(?:update|replace|change|revise|switch|move|correct)\b(?!\s+(?:the\s+)?(?:wording|phrasing|tone|style|register|grammar|punctuation|format|clarity|readability)\b)/i.test(objective);
  const bound = bind(source, objective);
  if (bound.ambiguous) return { kind: "CANNOT_SAFELY_COMPLETE", source, objective, reason: "AMBIGUOUS_REPLACEMENT" };
  if (updateRequested) {
    if (!bound.deltas.length || /\b(?:not supplied|not provided|not yet provided|missing|unknown|latest|not included|not yet been provided)\b/i.test(objective))
      return { kind: "CANNOT_SAFELY_COMPLETE", source, objective, reason: "MISSING_OR_UNBOUND_REPLACEMENT" };
    return { kind: "REQUIRED_UPDATE", source, objective, deltas: bound.deltas };
  }
  if (quality.kind === "NO_MATERIAL_DEFECT") return { kind: "KEEP", source, objective, qualityEvidence: quality.evidence };
  return { kind: "EDIT", source, objective, qualityEvidence: quality.kind === "MATERIAL_DEFECT" ? quality.evidence : null };
}

/** All unlicensed bytes must be identical in this first slice. */
export function exactAuthorizedUpdate(state: Extract<ObjectiveState, { kind: "REQUIRED_UPDATE" }>): string {
  let text = state.source;
  for (const delta of [...state.deltas].reverse())
    text = text.slice(0, delta.sourceStart) + delta.newText + text.slice(delta.sourceEnd);
  return text;
}

export function selectCandidateDTerminal(state: ObjectiveState, candidate?: string): Terminal {
  if (state.kind === "KEEP") return { status: "KEEP", text: state.source };
  if (state.kind === "CANNOT_SAFELY_COMPLETE") return { status: "ABSTAINED", text: null, reason: state.reason };
  if (state.kind === "EDIT") return { status: "NEEDS_EDITOR", text: null, reason: "EDITOR_NOT_CONNECTED" };
  if (candidate !== undefined && candidate === exactAuthorizedUpdate(state)) return { status: "COMPLETED", text: candidate };
  return { status: "ABSTAINED", text: null, reason: "REQUIRED_UPDATE_NOT_VERIFIED" };
}
