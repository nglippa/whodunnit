import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V5, RECONSTRUCTION_V6 } from "./strategies";
import { buildSemanticPlan, type SemanticReviewClient, type SemanticPlanningResult } from "./semantic-review";
import { classifyDocumentStructure, type DocumentType } from "../discourse/structure";

export const semanticDevelopmentCaseSchema = z.object({
  id: z.string().regex(/^s[a-e]\d{3}$/),
  text: z.string().min(20),
  genre: z.string().min(2),
  creator: z.string().min(1),
  requestedDisposition: z.enum(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "AMBIGUOUS"]),
  annotation: z.object({
    disposition: z.enum(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "AMBIGUOUS"]),
    concepts: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    safeToRewriteWithoutNewFacts: z.boolean(),
    missingInformation: z.array(z.string()),
    rationale: z.string().min(1),
    disagreement: z.object({ first: z.string(), second: z.string() }).strict().optional(),
  }).strict(),
}).strict();
export const semanticDevelopmentCorpusSchema = z.array(semanticDevelopmentCaseSchema).min(1).superRefine((cases, ctx) => {
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: "duplicate ID", path: [c.id] });
    ids.add(c.id);
  }
});
export type SemanticDevelopmentCase = z.infer<typeof semanticDevelopmentCaseSchema>;
type Disposition = SemanticDevelopmentCase["annotation"]["disposition"];
type Scope = "LEAVE_ALONE" | "LOCAL_EDIT" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
const scopeOf = (plan: ReturnType<typeof buildRewritePlan>): Scope => plan.changeScope === "UNCHANGED" || !plan.changeScope && plan.minimalChange.unchangedPreferred ? "LEAVE_ALONE" : plan.changeScope ?? "LOCAL_EDIT";
const bucket = (s: Scope) => s === "LEAVE_ALONE" ? "unchanged" : s === "SUBSTANTIVE_RECONSTRUCTION" ? "substantive" : "light";
const scopeRank = (s: Scope) => s === "LEAVE_ALONE" ? 0 : s === "SUBSTANTIVE_RECONSTRUCTION" ? 2 : 1;
const percentile = (xs: number[], p: number) => xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1] : null;
const REQUESTED_STRUCTURE: Partial<Record<string, DocumentType>> = {
  FAQ: "FAQ", INTERVIEW: "INTERVIEW", interview: "INTERVIEW", TRANSCRIPT: "TRANSCRIPT", CHAT: "CHAT",
  PROCEDURE: "PROCEDURE", POLICY: "POLICY", NOTES: "NOTES", EMAIL: "EMAIL",
  procedure: "PROCEDURE", "procedure excerpt": "PROCEDURE", "procedure notice": "PROCEDURE",
  "policy notice": "POLICY", "policy excerpt": "POLICY",
  "meeting minutes": "NOTES", "meeting notes": "NOTES", "meeting note": "NOTES", "meeting record": "NOTES", "committee minutes": "NOTES", "project notes": "NOTES",
  email: "EMAIL", "internal engineering email": "EMAIL", "personal email": "EMAIL",
};

export interface SemanticDevelopmentRow {
  id: string;
  disposition: Disposition;
  genre: string;
  lengthBand: "VERY_SHORT" | "SHORT" | "MEDIUM" | "LONG";
  v5: Scope;
  v6Deterministic: Scope;
  selectiveRouted: boolean;
  allReview?: Scope;
  selectiveReview?: Scope;
  allOutcome?: SemanticPlanningResult["telemetry"]["outcome"];
  selectiveOutcome?: SemanticPlanningResult["telemetry"]["outcome"];
  missingInformationRecognized?: boolean;
  latencyMs: number;
}
function structureSummary(cases: SemanticDevelopmentCase[], enhanced: boolean) {
  const known = cases.flatMap((c) => REQUESTED_STRUCTURE[c.genre] ? [{ expected: REQUESTED_STRUCTURE[c.genre]!, actual: classifyDocumentStructure(c.text, { enhanced }), formatted: c.text.includes("\n") }] : []);
  const confident = known.filter(({ actual }) => actual.confidence >= 0.8);
  const formatted = known.filter((x) => x.formatted);
  return {
    requestedGenreSubset: known.length,
    correct: known.filter(({ expected, actual }) => expected === actual.type).length,
    highConfidenceCount: confident.length,
    highConfidenceCorrect: confident.filter(({ expected, actual }) => expected === actual.type).length,
    formattedSubset: { total: formatted.length, correct: formatted.filter(({ expected, actual }) => expected === actual.type).length, highConfidenceCount: formatted.filter(({ actual }) => actual.confidence >= 0.8).length, highConfidenceCorrect: formatted.filter(({ expected, actual }) => actual.confidence >= 0.8 && expected === actual.type).length },
    byGenre: Object.fromEntries([...new Set(known.map(({ expected }) => expected))].map((genre) => [genre, {
      total: known.filter(({ expected }) => expected === genre).length,
      correct: known.filter(({ expected, actual }) => expected === genre && actual.type === expected).length,
      highConfidence: confident.filter(({ expected }) => expected === genre).length,
      highConfidenceCorrect: confident.filter(({ expected, actual }) => expected === genre && actual.type === expected).length,
    }])),
  };
}
function lengthBand(words: number): SemanticDevelopmentRow["lengthBand"] {
  return words < 80 ? "VERY_SHORT" : words < 200 ? "SHORT" : words < 600 ? "MEDIUM" : "LONG";
}
function summarize(rows: SemanticDevelopmentRow[], key: "v5" | "v6Deterministic" | "allReview" | "selectiveReview") {
  const eligible = rows.filter((r) => r.disposition !== "AMBIGUOUS" && r[key]);
  const clean = eligible.filter((r) => r.disposition === "LEAVE_ALONE");
  const problem = eligible.filter((r) => r.disposition === "LIGHT_EDIT" || r.disposition === "SUBSTANTIVE_RECONSTRUCTION");
  const light = eligible.filter((r) => r.disposition === "LIGHT_EDIT");
  const substantive = eligible.filter((r) => r.disposition === "SUBSTANTIVE_RECONSTRUCTION");
  return {
    evaluated: eligible.length,
    cleanUnchanged: clean.filter((r) => r[key] === "LEAVE_ALONE").length,
    cleanTotal: clean.length,
    problematicEdited: problem.filter((r) => r[key] !== "LEAVE_ALONE").length,
    problematicTotal: problem.length,
    lightCorrectScope: light.filter((r) => ["LOCAL_EDIT", "DISTRIBUTED_LIGHT_EDIT"].includes(r[key]!)).length,
    lightTotal: light.length,
    substantiveCorrectScope: substantive.filter((r) => r[key] === "SUBSTANTIVE_RECONSTRUCTION").length,
    substantiveTotal: substantive.length,
    dispositionMatrix: Object.fromEntries(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"].map((label) => [label, Object.fromEntries(["unchanged", "light", "substantive"].map((decision) => [decision, eligible.filter((r) => r.disposition === label && bucket(r[key]!) === decision).length]))])),
  };
}

/** Development only: no source text appears in rows or aggregate report. */
export async function evaluateSemanticDevelopment(cases: SemanticDevelopmentCase[], reviewer: SemanticReviewClient | null = null) {
  const rows: SemanticDevelopmentRow[] = [];
  for (const c of cases) {
    const started = performance.now();
    const input = { source: c.text, profile: PRESETS.natural };
    const v5 = buildRewritePlan(input, RECONSTRUCTION_V5);
    const v6 = buildRewritePlan(input, RECONSTRUCTION_V6);
    const deterministic = await buildSemanticPlan(input, null);
    const row: SemanticDevelopmentRow = {
      id: c.id, disposition: c.annotation.disposition, genre: c.genre,
      lengthBand: lengthBand(c.text.trim().split(/\s+/).length),
      v5: scopeOf(v5), v6Deterministic: scopeOf(v6), selectiveRouted: deterministic.route.requested,
      latencyMs: 0,
    };
    if (reviewer) {
      const all = await buildSemanticPlan(input, reviewer, { mode: "all" });
      const selective = deterministic.route.requested ? all : deterministic;
      row.allReview = all.finalScope;
      row.selectiveReview = selective.finalScope;
      row.allOutcome = all.telemetry.outcome;
      row.selectiveOutcome = selective.telemetry.outcome;
      row.missingInformationRecognized = c.annotation.safeToRewriteWithoutNewFacts ? undefined : Boolean(all.review?.missingInformation.length && !all.review.safeToRewriteWithoutNewFacts);
    }
    row.latencyMs = Math.round((performance.now() - started) * 100) / 100;
    rows.push(row);
  }
  const reviewed = rows.filter((r) => r.allReview);
  const changed = reviewed.filter((r) => r.v6Deterministic !== r.allReview);
  const report = {
    count: rows.length,
    labels: Object.fromEntries(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "AMBIGUOUS"].map((label) => [label, rows.filter((r) => r.disposition === label).length])),
    deterministic: { v5: summarize(rows, "v5"), v6: summarize(rows, "v6Deterministic") },
    routing: { selectiveCount: rows.filter((r) => r.selectiveRouted).length, allCount: rows.length },
    structure: { v5: structureSummary(cases, false), v6: structureSummary(cases, true) },
    ...(reviewer ? { semantic: {
      all: summarize(rows, "allReview"), selective: summarize(rows, "selectiveReview"),
      accepted: reviewed.filter((r) => r.allOutcome === "accepted").length,
      fallbacks: reviewed.filter((r) => r.allOutcome !== "accepted").length,
      escalations: changed.filter((r) => scopeRank(r.allReview!) > scopeRank(r.v6Deterministic)).length,
      deescalations: changed.filter((r) => scopeRank(r.allReview!) < scopeRank(r.v6Deterministic)).length,
      falseEscalations: changed.filter((r) => r.disposition === "LEAVE_ALONE" && scopeRank(r.allReview!) > scopeRank(r.v6Deterministic)).length,
      falseDeescalations: changed.filter((r) => r.disposition !== "LEAVE_ALONE" && scopeRank(r.allReview!) < scopeRank(r.v6Deterministic)).length,
      missingInformation: { recognized: rows.filter((r) => r.missingInformationRecognized).length, labeled: rows.filter((r) => r.missingInformationRecognized !== undefined).length },
    } } : {}),
    byLength: Object.fromEntries(["VERY_SHORT", "SHORT", "MEDIUM", "LONG"].map((band) => {
      const group = rows.filter((r) => r.lengthBand === band);
      return [band, { ...summarize(group, "v6Deterministic"), routed: group.filter((r) => r.selectiveRouted).length, latencyMs: { median: percentile(group.map((r) => r.latencyMs), 0.5), p95: percentile(group.map((r) => r.latencyMs), 0.95), worst: Math.max(0, ...group.map((r) => r.latencyMs)) } }];
    })),
  };
  return { rows, report };
}
