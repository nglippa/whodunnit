import { performance } from "node:perf_hooks";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { analyzeDiscourse, type DiscourseAnalysis, type DiscoursePhenomenon } from "./analyze";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { STRATEGIES } from "@/lib/reconstruction/strategies";
import type { RewriteStrategy } from "@/domain/strategy";

const genre = z.enum(["PROSE", "EMAIL", "CHAT", "TRANSCRIPT", "INTERVIEW", "FAQ", "PROCEDURE", "POLICY", "LIST", "NOTES", "MIXED", "UNKNOWN"]);
const disposition = z.enum(["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"]);
const phenomenon = z.enum(["GENERICNESS", "REGISTER_CLUSTER", "REDUNDANCY", "MECHANICAL_STRUCTURE", "LEGITIMATE_STRUCTURE", "VOICE_DEVICE"]);
export const developmentCaseSchema = z.object({
  id: z.string().min(1), pairId: z.string().min(1), variant: z.enum(["A", "B"]),
  genre, text: z.string().min(1), disposition, phenomena: z.array(phenomenon),
  rationale: z.string().min(1), provenance: z.string().min(1),
}).strict();
export const developmentCorpusSchema = z.array(developmentCaseSchema).min(1);
export type DevelopmentCase = z.infer<typeof developmentCaseSchema>;

type Label = z.infer<typeof disposition>;
type Phenomenon = z.infer<typeof phenomenon>;
type Planned = "LEAVE_ALONE" | "LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
const EXPECTED: Record<DiscoursePhenomenon, readonly Phenomenon[]> = {
  GENERIC_REGISTER: ["GENERICNESS", "REGISTER_CLUSTER"],
  POSSIBLE_RESTATEMENT: ["REDUNDANCY"],
  MECHANICAL_STRUCTURE: ["MECHANICAL_STRUCTURE"],
};
const classified = (analysis: DiscourseAnalysis): Planned => {
  if (analysis.findings.some((f) => f.action === "SUBSTANTIVE_RECONSTRUCTION")) return "SUBSTANTIVE_RECONSTRUCTION";
  if (analysis.findings.some((f) => f.action === "DISTRIBUTED_LIGHT_EDIT")) return "LIGHT_EDIT";
  return "LEAVE_ALONE";
};
const planned = (plan: ReturnType<typeof buildRewritePlan>): Planned => {
  if (plan.minimalChange.unchangedPreferred) return "LEAVE_ALONE";
  return plan.intensity === "substantial" ? "SUBSTANTIVE_RECONSTRUCTION" : "LIGHT_EDIT";
};
const rate = (n: number, d: number) => d ? n / d : null;
const counts = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
const percentile = (sorted: number[], q: number) => sorted[Math.ceil(q * sorted.length) - 1] ?? null;
const timing = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return { count: sorted.length, medianMs: sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null,
    p95Ms: percentile(sorted, 0.95), worstMs: sorted.at(-1) ?? null };
};
const lengthBucket = (words: number) => words < 100 ? "under100" : words < 300 ? "100to299" : "300plus";

/** Injected functions make calculations testable without provider imports or calls. */
export function evaluateDevelopmentCorpus(cases: DevelopmentCase[], options: {
  analyze?: typeof analyzeDiscourse;
  plan?: typeof buildRewritePlan;
  strategy?: RewriteStrategy | null;
  now?: () => number;
} = {}) {
  const analyze = options.analyze ?? analyzeDiscourse;
  const makePlan = options.plan ?? buildRewritePlan;
  const strategy = options.strategy === undefined ? STRATEGIES.find((s) => s.id === "reconstruction" && s.version === 5 && s.status === "experimental") ?? null : options.strategy;
  const now = options.now ?? (() => performance.now());
  const seen = new Set<string>();
  const pairs = new Map<string, Partial<Record<"A" | "B", { expected: Label; finding: Planned; planner: Planned | null }>>>();
  const byDisposition = Object.fromEntries(disposition.options.map((d) => [d, { documents: 0, findings: 0, trueFindings: 0, covered: 0, plannerCorrect: 0 }])) as Record<Label, { documents: number; findings: number; trueFindings: number; covered: number; plannerCorrect: number }>;
  const byPhenomenon = Object.fromEntries(["GENERICNESS", "REGISTER_CLUSTER", "REDUNDANCY", "MECHANICAL_STRUCTURE"].map((p) => [p, { documents: 0, covered: 0 }])) as Record<string, { documents: number; covered: number }>;
  const genreCounts = counts(genre.options);
  const genreCorrect = counts(genre.options);
  const genreConfident = counts(genre.options);
  const lengthTimes: Record<string, number[]> = { under100: [], "100to299": [], "300plus": [] };
  const plannerMatrix: Record<Label, Record<Planned, number>> = Object.fromEntries(disposition.options.map((label) => [label, counts(disposition.options)])) as Record<Label, Record<Planned, number>>;
  let known = 0, correct = 0, confident = 0, confidentCorrect = 0, findings = 0, actionable = 0, trueFindings = 0, covered = 0, clean = 0, restrained = 0, plannerCorrect = 0;
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error("Duplicate case id");
    seen.add(c.id);
    genreCounts[c.genre]++;
    const started = now();
    const result = analyze(c.text);
    const plan = strategy ? makePlan({ source: c.text, profile: PRESETS.natural }, strategy) : null;
    lengthTimes[lengthBucket(result.words)].push(now() - started);
    const predicted = classified(result);
    const plannerPrediction = plan ? planned(plan) : null;
    const target = byDisposition[c.disposition];
    target.documents++;
    if (result.structure.type !== "UNKNOWN") { known++; if (result.structure.type === c.genre) { correct++; genreCorrect[c.genre]++; } }
    if (result.structure.confidence >= 0.8) { confident++; genreConfident[c.genre]++; if (result.structure.type === c.genre) confidentCorrect++; }
    for (const f of result.findings) {
      findings++; target.findings++;
      if (f.action !== "ADVISORY") actionable++;
      if (EXPECTED[f.phenomenon].some((p) => c.phenomena.includes(p)) && c.disposition !== "LEAVE_ALONE") { trueFindings++; target.trueFindings++; }
    }
    if (result.findings.length) { covered++; target.covered++; }
    if (c.disposition === "LEAVE_ALONE") { clean++; if (predicted === "LEAVE_ALONE") restrained++; }
    for (const [p, v] of Object.entries(byPhenomenon)) if (c.phenomena.includes(p as Phenomenon)) {
      v.documents++;
      if (result.findings.some((f) => EXPECTED[f.phenomenon].includes(p as Phenomenon))) v.covered++;
    }
    if (plannerPrediction === c.disposition) { plannerCorrect++; target.plannerCorrect++; }
    if (plannerPrediction) plannerMatrix[c.disposition][plannerPrediction]++;
    const pair = pairs.get(c.pairId) ?? {};
    if (pair[c.variant]) throw new Error("Duplicate pair variant");
    pair[c.variant] = { expected: c.disposition, finding: predicted, planner: plannerPrediction };
    pairs.set(c.pairId, pair);
  }
  let completePairs = 0, contrastivePairs = 0, findingOrdered = 0, plannerOrdered = 0;
  const rank: Record<Planned, number> = { LEAVE_ALONE: 0, LIGHT_EDIT: 1, SUBSTANTIVE_RECONSTRUCTION: 2 };
  for (const pair of pairs.values()) {
    if (!pair.A || !pair.B) continue;
    completePairs++;
    const sign = Math.sign(rank[pair.B.expected] - rank[pair.A.expected]);
    if (sign === 0) continue;
    contrastivePairs++;
    if (Math.sign(rank[pair.B.finding] - rank[pair.A.finding]) === sign) findingOrdered++;
    if (pair.A.planner && pair.B.planner && Math.sign(rank[pair.B.planner] - rank[pair.A.planner]) === sign) plannerOrdered++;
  }
  return {
    cases: cases.length,
    structure: { known, coverage: rate(known, cases.length), correct, accuracyOnKnown: rate(correct, known), confident, confidentCorrect, accuracyWhenConfident: rate(confidentCorrect, confident), byGenre: Object.fromEntries(genre.options.map((g) => [g, { total: genreCounts[g], correct: genreCorrect[g], confident: genreConfident[g] }])) },
    findings: { count: findings, actionable, advisory: findings - actionable, trueFindings, precision: rate(trueFindings, findings), documentsWithFindings: covered,
      byDisposition: Object.fromEntries(Object.entries(byDisposition).map(([key, v]) => [key, { ...v, precision: rate(v.trueFindings, v.findings), coverage: rate(v.covered, v.documents) }])),
      byPhenomenon: Object.fromEntries(Object.entries(byPhenomenon).map(([key, v]) => [key, { ...v, coverage: rate(v.covered, v.documents) }])),
    },
    cleanRestraint: { total: clean, restrained, rate: rate(restrained, clean) },
    problematicCoverage: { total: cases.length - clean, covered: byDisposition.LIGHT_EDIT.covered + byDisposition.SUBSTANTIVE_RECONSTRUCTION.covered, rate: rate(byDisposition.LIGHT_EDIT.covered + byDisposition.SUBSTANTIVE_RECONSTRUCTION.covered, cases.length - clean) },
    planner: { strategy: strategy ? `${strategy.id}-v${strategy.version}` : null, available: Boolean(strategy), correct: strategy ? plannerCorrect : null, matrix: strategy ? plannerMatrix : null,
      accuracy: strategy ? rate(plannerCorrect, cases.length) : null,
      byDisposition: strategy ? Object.fromEntries(Object.entries(byDisposition).map(([key, v]) => [key, { correct: v.plannerCorrect, total: v.documents, accuracy: rate(v.plannerCorrect, v.documents) }])) : null },
    pairs: { complete: completePairs, contrastive: contrastivePairs, nonContrastive: completePairs - contrastivePairs, incomplete: pairs.size - completePairs, findingOrdered, findingAgreement: rate(findingOrdered, contrastivePairs),
      plannerOrdered: strategy ? plannerOrdered : null, plannerAgreement: strategy ? rate(plannerOrdered, contrastivePairs) : null },
    performance: { scope: strategy ? "analysis-and-planning" : "analysis-only", byLength: Object.fromEntries(Object.entries(lengthTimes).map(([key, values]) => [key, timing(values)])) },
  };
}
