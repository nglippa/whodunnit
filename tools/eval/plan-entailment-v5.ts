/** One-shot synthetic development comparison. No provider or model call. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import { entailmentLabelSchema, entailmentTaskSchema, validateEntailmentLabels } from "@/lib/evaluation/plan-entailment-schema";
import { getPrompt } from "@/lib/prompts";
import { assessSemanticJobReviewV5, semanticJobRequestV5, semanticReviewSchemaV5 } from "@/lib/reconstruction/semantic-review-jobs-v5";

const root = resolve("data/fixtures/plan-entailment-development");
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));

function frozen() {
  const manifest = z.object({ version: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT"), created: z.string(), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict().parse(read("manifest.json"));
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-z-]+\.json$/.test(name) || digest(readFileSync(resolve(root, name))) !== expected) throw new Error(`frozen input mismatch: ${name}`);
  }
  const tasks = z.array(entailmentTaskSchema).min(60).max(90).parse(read("tasks.json"));
  const labels = z.array(entailmentLabelSchema).parse(read("labels.json"));
  validateEntailmentLabels(tasks, labels);
  return { tasks, labels };
}

async function main() {
  const { tasks, labels } = frozen();
  const bundle = { contractVersion: "semantic-review.v5", strategy: "reconstruction-v9", system: getPrompt({ id: "semantic-review", version: 5 }).system,
    outputSchema: z.toJSONSchema(semanticReviewSchemaV5), requests: tasks.map((task) => ({ id: task.id, request: semanticJobRequestV5({ source: task.source, profile: PRESETS.natural,
      refinement: { directives: [], note: task.objective.length <= 280 ? task.objective : "See the full author objective in planner rationale." } }, task.objective) })) };
  const mode = process.argv[2] ?? "requests";
  if (mode === "requests") { process.stdout.write(JSON.stringify(bundle) + "\n"); return; }
  if (mode !== "audit" || !process.argv[3]) throw new Error("usage: plan-entailment-v5.ts requests|audit <saved-reviews.json>");
  const execution = z.object({ requestSha256: z.string().regex(/^[a-f0-9]{64}$/), outputSha256: z.string().regex(/^[a-f0-9]{64}$/), route: z.literal("account-backed-no-metered-api") }).strict().parse(read("review-execution-v5.json"));
  if (digest(JSON.stringify(bundle) + "\n") !== execution.requestSha256) throw new Error("v5 request changed after execution");
  const saved = readFileSync(resolve(process.argv[3]));
  if (digest(saved) !== execution.outputSha256) throw new Error("v5 saved output changed after execution");
  const reviews = z.array(z.object({ id: z.string(), review: z.unknown() }).strict()).parse(JSON.parse(saved.toString("utf8")));
  if (reviews.length !== tasks.length || reviews.some((item, index) => item.id !== tasks[index].id)) throw new Error("v5 review order/coverage mismatch");
  const rows = tasks.map((task, index) => ({ id: task.id, gold: labels[index].feasibility,
    assessment: assessSemanticJobReviewV5(task.source, task.objective, reviews[index].review) }));
  process.stdout.write(JSON.stringify({ contractVersion: "semantic-review.v5", count: rows.length, rows }) + "\n");
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "v5 evaluation failed"}\n`); process.exitCode = 1; });
