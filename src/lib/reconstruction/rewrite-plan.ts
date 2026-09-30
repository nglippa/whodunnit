import type { Refinement } from "@/domain/refinement";
import { REFINEMENT_LABELS } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import type { RewriteIntensity, RewriteStrategy } from "@/domain/strategy";
import type { DeterminismLevel, Dimension, RuleCategory, RuleLayer, Severity } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import { sourceVoiceProfile, type SourceVoiceProfile } from "../semantics/voice-devices";
import {
  DIMENSION_LABELS,
  constraintsFromSourceVoice,
  constraintsFromProfile,
  constraintsFromRefinement,
  constraintsFromVoiceprint,
  dimensionValue,
  resolveConstraints,
  type TargetConstraint,
} from "../rules/constraints";
import { analyzeWriting, type PatternPermission, type WritingAnalysis } from "../rules/engine";
import { getRegistry, rulesForProfile } from "../rules/packs";
import { round } from "../rules/metrics";
import type { ProtectedPhrase } from "@/domain/semantics";
import { RECONSTRUCTION_V1 } from "./strategies";
import { buildRefinementDelta, type RefinementDelta } from "./refinement-delta";
import { RULE_FAMILIES, activeFamilies, removableSpans } from "../rules/families";
import { blankDates, extractDates } from "../semantics/dates";
import { protectedPhrasesFor } from "../semantics/phrases";
import { countNegations, extractDateWords, extractLinks, extractNames, extractNumbers, extractQuotations } from "../verification/protected";
import { analyzeDiscourse, type DiscourseAnalysis } from "../discourse/analyze";
import { classifyDocumentStructure, structurePermission } from "../discourse/structure";
import type { SemanticReview } from "./semantic-review";

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
  determinism: DeterminismLevel;
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
  prohibitedPatterns: {
    ruleId: string;
    name: string;
    determinism: DeterminismLevel;
    category: RuleCategory;
    severity: Severity;
    /** true for rules that measure text shape (rates, rhythm, repetition) rather than a construction. */
    measure: boolean;
  }[];
  preferredPatterns: string[];
  advisoryGuidance: string[];
  refinement?: { asks: string[] };
  /**
   * Minimal-change decision: when nothing catalogued is wrong, nothing was
   * asked for, and the register already fits, the best rewrite is no rewrite.
   * Strategies with minimalChange "unchanged" return the source as it is.
   */
  minimalChange: { unchangedPreferred: boolean; reasons: string[] };
  /** Phrases to keep exactly or closely (author's list, quoted terms, recurring domain phrases). */
  protectedPhrases: ProtectedPhrase[];
  /** Rule families active in the source, with their guidance (paraphrasing a member is not a fix). */
  families: { id: string; name: string; guidance: string; rules: string[] }[];
  /** Source spans matched by removable families: filler a rewrite may delete outright. */
  removableSpans: [number, number][];
  /** The requested delta, for refinements. */
  refinementDelta: RefinementDelta | null;
  /** The source's own demonstrated habits (independent of a saved Voiceprint). */
  sourceVoice: Pick<SourceVoiceProfile, "confidence" | "deliberate" | "repeatedOpening" | "notes"> & { slopDensity: number };
  /** How much the text needs changing, from the measurements (see chooseIntensity). */
  intensity: RewriteIntensity;
  intensityReasons: string[];
  /** Experimental v5 editing scope. Advisory observations never force change. */
  changeScope?: "UNCHANGED" | "LOCAL_EDIT" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
  discourse?: DiscourseAnalysis;
  /** v6 only: validated editorial evidence, never a semantic-safety waiver. */
  semanticEditing?: { scope: "LOCAL_EDIT" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION"; findings: SemanticReview["findings"]; missingInformation: string[] };
  /** Which strategy compiled this plan, and what a prioritised budget left out (with reasons). */
  budget: { strategy: string; mode: RewriteStrategy["planning"]["mode"]; omitted: OmittedItem[] };
  /** The analysis the plan was built from (for post-checks). */
  analysis: WritingAnalysis;
  constraints: TargetConstraint[];
  /** Narrow, evidence-backed permissions applied in analysis and post-checks. */
  permissions: PatternPermission[];
}

export interface OmittedItem {
  section: "patterns" | "targets" | "prohibited" | "advisory";
  name: string;
  reason: string;
}

export interface PlanInput {
  source: string;
  profile: StyleProfile;
  refinement?: Refinement;
  voiceprint?: Voiceprint;
  /** The revision being refined (refinements only). */
  current?: string;
  /** Phrases the author asked to keep word for word. */
  protectedPhrases?: string[];
}

/** Rules that measure a punctuation or rhythm device: they never count toward "is this text templated?". */
const DEVICE_RULES = new Set(["slop.dash-density", "slop.dramatic-fragments", "core.semicolon-density", "core.uniform-sentence-length", "core.no-sentence-extremes", "core.repeated-sentence-openers"]);

/** Register dimensions: a mismatch here means the text does not fit the target yet. Rhythm is not one of them. */
const REGISTER_DIMENSIONS = new Set<Dimension>(["voice.contractions", "voice.first-person"]);

export function minimalChangeDecision(intensity: RewriteIntensity, targetRanges: TargetRange[], refinement?: Refinement): RewritePlan["minimalChange"] {
  const reasons: string[] = [];
  if (intensity !== "minimal") reasons.push(`intensity is ${intensity}`);
  if (refinement) reasons.push("the author asked for a refinement");
  const misfit = targetRanges.filter(
    (t) => t.action !== "keep" && (t.layer === "user-instruction" || (t.layer === "voiceprint" && t.strength >= 0.6) || (t.layer === "style" && REGISTER_DIMENSIONS.has(t.dimension))),
  );
  if (misfit.length) reasons.push(`register does not fit yet: ${misfit.map((t) => `${t.label} ${t.current} vs ${t.min}–${t.max}`).join("; ")}`);
  return reasons.length ? { unchangedPreferred: false, reasons } : { unchangedPreferred: true, reasons: ["no catalogued patterns, nothing requested, and the register already fits: leave the text as it is"] };
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

/**
 * Minimal-change principle: text with no catalogued patterns should come back
 * nearly as it went in, even though a model is available. A refinement or an
 * off-target confident Voiceprint is an explicit request for change.
 */
export function chooseIntensity(avoid: PatternToRework[], targetRanges: TargetRange[], refinement?: Refinement): { intensity: RewriteIntensity; reasons: string[] } {
  const reasons: string[] = [];
  const asks = refinement ? refinement.directives.filter((d) => d !== "keep_wording") : [];
  const userMoves = targetRanges.filter((t) => t.layer === "user-instruction" && t.action !== "keep");
  const voiceMoves = targetRanges.filter((t) => t.layer === "voiceprint" && t.strength >= 0.6 && t.action !== "keep");
  const occurrences = avoid.reduce((n, a) => n + a.occurrences, 0);
  const warnings = avoid.filter((a) => a.severity === "warning").length;

  if (avoid.length >= 6 || occurrences >= 10 || warnings >= 3) {
    reasons.push(`${avoid.length} catalogued patterns (${occurrences} occurrences, ${warnings} warnings)`);
    return { intensity: "substantial", reasons };
  }
  if (avoid.length > 0) reasons.push(`${avoid.length} catalogued pattern${avoid.length > 1 ? "s" : ""}`);
  if (asks.length > 0 || refinement?.note) reasons.push("the author asked for a change");
  if (userMoves.length) reasons.push(`requested range${userMoves.length > 1 ? "s" : ""} not met: ${userMoves.map((t) => t.label).join(", ")}`);
  if (voiceMoves.length) reasons.push(`off the author's Voiceprint: ${voiceMoves.map((t) => t.label).join(", ")}`);
  if (reasons.length) return { intensity: "normal", reasons };
  return { intensity: "minimal", reasons: ["no catalogued patterns and nothing the author asked for is out of range"] };
}

/** Constructions a rewrite tends to introduce, most likely first. */
const PROHIBIT_PRIORITY: RuleCategory[] = ["discourse", "specificity", "sentence", "lexical", "transition", "punctuation", "formatting", "voice", "paragraph", "repetition", "rhythm", "other", "semantic-safety"];
const SHAPE_CATEGORIES: RuleCategory[] = ["rhythm", "paragraph", "repetition"];
const DETERMINISM_PRIORITY: DeterminismLevel[] = ["deterministic", "heuristic", "model-assisted", "advisory"];

/**
 * Budget a plan by priority and relevance, never by truncating text:
 * semantic anchors and permitted habits are always kept; detected patterns are
 * ranked by severity, determinism and frequency; prohibitions favour the
 * phrase- and sentence-level constructions a rewrite most often introduces
 * (measures of text shape are already covered by target ranges); satisfied style ranges are not
 * restated; advisory guidance is dropped when the text needs little work.
 * Everything left out is recorded with a reason.
 */
export function prioritizePlan(plan: RewritePlan, strategy: RewriteStrategy): RewritePlan {
  if (strategy.planning.mode !== "prioritized") return plan;
  const policy = strategy.constraintPolicy;
  const omitted: OmittedItem[] = [];
  const cap = <T,>(items: T[], max: number | null, section: OmittedItem["section"], name: (t: T) => string, reason: string) => {
    if (max === null || items.length <= max) return items;
    for (const t of items.slice(max)) omitted.push({ section, name: name(t), reason });
    return items.slice(0, max);
  };

  const avoid = cap(
    [...plan.avoid].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        DETERMINISM_PRIORITY.indexOf(a.determinism) - DETERMINISM_PRIORITY.indexOf(b.determinism) ||
        b.occurrences - a.occurrences,
    ),
    policy.maxPatterns,
    "patterns",
    (a) => a.name,
    "lower priority than the patterns listed (severity, determinism, frequency)",
  );

  const minimal = strategy.planning.intensity === "enforce" && plan.intensity === "minimal";
  const targetRanges = plan.targetRanges.filter((t) => {
    if (t.layer !== "style") return true;
    if (t.action === "keep" && !policy.restateSatisfiedStyleRanges) {
      omitted.push({ section: "targets", name: t.label, reason: "already within the style range" });
      return false;
    }
    if (t.action !== "keep" && minimal) {
      omitted.push({ section: "targets", name: t.label, reason: "minimal intervention: a style-only range is not worth rewriting good text for" });
      return false;
    }
    return true;
  });

  const ranked = plan.prohibitedPatterns
    .filter((p) => {
      if (!p.measure) return true;
      omitted.push({ section: "prohibited", name: p.name, reason: "a measure of text shape, covered by target ranges and the post-check" });
      return false;
    })
    .sort(
      (a, b) =>
        PROHIBIT_PRIORITY.indexOf(a.category) - PROHIBIT_PRIORITY.indexOf(b.category) ||
        DETERMINISM_PRIORITY.indexOf(a.determinism) - DETERMINISM_PRIORITY.indexOf(b.determinism) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  const prohibitedPatterns = cap(ranked, policy.maxProhibited, "prohibited", (p) => p.name, "lower priority prohibition; still enforced by the post-check");

  let advisoryGuidance = plan.advisoryGuidance;
  if (policy.advisory === "never" || (policy.advisory === "unless-minimal" && minimal)) {
    for (const g of advisoryGuidance) omitted.push({ section: "advisory", name: g.split(":")[0], reason: minimal ? "minimal intervention" : "strategy omits advisory guidance" });
    advisoryGuidance = [];
  } else {
    advisoryGuidance = cap(advisoryGuidance, policy.maxAdvisory, "advisory", (g) => g.split(":")[0], "advisory budget");
  }

  return { ...plan, avoid, targetRanges, prohibitedPatterns, advisoryGuidance, budget: { ...plan.budget, omitted } };
}

/** How many items the contract carries, per section. Descriptive, for evaluation. */
export function planSize(plan: RewritePlan) {
  const p = plan.preserve;
  const anchors = p.numbers.length + p.dates.length + p.names.length + p.quotations.length + p.links.length;
  const size = {
    anchors,
    targets: plan.targetRanges.length,
    patterns: plan.avoid.length,
    permitted: plan.permitted.length,
    prohibited: plan.prohibitedPatterns.length,
    advisory: plan.advisoryGuidance.length,
    preferred: plan.preferredPatterns.length,
  };
  return { ...size, total: Object.values(size).reduce((a, b) => a + b, 0), omitted: plan.budget.omitted.length };
}

export function buildRewritePlan(input: PlanInput, strategy: RewriteStrategy = RECONSTRUCTION_V1): RewritePlan {
  const { source, profile, refinement } = input;
  const registry = getRegistry();
  const rules = rulesForProfile(profile, registry);
  const structure = strategy.planning.discourse ? classifyDocumentStructure(source, { enhanced: strategy.version >= 6 }) : undefined;
  const structurePermissions: PatternPermission[] = structure
    ? rules.flatMap((rule) => {
        const permission = structurePermission(structure, rule.id, source);
        return permission ? [{ ruleId: rule.id, layer: "source-voice" as const, ...permission }] : [];
      })
    : [];
  // Two passes: measure how templated the source is, then decide which devices are the author's habits.
  const baseConstraints = buildConstraints(input);
  const pre = analyzeWriting(source, rules, { constraints: baseConstraints, permissions: structurePermissions });
  const commonOpenerPermissions: PatternPermission[] = strategy.planning.discourse
    ? pre.findings.filter((finding) => ["core.repeated-sentence-openers", "core.repeated-paragraph-openers"].includes(finding.rule.id) && finding.matches.length > 0 && finding.matches.every((m) => /^(?:the|a|an)$/i.test(m.excerpt.trim())))
      .map((finding) => ({ ruleId: finding.rule.id, layer: "source-voice" as const, reason: "a repeated article alone does not establish a mechanical opening" }))
    : [];
  const headerPermissions: PatternPermission[] = strategy.planning.discourse && structure && ["EMAIL", "MIXED"].includes(structure.type) && structure.confidence >= 0.8
    ? pre.findings.filter((finding) => finding.rule.id === "slop.dramatic-fragments" && finding.matches.length > 0 && finding.matches.every((m) => /^(?:From|To|Subject|Cc|Date):/i.test(m.excerpt.trim())))
      .map((finding) => ({ ruleId: finding.rule.id, layer: "source-voice" as const, reason: "mail headers are document structure, not dramatic fragments", scope: "mail-header" as const, documentType: structure.type }))
    : [];
  const contextual = new Set([...commonOpenerPermissions, ...headerPermissions].map((p) => p.ruleId));
  const slopDensity = round((pre.findings.filter((f) => !f.suppressedBy && !contextual.has(f.rule.id) && f.rule.severity !== "info" && !DEVICE_RULES.has(f.rule.id)).length / Math.max(1, pre.metrics.words)) * 100, 2);
  const voice = sourceVoiceProfile(source, slopDensity);
  const openerFinding = pre.findings.find((f) => f.rule.id === "core.repeated-sentence-openers");
  const supportsOpening = (opening: string) => {
    const normalized = opening.trim().toLowerCase();
    return normalized.split(/\s+/).length >= 2 && Boolean(openerFinding?.matches.length) &&
      openerFinding!.matches.every((m) => source.slice(m.start, m.start + normalized.length).toLowerCase() === normalized);
  };
  const voiceOpening = strategy.planning.sourceVoice ? voice.repeatedOpening : null;
  const vpOpening = input.voiceprint?.stats && input.voiceprint.confidence >= 0.6
    ? input.voiceprint.stats.recurringOpeners.find(supportsOpening)
    : undefined;
  const voicePermissions: PatternPermission[] = vpOpening
    ? [{ ruleId: "core.repeated-sentence-openers", layer: "voiceprint", opening: vpOpening, reason: `Voiceprint “${input.voiceprint!.name}” accepts the recurring opening “${vpOpening}”.` }]
    : voiceOpening && supportsOpening(voiceOpening)
      ? [{ ruleId: "core.repeated-sentence-openers", layer: "source-voice", opening: voiceOpening, reason: `Source voice accepts the repeated opening “${voiceOpening}”.` }]
      : [];
  const permissions: PatternPermission[] = [...voicePermissions, ...structurePermissions, ...commonOpenerPermissions, ...headerPermissions];
  // The profile is always measured (evaluation reads it); only strategies that opt in let it shape the plan.
  const constraints = strategy.planning.sourceVoice ? [...baseConstraints, ...constraintsFromSourceVoice(voice, pre.metrics)] : baseConstraints;
  const analysis = analyzeWriting(source, rules, { constraints, permissions });
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
      determinism: f.rule.determinism,
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
    .map((r) => ({
      ruleId: r.id,
      name: r.name,
      determinism: r.determinism,
      category: r.category,
      severity: r.severity,
      measure: Boolean(r.dimension) || r.detection.kind === "metric" || r.detection.kind === "density" || SHAPE_CATEGORIES.includes(r.category),
    }));

  const advisoryGuidance = registry
    .query({ packIds: ["anti-slop", "core", "imported"], enabledOnly: true })
    .filter((r) => r.determinism === "advisory" || r.determinism === "model-assisted")
    .map((r) => `${r.name}: ${r.remediation.guidance}`);

  const vp = input.voiceprint?.stats;
  const preferredPatterns = vp ? [...vp.recurringPhrases.slice(0, 4).map((p) => `“${p}”`), ...vp.recurringOpeners.slice(0, 3).map((o) => `sentences opening with “${o}”`)] : [];
  if (strategy.planning.sourceVoice && voice.repeatedOpening && !preferredPatterns.some((p) => p.includes(`“${voice.repeatedOpening}”`)))
    preferredPatterns.push(`sentences opening with “${voice.repeatedOpening}”`);

  const srcWords = words(source).length;
  const safety = registry.query({ packIds: ["semantic-safety"], enabledOnly: true });
  const discourse = strategy.planning.discourse ? analyzeDiscourse(source, { profile, voiceprint: input.voiceprint, sourceVoice: voice, structure }) : undefined;
  const baseIntensity = chooseIntensity(avoid, targetRanges, refinement);
  const discourseAction = discourse?.findings.some((f) => f.action === "SUBSTANTIVE_RECONSTRUCTION")
    ? "SUBSTANTIVE_RECONSTRUCTION"
    : discourse?.findings.some((f) => f.action === "DISTRIBUTED_LIGHT_EDIT") ? "DISTRIBUTED_LIGHT_EDIT" : null;
  const intensity: RewriteIntensity = discourseAction === "SUBSTANTIVE_RECONSTRUCTION" ? "substantial"
    : discourseAction && baseIntensity.intensity === "minimal" ? "normal" : baseIntensity.intensity;
  const intensityReasons = discourseAction ? [...(baseIntensity.intensity === "minimal" ? [] : baseIntensity.reasons), `distributed ${discourse!.findings.filter((f) => f.action !== "ADVISORY").map((f) => f.phenomenon.toLowerCase().replaceAll("_", " ")).join(", ")} evidence`] : baseIntensity.reasons;
  const famActive = activeFamilies(analysis.findings, true);
  const families = RULE_FAMILIES.filter((f) => famActive.has(f.id)).map((f) => ({ id: f.id, name: f.name, guidance: f.guidance, rules: famActive.get(f.id)! }));
  const sourceDates = extractDates(source);
  const rest = blankDates(source, sourceDates);
  const plan: RewritePlan = {
    style: { label: profile.label, description: profile.description, register: profile.register, wordingRetention: profile.wordingRetention },
    preserve: {
      numbers: [...extractNumbers(rest).keys()],
      dates: [...sourceDates.map((d) => d.text), ...extractDateWords(rest).keys()],
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
    minimalChange: minimalChangeDecision(intensity, targetRanges, refinement),
    protectedPhrases: protectedPhrasesFor(source, { user: input.protectedPhrases, voiceprintPhrases: input.voiceprint?.stats?.recurringPhrases }),
    families,
    removableSpans: removableSpans(analysis.findings),
    sourceVoice: { confidence: voice.confidence, deliberate: voice.deliberate, repeatedOpening: voice.repeatedOpening, notes: voice.notes, slopDensity },
    refinementDelta: refinement ? buildRefinementDelta({ source, current: input.current, refinement, findings: analysis.findings }) : null,
    intensity,
    intensityReasons,
    ...(discourse ? { discourse, changeScope: intensity === "substantial" ? "SUBSTANTIVE_RECONSTRUCTION" : discourseAction ?? (intensity === "minimal" ? "UNCHANGED" : "LOCAL_EDIT") } : {}),
    budget: { strategy: `${strategy.id}-v${strategy.version}`, mode: strategy.planning.mode, omitted: [] },
    analysis,
    constraints,
    permissions,
  };
  return prioritizePlan(plan, strategy);
}

/** Short human-readable lines for the UI and the stored revision. */
export function summarizePlan(plan: RewritePlan): string[] {
  const lines: string[] = [];
  if (plan.refinement) lines.push(`Refine: ${plan.refinement.asks.join(", ")}; your original stays the reference for meaning`);
  for (const a of plan.avoid.slice(0, 4)) lines.push(`Rework: ${a.name}${a.occurrences > 1 ? ` (${a.occurrences}×)` : ""}`);
  for (const finding of plan.discourse?.findings.filter((f) => f.action !== "ADVISORY") ?? []) {
    if (finding.phenomenon === "GENERIC_REGISTER") lines.push(`Rework: broad framing across ${finding.paragraphIndices.length} paragraphs; keep the specific facts`);
  }
  for (const t of plan.targetRanges.filter((t) => t.action !== "keep").slice(0, 3)) {
    lines.push(`${t.action === "raise" ? "Raise" : "Lower"} ${t.label}: ${t.current} → ${t.min}–${t.max} (${t.origin})`);
  }
  for (const p of plan.permitted.slice(0, 2)) lines.push(`Keep: ${p.name}, which your ${p.reason.split(" accepts")[0]} accepts`);
  const kept = [plan.preserve.numbers.length && `${plan.preserve.numbers.length} figure${plan.preserve.numbers.length > 1 ? "s" : ""}`, plan.preserve.names.length && `${plan.preserve.names.length} name${plan.preserve.names.length > 1 ? "s" : ""}`, plan.preserve.quotations.length && `${plan.preserve.quotations.length} quotation${plan.preserve.quotations.length > 1 ? "s" : ""}`].filter(Boolean);
  if (kept.length) lines.push(`Protect ${kept.join(", ")}`);
  if (lines.length === 0) lines.push(`Adjust expression toward ${plan.style.label}; no catalogued patterns were found`);
  return lines.slice(0, 8);
}
