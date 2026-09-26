import type { RuleCategory, RuleFinding, Severity } from "@/domain/writing-rules";
import { detect } from "./detectors";
import { computeMetrics, type WritingMetrics } from "./metrics";
import type { RegisteredRule } from "./registry";
import { indexText } from "./text-index";
import { applyPrecedence, type TargetConstraint } from "./constraints";

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

export function analyzeWriting(text: string, rules: RegisteredRule[], options: { constraints?: TargetConstraint[] } = {}): WritingAnalysis {
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
