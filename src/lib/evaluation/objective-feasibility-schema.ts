import { z } from "zod";

/** Development labels only. Objective text is kept separate from source text. */
export const objectiveSourceSchema = z.object({
  id: z.string().regex(/^S\d{3}$/),
  genre: z.string().min(2),
  text: z.string().min(50),
  creator: z.string().min(1),
  pairWith: z.string().regex(/^S\d{3}$/).optional(),
  removedFact: z.string().min(8).optional(),
}).strict();

export const editingTaskSchema = z.object({
  id: z.string().regex(/^T\d{3}$/),
  sourceId: z.string().regex(/^S\d{3}$/),
  objective: z.string().min(8).max(500),
  objectiveCreator: z.string().min(1),
  pairGroup: z.string().optional(),
}).strict();

const missingSchema = z.object({
  proposition: z.string().min(8),
  prohibitedInference: z.string().min(8),
}).strict();

export const objectiveJobSchema = z.object({
  operation: z.enum(["COMPRESS", "DEDUPLICATE", "REORGANIZE", "CLARIFY_EXISTING", "SIMPLIFY_REGISTER", "SURFACE_EXISTING", "SUMMARIZE_EXISTING", "ADD_CAUSE", "ADD_EVIDENCE", "ADD_EXAMPLE", "ADD_OWNER", "ADD_DATE", "ADD_OUTCOME", "STRENGTHEN_CLAIM", "OTHER"]),
  requirement: z.string().min(3),
  scope: z.enum(["LOCAL", "DISTRIBUTED", "DOCUMENT_WIDE"]),
  feasibility: z.enum(["SAFE", "BLOCKED"]),
  sourceEvidence: z.array(z.string().min(3)).max(8),
  missing: z.array(missingSchema).max(4),
  dependency: z.enum(["INDEPENDENT", "COUPLED"]),
  rationale: z.string().min(10),
}).strict().superRefine((job, ctx) => {
  if (job.feasibility === "SAFE" && job.sourceEvidence.length === 0) ctx.addIssue({ code: "custom", message: "safe job needs source evidence" });
  if (job.feasibility === "BLOCKED" && job.missing.length === 0) ctx.addIssue({ code: "custom", message: "blocked job needs exact missing proposition" });
  if (job.feasibility === "SAFE" && job.missing.length) ctx.addIssue({ code: "custom", message: "safe job cannot require missing facts" });
});

export const objectiveLabelSchema = z.object({
  taskId: z.string().regex(/^T\d{3}$/),
  feasibility: z.enum(["FULLY_SAFE", "PARTIALLY_SAFE", "BLOCKED", "AMBIGUOUS"]),
  scope: z.enum(["LEAVE_ALONE", "LOCAL", "DISTRIBUTED_LIGHT", "SUBSTANTIVE", "AMBIGUOUS"]),
  confidence: z.number().min(0).max(1),
  jobs: z.array(objectiveJobSchema).max(6),
  rationale: z.string().min(10),
}).strict().superRefine((label, ctx) => {
  const safe = label.jobs.some((job) => job.feasibility === "SAFE");
  const blocked = label.jobs.some((job) => job.feasibility === "BLOCKED");
  if (label.feasibility === "FULLY_SAFE" && blocked) ctx.addIssue({ code: "custom", message: "fully safe task includes blocked work" });
  if (label.feasibility === "PARTIALLY_SAFE" && !(safe && blocked)) ctx.addIssue({ code: "custom", message: "partial task needs both safe and blocked work" });
  if (label.feasibility === "BLOCKED" && (!blocked || safe)) ctx.addIssue({ code: "custom", message: "blocked task must have only blocked work" });
});

export type ObjectiveSource = z.infer<typeof objectiveSourceSchema>;
export type EditingTask = z.infer<typeof editingTaskSchema>;
export type ObjectiveLabel = z.infer<typeof objectiveLabelSchema>;

export function validateObjectiveCorpus(sources: ObjectiveSource[], tasks: EditingTask[], labels: ObjectiveLabel[]): void {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (sourceById.size !== sources.length) throw new Error("duplicate source ID");
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  if (taskById.size !== tasks.length) throw new Error("duplicate task ID");
  if (labels.length !== tasks.length) throw new Error("blind labels must cover all tasks");
  for (const task of tasks) if (!sourceById.has(task.sourceId)) throw new Error(`missing source ${task.sourceId}`);
  for (const [i, label] of labels.entries()) {
    if (label.taskId !== tasks[i].id) throw new Error(`label order mismatch at ${i}`);
    const source = sourceById.get(tasks[i].sourceId)!;
    for (const job of label.jobs) {
      if (job.sourceEvidence.some((evidence) => !source.text.includes(evidence))) throw new Error(`source evidence absent in ${label.taskId}`);
    }
  }
  for (const source of sources) {
    if (source.pairWith && !sourceById.has(source.pairWith)) throw new Error(`source pair absent: ${source.id}`);
  }
}
