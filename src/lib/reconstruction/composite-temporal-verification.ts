import type { Finding } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { contentStems, extractClaims } from "@/lib/semantics/claims";
import { extractDates } from "@/lib/semantics/dates";
import type { VerifyContext } from "@/lib/verification/verify";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";

const WEEKDAY = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;
const IMMEDIATE_WEEKDAY = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*$/i;
const updateVerb = /\b(?:change|move|update|replace|switch|revise)\b/i;
const GENERIC_OBJECTIVE_TERMS = new Set(["move", "change", "update", "replace", "switch", "revise", "date", "day", "time"]);
const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type Temporal = { start: number; end: number; text: string; date: string | null; weekday: string | null };

/** Existing date mentions plus an immediately adjoining weekday form one expression. */
function expressions(text: string): Temporal[] {
  const out: Temporal[] = extractDates(text).map((date) => {
    const prefix = text.slice(0, date.start);
    const weekday = prefix.match(IMMEDIATE_WEEKDAY);
    const start = weekday?.index ?? date.start;
    return { start, end: date.end, text: text.slice(start, date.end), date: date.text,
      weekday: weekday ? weekday[0].match(WEEKDAY)?.[0].toLowerCase() ?? null : null };
  });
  for (const match of text.matchAll(WEEKDAY)) {
    const start = match.index ?? 0;
    if (out.some((item) => start >= item.start && start < item.end)) continue;
    out.push({ start, end: start + match[0].length, text: match[0], date: null, weekday: match[0].toLowerCase() });
  }
  return out.sort((a, b) => a.start - b.start);
}

function withoutTemporal(text: string): string {
  let out = text;
  for (const item of expressions(text).reverse()) out = out.slice(0, item.start) + " " + out.slice(item.end);
  return out;
}

function clauseFor(source: string, temporal: Temporal): string | null {
  const claim = extractClaims(source).find((item) => temporal.start >= item.span.start && temporal.end <= item.span.end);
  return claim?.text.split(/\s+and\s+|;/i).find((part) => part.includes(temporal.text)) ?? null;
}

function objectiveLicenses(source: string, objective: string, old: Temporal, next: Temporal): boolean {
  if (!updateVerb.test(objective) || /\b(?:do not|don't|never|avoid)\s+(?:change|move|update|replace|switch|revise)\b/i.test(objective)) return false;
  const targets = expressions(objective).filter((item) => norm(item.text) === norm(next.text) &&
    /\b(?:to|as|now|for)\s*$/i.test(objective.slice(0, item.start)));
  if (targets.length !== 1) return false;
  const precedingUpdates = [...objective.slice(0, targets[0].start).matchAll(/\b(?:change|move|update|replace|switch|revise)\b/gi)];
  if (!precedingUpdates.length) return false;
  // Preservation clauses elsewhere in the objective cannot supply the
  // subject for this requested target ("move audit ... keep meeting").
  const directive = objective.slice(precedingUpdates.at(-1)!.index, targets[0].end);
  // Never infer a replacement component (including a year) from the calendar.
  if (Boolean(old.date) !== Boolean(next.date) || Boolean(old.weekday) !== Boolean(next.weekday)) return false;
  const oldYear = old.date ? extractDates(old.date)[0]?.canonical.split("-")[0] : null;
  const newYear = next.date ? extractDates(next.date)[0]?.canonical.split("-")[0] : null;
  if (Boolean(oldYear && oldYear !== "?") !== Boolean(newYear && newYear !== "?")) return false;
  if (source.split(old.text).length !== 2) return false; // duplicated source expression is ambiguous
  const sourceExpressions = expressions(source);
  const objectiveTerms = new Set(contentStems(withoutTemporal(directive)));
  const subjectTerms = [...objectiveTerms].filter((word) => !GENERIC_OBJECTIVE_TERMS.has(word));
  if (sourceExpressions.length === 1) {
    const sourceTerms = new Set(contentStems(withoutTemporal(source)));
    return !subjectTerms.length || subjectTerms.some((word) => sourceTerms.has(word));
  }

  // With multiple temporal facts, an objective without the old date must
  // identify the changed claim or its local "and" segment uniquely.
  const segment = clauseFor(source, old);
  if (!segment) return false;
  const shared = contentStems(withoutTemporal(segment)).filter((word) => objectiveTerms.has(word));
  if (!shared.length) return false;
  return shared.some((word) => sourceExpressions.every((item) => item.start === old.start ||
    !contentStems(withoutTemporal(clauseFor(source, item) ?? "")).includes(word)));
}

function exactReplacement(source: string, candidate: string, objective: string): { old: Temporal; next: Temporal } | null {
  const matches = expressions(source).flatMap((old) => expressions(candidate).filter((next) =>
    next.start === old.start && norm(next.text) !== norm(old.text) &&
    source.slice(0, old.start) + next.text + source.slice(old.end) === candidate &&
    objectiveLicenses(source, objective, old, next)).map((next) => ({ old, next })));
  return matches.length === 1 ? matches[0] : null;
}

/** V14 only: neutralize findings for one exact, objective-supplied temporal expression replacement. */
export function verifyCompositeTemporalDelta(source: string, candidate: string, objective: string, profile: StyleProfile,
  ctx: VerifyContext = {}): ReturnType<typeof verifyExactObjectiveDeltas> {
  const baseline = verifyExactObjectiveDeltas(source, candidate, objective, profile, ctx);
  const pair = exactReplacement(source, candidate, objective);
  if (!pair) return baseline;
  const { old, next } = pair;
  const oldParts = [old.date, old.weekday].filter((part): part is string => Boolean(part)).map(norm);
  const newParts = [next.date, next.weekday].filter((part): part is string => Boolean(part)).map(norm);
  const sourceClaim = extractClaims(source).find((item) => old.start >= item.span.start && old.end <= item.span.end);
  const candidateClaim = extractClaims(candidate).find((item) => next.start >= item.span.start && next.end <= item.span.end);
  const findings = baseline.verification.findings.map((finding): Finding => {
    if (finding.severity !== "blocking") return finding;
    const sourcePart = finding.source ? norm(finding.source) : null;
    const candidatePart = finding.candidate ? norm(finding.candidate) : null;
    const temporal = finding.kind === "altered_date" &&
      (sourcePart && oldParts.includes(sourcePart) && !candidatePart || candidatePart && newParts.includes(candidatePart) && !sourcePart);
    const claim = finding.kind === "missing_claim" && sourceClaim && candidateClaim && finding.source === sourceClaim.text &&
      sourceClaim.text.replace(old.text, next.text) === candidateClaim.text;
    if (!temporal && !claim) return finding;
    return { ...finding, severity: "warning", message: `AUTHORIZED_CHANGE: ${finding.message}` };
  });
  const newlyGranted = findings.flatMap((finding, index) => finding !== baseline.verification.findings[index] ? [{
    kind: finding.kind, source: finding.source ?? null, candidate: finding.candidate ?? null,
    basis: "OBJECTIVE" as const, objectiveEvidence: objective,
  }] : []);
  return { verification: { ...baseline.verification, findings, status: statusFromFindings(findings) },
    authorized: [...baseline.authorized, ...newlyGranted] };
}
