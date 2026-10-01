import type { Finding, VerificationResult } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { contentStems, extractClaims, negatorsOf } from "@/lib/semantics/claims";
import { extractDates } from "@/lib/semantics/dates";
import { extractDateWords, extractNameSpans, extractNumbers } from "@/lib/verification/protected";
import type { VerifyContext } from "@/lib/verification/verify";
import { verifyObjectiveAware, type AuthorizedChange } from "./objective-aware-verification";

// V13 adds authorization only for a uniquely matched source claim, requested
// target, and candidate claim. V11 remains the fallback for every other case.
const norm = (text: string) => text.toLowerCase().replace(/[’]/g, "'").replace(/[-–]/g, " ").replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();
const has = (text: string, value: string) => ` ${norm(text)} `.includes(` ${norm(value)} `);
const updating = /\b(?:change|move|update|replace|switch|revise|now|cancel|postpone|decid|close|approv|will be provided|will not|no new date)\b/i;
const tokens = (text: string) => new Set(contentStems(text.replace(/[-–]/g, " ")));
const overlap = (a: string, b: string) => [...tokens(a)].filter((word) => tokens(b).has(word)).length;
const clauses = (text: string) => text.split(/,\s+|\s+and\s+/i).map((part) => part.trim().replace(/^(?:and|but)\s+/i, ""));

type Claim = ReturnType<typeof extractClaims>[number];
function sentenceWith(claims: Claim[], value: string): Claim[] { return claims.filter((claim) => has(claim.text, value)); }

function pairedClaim(sourceClaims: Claim[], candidateClaims: Claim[], sourceValue: string, targetValue: string): { source: Claim; candidate: Claim } | null {
  const candidates = sentenceWith(candidateClaims, targetValue);
  if (candidates.length !== 1) return null;
  const target = candidates[0];
  const possible = sentenceWith(sourceClaims, sourceValue).map((claim) => ({ claim, score: overlap(claim.text, target.text) }));
  possible.sort((a, b) => b.score - a.score);
  if (!possible.length || possible[0].score < 2 || possible[1]?.score === possible[0].score) return null;
  return { source: possible[0].claim, candidate: target };
}

function objectiveTargetsClaim(objective: string, sourceClaim: Claim, target: string, oldValue: string): boolean {
  if (!updating.test(objective) || !has(objective, target)) return false;
  if (has(objective, oldValue)) return true;
  // A named subject/operation must disambiguate a change when the old value
  // appears more than once or was not named in the request.
  const shared = [...tokens(objective)].filter((word) => tokens(sourceClaim.text).has(word));
  if (shared.length >= 2) return true;
  const changedClause = clauses(sourceClaim.text).find((part) => has(part, oldValue));
  return Boolean(shared.length === 1 && changedClause && [...tokens(objective)]
    .filter((word) => tokens(changedClause).has(word) &&
      clauses(sourceClaim.text).filter((part) => tokens(part).has(word)).length === 1).length === 1);
}

function claimStateAuthorized(objective: string, sourceClaim: string, candidateClaim: string): boolean {
  if (!updating.test(objective) || overlap(sourceClaim, candidateClaim) < 2 || overlap(objective, sourceClaim) < 2) return false;
  const sourceTerms = tokens(sourceClaim);
  const addedTerms = [...tokens(candidateClaim)].filter((word) => !sourceTerms.has(word));
  const objectiveTerms = tokens(objective);
  if (addedTerms.some((word) => !objectiveTerms.has(word))) return false;
  const candidateNegators = negatorsOf(candidateClaim);
  const objectiveNegators = negatorsOf(objective);
  if (candidateNegators.length && !candidateNegators.every((word) => objectiveNegators.includes(word))) return false;
  // Mere mention of a status is not permission. Require the changed claim's
  // replacement state to occur in the objective, including a negative state.
  if (addedTerms.length > 0 || candidateNegators.length > 0 && objectiveNegators.length > 0) return true;
  // Removing a negative state is allowed only when the user affirmatively
  // requests the same subject and action, e.g. "aprons will be provided".
  return negatorsOf(sourceClaim).length > 0 && candidateNegators.length === 0 && objectiveNegators.length === 0 &&
    overlap(objective, candidateClaim) >= 2;
}

/** Exact-delta successor to V11. Never grants a type-wide license. */
export function verifyExactObjectiveDeltas(source: string, candidate: string, objective: string, profile: StyleProfile,
  ctx: VerifyContext = {}): { verification: VerificationResult; authorized: AuthorizedChange[] } {
  const baseline = verifyObjectiveAware(source, candidate, objective, profile, ctx);
  const findings = baseline.verification.findings.slice();
  const authorized = baseline.authorized.slice();
  const sourceClaims = extractClaims(source);
  const candidateClaims = extractClaims(candidate);
  const originalFindingCount = findings.length;
  const granted = new Set<number>();
  const grant = (index: number) => {
    if (granted.has(index) || findings[index].severity !== "blocking") return;
    granted.add(index);
    const finding = findings[index];
    authorized.push({ kind: finding.kind, source: finding.source ?? null, candidate: finding.candidate ?? null,
      basis: "OBJECTIVE", objectiveEvidence: objective });
    findings[index] = { ...finding, severity: "warning", message: `AUTHORIZED_CHANGE: ${finding.message}` };
  };
  const addHard = (sourceText: string, candidateText: string, message: string) => findings.push({
    kind: "added_claim", severity: "blocking", origin: "deterministic", message,
    source: sourceText, candidate: candidateText,
  } satisfies Finding);

  // Protected values are compared as sets by V11. Reconstruct only the single
  // affected occurrence from its claim; untouched same-type values stay hard.
  for (const kind of ["altered_date", "altered_number"] as const) {
    const missing = findings.map((finding, index) => ({ finding, index })).filter(({ finding }) =>
      finding.kind === kind && finding.severity === "blocking" && finding.source && !finding.candidate);
    const added = findings.map((finding, index) => ({ finding, index })).filter(({ finding }) =>
      finding.kind === kind && finding.severity === "blocking" && finding.candidate && !finding.source);
    for (const next of added) {
      const target = next.finding.candidate!;
      const targetClaims = sentenceWith(candidateClaims, target);
      if (targetClaims.length !== 1) continue;
      const targetClaim = targetClaims[0];
      const sources = sourceClaims.map((claim) => ({ claim, score: overlap(claim.text, targetClaim.text) }))
        .sort((a, b) => b.score - a.score);
      if (!sources.length || sources[0].score < 2 || sources[1]?.score === sources[0].score) continue;
      const sourceClaim = sources[0].claim;
      const parsedDates = extractDates(sourceClaim.text);
      const values = kind === "altered_number" ? [...extractNumbers(sourceClaim.text).keys()] :
        [...parsedDates.map((date) => date.text), ...[...extractDateWords(sourceClaim.text).keys()]
          .filter((word) => !parsedDates.some((date) => has(date.text, word)))];
      const oldValues = values.filter((value) => !has(targetClaim.text, value));
      const targetClause = clauses(targetClaim.text).find((part) => has(part, target));
      const old = oldValues.filter((value) => {
        const sourceClause = clauses(sourceClaim.text).find((part) => has(part, value));
        return sourceClause && targetClause && overlap(sourceClause, targetClause) >= 2;
      });
      if (old.length !== 1 || !objectiveTargetsClaim(objective, sourceClaim, target, old[0])) continue;
      // The target value must occur only in this candidate claim; otherwise
      // the same objective might mask another newly introduced fact.
      grant(next.index);
      for (const prior of missing) if (norm(prior.finding.source!) === norm(old[0])) grant(prior.index);
      if (kind === "altered_date") findings.forEach((finding, index) => {
        if (finding.kind === "altered_name" && finding.source && norm(finding.source) === norm(old[0])) grant(index);
      });
    }
  }

  // A deadline may disappear because the user explicitly replaces the status
  // that made it applicable ("open through Thursday" -> "closed"). Require
  // an exact replacement clause in the objective and the same claim context.
  findings.forEach((finding, index) => {
    if (finding.kind !== "altered_date" || finding.severity !== "blocking" || !finding.source || finding.candidate) return;
    const sources = sentenceWith(sourceClaims, finding.source);
    if (sources.length !== 1) return;
    const sourceClause = clauses(sources[0].text).find((part) => has(part, finding.source!));
    if (!sourceClause) return;
    const replacements = candidateClaims.flatMap((claim) => clauses(claim.text))
      .filter((part) => overlap(sourceClause, part) >= 1 && has(objective, part) &&
        !has(part, finding.source!) && !has(part, "date"));
    if (replacements.length !== 1 || !updating.test(objective)) return;
    grant(index);
  });

  // Single-token names often have warning severity in the old extractor. A
  // second replacement is still a protected collateral change, even when it
  // did not produce a blocking finding in V11.
  if (/\b(?:change|replace|update|switch)\b/i.test(objective)) {
    const missingNames = findings.filter((finding) => finding.kind === "altered_name" && finding.source &&
      !authorized.some((item) => item.kind === "altered_name" && item.source === finding.source));
    const newNames = extractNameSpans(candidate).map(({ name }) => name).filter((name) => !has(source, name) && !has(objective, name));
    if (missingNames.length && newNames.length) addHard(missingNames[0].source!, newNames[0], "Unrequested actor replacement accompanies an authorized update.");
  }

  // The legacy integrity checker can miss a changed predicate in a separate
  // sentence ("budget unchanged" -> "budget increased"). For explicit fact
  // updates, protect an unrelated claim whose subject stays put but whose
  // sole content change is absent from the objective.
  for (const [index, sourceClaim] of sourceClaims.entries()) {
    const candidateClaim = candidateClaims[index];
    if (!candidateClaim || sourceClaim.text === candidateClaim.text ||
      overlap(sourceClaim.text, candidateClaim.text) < 1) continue;
    const before = tokens(sourceClaim.text);
    const after = tokens(candidateClaim.text);
    const removed = [...before].filter((word) => !after.has(word));
    const added = [...after].filter((word) => !before.has(word));
    if (removed.length !== 1 || added.length !== 1 || tokens(objective).has(added[0]) ||
      tokens(objective).has(removed[0]) || !updating.test(objective)) continue;
    if (findings.some((finding) => finding.severity === "blocking" && finding.source === sourceClaim.text && finding.candidate === candidateClaim.text)) continue;
    addHard(sourceClaim.text, candidateClaim.text, "An unrelated claim changes outside the requested semantic delta.");
  }

  // A person replacement has no paired added-name hard finding. Its added
  // claim is warning-level, so tie the missing name to a unique new name in
  // the objective and the same candidate claim.
  findings.forEach((finding, index) => {
    if (finding.kind !== "altered_name" || !finding.source) return;
    const added = extractNameSpans(candidate).map(({ name }) => name).filter((name) => !has(source, name) && has(objective, name));
    if (added.length !== 1) return;
    const pair = pairedClaim(sourceClaims, candidateClaims, finding.source, added[0]);
    if (!pair || !objectiveTargetsClaim(objective, pair.source, added[0], finding.source)) return;
    if (finding.severity === "blocking") grant(index);
    else if (!authorized.some((item) => item.kind === "altered_name" && item.source === finding.source))
      authorized.push({ kind: finding.kind, source: finding.source, candidate: added[0], basis: "OBJECTIVE", objectiveEvidence: objective });
  });

  // Claim-level polarity/status findings already carry the aligned source and
  // candidate claims. The objective must support every new content term and
  // every newly introduced negation in that particular claim.
  findings.forEach((finding, index) => {
    if (index >= originalFindingCount) return;
    if (finding.severity !== "blocking" || !finding.source || !finding.candidate ||
      !["negation_changed", "assertion_strength_changed", "added_claim"].includes(finding.kind)) return;
    if (claimStateAuthorized(objective, finding.source, finding.candidate)) grant(index);
  });

  return { verification: { ...baseline.verification, findings, status: statusFromFindings(findings) }, authorized };
}
