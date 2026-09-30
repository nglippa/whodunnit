import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V3, RECONSTRUCTION_V5 } from "../reconstruction/strategies";

export const V2_DISPOSITIONS = ["LEAVE_ALONE", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "AMBIGUOUS"] as const;
export const V2_CONCEPTS = ["GENERICNESS", "REDUNDANCY", "MECHANICAL_STRUCTURE", "REGISTER_INFLATION", "EMPTY_SIGNIFICANCE", "FORMULAIC_ARGUMENT", "LOCAL_WORDING", "VOICE", "GENRE_JUSTIFIED_STRUCTURE", "OTHER"] as const;
export const V2_GENRES = ["PROSE", "EMAIL", "CHAT", "TRANSCRIPT", "INTERVIEW", "FAQ", "PROCEDURE", "POLICY", "LIST", "NOTES", "MIXED", "UNKNOWN"] as const;
export const V2_BANDS = ["VERY_SHORT", "SHORT", "MEDIUM", "LONG"] as const;
const id = z.string().regex(/^[A-E]\d{3}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const disposition = z.enum(V2_DISPOSITIONS);
const genre = z.enum(V2_GENRES);
const concept = z.enum(V2_CONCEPTS);
export const v2DocumentSchema = z.object({ id, text: z.string().min(80) }).strict();
export const v2BriefSchema = z.object({ id, creatorId: z.enum(["A", "B", "C", "D", "E"]), requestedDisposition: disposition.exclude(["AMBIGUOUS"]), requestedConcepts: z.array(concept), requestedGenre: z.string().min(2), requestedLengthBand: z.enum([...V2_BANDS, "UNSET"]), briefRationale: z.string().min(5) }).strict();
export const v2ReviewSchema = z.object({ id, disposition, concepts: z.array(concept), genre, confidence: z.number().min(0).max(1), rationale: z.string().min(5).max(800) }).strict();
export const v2LabelSchema = z.object({ id, disposition, concepts: z.array(concept), genre: genre.nullable(), confidence: z.number().min(0).max(1), reviewerAgreement: z.boolean() }).strict();
export const v2DocumentsSchema = z.array(v2DocumentSchema).min(120).max(150);
export const v2ManifestSchema = z.object({ version: z.literal("2.0.0"), created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), marker: z.literal("FROZEN_HOLDOUT_DO_NOT_TUNE"), provenance: z.literal("synthetic-newly-authored"), documentCount: z.number().int().min(120).max(150), creatorIds: z.array(z.enum(["A", "B", "C", "D", "E"])).min(4).max(5), reviewerIds: z.tuple([z.literal("R1"), z.literal("R2")]), frozenBeforeEvaluation: z.literal(true), engineRevision: z.string().regex(/^[a-f0-9]{40}$/), engineSha256: sha, files: z.record(z.string(), sha), dispositionCounts: z.record(z.string(), z.number().int().nonnegative()), lengthCounts: z.record(z.string(), z.number().int().nonnegative()), genreCounts: z.record(z.string(), z.number().int().nonnegative()) }).strict();
export type V2Document = z.infer<typeof v2DocumentSchema>;
export type V2Brief = z.infer<typeof v2BriefSchema>;
export type V2Review = z.infer<typeof v2ReviewSchema>;
export type V2Label = z.infer<typeof v2LabelSchema>;
export type V2Band = typeof V2_BANDS[number];
export const v2Hash = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
export const v2Words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export const v2Band = (words: number): V2Band => words < 80 ? "VERY_SHORT" : words < 200 ? "SHORT" : words < 600 ? "MEDIUM" : "LONG";
const rate = (n: number, d: number) => d ? n / d : null;
const count = <T extends string>(values: T[]) => Object.fromEntries([...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]));
const exactIds = (expected: string[], actual: string[], name: string) => {
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some((x) => !expected.includes(x))) throw new Error(`${name} IDs differ from documents`);
};

export function adjudicateV2(documents: V2Document[], first: V2Review[], second: V2Review[]): V2Label[] {
  const ids = documents.map((d) => d.id);
  exactIds(ids, first.map((r) => r.id), "First review");
  exactIds(ids, second.map((r) => r.id), "Second review");
  const a = new Map(first.map((r) => [r.id, r]));
  const b = new Map(second.map((r) => [r.id, r]));
  return documents.map(({ id }) => {
    const left = a.get(id)!; const right = b.get(id)!;
    const agreed = left.disposition === right.disposition && left.disposition !== "AMBIGUOUS";
    return { id, disposition: agreed ? left.disposition : "AMBIGUOUS", concepts: left.concepts.filter((c) => right.concepts.includes(c)), genre: left.genre === right.genre ? left.genre : null, confidence: Math.min(left.confidence, right.confidence), reviewerAgreement: agreed };
  });
}

/** Exact-byte validation, with no engine import or execution. */
export function validateV2Freeze(raw: Record<string, string>) {
  const manifest = v2ManifestSchema.parse(JSON.parse(raw["manifest.json"]));
  const expected = ["documents.json", "briefs.json", "review-r1.json", "review-r2.json", "labels.json"];
  if (Object.keys(manifest.files).sort().join() !== expected.sort().join()) throw new Error("Unexpected frozen file set");
  for (const file of expected) if (v2Hash(raw[file]) !== manifest.files[file]) throw new Error(`Frozen fingerprint mismatch: ${file}`);
  const documents = v2DocumentsSchema.parse(JSON.parse(raw["documents.json"]));
  const briefs = z.array(v2BriefSchema).parse(JSON.parse(raw["briefs.json"]));
  const first = z.array(v2ReviewSchema).parse(JSON.parse(raw["review-r1.json"]));
  const second = z.array(v2ReviewSchema).parse(JSON.parse(raw["review-r2.json"]));
  const labels = z.array(v2LabelSchema).parse(JSON.parse(raw["labels.json"]));
  const ids = documents.map((d) => d.id);
  exactIds(ids, ids, "Document");
  exactIds(ids, briefs.map((x) => x.id), "Brief");
  exactIds(ids, labels.map((x) => x.id), "Label");
  if (new Set(documents.map((d) => d.text.trim())).size !== documents.length) throw new Error("Duplicate document text");
  if (briefs.some((b) => b.creatorId !== b.id[0])) throw new Error("Creator provenance mismatch");
  if (JSON.stringify([...new Set(briefs.map((b) => b.creatorId))].sort()) !== JSON.stringify([...manifest.creatorIds].sort())) throw new Error("Creator list mismatch");
  for (const group of [first, second, labels]) if (group.some((x) => new Set(x.concepts).size !== x.concepts.length)) throw new Error("Duplicate concept annotation");
  const derived = adjudicateV2(documents, first, second);
  if (JSON.stringify(derived) !== JSON.stringify(labels)) throw new Error("Gold labels do not match blind reviews");
  if (manifest.documentCount !== documents.length) throw new Error("Manifest document count mismatch");
  if (JSON.stringify(manifest.dispositionCounts) !== JSON.stringify(count(labels.map((x) => x.disposition)))) throw new Error("Manifest label count mismatch");
  if (JSON.stringify(manifest.lengthCounts) !== JSON.stringify(count(documents.map((x) => v2Band(v2Words(x.text)))))) throw new Error("Manifest length count mismatch");
  if (JSON.stringify(manifest.genreCounts) !== JSON.stringify(count(labels.map((x) => x.genre ?? "DISPUTED")))) throw new Error("Manifest genre count mismatch");
  return { manifest, documents, briefs, first, second, labels };
}

type Planned = "UNCHANGED" | "LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
type Finding = { id: string; family: string; severity: string; occurrences: number };
export interface V2Outcome {
  id: string; words: number; band: V2Band;
  v1: { wouldCallModel: boolean; actionable: number; findings: Finding[] };
  v3: { disposition: Planned; actionable: number; findings: Finding[]; permitted: string[] };
  v5: { disposition: Planned; scope: string; actionable: number; findings: Finding[]; permitted: string[]; structure: { type: string; confidence: number }; discourse: { phenomenon: string; action: string; support: { kind: string; count: number; total: number }[]; counterevidenceCount: number }[]; uncertainty: string | null };
  timingMs: { v1: number; v3: number; v5: number; total: number };
}
const planned = (plan: ReturnType<typeof buildRewritePlan>): Planned => plan.minimalChange.unchangedPreferred ? "UNCHANGED" : plan.intensity === "substantial" ? "SUBSTANTIVE_RECONSTRUCTION" : "LIGHT_EDIT";
const findings = (plan: ReturnType<typeof buildRewritePlan>): Finding[] => plan.analysis.findings.filter((f) => !f.suppressedBy && f.rule.severity !== "info").map((f) => ({ id: f.rule.id, family: f.rule.category, severity: f.rule.severity, occurrences: f.matches.length }));

/** Only document text enters the plans. Labels and creator briefs never cross this call. */
export function evaluateV2Text(text: string, id: string, now = () => performance.now()): V2Outcome {
  const started = now();
  const v1 = buildRewritePlan({ source: text, profile: PRESETS.natural }, RECONSTRUCTION_V1);
  const afterV1 = now();
  const v3 = buildRewritePlan({ source: text, profile: PRESETS.natural }, RECONSTRUCTION_V3);
  const afterV3 = now();
  const v5 = buildRewritePlan({ source: text, profile: PRESETS.natural }, RECONSTRUCTION_V5);
  const afterV5 = now();
  const words = v2Words(text);
  return { id, words, band: v2Band(words),
    v1: { wouldCallModel: !(RECONSTRUCTION_V1.minimalChange === "unchanged" && v1.minimalChange.unchangedPreferred), actionable: v1.avoid.length, findings: findings(v1) },
    v3: { disposition: planned(v3), actionable: v3.avoid.length, findings: findings(v3), permitted: v3.permitted.map((x) => x.ruleId) },
    v5: { disposition: planned(v5), scope: v5.changeScope ?? "UNAVAILABLE", actionable: v5.avoid.length + (v5.discourse?.findings.filter((f) => f.action !== "ADVISORY").length ?? 0), findings: findings(v5), permitted: v5.permitted.map((x) => x.ruleId), structure: { type: v5.discourse?.structure.type ?? "UNKNOWN", confidence: v5.discourse?.structure.confidence ?? 0 }, discourse: v5.discourse?.findings.map((f) => ({ phenomenon: f.phenomenon, action: f.action, support: f.supporting.map((s) => ({ kind: s.kind, count: s.count, total: s.total })), counterevidenceCount: f.counterevidence.length })) ?? [], uncertainty: v5.discourse?.uncertainty ?? null },
    timingMs: { v1: afterV1 - started, v3: afterV3 - afterV1, v5: afterV5 - afterV3, total: afterV5 - started } };
}

const timing = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const middle = Math.floor(s.length / 2);
  return {
    medianMs: !s.length ? null : s.length % 2 ? s[middle] : (s[middle - 1] + s[middle]) / 2,
    p95Ms: s[Math.ceil(s.length * .95) - 1] ?? null,
    worstMs: s.at(-1) ?? null,
  };
};
export function summarizeV2(outcomes: V2Outcome[], labels: V2Label[]) {
  const byId = new Map(labels.map((x) => [x.id, x]));
  exactIds(labels.map((x) => x.id), outcomes.map((x) => x.id), "Outcome");
  const solid = outcomes.filter((x) => byId.get(x.id)!.disposition !== "AMBIGUOUS");
  const clean = solid.filter((x) => byId.get(x.id)!.disposition === "LEAVE_ALONE");
  const edit = solid.filter((x) => byId.get(x.id)!.disposition !== "LEAVE_ALONE");
  const matrix = (which: "v3" | "v5") => Object.fromEntries(V2_DISPOSITIONS.map((gold) => [
    gold,
    Object.fromEntries(["UNCHANGED", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"].map((p) => [
      p, outcomes.filter((x) => byId.get(x.id)!.disposition === gold && x[which].disposition === p).length,
    ])),
  ]));
  // v3 is the historical local planner; a mere rule observation is not an edit decision.
  const local = (x: V2Outcome) => x.v3.disposition !== "UNCHANGED";
  const discourse = (x: V2Outcome) => x.v5.discourse.some((f) => f.action !== "ADVISORY");
  const detection = Object.fromEntries(["LOCAL_ONLY", "DISCOURSE_ONLY", "BOTH", "NEITHER"].map((kind) => [
    kind,
    solid.filter((x) => kind === (local(x) ? discourse(x) ? "BOTH" : "LOCAL_ONLY" : discourse(x) ? "DISCOURSE_ONLY" : "NEITHER")).map((x) => x.id),
  ]));
  const bands = Object.fromEntries(V2_BANDS.map((band) => {
    const rows = outcomes.filter((x) => x.band === band);
    const c = rows.filter((x) => byId.get(x.id)!.disposition === "LEAVE_ALONE");
    const e = rows.filter((x) => ["LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"].includes(byId.get(x.id)!.disposition));
    return [band, {
      count: rows.length,
      clean: c.length,
      cleanUnchanged: c.filter((x) => x.v5.disposition === "UNCHANGED").length,
      problematic: e.length,
      problematicEdited: e.filter((x) => x.v5.disposition !== "UNCHANGED").length,
      actionable: rows.reduce((n, x) => n + x.v5.actionable, 0),
      advisory: rows.reduce((n, x) => n + x.v5.discourse.filter((f) => f.action === "ADVISORY").length, 0),
      insufficient: rows.filter((x) => x.v5.uncertainty === "INSUFFICIENT_EVIDENCE").length,
      timing: {
        v1: timing(rows.map((x) => x.timingMs.v1)),
        v3: timing(rows.map((x) => x.timingMs.v3)),
        v5: timing(rows.map((x) => x.timingMs.v5)),
        total: timing(rows.map((x) => x.timingMs.total)),
      },
    }];
  }));
  const genreRows = outcomes.filter((x) => byId.get(x.id)!.genre !== null);
  const genreStats = (rows: V2Outcome[]) => ({ total: rows.length, correct: rows.filter((x) => x.v5.structure.type === byId.get(x.id)!.genre).length, accuracy: rate(rows.filter((x) => x.v5.structure.type === byId.get(x.id)!.genre).length, rows.length) });
  const discourseProxy: Partial<Record<typeof V2_CONCEPTS[number], string>> = {
    GENERICNESS: "GENERIC_REGISTER",
    REDUNDANCY: "POSSIBLE_RESTATEMENT",
    MECHANICAL_STRUCTURE: "MECHANICAL_STRUCTURE",
    REGISTER_INFLATION: "GENERIC_REGISTER",
  };
  const concepts = Object.fromEntries(V2_CONCEPTS.map((concept) => {
    const rows = edit.filter((x) => byId.get(x.id)!.concepts.includes(concept));
    const proxy = discourseProxy[concept];
    return [concept, {
      annotated: rows.length,
      v3Edited: rows.filter(local).length,
      v5Edited: rows.filter((x) => x.v5.disposition !== "UNCHANGED").length,
      relevantDiscourseProxy: proxy ? rows.filter((x) => x.v5.discourse.some((f) => f.phenomenon === proxy && f.action !== "ADVISORY")).length : null,
      proxyMeaning: proxy ?? "NO_DIRECT_DISCOURSE_PROXY",
    }];
  }));
  const mixed = solid.filter((x) => byId.get(x.id)!.concepts.some((c) => c === "VOICE" || c === "GENRE_JUSTIFIED_STRUCTURE"));
  return { counts: { documents: outcomes.length, unambiguous: solid.length, ambiguous: outcomes.length - solid.length, clean: clean.length, light: edit.filter((x) => byId.get(x.id)!.disposition === "LIGHT_EDIT").length, substantive: edit.filter((x) => byId.get(x.id)!.disposition === "SUBSTANTIVE_RECONSTRUCTION").length },
    v1: { modelPressureOnClean: clean.filter((x) => x.v1.wouldCallModel).length, actionableOnClean: clean.filter((x) => x.v1.actionable > 0).length },
    v3: { matrix: matrix("v3"), cleanUnchanged: clean.filter((x) => x.v3.disposition === "UNCHANGED").length, problematicEdited: edit.filter((x) => x.v3.disposition !== "UNCHANGED").length },
    v5: { matrix: matrix("v5"), cleanUnchanged: clean.filter((x) => x.v5.disposition === "UNCHANGED").length, problematicEdited: edit.filter((x) => x.v5.disposition !== "UNCHANGED").length, lightCorrect: edit.filter((x) => byId.get(x.id)!.disposition === "LIGHT_EDIT" && x.v5.disposition === "LIGHT_EDIT").length, substantiveCorrect: edit.filter((x) => byId.get(x.id)!.disposition === "SUBSTANTIVE_RECONSTRUCTION" && x.v5.disposition === "SUBSTANTIVE_RECONSTRUCTION").length },
    detection, bands, concepts,
    structure: { overall: genreStats(genreRows), highConfidence: genreStats(genreRows.filter((x) => x.v5.structure.confidence >= .8)), highConfidenceCoverage: rate(genreRows.filter((x) => x.v5.structure.confidence >= .8).length, genreRows.length), byGenre: Object.fromEntries(V2_GENRES.map((g) => [g, genreStats(genreRows.filter((x) => byId.get(x.id)!.genre === g))])) },
    mixed: { count: mixed.length, unchanged: mixed.filter((x) => x.v5.disposition === "UNCHANGED").length, substantive: mixed.filter((x) => x.v5.disposition === "SUBSTANTIVE_RECONSTRUCTION").length },
    cleanFalsePositiveIds: clean.filter((x) => x.v5.disposition !== "UNCHANGED").map((x) => x.id),
    problematicMissIds: edit.filter((x) => x.v5.disposition === "UNCHANGED").map((x) => x.id) };
}

export function reviewAgreement(documents: V2Document[], first: V2Review[], second: V2Review[]) {
  const secondById = new Map(second.map((x) => [x.id, x]));
  const rows = documents.map((d) => ({ id: d.id, band: v2Band(v2Words(d.text)), a: first.find((x) => x.id === d.id)!, b: secondById.get(d.id)! }));
  const calc = (subset: typeof rows) => ({ total: subset.length, dispositionAgreed: subset.filter((x) => x.a.disposition === x.b.disposition).length, rate: rate(subset.filter((x) => x.a.disposition === x.b.disposition).length, subset.length), conceptExactAgreed: subset.filter((x) => [...x.a.concepts].sort().join() === [...x.b.concepts].sort().join()).length, conceptJaccardMean: subset.length ? subset.reduce((n, x) => { const union = new Set([...x.a.concepts, ...x.b.concepts]); return n + (union.size ? x.a.concepts.filter((c) => x.b.concepts.includes(c)).length / union.size : 1); }, 0) / subset.length : null });
  return { overall: calc(rows), byLength: Object.fromEntries(V2_BANDS.map((band) => [band, calc(rows.filter((x) => x.band === band))])), byGenre: Object.fromEntries(V2_GENRES.map((genre) => [genre, calc(rows.filter((x) => x.a.genre === genre))])), genreDisagreement: rows.filter((x) => x.a.genre !== x.b.genre).map((x) => x.id), dispositionDisagreement: rows.filter((x) => x.a.disposition !== x.b.disposition).map((x) => x.id) };
}
