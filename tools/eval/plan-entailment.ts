/** Synthetic development evaluation. This CLI never constructs a model provider. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { entailmentLabelSchema, entailmentTaskSchema, validateEntailmentLabels } from "@/lib/evaluation/plan-entailment-schema";
import { getPrompt } from "@/lib/prompts";
import { buildSemanticJobPlan, semanticJobRequest, semanticReviewSchemaV4, type SemanticJobClientV4 } from "@/lib/reconstruction/semantic-review-jobs";

const root = resolve("data/fixtures/plan-entailment-development");
const digest = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const manifestSchema = z.object({ version: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT"), created: z.string(), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict();
const reviewEntrySchema = z.object({ id: z.string(), review: z.unknown() }).strict();

function frozen() {
  const manifest = manifestSchema.parse(read("manifest.json"));
  for (const name of ["tasks.json", "labels.json", "second-reviews.json", "disputes.json"]) if (!manifest.files[name]) throw new Error(`manifest omits ${name}`);
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name) || digest(readFileSync(resolve(root, name))) !== expected) throw new Error(`frozen input mismatch: ${name}`);
  }
  const tasks = z.array(entailmentTaskSchema).min(60).max(90).parse(read("tasks.json"));
  const labels = z.array(entailmentLabelSchema).parse(read("labels.json"));
  validateEntailmentLabels(tasks, labels);
  const second = z.array(entailmentLabelSchema).parse(read("second-reviews.json"));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  if (new Set(second.map((label) => label.id)).size !== second.length) throw new Error("duplicate second review");
  for (const label of second) {
    const task = taskById.get(label.id);
    if (!task) throw new Error(`unknown second review: ${label.id}`);
    validateEntailmentLabels([task], [label]);
  }
  const disputes = z.array(z.object({ id: entailmentTaskSchema.shape.id, status: z.enum(["AGREED", "DISPUTED", "AMBIGUOUS"]), note: z.string() }).strict()).parse(read("disputes.json"));
  if (disputes.length !== second.length || new Set(disputes.map((item) => item.id)).size !== disputes.length || disputes.some((item) => !second.some((label) => label.id === item.id))) throw new Error("dispute coverage mismatch");
  return { tasks, labels, second, disputes, manifest };
}

const inputFor = (source: string, objective: string) => ({ source, profile: PRESETS.natural,
  refinement: { directives: [] as [], note: objective.length <= 280 ? objective : "See the full author objective in planner rationale." } });

async function main() {
  const data = frozen();
  const mode = process.argv[2] ?? "integrity";
  if (mode === "integrity") {
    process.stdout.write(JSON.stringify({ valid: true, tasks: data.tasks.length, secondReviewed: data.second.length, fingerprints: data.manifest.files }) + "\n");
    return;
  }
  const bundle = { contractVersion: "semantic-review.v4", strategy: "reconstruction-v8", system: getPrompt({ id: "semantic-review", version: 4 }).system,
    outputSchema: z.toJSONSchema(semanticReviewSchemaV4), requests: data.tasks.map((task) => ({ id: task.id, request: semanticJobRequest(inputFor(task.source, task.objective), task.objective) })) };
  if (mode === "requests") { process.stdout.write(JSON.stringify(bundle) + "\n"); return; }
  if (mode !== "audit" || !process.argv[3]) throw new Error("usage: plan-entailment.ts integrity|requests|audit <saved-reviews.json>");
  const execution = z.object({ requestSha256: z.string().regex(/^[a-f0-9]{64}$/), outputSha256: z.string().regex(/^[a-f0-9]{64}$/), route: z.literal("account-backed-no-metered-api") }).strict().parse(read("review-execution.json"));
  if (digest(JSON.stringify(bundle) + "\n") !== execution.requestSha256) throw new Error("request bundle changed after execution");
  const saved = readFileSync(resolve(process.argv[3]));
  if (digest(saved) !== execution.outputSha256) throw new Error("review output changed after execution");
  const reviews = z.array(reviewEntrySchema).parse(JSON.parse(saved.toString("utf8")));
  if (reviews.length !== data.tasks.length || reviews.some((item, index) => item.id !== data.tasks[index].id)) throw new Error("review coverage/order mismatch");
  const rows = await Promise.all(data.tasks.map(async (task, index) => {
    const client: SemanticJobClientV4 = { model: "account-backed-replay", async review() { return { review: reviews[index].review }; } };
    const result = await buildSemanticJobPlan(inputFor(task.source, task.objective), task.objective, client);
    return { id: task.id, gold: data.labels[index].feasibility, validation: result.telemetry.outcome, feasibility: result.assessment?.feasibility ?? null,
      execution: result.telemetry.execution, authorizedJobIndices: result.assessment?.authorizedJobIndices ?? [], finalScope: result.assessment?.finalScope ?? null,
      jobs: result.review?.jobs ?? [] };
  }));
  process.stdout.write(JSON.stringify({ contractVersion: "semantic-review.v4", count: rows.length, rows }) + "\n");
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "plan-entailment evaluation failed"}\n`); process.exitCode = 1; });
