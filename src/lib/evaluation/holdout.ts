import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V3 } from "../reconstruction/strategies";
import { indexText } from "../rules/text-index";

export const holdoutConcepts = ["FORMULAIC", "VOICE_DEVICE", "LEGITIMATE_FORMALITY", "REDUNDANCY", "UNSUPPORTED_STRENGTH", "GENERIC_REGISTER", "MECHANICAL_STRUCTURE", "OTHER"] as const;
export const holdoutDisposition = z.enum(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"]);
export const holdoutDocumentSchema = z.object({
  id: z.string().regex(/^[CPM]\d{3}$/),
  cohort: z.enum(["clean", "problematic", "mixed"]),
  genre: z.string().min(2).max(100),
  text: z.string().min(100),
  provenance: z.literal("synthetic-newly-authored"),
}).strict();
export const holdoutLabelSchema = z.object({
  id: holdoutDocumentSchema.shape.id,
  disposition: holdoutDisposition,
  concepts: z.array(z.enum(holdoutConcepts)).max(8),
  rationale: z.string().min(10).max(800),
  ambiguous: z.boolean(),
}).strict();
export const holdoutDocumentsSchema = z.array(holdoutDocumentSchema).min(60).max(100);
export const holdoutLabelsSchema = z.array(holdoutLabelSchema);
export const holdoutManifestSchema = z.object({
  version: z.literal("1.0.0"),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  labelsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  provenance: z.literal("synthetic-newly-authored"),
  creatorRoles: z.array(z.string().min(1)).min(1),
  reviewerRole: z.string().min(1),
  frozenBeforeEvaluation: z.literal(true),
}).strict();

export type HoldoutDocument = z.infer<typeof holdoutDocumentSchema>;
export type HoldoutLabel = z.infer<typeof holdoutLabelSchema>;
export type HoldoutManifest = z.infer<typeof holdoutManifestSchema>;
export type PlannerDisposition = "UNCHANGED" | "LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
export type LengthBand = "VERY_SHORT" | "SHORT" | "MEDIUM" | "LONG";

export const sha256Bytes = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** A post-fix audit is comparable only when the exact frozen exam matches. */
export function assertComparableBaseline(baseline: unknown, manifest: HoldoutManifest) {
  const record = z.object({
    kind: z.literal("deterministic-holdout-audit"),
    run: z.literal("baseline-62259e8"),
    engineBaselineCommit: z.literal("62259e8"),
    holdoutVersion: z.string(),
    documentsSha256: z.string(),
    labelsSha256: z.string(),
  }).parse(baseline);
  if (record.holdoutVersion !== manifest.version || record.documentsSha256 !== manifest.documentsSha256 || record.labelsSha256 !== manifest.labelsSha256) {
    throw new Error("Post-fix exam differs from frozen baseline");
  }
}

/** Verify exact file bytes, then validate cross-file annotation integrity. */
export function validateFrozenHoldout(documentsRaw: string, labelsRaw: string, manifestRaw: string, reviewsRaw?: string) {
  const manifest = holdoutManifestSchema.parse(JSON.parse(manifestRaw));
  if (sha256Bytes(documentsRaw) !== manifest.documentsSha256) throw new Error("Holdout document fingerprint changed");
  if (sha256Bytes(labelsRaw) !== manifest.labelsSha256) throw new Error("Holdout label fingerprint changed");
  if (reviewsRaw !== undefined && sha256Bytes(reviewsRaw) !== manifest.reviewsSha256) throw new Error("Blind-review fingerprint changed");
  const documents = holdoutDocumentsSchema.parse(JSON.parse(documentsRaw));
  const labels = holdoutLabelsSchema.parse(JSON.parse(labelsRaw));
  const ids = new Set(documents.map((d) => d.id));
  if (ids.size !== documents.length || labels.length !== documents.length || new Set(labels.map((l) => l.id)).size !== labels.length || labels.some((l) => !ids.has(l.id))) {
    throw new Error("Holdout documents and labels must have unique, matching IDs");
  }
  if (new Set(documents.map((d) => d.text.trim())).size !== documents.length) throw new Error("Duplicate holdout document text");
  if (labels.some((l) => new Set(l.concepts).size !== l.concepts.length)) throw new Error("Duplicate concept annotation");
  for (const document of documents) {
    if (document.id[0] !== { clean: "C", problematic: "P", mixed: "M" }[document.cohort]) throw new Error(`Cohort/ID mismatch: ${document.id}`);
  }
  return { manifest, documents, labels };
}

export function lengthBand(words: number): LengthBand {
  if (words < 80) return "VERY_SHORT";
  if (words < 200) return "SHORT";
  if (words < 600) return "MEDIUM";
  return "LONG";
}

function unionLength(spans: [number, number][]): number {
  const ordered = spans.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = 0;
  for (const [a, b] of ordered) {
    total += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return total;
}

/** Evaluator metadata is excluded by construction: only source text enters planning. */
export function evaluateHoldoutText(source: string) {
  const start = performance.now();
  const v1 = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V1);
  const afterAnalysis = performance.now();
  const v3 = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V3);
  const end = performance.now();
  const active = v3.analysis.findings.filter((f) => !f.suppressedBy && f.rule.severity !== "info");
  const actionable = new Set(v3.avoid.map((a) => a.ruleId));
  const ix = indexText(source);
  const localized: [number, number][] = [];
  let documentWideFindings = 0;
  for (const finding of active.filter((f) => actionable.has(f.rule.id))) {
    for (const match of finding.matches) {
      if (match.start === 0 && match.end >= source.length) documentWideFindings++;
      else localized.push([match.start, match.end]);
    }
  }
  const targetedSentences = ix.sentences.filter((s) => localized.some(([a, b]) => s.start < b && s.end > a)).length;
  const voiceRules = { dashes: "slop.dash-density", fragments: "slop.dramatic-fragments", semicolons: "core.semicolon-density", repetition: "core.repeated-sentence-openers" } as const;
  const voiceConflicts = (Object.keys(voiceRules) as (keyof typeof voiceRules)[]).filter((device) => v3.sourceVoice.deliberate[device] && active.some((f) => f.rule.id === voiceRules[device]));
  const decision: PlannerDisposition = v3.minimalChange.unchangedPreferred ? "UNCHANGED" : v3.intensity === "substantial" ? "SUBSTANTIVE_RECONSTRUCTION" : "LIGHT_EDIT";
  return {
    words: v3.analysis.metrics.words,
    band: lengthBand(v3.analysis.metrics.words),
    v1WouldCallModel: true, // v1 has no unchanged bypass; this is pressure, not a measured rewrite.
    v1ActionableFindings: v1.avoid.length,
    planner: decision,
    actionableFindings: active.length,
    actionableMatches: active.reduce((n, f) => n + f.matches.length, 0),
    plannerPatterns: v3.avoid.length,
    advisoryFindings: v3.analysis.findings.filter((f) => !f.suppressedBy && f.rule.severity === "info").length,
    familyNames: v3.families.map((f) => f.name),
    ruleFindings: active.map((f) => ({ id: f.rule.id, family: f.rule.category, occurrences: f.matches.length })),
    permitted: v3.permitted.map((p) => p.ruleId),
    sourceVoice: { confidence: v3.sourceVoice.confidence, deliberate: v3.sourceVoice.deliberate, repeatedOpening: Boolean(v3.sourceVoice.repeatedOpening) },
    voiceConflicts,
    pressure: { localizedCharacters: unionLength(localized), localizedShare: source.length ? unionLength(localized) / source.length : 0, targetedSentences, totalSentences: ix.sentences.length, documentWideFindings },
    runtimeMs: { v1: afterAnalysis - start, v3: end - afterAnalysis, total: end - start },
  };
}

export type HoldoutResult = ReturnType<typeof evaluateHoldoutText> & { id: string; cohort: HoldoutDocument["cohort"] };
export function evaluateFrozenDocuments(documents: HoldoutDocument[]): HoldoutResult[] {
  return documents.map(({ id, cohort, text }) => ({ id, cohort, ...evaluateHoldoutText(text) }));
}

export function percentile(values: number[], percentileRank: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil((percentileRank / 100) * ordered.length) - 1];
}

export function summarizeHoldout(results: HoldoutResult[], labels: HoldoutLabel[]) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  if (results.some((r) => !byId.has(r.id))) throw new Error("Result has no gold label");
  const cells = Object.fromEntries(holdoutDisposition.options.map((gold) => [gold, { UNCHANGED: 0, LIGHT_EDIT: 0, SUBSTANTIVE_RECONSTRUCTION: 0 }]));
  const unambiguous = results.filter((r) => !byId.get(r.id)!.ambiguous);
  for (const r of unambiguous) cells[byId.get(r.id)!.disposition][r.planner]++;
  const clean = unambiguous.filter((r) => byId.get(r.id)!.disposition === "LEAVE_ALONE");
  const problematic = unambiguous.filter((r) => byId.get(r.id)!.disposition !== "LEAVE_ALONE");
  const byFamily: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  for (const r of clean) for (const f of r.ruleFindings) byFamily[f.family] = (byFamily[f.family] ?? 0) + 1;
  for (const r of clean) for (const f of r.ruleFindings) byRule[f.id] = (byRule[f.id] ?? 0) + 1;
  const namedFamilies = Object.fromEntries([...new Set(problematic.flatMap((r) => r.familyNames))].map((name) => [name, problematic.filter((r) => r.familyNames.includes(name)).length]));
  const bands = Object.fromEntries((["VERY_SHORT", "SHORT", "MEDIUM", "LONG"] as const).map((band) => {
    const inBand = results.filter((r) => r.band === band);
    const times = inBand.map((r) => r.runtimeMs.total);
    const bandClean = inBand.filter((r) => byId.get(r.id)?.disposition === "LEAVE_ALONE" && !byId.get(r.id)?.ambiguous);
    return [band, {
      count: inBand.length,
      clean: bandClean.length,
      cleanUnchanged: bandClean.filter((r) => r.planner === "UNCHANGED").length,
      cleanActionable: bandClean.filter((r) => r.actionableFindings > 0).length,
      actionableDocuments: inBand.filter((r) => r.actionableFindings > 0).length,
      actionablePer1000Words: inBand.reduce((n, r) => n + r.actionableFindings, 0) * 1000 / Math.max(1, inBand.reduce((n, r) => n + r.words, 0)),
      medianMs: percentile(times, 50), p95Ms: percentile(times, 95), worstMs: times.length ? Math.max(...times) : null,
    }];
  }));
  // Predeclared, deliberately coarse category proxies. A hit is possible evidence,
  // never proof of semantic recognition; unsupported strength needs a before/after.
  const conceptCategories: Partial<Record<(typeof holdoutConcepts)[number], string[]>> = {
    FORMULAIC: ["discourse", "transition", "sentence", "formatting"],
    REDUNDANCY: ["repetition", "discourse"],
    GENERIC_REGISTER: ["lexical", "specificity"],
    MECHANICAL_STRUCTURE: ["rhythm", "paragraph", "repetition"],
  };
  const conceptCoverage = Object.fromEntries(holdoutConcepts.map((concept) => {
    const categories = conceptCategories[concept];
    const annotated = problematic.filter((r) => byId.get(r.id)!.concepts.includes(concept));
    return [concept, {
      annotated: annotated.length,
      proxyApplicable: Boolean(categories),
      proxyHit: categories ? annotated.filter((r) => r.ruleFindings.some((f) => categories.includes(f.family))).length : null,
      missedIds: categories ? annotated.filter((r) => !r.ruleFindings.some((f) => categories.includes(f.family))).map((r) => r.id) : [],
    }];
  }));
  return {
    counts: { documents: results.length, unambiguous: unambiguous.length, ambiguous: results.length - unambiguous.length, clean: clean.length, problematic: problematic.length, cohorts: Object.fromEntries(["clean", "problematic", "mixed"].map((c) => [c, results.filter((r) => r.cohort === c).length])) },
    plannerMatrix: cells,
    clean: { actionableDocuments: clean.filter((r) => r.actionableFindings > 0).length, actionableFindings: clean.reduce((n, r) => n + r.actionableFindings, 0), unchanged: clean.filter((r) => r.planner === "UNCHANGED").length, v1ModelCalls: clean.filter((r) => r.v1WouldCallModel).length, localizedShareMean: clean.length ? clean.reduce((n, r) => n + r.pressure.localizedShare, 0) / clean.length : 0, voiceConflictDocuments: clean.filter((r) => r.voiceConflicts.length > 0).map((r) => r.id), findingsByCategory: byFamily, findingsByRule: byRule },
    problematic: { anyActionable: problematic.filter((r) => r.actionableFindings > 0).length, unchanged: problematic.filter((r) => r.planner === "UNCHANGED").length, namedFamilyDocuments: namedFamilies },
    pressure: {
      localizedDocuments: results.filter((r) => r.pressure.localizedCharacters > 0).length,
      localizedShareMean: results.length ? results.reduce((n, r) => n + r.pressure.localizedShare, 0) / results.length : 0,
      targetedSentences: results.reduce((n, r) => n + r.pressure.targetedSentences, 0),
      totalSentences: results.reduce((n, r) => n + r.pressure.totalSentences, 0),
      documentWideFindings: results.reduce((n, r) => n + r.pressure.documentWideFindings, 0),
    },
    conceptCoverage,
    mixed: { documents: results.filter((r) => r.cohort === "mixed").length, actionable: results.filter((r) => r.cohort === "mixed" && r.actionableFindings > 0).length, unchanged: results.filter((r) => r.cohort === "mixed" && r.planner === "UNCHANGED").length },
    bands,
    note: "No composite score. Concept coverage uses coarse category proxies; a hit does not prove that the annotated phenomenon was understood. Unsupported strength needs a before/after and is not measurable here. V1 model calls are inferred from strategy policy; no model ran.",
  };
}
