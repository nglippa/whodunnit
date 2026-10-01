/** Frozen synthetic editing-job development evaluation. No provider is constructed or called. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { editingJobDocumentSchema, editingJobLabelSchema, validateEditingJobLabels } from "@/lib/evaluation/editing-job-schema";
import { getPrompt } from "@/lib/prompts";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { buildSemanticPlan, semanticProgressionMap, semanticRequest, type SemanticReviewClient } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V7 } from "@/lib/reconstruction/strategies";

const root = resolve("data/fixtures/editing-job-validation");
const manifestSchema = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT"), created: z.string(), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict();
const blindReviewSchema = z.object({ reviewer: z.string().min(1), annotations: z.array(editingJobLabelSchema) }).strict();
const executionSchema = z.object({ contractVersion: z.literal("semantic-review.v3"), strategy: z.literal("reconstruction-v7"), requestBundleSha256: z.string().regex(/^[a-f0-9]{64}$/), savedOutputSha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough();
const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");

function readJson(name: string): unknown { return JSON.parse(readFileSync(resolve(root, name), "utf8")); }
function inputs() {
  const manifest = manifestSchema.parse(readJson("manifest.json"));
  for (const required of ["documents.json", "labels.json", "blind-reviews.json", "creator-requests.json"]) {
    if (!(required in manifest.files)) throw new Error(`manifest omits ${required}`);
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name)) throw new Error("invalid manifest path");
    const actual = sha256(readFileSync(resolve(root, name)));
    if (actual !== expected) throw new Error(`frozen input fingerprint mismatch: ${name}`);
  }
  const documents = z.array(editingJobDocumentSchema).min(1).parse(readJson("documents.json"));
  const labels = z.array(editingJobLabelSchema).parse(readJson("labels.json"));
  const blindReviews = z.array(blindReviewSchema).parse(readJson("blind-reviews.json"));
  validateEditingJobLabels(documents, labels);
  const ids = new Set(documents.map((document) => document.id));
  for (const blind of blindReviews) {
    const seen = new Set<string>();
    for (const label of blind.annotations) {
      if (!ids.has(label.id) || seen.has(label.id)) throw new Error(`blind-review ID mismatch: ${blind.reviewer}/${label.id}`);
      seen.add(label.id);
      validateEditingJobLabels([documents.find((document) => document.id === label.id)!], [label]);
    }
  }
  return { manifest, documents, labels, blindReviews };
}

async function main() {
  const { manifest, documents, labels, blindReviews } = inputs();
  const mode = process.argv[2] ?? "integrity";
  if (mode === "integrity") {
    process.stdout.write(JSON.stringify({ valid: true, documents: documents.length, secondReviewCount: new Set(blindReviews.flatMap((r) => r.annotations.map((a) => a.id))).size, fingerprints: manifest.files }) + "\n");
    return;
  }
  const requests = documents.map((document) => {
    const input = { source: document.text, profile: PRESETS.natural };
    return { id: document.id, request: semanticRequest(input, buildRewritePlan(input, RECONSTRUCTION_V7)) };
  });
  const requestBundle = JSON.stringify({ contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", system: getPrompt({ id: "semantic-review", version: 3 }).system, requests }) + "\n";
  if (mode === "requests") {
    process.stdout.write(requestBundle);
    return;
  }
  if (mode !== "audit" || !process.argv[3]) throw new Error("usage: editing-job-validation.ts integrity|requests|audit <saved-reviews.json>");
  const execution = executionSchema.parse(readJson("review-execution.json"));
  if (sha256(requestBundle) !== execution.requestBundleSha256) throw new Error("pinned semantic-review request fingerprint mismatch");
  const savedBytes = readFileSync(resolve(process.argv[3]));
  if (sha256(savedBytes) !== execution.savedOutputSha256) throw new Error("saved semantic-review output fingerprint mismatch");
  const saved = z.array(z.object({ id: z.string(), review: z.unknown(), model: z.string().optional() }).strict()).parse(JSON.parse(savedBytes.toString("utf8")));
  if (saved.length !== documents.length || saved.some((entry, i) => entry.id !== documents[i].id)) throw new Error("saved reviews must cover frozen documents in order");
  const bySource = new Map(documents.map((document) => [document.text, document.id]));
  if (bySource.size !== documents.length) throw new Error("duplicate document text");
  const byId = new Map(saved.map((entry) => [entry.id, entry]));
  const client: SemanticReviewClient = {
    model: "account-backed-validation-replay", contractVersion: 3,
    async review(request) {
      const id = bySource.get(request.source);
      if (!id) throw new Error("unknown synthetic source");
      return { review: byId.get(id)!.review };
    },
  };
  const rows = [];
  for (const [i, document] of documents.entries()) {
    const result = await buildSemanticPlan({ source: document.text, profile: PRESETS.natural }, client, { mode: "all", strategy: RECONSTRUCTION_V7 });
    rows.push({ id: document.id, genre: document.genre, words: document.text.trim().split(/\s+/).length,
      gold: labels[i], deterministicScope: result.telemetry.deterministicScope, validation: result.telemetry.outcome,
      diagnosis: result.assessment?.diagnosis ?? null, feasibility: result.assessment?.feasibility ?? null,
      execution: result.assessment?.execution ?? null, finalScope: result.finalScope,
      reviewMissingInformation: result.review?.missingInformation ?? [],
      reviewFindings: result.review?.findings.map((finding) => ({ phenomenon: finding.phenomenon, scope: finding.scope, severity: finding.severity, confidence: finding.confidence, reason: finding.reason, evidence: finding.evidence.map((span) => span.text) })) ?? [],
      progression: result.review ? semanticProgressionMap(document.text, result.review) : null });
  }
  const scopeMatrix: Record<string, Record<string, number>> = {};
  const feasibilityMatrix: Record<string, Record<string, number>> = {};
  const executionMatrix: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    for (const [matrix, gold, observed] of [
      [scopeMatrix, row.gold.scope, row.diagnosis ?? "INVALID"],
      [feasibilityMatrix, row.gold.feasibility, row.feasibility ?? "INVALID"],
      [executionMatrix, row.gold.feasibility, row.execution ?? "INVALID"],
    ] as const) {
      matrix[gold] ??= {};
      matrix[gold][observed] = (matrix[gold][observed] ?? 0) + 1;
    }
  }
  process.stdout.write(JSON.stringify({ count: rows.length, contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", mode: "all", scopeMatrix, feasibilityMatrix, executionMatrix, rows }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "editing-job validation failed"}\n`); process.exitCode = 1; });
