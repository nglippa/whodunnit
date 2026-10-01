/** Synthetic scope validation. Frozen inputs are checked before any planner replay. No provider calls. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { getPrompt } from "@/lib/prompts";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { buildSemanticPlan, semanticProgressionMap, semanticRequest, type SemanticReviewClient } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V7 } from "@/lib/reconstruction/strategies";

const root = resolve("data/fixtures/semantic-scope-validation");
const documentSchema = z.object({ id: z.string().min(2), text: z.string().min(20), genre: z.string().min(2), creator: z.string().min(1) }).strict();
const labelSchema = z.object({
  id: z.string().min(2),
  scope: z.enum(["LEAVE_ALONE", "LOCAL_EDIT", "DISTRIBUTED_LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "INSUFFICIENT_CONTEXT"]),
  information: z.enum(["SUFFICIENT", "PARTIAL", "CRITICAL_MISSING"]),
  feasibility: z.enum(["SAFE", "PARTIALLY_SAFE", "BLOCKED_PENDING_INFORMATION"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(10),
  whyLocalInsufficient: z.string().optional(),
  missingInformation: z.array(z.string()),
  ambiguous: z.boolean().optional(),
  ambiguityReason: z.string().optional(),
  scopeDisputed: z.boolean().optional(),
  informationDisputed: z.boolean().optional(),
  feasibilityDisputed: z.boolean().optional(),
}).strict().superRefine((label, ctx) => {
  if (label.scope === "SUBSTANTIVE_RECONSTRUCTION" && !label.whyLocalInsufficient?.trim()) ctx.addIssue({ code: "custom", message: "substantive rationale must explain why local edits fail" });
  if (label.feasibility === "BLOCKED_PENDING_INFORMATION" && label.missingInformation.length === 0) ctx.addIssue({ code: "custom", message: "blocked feasibility must name missing information" });
});
const reviewSchema = z.object({ reviewer: z.string().min(1), annotations: z.array(labelSchema) }).strict();
const manifestSchema = z.object({ schemaVersion: z.literal(1), created: z.string(), status: z.literal("FROZEN_DEVELOPMENT"), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict();

function readJson(name: string): unknown { return JSON.parse(readFileSync(resolve(root, name), "utf8")); }
function validateInputs() {
  const manifest = manifestSchema.parse(readJson("manifest.json"));
  for (const required of ["documents.json", "labels.json", "blind-reviews.json", "creator-requests.json"]) {
    if (!(required in manifest.files)) throw new Error(`manifest omits ${required}`);
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name)) throw new Error("invalid manifest path");
    const actual = createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");
    if (actual !== expected) throw new Error(`frozen input fingerprint mismatch: ${name}`);
  }
  const documents = z.array(documentSchema).min(1).parse(readJson("documents.json"));
  const labels = z.array(labelSchema).parse(readJson("labels.json"));
  const reviews = z.array(reviewSchema).parse(readJson("blind-reviews.json"));
  const ids = documents.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate document id");
  if (labels.length !== ids.length || labels.some((l, i) => l.id !== ids[i])) throw new Error("label coverage/order mismatch");
  for (const review of reviews) {
    if (new Set(review.annotations.map((a) => a.id)).size !== review.annotations.length || review.annotations.some((a) => !ids.includes(a.id))) throw new Error("blind review id mismatch");
  }
  return { manifest, documents, labels, reviews };
}

async function main() {
const input = validateInputs();
const mode = process.argv[2] ?? "integrity";
if (mode === "integrity") {
  process.stdout.write(JSON.stringify({ valid: true, count: input.documents.length, fingerprints: input.manifest.files }) + "\n");
} else if (mode === "requests") {
  const requests = input.documents.map((d) => {
    const planInput = { source: d.text, profile: PRESETS.natural };
    return { id: d.id, request: semanticRequest(planInput, buildRewritePlan(planInput, RECONSTRUCTION_V7)) };
  });
  process.stdout.write(JSON.stringify({ contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", system: getPrompt({ id: "semantic-review", version: 3 }).system, requests }) + "\n");
} else if (mode === "audit") {
  const savedPath = process.argv[3];
  if (!savedPath) throw new Error("audit requires a saved synthetic review JSON path");
  const saved = z.array(z.object({ id: z.string(), review: z.unknown(), model: z.string().optional() })).parse(JSON.parse(readFileSync(resolve(savedPath), "utf8")));
  const byId = new Map(saved.map((r) => [r.id, r]));
  if (byId.size !== saved.length || saved.some((r) => !input.documents.some((d) => d.id === r.id))) throw new Error("review id mismatch");
  const sourceToId = new Map(input.documents.map((d) => [d.text, d.id]));
  if (sourceToId.size !== input.documents.length) throw new Error("duplicate document text");
  const client: SemanticReviewClient = {
    model: "account-backed-validation-replay", contractVersion: 3,
    async review(request) {
      const id = sourceToId.get(request.source);
      const record = id && byId.get(id);
      if (!record) throw new Error("review unavailable");
      return { review: record.review };
    },
  };
  const rows = [];
  for (const [i, d] of input.documents.entries()) {
    const planInput = { source: d.text, profile: PRESETS.natural };
    const started = performance.now();
    const all = await buildSemanticPlan(planInput, client, { mode: "all", strategy: RECONSTRUCTION_V7 });
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    // The all-mode route is intentionally unconditional; compute the selective route separately.
    const deterministicSelective = await buildSemanticPlan(planInput, null, { mode: "selective", strategy: RECONSTRUCTION_V7 });
    const selectiveRequested = deterministicSelective.route.requested;
    const selected = selectiveRequested ? all : deterministicSelective;
    const progression = all.review ? semanticProgressionMap(d.text, all.review) : null;
    rows.push({ id: d.id, genre: d.genre, words: d.text.trim().split(/\s+/).length,
      documentType: all.plan.discourse?.structure.type ?? "UNKNOWN", documentTypeConfidence: all.plan.discourse?.structure.confidence ?? 0,
      gold: input.labels[i], deterministic: all.telemetry.deterministicScope,
      reviewOutcome: all.telemetry.outcome, diagnosis: all.assessment?.diagnosis ?? null, feasibility: all.assessment?.feasibility ?? null,
      execution: all.assessment?.execution ?? null, finalScope: all.finalScope, selectiveRequested, selectiveScope: selected.finalScope,
      findingCount: all.review?.findings.length ?? 0, missingInformation: all.review?.missingInformation ?? [],
      findingPhenomena: all.review?.findings.map((finding) => ({ phenomenon: finding.phenomenon, scope: finding.scope, severity: finding.severity, confidence: finding.confidence })) ?? [],
      progression, deterministicAndReplayMs: elapsedMs });
  }
  process.stdout.write(JSON.stringify({ contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", count: rows.length, rows }) + "\n");
} else throw new Error("usage: scope-validation.ts integrity|requests|audit <saved-reviews.json>");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "scope validation failed"}\n`); process.exitCode = 1; });
