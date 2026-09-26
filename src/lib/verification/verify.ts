import type { Finding, VerificationResult } from "@/domain/verification";
import { statusFromFindings } from "@/domain/verification";
import type { StyleProfile } from "@/domain/style";
import { words } from "../analysis/tokenize";
import { STOPWORDS } from "../analysis/lexicon";
import { countNegations, extractDateWords, extractLinks, extractNameSpans, extractNames, extractNumbers, extractQuotations } from "./protected";

/**
 * Deterministic meaning checks. They cannot prove two texts mean the same
 * thing; they catch the concrete failures that matter most (a changed figure,
 * a dropped name, a flipped negation) and report which checks ran.
 */

const excerpt = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function diffMultiset(source: Map<string, number>, candidate: Map<string, number>) {
  const missing: string[] = [];
  const added: string[] = [];
  for (const [k, n] of source) if ((candidate.get(k) ?? 0) < n) missing.push(k);
  for (const [k, n] of candidate) if ((source.get(k) ?? 0) < n) added.push(k);
  return { missing, added };
}

const normalizeSpace = (s: string) => s.replace(/[\s ]+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export function checkProtectedSpans(source: string, candidate: string): Finding[] {
  const findings: Finding[] = [];

  const nums = diffMultiset(extractNumbers(source), extractNumbers(candidate));
  for (const n of nums.missing) findings.push({ kind: "altered_number", severity: "blocking", origin: "deterministic", message: `The figure ${n} from your text is missing or changed.`, source: n });
  for (const n of nums.added) findings.push({ kind: "altered_number", severity: "blocking", origin: "deterministic", message: `The rewrite introduces ${n}, which is not in your text.`, candidate: n });

  const dates = diffMultiset(extractDateWords(source), extractDateWords(candidate));
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

const stem = (w: string) =>
  w
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/(?:ing|edly|ed|ies|es|s|ly)$/, "")
    .slice(0, 7);

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

export function verifyDeterministic(source: string, candidate: string, profile: StyleProfile): VerificationResult {
  const coverage = lexicalCoverage(source, candidate);
  const findings = [...checkProtectedSpans(source, candidate), ...checkNegation(source, candidate), ...checkLength(source, candidate, profile)];
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
    checks: ["protected_spans", "negation", "length", "lexical_coverage"],
    lexicalCoverage: Math.round(coverage * 100) / 100,
  };
}

/** Merge a model's meaning findings into a deterministic result. */
export function mergeVerification(base: VerificationResult, modelFindings: Finding[] | null): VerificationResult {
  if (!modelFindings) return base;
  const findings = [...base.findings, ...modelFindings];
  return { ...base, findings, status: statusFromFindings(findings), checks: [...base.checks, "model_meaning"] };
}
