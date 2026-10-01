import type { Finding, VerificationResult } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { checkProtectedSpans, lexicalCoverage, verifyDeterministic, type VerifyContext } from "@/lib/verification/verify";

/** Internal evidence only. The text fields must never be copied into production telemetry. */
export interface AuthorizedChange {
  kind: Finding["kind"];
  source: string | null;
  candidate: string | null;
  basis: "OBJECTIVE" | "STRUCTURE" | "FRAMING";
  objectiveEvidence: string | null;
}

const NUMBERS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
const normalized = (s: string) => s.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUMBERS[w])
  .replace(/[’]/g, "'").replace(/\b(planned|planning)\b/g, "pending");
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, value: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escaped(normalized(value))}(?![\\p{L}\\p{N}])`, "u").test(normalized(text));

/** Require a direct update/decision instruction near the exact candidate value. */
function targetEvidence(objective: string, target: string, allowPlural = false, sourceContext?: string, oldValue?: string): string | null {
  const numberWord = Object.entries(NUMBERS).find(([, numeral]) => numeral === target)?.[0];
  const alternatives = [target, ...(allowPlural && /^[a-z]+$/i.test(target) && !target.endsWith("s") ? [`${target}s`] : []),
    ...(numberWord ? [numberWord] : [])].map(escaped).join("|");
  const match = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu").exec(objective);
  if (!match) return null;
  const clause = normalized(objective.slice(Math.max(0, match.index - 100), match.index + match[0].length));
  if (!/\b(?:change|changed|move|moved|update|updated|replace|replaced|switch|switched|now|approved|decided|instead of|state that|say that|rewrite this to)\b/.test(clause)) return null;
  if (sourceContext && oldValue && !mentions(objective, oldValue)) {
    const stem = (word: string) => word.toLowerCase().replace(/(?:ing|ed|es|s)$/, "");
    const meaningful = (text: string) => (text.match(/[a-z]{4,}/gi) ?? []).map(stem)
      .filter((word) => !["this", "that", "with", "from", "will", "would", "should", "chang", "updat", "remind", "stat", "then", "there", "have", "been"].includes(word));
    const sourceWords = new Set(meaningful(sourceContext.replace(new RegExp(escaped(oldValue), "ig"), "")));
    const nearby = meaningful(objective.slice(Math.max(0, match.index - 60), match.index));
    if (!nearby.some((word) => sourceWords.has(word))) return null;
  }
  return objective.slice(Math.max(0, match.index - 100), match.index + match[0].length);
}

function structuralMarkers(candidate: string): string | null {
  const markers = [...candidate.matchAll(/^\s{0,4}([1-9]\d?)[.)]\s+/gm)].map((m) => Number(m[1]));
  if (markers.length < 2 || !markers.every((n, index) => n === index + 1)) return null;
  return candidate.replace(/^\s{0,4}[1-9]\d?[.)]\s+/gm, "");
}

function emptyFrame(claim: string, candidate: string): boolean {
  if (/\d|[“”"]/.test(claim)) return false;
  if (/^(?:this|the following) (?:is|are) (?:an? )?(?:important|brief|key|general) (?:update|note|point|message)\b/i.test(claim)) return true;
  const prefix = claim.match(/^(?:it is|it's) (?:important|worthwhile|worth) to (?:note|mention|remember) that\s+(.+)$/i);
  return Boolean(prefix && lexicalCoverage(prefix[1], candidate) >= 0.8);
}

function explicitRemoval(objective: string, claim: string): string | null {
  const match = normalized(objective).match(/\b(?:remove|delete|omit)\s+(?:the\s+)?([^.!?;]{3,90})/);
  if (!match) return null;
  const words = (s: string) => new Set(s.match(/[a-z]{4,}/g)?.filter((w) => !["remove", "delete", "omit", "line", "sentence", "paragraph", "from", "this", "that", "about"].includes(w)) ?? []);
  const requested = words(match[1]);
  const inClaim = words(normalized(claim));
  if ([...requested].filter((word) => inClaim.has(word)).length < 2) return null;
  return match[0];
}

/** V11-only adjustment. No source-only invariant is globally weakened. */
export function verifyObjectiveAware(source: string, candidate: string, objective: string, profile: StyleProfile,
  ctx: VerifyContext = {}): { verification: VerificationResult; authorized: AuthorizedChange[] } {
  const raw = verifyDeterministic(source, candidate, profile, ctx);
  const authorized: AuthorizedChange[] = [];
  const granted = new Set<number>();
  const grant = (index: number, evidence: string | null, basis: AuthorizedChange["basis"]) => {
    const item = raw.findings[index];
    if (granted.has(index)) return;
    granted.add(index);
    authorized.push({ kind: item.kind, source: item.source ?? null, candidate: item.candidate ?? null, basis, objectiveEvidence: evidence });
  };

  const withoutMarkers = structuralMarkers(candidate);
  if (withoutMarkers !== null) {
    const remaining = checkProtectedSpans(source, withoutMarkers);
    raw.findings.forEach((finding, index) => {
      if (finding.kind === "altered_number" && finding.candidate &&
        !remaining.some((other) => other.kind === "altered_number" && other.candidate === finding.candidate))
        grant(index, null, "STRUCTURE");
    });
  }

  raw.findings.forEach((finding, index) => {
    if (finding.kind === "missing_claim" && finding.source && emptyFrame(finding.source, candidate))
      grant(index, null, "FRAMING");
  });

  for (const kind of ["altered_date", "altered_number"] as const) {
    const old = raw.findings.map((finding, index) => ({ finding, index })).filter(({ finding, index }) =>
      !granted.has(index) && finding.kind === kind && finding.severity === "blocking" && finding.source && !finding.candidate);
    const next = raw.findings.map((finding, index) => ({ finding, index })).filter(({ finding, index }) =>
      !granted.has(index) && finding.kind === kind && finding.severity === "blocking" && finding.candidate && !finding.source);
    if (old.length !== 1 || next.length !== 1) continue; // Ambiguous pairing fails closed.
    const sourceContext = source.split(/(?<=[.!?])\s+/).find((sentence) => mentions(sentence, old[0].finding.source!)) ?? source;
    const evidence = targetEvidence(objective, next[0].finding.candidate!, kind === "altered_date", sourceContext, old[0].finding.source!);
    if (!evidence) continue;
    grant(old[0].index, evidence, "OBJECTIVE");
    grant(next[0].index, evidence, "OBJECTIVE");
    // Some date words are also misidentified as names; authorize only that same exact source token.
    if (kind === "altered_date") raw.findings.forEach((finding, index) => {
      if (finding.kind === "altered_name" && finding.source &&
        normalized(finding.source).replace(/s$/, "") === normalized(old[0].finding.source!).replace(/s$/, "")) grant(index, evidence, "OBJECTIVE");
    });
  }

  const missingNames = raw.findings.map((finding, index) => ({ finding, index })).filter(({ finding, index }) =>
    !granted.has(index) && finding.kind === "altered_name" && finding.severity === "blocking" && finding.source);
  const addedNames = raw.findings.map((finding, index) => ({ finding, index })).filter(({ finding }) =>
    finding.kind === "added_claim" && finding.candidate && !mentions(source, finding.candidate));
  if (missingNames.length === 1 && addedNames.length === 1) {
    const evidence = targetEvidence(objective, addedNames[0].finding.candidate!);
    if (evidence && /\b(?:owner|actor|person|name|responsib|assigned|lead)\b/i.test(evidence))
      grant(missingNames[0].index, evidence, "OBJECTIVE");
  }

  raw.findings.forEach((finding, index) => {
    if (granted.has(index) || finding.kind !== "missing_claim" || !finding.source) return;
    const evidence = explicitRemoval(objective, finding.source);
    if (evidence) grant(index, evidence, "OBJECTIVE");
  });

  const findings = raw.findings.map((finding, index) => granted.has(index) ?
    { ...finding, severity: "warning" as const, message: `AUTHORIZED_CHANGE: ${finding.message}` } : finding);
  return { verification: { ...raw, findings, status: statusFromFindings(findings) }, authorized };
}
