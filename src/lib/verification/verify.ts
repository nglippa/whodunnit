import type { Finding, VerificationResult } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { words } from "../analysis/tokenize";
import { STOPWORDS } from "../analysis/lexicon";
import { stem } from "../analysis/stem";
import { countNegations, extractDateWords, extractLinks, extractNameSpans, extractNames, extractNumbers, extractQuotations, MONTHS } from "./protected";
import type { ProtectedPhrase } from "@/domain/semantics";
import { blankDates, datesCompatible, extractDates } from "../semantics/dates";
import { analyzeIntegrity, integrityFindings, type IntegrityReport } from "../semantics/integrity";
import type { Licenses } from "../semantics/compare";
import { analyzeWriting } from "../rules/engine";
import { removableSpans } from "../rules/families";
import { rulesForProfile } from "../rules/packs";

/**
 * Deterministic meaning checks. They cannot prove two texts mean the same
 * thing; they catch the concrete failures that matter most (a changed figure,
 * a dropped name, a flipped negation) and report which checks ran.
 */

const excerpt = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Set difference: a value is missing when the rewrite never mentions it, and
 * added when the source never does. Mentioning a source figure twice is not a
 * new fact, and dropping a repeated mention is not a lost one.
 */
function diffSets(source: Map<string, number>, candidate: Map<string, number>) {
  const missing = [...source.keys()].filter((k) => !candidate.has(k));
  const added = [...candidate.keys()].filter((k) => !source.has(k));
  return { missing, added };
}

const MONTH_BY_NUMBER = (mm: string) => MONTHS[Number(mm) - 1];

const normalizeSpace = (s: string) => s.replace(/[\s ]+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export function checkProtectedSpans(source: string, candidate: string): Finding[] {
  const findings: Finding[] = [];

  // Dates are compared as dates, so "12 March 2026" → "March 12, 2026" is not a changed number.
  const sDates = extractDates(source);
  const cDates = extractDates(candidate);
  const sRest = blankDates(source, sDates);
  const cRest = blankDates(candidate, cDates);
  for (const d of sDates) {
    if (cDates.some((c) => c.canonical === d.canonical)) continue;
    if (cDates.some((c) => datesCompatible(d.canonical, c.canonical)))
      findings.push({ kind: "altered_date", severity: "warning", origin: "deterministic", message: `The date “${d.text}” is less specific in the rewrite.`, source: d.text });
    else findings.push({ kind: "altered_date", severity: "blocking", origin: "deterministic", message: `The date “${d.text}” is missing or changed.`, source: d.text });
  }
  for (const c of cDates) {
    if (!sDates.some((d) => datesCompatible(d.canonical, c.canonical)))
      findings.push({ kind: "altered_date", severity: "blocking", origin: "deterministic", message: `The rewrite adds the date “${c.text}”.`, candidate: c.text });
  }
  const monthsIn = (ds: typeof sDates) => new Set(ds.map((d) => MONTH_BY_NUMBER(d.canonical.split("-")[1])));

  const nums = diffSets(extractNumbers(sRest), extractNumbers(cRest));
  for (const n of nums.missing) findings.push({ kind: "altered_number", severity: "blocking", origin: "deterministic", message: `The figure ${n} from your text is missing or changed.`, source: n });
  for (const n of nums.added) findings.push({ kind: "altered_number", severity: "blocking", origin: "deterministic", message: `The rewrite introduces ${n}, which is not in your text.`, candidate: n });

  const dates = diffSets(extractDateWords(sRest), extractDateWords(cRest));
  dates.missing = dates.missing.filter((d) => !monthsIn(cDates).has(d));
  dates.added = dates.added.filter((d) => !monthsIn(sDates).has(d));
  for (const d of dates.missing) findings.push({ kind: "altered_date", severity: "blocking", origin: "deterministic", message: `The date reference “${d}” is missing or changed.`, source: d });
  for (const d of dates.added) findings.push({ kind: "altered_date", severity: "blocking", origin: "deterministic", message: `The rewrite adds a date reference “${d}”.`, candidate: d });

  const cand = normalizeSpace(candidate);
  for (const q of extractQuotations(source)) {
    if (!cand.includes(normalizeSpace(q))) findings.push({ kind: "altered_quotation", severity: "blocking", origin: "deterministic", message: "A quotation was not carried over word for word.", source: excerpt(q) });
  }

  for (const l of extractLinks(source)) {
    if (!candidate.includes(l)) findings.push({ kind: "altered_link", severity: "blocking", origin: "deterministic", message: "A link or address was changed or dropped.", source: excerpt(l) });
  }

  const candLower = candidate.toLowerCase();
  for (const { name, strength } of extractNameSpans(source)) {
    if (!candLower.includes(name.toLowerCase())) {
      findings.push({
        kind: "altered_name",
        severity: strength === "strong" ? "blocking" : "warning",
        origin: "deterministic",
        message: `“${name}” no longer appears in the rewrite.`,
        source: name,
      });
    }
  }
  const srcLower = source.toLowerCase();
  for (const name of extractNames(candidate)) {
    const firstWord = name.split(" ")[0].toLowerCase();
    if (!srcLower.includes(name.toLowerCase()) && !srcLower.includes(firstWord)) {
      findings.push({ kind: "added_claim", severity: "warning", origin: "deterministic", message: `“${name}” appears in the rewrite but not in your text.`, candidate: name });
    }
  }
  return findings;
}

export function checkNegation(source: string, candidate: string): Finding[] {
  const a = countNegations(source);
  const b = countNegations(candidate);
  if (a === b) return [];
  return [
    {
      kind: "negation_changed",
      severity: "warning",
      origin: "deterministic",
      message: `Your text has ${a} negation${a === 1 ? "" : "s"}; the rewrite has ${b}. Check that no statement flipped.`,
    },
  ];
}

export function checkLength(source: string, candidate: string, profile: StyleProfile): Finding[] {
  const s = words(source).length;
  const c = words(candidate).length;
  if (s < 12) return []; // ratios are meaningless for very short inputs
  const ratio = c / s;
  const slack = 0.1;
  if (ratio < profile.lengthRatio.min - slack || ratio > profile.lengthRatio.max + slack) {
    return [
      {
        kind: "length_out_of_range",
        severity: "warning",
        origin: "deterministic",
        message: `The rewrite is ${Math.round(ratio * 100)}% of your length; ${profile.label} aims for ${Math.round(profile.lengthRatio.min * 100)}–${Math.round(profile.lengthRatio.max * 100)}%.`,
      },
    ];
  }
  return [];
}


/** Share of the source's distinct content-word stems that survive in the candidate. */
export function lexicalCoverage(source: string, candidate: string): number {
  const content = (t: string) => new Set(words(t).filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase().replace(/['’]/g, ""))).map(stem));
  const src = content(source);
  if (src.size === 0) return 1;
  const cand = content(candidate);
  let kept = 0;
  for (const w of src) if (cand.has(w)) kept++;
  return kept / src.size;
}

const COVERAGE_FLOOR: Record<StyleProfile["wordingRetention"], number> = { low: 0.3, medium: 0.42, high: 0.6 };

export interface VerifyContext {
  /** Source spans a rewrite may delete (filler patterns). Computed from the rules when omitted. */
  removableSpans?: [number, number][];
  /** Changes the author explicitly asked for (e.g. "more confident", "cut the intro"). */
  licenses?: Licenses;
  protectedPhrases?: ProtectedPhrase[];
}

/** Claim-level integrity with the rule context the pipeline would use. */
export function integrityReport(source: string, candidate: string, profile: StyleProfile, ctx: VerifyContext = {}): IntegrityReport {
  const spans = ctx.removableSpans ?? removableSpans(analyzeWriting(source, rulesForProfile(profile)).findings);
  return analyzeIntegrity(source, candidate, { removableSpans: spans, licenses: ctx.licenses, protectedPhrases: ctx.protectedPhrases });
}

export function verifyDeterministic(source: string, candidate: string, profile: StyleProfile, ctx: VerifyContext = {}): VerificationResult {
  const coverage = lexicalCoverage(source, candidate);
  // Negation is judged claim by claim (with implicit negatives such as "postpone"), not by counting "not".
  const integrity = integrityReport(source, candidate, profile, ctx);
  const findings = [...checkProtectedSpans(source, candidate), ...integrityFindings(integrity), ...checkLength(source, candidate, profile)];
  if (words(source).length >= 20 && coverage < COVERAGE_FLOOR[profile.wordingRetention]) {
    findings.push({
      kind: "meaning_drift",
      severity: "warning",
      origin: "deterministic",
      message: `Only ${Math.round(coverage * 100)}% of your key words survive. Read closely for anything dropped.`,
    });
  }
  return {
    status: statusFromFindings(findings),
    findings,
    checks: ["protected_spans", "negation", "claims", "quotations", "phrases", "mechanics", "length", "lexical_coverage"],
    lexicalCoverage: Math.round(coverage * 100) / 100,
  };
}

/** Merge a model's meaning findings into a deterministic result. */
export function mergeVerification(base: VerificationResult, modelFindings: Finding[] | null): VerificationResult {
  if (!modelFindings) return base;
  const findings = [...base.findings, ...modelFindings];
  return { ...base, findings, status: statusFromFindings(findings), checks: [...base.checks, "model_meaning"] };
}
