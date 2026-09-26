import type { PatternComparison } from "@/domain/document";
import type { WritingAnalysis } from "../rules/engine";
import { analyzeWriting } from "../rules/engine";
import { dimensionValue } from "../rules/constraints";
import { round } from "../rules/metrics";
import type { RewritePlan } from "./rewrite-plan";
import type { RegisteredRule } from "../rules/registry";

/**
 * After reconstruction the same rules run again on the candidate. The
 * comparison says which patterns were resolved, which remain, and which the
 * rewrite introduced, plus how measured targets moved. It is not a quality
 * score, and the pipeline does not chase zero: rules can conflict and natural
 * writing is not rule perfection.
 */

const activeCounts = (a: WritingAnalysis) => {
  const m = new Map<string, { name: string; count: number; determinism: string; severity: string }>();
  for (const f of a.findings) {
    if (f.suppressedBy || f.rule.severity === "info") continue;
    m.set(f.rule.id, { name: f.rule.name, count: f.matches.length, determinism: f.rule.determinism, severity: f.rule.severity });
  }
  return m;
};

export function comparePatterns(plan: RewritePlan, candidate: string, rules: RegisteredRule[]): PatternComparison {
  const after = analyzeWriting(candidate, rules, { constraints: plan.constraints });
  const b = activeCounts(plan.analysis);
  const a = activeCounts(after);
  const resolved: PatternComparison["resolved"] = [];
  const remaining: PatternComparison["remaining"] = [];
  const introduced: PatternComparison["introduced"] = [];
  for (const [id, x] of b) {
    const now = a.get(id)?.count ?? 0;
    if (now === 0) resolved.push({ ruleId: id, name: x.name, count: x.count });
    else remaining.push({ ruleId: id, name: x.name, count: now });
  }
  for (const [id, x] of a) {
    const was = b.get(id)?.count ?? 0;
    if (was === 0) introduced.push({ ruleId: id, name: x.name, count: x.count, deterministic: x.determinism === "deterministic" });
  }
  const targets = plan.targetRanges.map((t) => {
    const value = round(dimensionValue(after.metrics, t.dimension), 2);
    return { dimension: t.dimension, label: t.label, unit: t.unit, before: t.current, after: value, min: t.min, max: t.max, origin: t.origin, met: value >= t.min && value <= t.max };
  });
  return {
    before: plan.analysis.summary.patternCount,
    after: after.summary.patternCount,
    resolved,
    remaining,
    introduced,
    targets,
  };
}
