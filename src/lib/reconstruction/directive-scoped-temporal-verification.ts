import type { Finding } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { contentStems, extractClaims } from "@/lib/semantics/claims";
import { sentenceSpans } from "@/lib/analysis/tokenize";
import { extractDates } from "@/lib/semantics/dates";
import type { VerifyContext } from "@/lib/verification/verify";
import { verifyCompositeTemporalDelta } from "./composite-temporal-verification";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";

const WEEKDAY = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;
const IMMEDIATE_WEEKDAY = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*$/i;
const updateVerb = /\b(?:change|move|update|replace|switch|revise)\b/i;
const GENERIC_OBJECTIVE_TERMS = new Set(contentStems("move change update replace switch revise date day time"));
const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type Temporal = { start: number; end: number; text: string; date: string | null; weekday: string | null };
type Directive = { start: number; end: number; text: string };

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

/** Sentence boundaries already used by claim extraction, plus explicit directive separators. */
function directives(objective: string): Directive[] {
  return sentenceSpans(objective).flatMap((sentence) => {
    const out: Directive[] = [];
    let start = sentence.start;
    const separators = /;|,?\s+but\s+|\s+and\s+(?=(?:move|change|update|replace|switch|revise|keep|leave|preserve|do not|don't)\b)/gi;
    for (const match of sentence.text.matchAll(separators)) {
      const end = sentence.start + match.index;
      if (objective.slice(start, end).trim()) out.push({ start, end, text: objective.slice(start, end).trim() });
      start = end + match[0].length;
    }
    if (objective.slice(start, sentence.end).trim()) out.push({ start, end: sentence.end, text: objective.slice(start, sentence.end).trim() });
    return out;
  });
}

const protection = /^(?:(?:please|also)\s+)*(?:(?:do not|don't|never|avoid)\s+(?:change|move|update|replace|switch|revise|touch)\b|(?:keep|leave|preserve)\b)/i;
const everythingElse = /^(?:keep|leave|preserve)\s+(?:everything|anything)\s+else\s+(?:unchanged|alone|as\s+is)[.!?]?$/i;
const globalTemporalProtection = /\b(?:any|all|every)\s+(?:other\s+)?(?:dates?|days?|times?)\b|\bno\s+(?:dates?|days?|times?)\b/i;
const otherNegation = /\b(?:do not|don't|never|avoid|must not|should not|not)\b/i;

function withoutPreservedLiterals(source: string, old: Temporal, instruction: string): string {
  const outside = ` ${norm(source.slice(0, old.start) + " " + source.slice(old.end))} `;
  // A room number or stated clock time is a source-backed protected fact even
  // when it shares a sentence with the changed date. Remove only that literal,
  // never another named fact protected by the same directive.
  return instruction.replace(/\b(?:room\s+\d+|\d+\s*(?:a\.m\.|p\.m\.|am|pm))(?=$|[^\p{L}\p{N}])/giu,
    (literal) => outside.includes(` ${norm(literal)} `) ? " " : literal);
}

function directSubjectTerms(objective: string, requested: { verbAt: number; targetStart: number }): string[] {
  const beforeTarget = objective.slice(requested.verbAt, requested.targetStart);
  // Context after a relation or contrast is not the direct object of "move".
  const directObject = beforeTarget.split(/\b(?:from|after|before|not|with|without|about)\b|,/i)[0];
  return contentStems(withoutTemporal(directObject)).filter((word) => !GENERIC_OBJECTIVE_TERMS.has(word));
}

/** A preservation directive may constrain another uniquely named source fact, or the exact replacement's complement. */
function constraintsPermit(source: string, old: Temporal, parts: Directive[], update: Directive,
  affirmativeTerms: string[], requireDistinctProtection: boolean): boolean {
  const sourceClaims = extractClaims(source);
  const changedClaim = sourceClaims.find((claim) => old.start >= claim.span.start && old.end <= claim.span.end);
  if (!changedClaim) return false;
  const sourceExpressions = expressions(source);
  const oldSegmentTerms = new Set(contentStems(withoutTemporal(clauseFor(source, old) ?? changedClaim.text)));
  for (const part of parts) {
    const text = part.text.replace(/\u2019/g, "'");
    if (globalTemporalProtection.test(text)) return false;
    if (part === update) {
      if (protection.test(text) || otherNegation.test(text)) return false;
      continue;
    }
    if (everythingElse.test(text)) continue; // exactReplacement already requires every other byte to be unchanged.
    if (!protection.test(text)) {
      if (otherNegation.test(text)) return false;
      continue;
    }
    const subject = text.replace(protection, " ").replace(/\b(?:dates?|days?|times?|unchanged|alone|as\s+is)\b/gi, " ");
    const terms = new Set(contentStems(withoutTemporal(subject)));
    if (!terms.size) return false; // global or unidentified scope, including "any dates"
    if (affirmativeTerms.some((word) => terms.has(word))) return false;
    const otherTemporal = sourceExpressions.filter((item) => item.start !== old.start &&
      contentStems(withoutTemporal(clauseFor(source, item) ?? "")).some((word) => terms.has(word)));
    const otherClaims = sourceClaims.filter((claim) => claim !== changedClaim &&
      contentStems(withoutTemporal(claim.text)).some((word) => terms.has(word)));
    // A protected date must identify a different temporal expression. "The
    // date" and "its date" beside an unchanged room are still ambiguous.
    if (/\b(?:dates?|days?)\b/i.test(text)) {
      if (otherTemporal.length !== 1) return false;
      continue;
    }
    // A time/deadline/schedule constraint needs evidence outside the changed
    // claim; otherwise its referent could be the requested date.
    if (/\b(?:times?|deadlines?|schedules?)\b/i.test(text)) {
      if (!otherTemporal.length && !otherClaims.length) return false;
      continue;
    }
    // With no temporal scope, the whole-expression replacement itself proves
    // every other source byte stayed put. A named changed event still conflicts;
    // an explicit room/time literal is a distinct unchanged fact in that claim.
    const remainder = withoutPreservedLiterals(source, old, subject);
    const scoped = contentStems(withoutTemporal(remainder));
    if (scoped.some((word) => oldSegmentTerms.has(word))) return false;
    // An unidentified protection in a one-claim source could refer to that
    // very event, even when V14 had already granted the replacement. For
    // longer sources, retain published V14 passes while requiring distinct
    // evidence before granting a new V15 exception.
    if ((requireDistinctProtection || sourceClaims.length === 1) &&
      !otherTemporal.length && !otherClaims.length && remainder === subject) return false;
  }
  return true;
}

function requestedDirective(objective: string, next: Temporal): { parts: Directive[]; update: Directive; verbAt: number; targetStart: number; targetEnd: number } | null {
  const targets = expressions(objective).filter((item) => norm(item.text) === norm(next.text) &&
    /\b(?:to|as|now|for)\s*$/i.test(objective.slice(0, item.start)));
  if (targets.length !== 1) return null;
  const parts = directives(objective);
  const update = parts.find((part) => targets[0].start >= part.start && targets[0].end <= part.end);
  if (!update) return null;
  const precedingUpdates = [...objective.slice(update.start, targets[0].start).matchAll(/\b(?:change|move|update|replace|switch|revise)\b/gi)];
  if (!precedingUpdates.length) return null;
  return { parts, update, verbAt: update.start + precedingUpdates.at(-1)!.index,
    targetStart: targets[0].start, targetEnd: targets[0].end };
}

function objectiveLicenses(source: string, objective: string, old: Temporal, next: Temporal,
  requireDistinctProtection = true): boolean {
  if (!updateVerb.test(objective)) return false;
  const requested = requestedDirective(objective, next);
  if (!requested) return false;
  const { parts, update, verbAt, targetEnd } = requested;
  const subjectTerms = directSubjectTerms(objective, requested);
  if (!constraintsPermit(source, old, parts, update, subjectTerms, requireDistinctProtection)) return false;
  // Preservation clauses elsewhere in the objective cannot supply the
  // subject for this requested target ("move audit ... keep meeting").
  const directive = objective.slice(verbAt, targetEnd);
  // Never infer a replacement component (including a year) from the calendar.
  if (Boolean(old.date) !== Boolean(next.date) || Boolean(old.weekday) !== Boolean(next.weekday)) return false;
  const oldYear = old.date ? extractDates(old.date)[0]?.canonical.split("-")[0] : null;
  const newYear = next.date ? extractDates(next.date)[0]?.canonical.split("-")[0] : null;
  if (Boolean(oldYear && oldYear !== "?") !== Boolean(newYear && newYear !== "?")) return false;
  if (source.split(old.text).length !== 2) return false; // duplicated source expression is ambiguous
  const sourceExpressions = expressions(source);
  const objectiveTerms = new Set(contentStems(withoutTemporal(directive)));
  const segment = clauseFor(source, old);
  if (!segment) return false;
  const segmentTerms = new Set(contentStems(withoutTemporal(segment)));
  if (sourceExpressions.length === 1) {
    return subjectTerms.every((word) => segmentTerms.has(word));
  }

  // With multiple temporal facts, an objective without the old date must
  // identify the changed claim or its local "and" segment uniquely.
  if (!subjectTerms.length || !subjectTerms.every((word) => segmentTerms.has(word))) return false;
  return subjectTerms.some((word) => objectiveTerms.has(word) && sourceExpressions.every((item) => item.start === old.start ||
    !contentStems(withoutTemporal(clauseFor(source, item) ?? "")).includes(word)));
}

function changedExpression(source: string, candidate: string): { old: Temporal; next: Temporal } | null {
  const matches = expressions(source).flatMap((old) => expressions(candidate).filter((next) =>
    next.start === old.start && norm(next.text) !== norm(old.text) &&
    source.slice(0, old.start) + next.text + source.slice(old.end) === candidate).map((next) => ({ old, next })));
  return matches.length === 1 ? matches[0] : null;
}

function temporalChanges(source: string, candidate: string): { old: Temporal; next: Temporal }[] | null {
  const before = expressions(source);
  const after = expressions(candidate);
  if (before.length !== after.length) return null;
  return before.flatMap((old, index) => norm(old.text) === norm(after[index].text) ? [] : [{ old, next: after[index] }]);
}

function conflictsWithProtection(source: string, candidate: string, objective: string, baselineRejected: boolean): boolean {
  const parts = directives(objective);
  if (!parts.some((part) => protection.test(part.text.replace(/\u2019/g, "'")) ||
    otherNegation.test(part.text.replace(/\u2019/g, "'")) || globalTemporalProtection.test(part.text))) return false;
  const changes = temporalChanges(source, candidate);
  if (!changes) return true; // altered expression count has no safe one-to-one identity
  return changes.some(({ old, next }) => !objectiveLicenses(source, objective, old, next, baselineRejected));
}

/** V15 only: V14's exact temporal delta with directive-local preservation constraints. */
export function verifyDirectiveScopedTemporalDelta(source: string, candidate: string, objective: string, profile: StyleProfile,
  ctx: VerifyContext = {}): ReturnType<typeof verifyExactObjectiveDeltas> {
  const baseline = verifyCompositeTemporalDelta(source, candidate, objective, profile, ctx);
  const changed = changedExpression(source, candidate);
  if (conflictsWithProtection(source, candidate, objective, baseline.verification.status === "rejected")) {
    // V13 may have already granted a date-only delta. A contradictory local or
    // global protection still wins the safety gate; never rely on the composite
    // grant simply failing to undo an earlier baseline authorization.
    const findings: Finding[] = [...baseline.verification.findings, { kind: "altered_date", severity: "blocking",
      origin: "deterministic", message: "The requested temporal replacement conflicts with a preservation directive.",
      source: changed?.old.text, candidate: changed?.next.text }];
    return { verification: { ...baseline.verification, findings, status: "rejected" }, authorized: baseline.authorized };
  }
  const pair = changed && objectiveLicenses(source, objective, changed.old, changed.next) ? changed : null;
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
