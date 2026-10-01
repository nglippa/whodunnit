/** One-shot synthetic development comparison. No model provider is constructed. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { editingTaskSchema, objectiveLabelSchema, objectiveSourceSchema, validateObjectiveCorpus } from "@/lib/evaluation/objective-feasibility-schema";
import { getPrompt } from "@/lib/prompts";
import { buildSemanticJobPlan, semanticJobRequest, semanticReviewSchemaV4, type SemanticJobClientV4 } from "@/lib/reconstruction/semantic-review-jobs";

const root = resolve("data/fixtures/objective-feasibility");
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const json = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const executionSchema = z.object({ contractVersion: z.literal("semantic-review.v4"), strategy: z.literal("reconstruction-v8"), requestBundleSha256: z.string().regex(/^[0-9a-f]{64}$/), savedOutputSha256: z.string().regex(/^[0-9a-f]{64}$/), route: z.literal("account-backed-no-metered-api") }).strict();

async function main() {
  const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT"), files: z.record(z.string(), z.string()) }).passthrough().parse(json("manifest.json"));
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name) || sha(readFileSync(resolve(root, name))) !== digest) throw new Error(`frozen input fingerprint mismatch: ${name}`);
  }
  const sources = z.array(objectiveSourceSchema).parse(json("sources.json"));
  const tasks = z.array(editingTaskSchema).parse(json("tasks.json"));
  const labels = z.array(objectiveLabelSchema).parse(json("labels.json"));
  validateObjectiveCorpus(sources, tasks, labels);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const inputFor = (task: (typeof tasks)[number]) => ({ source: sourceById.get(task.sourceId)!.text, profile: PRESETS.natural,
    refinement: { directives: [] as [], note: task.objective.length <= 280 ? task.objective : "See the full author objective in planner rationale." } });
  const bundle = { contractVersion: "semantic-review.v4", strategy: "reconstruction-v8", system: getPrompt({ id: "semantic-review", version: 4 }).system,
    outputSchema: z.toJSONSchema(semanticReviewSchemaV4), requests: tasks.map((task) => ({ id: task.id, request: semanticJobRequest(inputFor(task), task.objective) })) };
  const mode = process.argv[2] ?? "requests";
  if (mode === "requests") { process.stdout.write(JSON.stringify(bundle) + "\n"); return; }
  if (mode !== "audit" || !process.argv[3]) throw new Error("usage: objective-feasibility-v4.ts requests|audit <saved-reviews.json>");
  const execution = executionSchema.parse(json("v4-review-execution.json"));
  if (sha(JSON.stringify(bundle) + "\n") !== execution.requestBundleSha256) throw new Error("v4 request fingerprint mismatch");
  const savedBytes = readFileSync(resolve(process.argv[3]));
  if (sha(savedBytes) !== execution.savedOutputSha256) throw new Error("v4 saved review fingerprint mismatch");
  const saved = z.array(z.object({ id: z.string(), review: z.unknown(), model: z.string().optional() }).strict()).parse(JSON.parse(savedBytes.toString("utf8")));
  if (saved.length !== tasks.length || saved.some((x, i) => x.id !== tasks[i].id)) throw new Error("v4 reviews must cover frozen tasks in order");
  const rows = await Promise.all(tasks.map(async (task, i) => {
    const client: SemanticJobClientV4 = { model: "account-backed-validation-replay", async review() { return { review: saved[i].review }; } };
    const result = await buildSemanticJobPlan(inputFor(task), task.objective, client);
    return { id: task.id, sourceId: task.sourceId, gold: labels[i].feasibility, goldScope: labels[i].scope,
      outcome: result.telemetry.outcome, observed: result.assessment?.feasibility ?? "INVALID", sourceDiagnosis: result.assessment?.sourceDiagnosis ?? null,
      requestedScope: result.assessment?.requestedScope ?? null, finalScope: result.assessment?.finalScope ?? null, execution: result.telemetry.execution,
      safeJobs: result.telemetry.safeJobs, blockedJobs: result.telemetry.blockedJobs, authorizedJobs: result.telemetry.authorizedJobs,
      jobs: result.review?.jobs.map((job, index) => ({ index, operation: job.operation, objectiveRequirement: job.objectiveRequirement, feasibility: job.feasibility,
        sourceEvidence: job.sourceEvidence.map((span) => span.text), missingProposition: job.missingProposition, prohibitedInference: job.prohibitedInference,
        dependency: job.dependency, authorized: result.assessment?.authorizedJobIndices.includes(index) ?? false })) ?? [] };
  }));
  const feasibilityMatrix: Record<string, Record<string, number>> = {};
  for (const row of rows) { feasibilityMatrix[row.gold] ??= {}; feasibilityMatrix[row.gold][row.observed] = (feasibilityMatrix[row.gold][row.observed] ?? 0) + 1; }
  process.stdout.write(JSON.stringify({ count: rows.length, contractVersion: "semantic-review.v4", strategy: "reconstruction-v8", mode: "all", feasibilityMatrix, rows }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "v4 objective audit failed"}\n`); process.exitCode = 1; });
