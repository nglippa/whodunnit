/** Synthetic development input only. This command never constructs a model provider. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { objectiveSemanticRequest } from "@/lib/evaluation/objective-feasibility";
import { editingTaskSchema, objectiveLabelSchema, objectiveSourceSchema, validateObjectiveCorpus } from "@/lib/evaluation/objective-feasibility-schema";
import { getPrompt } from "@/lib/prompts";
import { buildSemanticPlan, validateSemanticReview, type SemanticReviewClient } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V7 } from "@/lib/reconstruction/strategies";

const root = resolve("data/fixtures/objective-feasibility");
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const manifestSchema = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT"), created: z.string(), files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)) }).strict();
const blindReviewSchema = z.object({ reviewer: z.string().min(1), annotations: z.array(objectiveLabelSchema) }).strict();
const disputeSchema = z.object({ taskId: z.string(), status: z.enum(["AGREED", "DISPUTED", "AMBIGUOUS"]), reason: z.string() }).strict();
const executionSchema = z.object({ contractVersion: z.literal("semantic-review.v3"), strategy: z.literal("reconstruction-v7"), requestBundleSha256: z.string().regex(/^[0-9a-f]{64}$/), savedOutputSha256: z.string().regex(/^[0-9a-f]{64}$/), route: z.literal("account-backed-no-metered-api") }).strict();

function json(name: string): unknown { return JSON.parse(readFileSync(resolve(root, name), "utf8")); }
function frozenInputs() {
  const manifest = manifestSchema.parse(json("manifest.json"));
  for (const name of ["sources.json", "tasks.json", "labels.json", "second-reviews.json", "disputes.json"]) {
    if (!manifest.files[name]) throw new Error(`manifest omits ${name}`);
  }
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name)) throw new Error("invalid manifest path");
    if (sha(readFileSync(resolve(root, name))) !== digest) throw new Error(`frozen input fingerprint mismatch: ${name}`);
  }
  const sources = z.array(objectiveSourceSchema).min(50).max(70).parse(json("sources.json"));
  const tasks = z.array(editingTaskSchema).min(120).max(180).parse(json("tasks.json"));
  const labels = z.array(objectiveLabelSchema).parse(json("labels.json"));
  const reviews = z.array(blindReviewSchema).parse(json("second-reviews.json"));
  const disputes = z.array(disputeSchema).parse(json("disputes.json"));
  validateObjectiveCorpus(sources, tasks, labels);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  for (const review of reviews) {
    for (const label of review.annotations) {
      if (seen.has(label.taskId)) throw new Error(`duplicate second review: ${label.taskId}`);
      seen.add(label.taskId);
      const task = taskById.get(label.taskId);
      if (!task) throw new Error(`unknown second-review task: ${label.taskId}`);
      validateObjectiveCorpus(sources, [task], [label]);
    }
  }
  if (new Set(disputes.map((d) => d.taskId)).size !== disputes.length || disputes.some((d) => !seen.has(d.taskId))) throw new Error("dispute inventory mismatch");
  return { manifest, sources, tasks, labels, reviews, disputes };
}

function requestBundle(inputs: ReturnType<typeof frozenInputs>) {
  const sourceById = new Map(inputs.sources.map((source) => [source.id, source]));
  return { contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", objectiveTransport: "plannerRationale: Author's note", system: getPrompt({ id: "semantic-review", version: 3 }).system,
    requests: inputs.tasks.map((task) => ({ id: task.id, request: objectiveSemanticRequest(sourceById.get(task.sourceId)!.text, task.objective) })) };
}

async function main() {
  const inputs = frozenInputs();
  const mode = process.argv[2] ?? "integrity";
  const independentlyDefensiblePartial = inputs.reviews.flatMap((r) => r.annotations).filter((r) => r.feasibility === "PARTIALLY_SAFE" && inputs.labels.find((l) => l.taskId === r.taskId)?.feasibility === "PARTIALLY_SAFE").length;
  if (mode === "integrity") {
    process.stdout.write(JSON.stringify({ valid: true, sources: inputs.sources.length, tasks: inputs.tasks.length, secondReviewed: inputs.reviews.reduce((n, r) => n + r.annotations.length, 0), independentlyDefensiblePartial, fingerprints: inputs.manifest.files }) + "\n");
    return;
  }
  if (independentlyDefensiblePartial < 25) throw new Error("fewer than 25 independently defensible partial tasks: model review prohibited");
  const bundle = requestBundle(inputs);
  if (mode === "requests") { process.stdout.write(JSON.stringify(bundle) + "\n"); return; }
  if (mode !== "audit" || !process.argv[3]) throw new Error("usage: objective-feasibility-validation.ts integrity|requests|audit <saved-reviews.json>");
  const execution = executionSchema.parse(json("review-execution.json"));
  if (sha(JSON.stringify(bundle) + "\n") !== execution.requestBundleSha256) throw new Error("pinned request fingerprint mismatch");
  const savedBytes = readFileSync(resolve(process.argv[3]));
  if (sha(savedBytes) !== execution.savedOutputSha256) throw new Error("saved review fingerprint mismatch");
  const saved = z.array(z.object({ id: z.string(), review: z.unknown(), model: z.string().optional() }).strict()).parse(JSON.parse(savedBytes.toString("utf8")));
  if (saved.length !== inputs.tasks.length || saved.some((entry, i) => entry.id !== inputs.tasks[i].id)) throw new Error("saved reviews must cover frozen tasks in order");
  const sourceById = new Map(inputs.sources.map((source) => [source.id, source]));
  const rows = await Promise.all(inputs.tasks.map(async (task, i) => {
    const source = sourceById.get(task.sourceId)!;
    try {
      const review = validateSemanticReview(source.text, saved[i].review, 3);
      if (!("rewriteFeasibility" in review)) throw new Error("missing v3 feasibility");
      const objective = task.objective;
      const refinement = { directives: [] as [], note: objective.length <= 280 ? objective : "See the full author objective in planner rationale." };
      const client: SemanticReviewClient = { model: "account-backed-validation-replay", contractVersion: 3, async review() { return { review: saved[i].review }; } };
      const result = await buildSemanticPlan({ source: source.text, profile: PRESETS.natural, refinement }, client, { mode: "all", strategy: RECONSTRUCTION_V7 });
      return { id: task.id, sourceId: task.sourceId, gold: inputs.labels[i].feasibility, scopeGold: inputs.labels[i].scope, valid: true,
        observed: review.disposition === "LEAVE_ALONE" || review.disposition === "INSUFFICIENT_EVIDENCE" ? "NO_EDIT_DIAGNOSIS" : review.rewriteFeasibility,
        disposition: review.disposition, missingInformation: review.missingInformation, findingCount: review.findings.length,
        execution: result.assessment?.execution ?? null, finalScope: result.finalScope, reviewOutcome: result.telemetry.outcome };
    } catch (error) {
      return { id: task.id, sourceId: task.sourceId, gold: inputs.labels[i].feasibility, scopeGold: inputs.labels[i].scope, valid: false,
        observed: "INVALID", disposition: null, missingInformation: [], findingCount: 0, error: error instanceof Error ? error.message : "invalid review" };
    }
  }));
  const feasibilityMatrix: Record<string, Record<string, number>> = {};
  for (const row of rows) { feasibilityMatrix[row.gold] ??= {}; feasibilityMatrix[row.gold][row.observed] = (feasibilityMatrix[row.gold][row.observed] ?? 0) + 1; }
  process.stdout.write(JSON.stringify({ count: rows.length, contractVersion: "semantic-review.v3", strategy: "reconstruction-v7", mode: "all", feasibilityMatrix, rows }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "objective feasibility audit failed"}\n`); process.exitCode = 1; });
