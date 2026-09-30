import type { RuleCategory, RuleFinding, RuleLayer, Severity } from "@/domain/writing-rules";
import { detect } from "./detectors";
import { computeMetrics, type WritingMetrics } from "./metrics";
import type { RegisteredRule } from "./registry";
import { indexText } from "./text-index";
import { applyPrecedence, type TargetConstraint } from "./constraints";
import { classifyDocumentStructure, type DocumentType, type StructuralScope } from "../discourse/structure";

/**
 * analyzeWriting(text, rules) → metrics + findings. Deterministic and pure:
 * the same text and rules always give the same result. No scores, no
 * probabilities of authorship: only which patterns are present and where.
 */

export interface WritingAnalysis {
  metrics: WritingMetrics;
  findings: RuleFinding[];
  summary: {
    /** Rules that fired and are active (not suppressed, not info). */
    patternCount: number;
    matchCount: number;
    byCategory: Partial<Record<RuleCategory, number>>;
    bySeverity: Record<Severity, number>;
    suppressedCount: number;
  };
}

export interface PatternPermission {
  ruleId: string;
  layer: RuleLayer;
  reason: string;
  /** Scope permission to the exact author's recurring opening. */
  opening?: string;
  /** Rechecked against each analyzed text, including candidate post-checks. */
  scope?: StructuralScope;
  documentType?: DocumentType;
}

function structuralMatch(text: string, start: number, end: number, scope: StructuralScope): boolean {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const prefix = text.slice(lineStart, start).trim();
  const line = text.slice(lineStart).split(/\r?\n/, 1)[0].trim();
  if (scope === "speaker-prefix") return !prefix && /^(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z])(?:\s+\d{1,2}:\d{2})?:\s/.test(line);
  if (scope === "dialogue-question") return /^(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z]):\s/.test(line) && text.slice(start, end).includes("?");
  if (scope === "mail-header") return !prefix && /^(?:From|To|Subject|Cc|Date):\s/i.test(line);
  if (scope === "transcript-marker") return !prefix && /^\[(?:Recording|Transcript)\s+(?:starts|ends)\]/i.test(line);
  const paragraphStart = text.slice(0, start).split(/\r?\n\s*\r?\n/).at(-1)?.trim() ?? "";
  if (scope === "faq-question") return !paragraphStart && line.includes("?");
  return (!paragraphStart || /^(?:[-*+]\s*|\d+[.)]\s*)$/.test(paragraphStart)) && /^(?:[-*+]\s|\d+[.)]\s)/.test(line);
}

export function toFinding(rule: RegisteredRule, matches: RuleFinding["matches"]): RuleFinding {
  return {
    rule: {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      determinism: rule.determinism,
      dimension: rule.dimension,
      source: rule.source,
      layer: rule.layer,
      guidance: rule.remediation.guidance,
      packId: rule.packId,
    },
    matches,
  };
}

export function analyzeWriting(text: string, rules: RegisteredRule[], options: { constraints?: TargetConstraint[]; permissions?: PatternPermission[] } = {}): WritingAnalysis {
  const ix = indexText(text);
  const metrics = computeMetrics(ix);
  const ctx = { ix, metrics };
  let findings: RuleFinding[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matches = detect(rule, ctx);
    if (matches.length) findings.push(toFinding(rule, matches));
  }
  if (options.constraints?.length) findings = applyPrecedence(findings, options.constraints, metrics);
  if (options.permissions?.length) {
    const candidateStructure = options.permissions.some((p) => p.documentType) ? classifyDocumentStructure(text) : null;
    const needsDashCheck = options.permissions.some((p) => p.scope === "list-dash-dominance");
    const bullets = needsDashCheck ? (text.match(/^\s*[-*+]\s/gm) ?? []).length : 0;
    const listDashesDominate = bullets >= 2 && bullets >= (text.match(/—|–/g) ?? []).length * 2;
    findings = findings.map((f) => {
      if (f.suppressedBy || f.rule.layer === "semantic-safety") return f;
      const permission = options.permissions?.find((p) => p.ruleId === f.rule.id &&
        (!p.documentType || (candidateStructure?.type === p.documentType && candidateStructure.confidence >= 0.8)) &&
        (!p.opening || f.matches.every((m) => text.slice(m.start, m.start + p.opening!.length).toLowerCase() === p.opening!.toLowerCase())) &&
        (!p.scope || (p.scope === "list-dash-dominance" ? listDashesDominate : f.matches.every((m) => structuralMatch(text, m.start, m.end, p.scope!)))));
      return permission ? { ...f, suppressedBy: { layer: permission.layer, reason: permission.reason } } : f;
    });
  }

  const active = findings.filter((f) => !f.suppressedBy);
  const bySeverity: Record<Severity, number> = { info: 0, suggestion: 0, warning: 0 };
  const byCategory: Partial<Record<RuleCategory, number>> = {};
  for (const f of active) {
    bySeverity[f.rule.severity]++;
    byCategory[f.rule.category] = (byCategory[f.rule.category] ?? 0) + 1;
  }
  return {
    metrics,
    findings,
    summary: {
      patternCount: active.filter((f) => f.rule.severity !== "info").length,
      matchCount: active.reduce((a, f) => a + f.matches.length, 0),
      byCategory,
      bySeverity,
      suppressedCount: findings.length - active.length,
    },
  };
}
