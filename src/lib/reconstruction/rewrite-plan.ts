import type { Refinement } from "@/domain/refinement";
import { REFINEMENT_LABELS } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import type { Dimension, RuleLayer, Severity } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import {
  DIMENSION_LABELS,
  constraintsFromProfile,
  constraintsFromRefinement,
  constraintsFromVoiceprint,
  dimensionValue,
  resolveConstraints,
  type TargetConstraint,
} from "../rules/constraints";
import { analyzeWriting, type WritingAnalysis } from "../rules/engine";
import { getRegistry, rulesForProfile } from "../rules/packs";
import { round } from "../rules/metrics";
import { countNegations, extractDateWords, extractLinks, extractNames, extractNumbers, extractQuotations } from "../verification/protected";

/**
 * The rewrite plan is compiled before any model call. It is the contract the
 * provider receives: what must survive, which measured targets to move
 * toward, which detected patterns to rework, and what must not be introduced.
 * Nothing in it is a whole source document or a free-form style essay.
 */

export interface TargetRange {
  dimension: Dimension;
  label: string;
  unit: string;
  current: number;
  min: number;
  max: number;
  origin: string;
  layer: RuleLayer;
  strength: number;
  action: "raise" | "lower" | "keep";
}

export interface PatternToRework {
  ruleId: string;
  name: string;
  severity: Severity;
  occurrences: number;
  examples: string[];
  guidance: string;
}

export interface RewritePlan {
  style: { label: string; description: string; register: StyleProfile["register"]; wordingRetention: StyleProfile["wordingRetention"] };
  preserve: { numbers: string[]; dates: string[]; names: string[]; quotations: string[]; links: string[]; negations: number };
  mustNotAlter: string[];
  lengthBudget: { minWords: number; maxWords: number };
  targetRanges: TargetRange[];
  /** Pressures that lost to a higher-precedence one (reported for transparency). */
  overridden: { dimension: Dimension; origin: string; by: string }[];
  avoid: PatternToRework[];
  /** Rules that fired but are deliberately permitted (e.g. by a strong Voiceprint). */
  permitted: { ruleId: string; name: string; reason: string }[];
  prohibitedPatterns: { ruleId: string; name: string }[];
  preferredPatterns: string[];
  advisoryGuidance: string[];
  refinement?: { asks: string[] };
  /** The analysis the plan was built from (for post-checks). */
  analysis: WritingAnalysis;
  constraints: TargetConstraint[];
}

export interface PlanInput {
  source: string;
  profile: StyleProfile;
  refinement?: Refinement;
  voiceprint?: Voiceprint;
}

const SEVERITY_ORDER: Record<Severity, number> = { warning: 0, suggestion: 1, info: 2 };
const shorten = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildConstraints(input: Omit<PlanInput, "source">): TargetConstraint[] {
  return [
    ...constraintsFromProfile(input.profile),
    ...(input.voiceprint ? constraintsFromVoiceprint(input.voiceprint) : []),
    ...constraintsFromRefinement(input.refinement),
  ];
}

export function buildRewritePlan(input: PlanInput): RewritePlan {
  const { source, profile, refinement } = input;
  const registry = getRegistry();
  const rules = rulesForProfile(profile, registry);
  const constraints = buildConstraints(input);
  const analysis = analyzeWriting(source, rules, { constraints });
  const { active, overridden } = resolveConstraints(constraints);

  const targetRanges: TargetRange[] = active.map((c) => {
    const current = round(dimensionValue(analysis.metrics, c.dimension), 2);
    return {
      dimension: c.dimension,
      label: DIMENSION_LABELS[c.dimension].label,
      unit: c.unit,
      current,
      min: c.min,
      max: c.max,
      origin: c.origin,
      layer: c.layer,
      strength: c.strength,
      action: current < c.min ? "raise" : current > c.max ? "lower" : "keep",
    };
  });

  const avoid: PatternToRework[] = analysis.findings
    .filter((f) => !f.suppressedBy && f.rule.severity !== "info")
    .sort((a, b) => SEVERITY_ORDER[a.rule.severity] - SEVERITY_ORDER[b.rule.severity] || b.matches.length - a.matches.length)
    .map((f) => ({
      ruleId: f.rule.id,
      name: f.rule.name,
      severity: f.rule.severity,
      occurrences: f.matches.length,
      examples: [...new Set(f.matches.map((m) => shorten(m.excerpt)))].slice(0, 2),
      guidance: f.rule.guidance,
    }));

  const permitted = analysis.findings
    .filter((f) => f.suppressedBy)
    .map((f) => ({ ruleId: f.rule.id, name: f.rule.name, reason: f.suppressedBy!.reason }));

  // Must not introduce: deterministic/heuristic rules in the active set that did not already fire.
  const fired = new Set(analysis.findings.map((f) => f.rule.id));
  const prohibitedPatterns = rules
    .filter((r) => (r.determinism === "deterministic" || r.determinism === "heuristic") && r.severity !== "info" && !fired.has(r.id))
    .map((r) => ({ ruleId: r.id, name: r.name }));

  const advisoryGuidance = registry
    .query({ packIds: ["anti-slop", "core", "imported"], enabledOnly: true })
    .filter((r) => r.determinism === "advisory" || r.determinism === "model-assisted")
    .map((r) => `${r.name}: ${r.remediation.guidance}`);

  const vp = input.voiceprint?.stats;
  const preferredPatterns = vp ? [...vp.recurringPhrases.slice(0, 4).map((p) => `“${p}”`), ...vp.recurringOpeners.slice(0, 3).map((o) => `sentences opening with “${o}”`)] : [];

  const srcWords = words(source).length;
  const safety = registry.query({ packIds: ["semantic-safety"], enabledOnly: true });
  return {
    style: { label: profile.label, description: profile.description, register: profile.register, wordingRetention: profile.wordingRetention },
    preserve: {
      numbers: [...extractNumbers(source).keys()],
      dates: [...extractDateWords(source).keys()],
      names: extractNames(source),
      quotations: extractQuotations(source).map((q) => shorten(q, 200)),
      links: extractLinks(source),
      negations: countNegations(source),
    },
    mustNotAlter: safety.filter((r) => r.severity === "warning").map((r) => `${r.name}: ${r.remediation.guidance}`),
    lengthBudget: { minWords: Math.floor(srcWords * profile.lengthRatio.min), maxWords: Math.ceil(srcWords * profile.lengthRatio.max) },
    targetRanges,
    overridden: overridden.map((o) => ({ dimension: o.constraint.dimension, origin: o.constraint.origin, by: o.by.origin })),
    avoid,
    permitted,
    prohibitedPatterns,
    preferredPatterns,
    advisoryGuidance,
    refinement: refinement ? { asks: [...refinement.directives.map((d) => REFINEMENT_LABELS[d]), ...(refinement.note ? [`Author's note: ${refinement.note}`] : [])] } : undefined,
    analysis,
    constraints,
  };
}

/** Short human-readable lines for the UI and the stored revision. */
export function summarizePlan(plan: RewritePlan): string[] {
  const lines: string[] = [];
  if (plan.refinement) lines.push(`Refine: ${plan.refinement.asks.join(", ")}; your original stays the reference for meaning`);
  for (const a of plan.avoid.slice(0, 4)) lines.push(`Rework: ${a.name}${a.occurrences > 1 ? ` (${a.occurrences}×)` : ""}`);
  for (const t of plan.targetRanges.filter((t) => t.action !== "keep").slice(0, 3)) {
    lines.push(`${t.action === "raise" ? "Raise" : "Lower"} ${t.label}: ${t.current} → ${t.min}–${t.max} (${t.origin})`);
  }
  for (const p of plan.permitted.slice(0, 2)) lines.push(`Keep: ${p.name}, which your ${p.reason.split(" accepts")[0]} accepts`);
  const kept = [plan.preserve.numbers.length && `${plan.preserve.numbers.length} figure${plan.preserve.numbers.length > 1 ? "s" : ""}`, plan.preserve.names.length && `${plan.preserve.names.length} name${plan.preserve.names.length > 1 ? "s" : ""}`, plan.preserve.quotations.length && `${plan.preserve.quotations.length} quotation${plan.preserve.quotations.length > 1 ? "s" : ""}`].filter(Boolean);
  if (kept.length) lines.push(`Protect ${kept.join(", ")}`);
  if (lines.length === 0) lines.push(`Adjust expression toward ${plan.style.label}; no catalogued patterns were found`);
  return lines.slice(0, 8);
}
