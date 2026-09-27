import type { Finding, FindingKind } from "@/domain/verification";
import type { ClaimChange, ClaimComparison, ProtectedPhrase } from "@/domain/semantics";
import { extractClaims } from "./claims";
import { compareClaims, type CompareContext } from "./compare";
import { checkMechanics } from "./mechanics";
import { checkPhrases, protectedPhrasesFor } from "./phrases";
import { checkQuotations, type QuoteReport } from "./quotes";

/**
 * Semantic integrity: did the rewrite preserve what the author actually
 * said? Deterministic, browser-safe, and conservative. Findings are graded:
 *
 *   blocking  the meaning changed (a flipped negation, "almost three weeks"
 *             → "three weeks", "helps" → "determines", an invented cause,
 *             a dropped quotation mark, "across" → "against the grain")
 *   major     probably changed; a person or a judge should look (a dropped
 *             hedge, an added clause with new content, an invented question)
 *   minor     worth recording (mechanical slips, near-equivalent bounds)
 *
 * What this layer cannot decide it does not pass: it leaves it to the
 * semantic judge, and says which checks ran.
 */

export const SEMANTIC_ANALYSIS_VERSION = "semantics.v1";

export interface IntegrityContext extends CompareContext {
  protectedPhrases?: ProtectedPhrase[];
}

export interface IntegrityReport {
  version: string;
  comparison: ClaimComparison;
  removableClaims: string[];
  quotes: QuoteReport;
  phrases: ClaimChange[];
  mechanics: ClaimChange[];
  verdict: "PASS" | "NEEDS_REVIEW" | "FAIL";
}

export function allChanges(r: IntegrityReport): ClaimChange[] {
  return [...r.comparison.changes, ...r.quotes.issues, ...r.phrases, ...r.mechanics];
}

export function verdictOf(changes: ClaimChange[]): IntegrityReport["verdict"] {
  if (changes.some((c) => c.severity === "blocking")) return "FAIL";
  if (changes.some((c) => c.severity === "major")) return "NEEDS_REVIEW";
  return "PASS";
}

export function analyzeIntegrity(source: string, output: string, ctx: IntegrityContext = {}): IntegrityReport {
  const src = extractClaims(source);
  const out = extractClaims(output);
  const cmp = compareClaims(source, output, src, out, ctx);
  const quotes = checkQuotations(source, output);
  const phrases = checkPhrases(source, output, ctx.protectedPhrases ?? protectedPhrasesFor(source));
  const mechanics = checkMechanics(source, output);
  const report: IntegrityReport = {
    version: SEMANTIC_ANALYSIS_VERSION,
    comparison: { sourceClaims: src.length, outputClaims: out.length, aligned: cmp.aligned, changes: cmp.changes },
    removableClaims: cmp.removableClaims,
    quotes,
    phrases,
    mechanics,
    verdict: "PASS",
  };
  report.verdict = verdictOf(allChanges(report));
  return report;
}

const KIND: Record<ClaimChange["aspect"], FindingKind> = {
  polarity: "negation_changed",
  quantity: "quantity_changed",
  modality: "assertion_strength_changed",
  evidence: "assertion_strength_changed",
  causation: "assertion_strength_changed",
  quantifier: "assertion_strength_changed",
  frequency: "assertion_strength_changed",
  "causal-relation": "added_claim",
  question: "added_question",
  "temporal-clause": "added_claim",
  content: "added_claim",
  phrase: "phrase_changed",
  quotation: "quotation_damaged",
  mechanics: "mechanical_damage",
};

const clip = (s: string | null, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : undefined);

/** Product findings: blocking stays blocking, major becomes a warning, minor is kept only for mechanical damage. */
export function integrityFindings(r: IntegrityReport): Finding[] {
  const out: Finding[] = [];
  for (const c of allChanges(r)) {
    if (c.severity === "minor" && c.aspect !== "mechanics") continue;
    const kind: FindingKind = c.relation === "dropped" && c.aspect === "content" ? "missing_claim" : KIND[c.aspect];
    out.push({
      kind,
      severity: c.severity === "blocking" ? "blocking" : "warning",
      origin: "deterministic",
      message: clip(c.detail, 400)!,
      source: clip(c.source, 300),
      candidate: clip(c.output, 300),
    });
  }
  return out;
}
