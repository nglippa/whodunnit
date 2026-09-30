/** Synthetic holdout only. This CLI never imports providers or sends text to a service. */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import {
  assertComparableBaseline, evaluateFrozenDocuments, holdoutDocumentSchema, holdoutLabelSchema,
  sha256Bytes, summarizeHoldout, validateFrozenHoldout,
} from "../../src/lib/evaluation/holdout";

const root = process.cwd();
const base = path.join(root, "data/evaluation/holdout");
const frozen = path.join(base, "frozen");
const reports = path.join(base, "reports");
const read = (name: string) => readFileSync(path.join(frozen, name), "utf8");
const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;
const writeNew = (name: string, value: string) => writeFileSync(name, value, { flag: "wx" });

const draftSchema = holdoutDocumentSchema.extend({
  disposition: holdoutLabelSchema.shape.disposition,
  concepts: holdoutLabelSchema.shape.concepts,
  rationale: holdoutLabelSchema.shape.rationale,
});
const reviewsSchema = z.array(z.object({
  id: holdoutDocumentSchema.shape.id,
  disposition: holdoutLabelSchema.shape.disposition,
  concepts: holdoutLabelSchema.shape.concepts,
  rationale: holdoutLabelSchema.shape.rationale,
}).strict()).min(20);

function drafts() {
  return ["clean.json", "challenging.json", "long-supplement.json"].flatMap((name) => z.array(draftSchema).parse(JSON.parse(readFileSync(path.join(base, "drafts", name), "utf8"))));
}

function sample() {
  const all = drafts();
  const quota = { clean: 16, problematic: 8, mixed: 8 } as const;
  const selected = (Object.keys(quota) as (keyof typeof quota)[]).flatMap((cohort) => {
    const cohortDocs = all.filter((d) => d.cohort === cohort).sort((a, b) => a.id.localeCompare(b.id));
    const count = Math.min(quota[cohort], cohortDocs.length);
    return Array.from({ length: count }, (_, i) => {
      const d = cohortDocs[Math.floor(((i + 0.5) * cohortDocs.length) / count)];
      return { id: d.id, text: d.text };
    });
  });
  const output = path.join(base, "drafts", "review-sample.json");
  writeNew(output, json(selected));
  process.stdout.write(`Blind sample: ${selected.length} documents, no labels: ${output}\n`);
}

function freeze() {
  const allDrafts = drafts();
  const reviews = reviewsSchema.parse([
    ...JSON.parse(readFileSync(path.join(base, "drafts", "blind-review.json"), "utf8")),
    ...JSON.parse(readFileSync(path.join(base, "drafts", "blind-review-supplement.json"), "utf8")),
  ]);
  const byReview = new Map(reviews.map((r) => [r.id, r]));
  const sample = z.array(z.object({ id: holdoutDocumentSchema.shape.id, text: z.string() }).strict()).parse([
    ...JSON.parse(readFileSync(path.join(base, "drafts", "review-sample.json"), "utf8")),
    ...JSON.parse(readFileSync(path.join(base, "drafts", "review-supplement-sample.json"), "utf8")),
  ]);
  const sampleIds = sample.map((s) => s.id);
  if (new Set(sampleIds).size !== sampleIds.length || sample.some((s) => allDrafts.find((d) => d.id === s.id)?.text !== s.text)) throw new Error("Blind sample differs from authored documents");
  if (reviews.length !== sampleIds.length || sampleIds.some((id) => !byReview.has(id))) throw new Error("Blind review must cover the complete preselected sample");
  if (byReview.size !== reviews.length || reviews.some((r) => !allDrafts.some((d) => d.id === r.id))) throw new Error("Blind review IDs must be unique and present in drafts");
  if (allDrafts.length < 60 || allDrafts.length > 100) throw new Error("Holdout size outside 60–100");
  const documents = allDrafts.map(({ id, cohort, genre, text, provenance }) => ({ id, cohort, genre, text, provenance }));
  if (new Set(documents.map((d) => d.text.trim())).size !== documents.length) throw new Error("Duplicate holdout document text");
  const labels = allDrafts.map(({ id, disposition, concepts, rationale }) => {
    const other = byReview.get(id);
    return { id, disposition, concepts, rationale, ambiguous: Boolean(other && other.disposition !== disposition) };
  });
  const documentsRaw = json(documents);
  const labelsRaw = json(labels);
  const reviewsRaw = json(reviews);
  const manifestRaw = json({
    version: "1.0.0", created: new Date().toISOString().slice(0, 10),
    documentsSha256: sha256Bytes(documentsRaw), labelsSha256: sha256Bytes(labelsRaw), reviewsSha256: sha256Bytes(reviewsRaw),
    provenance: "synthetic-newly-authored", creatorRoles: ["blind clean corpus creator", "blind challenging corpus creator", "blind long-form corpus creator"],
    reviewerRole: "blind independent annotation reviewers", frozenBeforeEvaluation: true,
  });
  // Validate before writing and refuse to overwrite an existing frozen exam.
  validateFrozenHoldout(documentsRaw, labelsRaw, manifestRaw, reviewsRaw);
  mkdirSync(frozen, { recursive: true });
  if (["documents.json", "labels.json", "blind-review.json", "manifest.json"].some((name) => existsSync(path.join(frozen, name)))) throw new Error("Frozen holdout already exists; refusing overwrite");
  writeNew(path.join(frozen, "documents.json"), documentsRaw);
  writeNew(path.join(frozen, "labels.json"), labelsRaw);
  writeNew(path.join(frozen, "blind-review.json"), reviewsRaw);
  writeNew(path.join(frozen, "manifest.json"), manifestRaw);
  process.stdout.write(`Frozen ${documents.length} documents. Documents ${sha256Bytes(documentsRaw)} Labels ${sha256Bytes(labelsRaw)}\n`);
}

function run(name: string) {
  if (!["baseline-62259e8", "post-fix"].includes(name)) throw new Error("Expected baseline-62259e8 or post-fix");
  const output = path.join(reports, `${name}.json`);
  if (existsSync(output)) throw new Error(`${name} already exists; refusing a repeat holdout run`);
  if (name === "baseline-62259e8") {
    const scope = ["src/lib", "src/domain", "data/rules/packs"];
    const changed = execFileSync("git", ["diff", "--name-only", "62259e8", "--", ...scope], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...scope], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    const permitted = new Set(["src/lib/evaluation/holdout.ts", "src/lib/evaluation/holdout.test.ts"]);
    if ([...changed, ...untracked].some((file) => !permitted.has(file))) throw new Error("Baseline requires the untouched 62259e8 writing engine and its domain dependencies");
  }
  const { manifest, documents, labels } = validateFrozenHoldout(read("documents.json"), read("labels.json"), read("manifest.json"), read("blind-review.json"));
  if (name === "post-fix") {
    const baselinePath = path.join(reports, "baseline-62259e8.json");
    if (!existsSync(baselinePath)) throw new Error("Post-fix requires the frozen baseline report");
    assertComparableBaseline(JSON.parse(readFileSync(baselinePath, "utf8")), manifest);
  }
  const reviews = reviewsSchema.parse(JSON.parse(read("blind-review.json")));
  const goldById = new Map(labels.map((l) => [l.id, l]));
  const agreement = {
    reviewed: reviews.length,
    dispositionAgreement: reviews.filter((r) => goldById.get(r.id)?.disposition === r.disposition).length,
    conceptExactAgreement: reviews.filter((r) => JSON.stringify([...goldById.get(r.id)!.concepts].sort()) === JSON.stringify([...r.concepts].sort())).length,
    conceptDisagreementIds: reviews.filter((r) => JSON.stringify([...goldById.get(r.id)!.concepts].sort()) !== JSON.stringify([...r.concepts].sort())).map((r) => r.id),
    dispositionDisagreements: reviews.filter((r) => goldById.get(r.id)?.disposition !== r.disposition).map((r) => ({ id: r.id, creator: goldById.get(r.id)?.disposition, reviewer: r.disposition })),
  };
  const results = evaluateFrozenDocuments(documents);
  const report = {
    kind: "deterministic-holdout-audit", run: name,
    engineBaselineCommit: "62259e8", holdoutVersion: manifest.version,
    documentsSha256: manifest.documentsSha256, labelsSha256: manifest.labelsSha256,
    executedAt: new Date().toISOString(),
    blindReview: agreement,
    summary: summarizeHoldout(results, labels),
    documents: results,
  };
  mkdirSync(reports, { recursive: true });
  writeNew(output, json(report));
  process.stdout.write(`${output}\n${JSON.stringify(report.summary, null, 2)}\n`);
}

const command = process.argv[2];
if (command === "freeze") freeze();
else if (command === "sample") sample();
else if (command === "validate") {
  const data = validateFrozenHoldout(read("documents.json"), read("labels.json"), read("manifest.json"), read("blind-review.json"));
  process.stdout.write(`Valid frozen holdout: ${data.documents.length} documents\n`);
} else if (command === "run") run(process.argv[3]);
else throw new Error("Usage: pnpm eval:holdout sample|freeze|validate|run baseline-62259e8|run post-fix");
