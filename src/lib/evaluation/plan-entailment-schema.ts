import { z } from "zod";

/** Development-only editorial labels. They are never sent to a semantic reviewer. */
export const entailmentTaskSchema = z.object({
  id: z.string().regex(/^[ABCD]\d{3}$/),
  source: z.string().min(50),
  objective: z.string().min(8),
  genre: z.string().min(2),
  creator: z.enum(["A", "B", "C", "D"]),
}).strict();

export const entailmentRequirementSchema = z.object({
  id: z.string().regex(/^R\d+$/),
  text: z.string().min(3),
  type: z.enum(["TRANSFORM", "PRESERVE", "PROHIBIT"]),
  materiality: z.enum(["REQUIRED", "OPTIONAL"]),
}).strict();

export const entailmentConstraintSchema = z.object({
  id: z.string().regex(/^C\d+$/),
  sourceQuote: z.string().min(3),
  mustPreserve: z.string().min(5),
  kind: z.enum(["CONDITION", "HEDGE", "NEGATION", "EXCEPTION", "QUANTITY", "TIME", "ATTRIBUTION", "CAUSAL_STATUS", "ACTOR", "OTHER"]),
}).strict();

export const entailmentGoldJobSchema = z.object({
  id: z.string().regex(/^J\d+$/),
  operation: z.string().min(3),
  requirementIds: z.array(z.string().regex(/^R\d+$/)).min(1),
  feasibility: z.enum(["SAFE", "BLOCKED"]),
  sourceEvidence: z.array(z.string().min(3)).max(8),
  missingProposition: z.string().min(5).nullable(),
  mustPreserveIds: z.array(z.string().regex(/^C\d+$/)),
  mustNotInfer: z.array(z.string().min(5)),
  coupling: z.enum(["INDEPENDENT", "COUPLED", "GLOBALLY_COUPLED"]),
}).strict();

export const entailmentLabelSchema = z.object({
  id: entailmentTaskSchema.shape.id,
  feasibility: z.enum(["FULLY_SAFE", "PARTIALLY_SAFE", "BLOCKED", "AMBIGUOUS"]),
  requirements: z.array(entailmentRequirementSchema).min(1).max(8),
  constraints: z.array(entailmentConstraintSchema).max(10),
  jobs: z.array(entailmentGoldJobSchema).max(8),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(10),
}).strict();

export type EntailmentTask = z.infer<typeof entailmentTaskSchema>;
export type EntailmentLabel = z.infer<typeof entailmentLabelSchema>;

export function validateEntailmentLabels(tasks: EntailmentTask[], labels: EntailmentLabel[]): void {
  if (tasks.length !== labels.length || new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error("task/label coverage mismatch");
  for (const [index, label] of labels.entries()) {
    const task = tasks[index];
    if (label.id !== task.id) throw new Error(`label order mismatch: ${task.id}`);
    const requirements = new Set(label.requirements.map((item) => item.id));
    const constraints = new Set(label.constraints.map((item) => item.id));
    if (requirements.size !== label.requirements.length || constraints.size !== label.constraints.length) throw new Error(`duplicate label ID: ${task.id}`);
    if (new Set(label.jobs.map((job) => job.id)).size !== label.jobs.length) throw new Error(`duplicate job ID: ${task.id}`);
    for (const constraint of label.constraints) if (!task.source.includes(constraint.sourceQuote)) throw new Error(`constraint quote absent: ${task.id}`);
    for (const job of label.jobs) {
      if (job.requirementIds.some((id) => !requirements.has(id))) throw new Error(`unknown requirement: ${task.id}`);
      if (job.mustPreserveIds.some((id) => !constraints.has(id))) throw new Error(`unknown constraint: ${task.id}`);
      if (job.sourceEvidence.some((quote) => !task.source.includes(quote))) throw new Error(`job evidence absent: ${task.id}`);
      if (job.feasibility === "SAFE" && job.sourceEvidence.length === 0) throw new Error(`safe job without source evidence: ${task.id}`);
      if (job.feasibility === "SAFE" && job.missingProposition) throw new Error(`safe job claims missing fact: ${task.id}`);
      if (job.feasibility === "BLOCKED" && !job.missingProposition) throw new Error(`blocked job without missing fact: ${task.id}`);
    }
    const safe = label.jobs.some((job) => job.feasibility === "SAFE");
    const blocked = label.jobs.some((job) => job.feasibility === "BLOCKED");
    if (label.feasibility === "FULLY_SAFE" && blocked || label.feasibility === "PARTIALLY_SAFE" && !(safe && blocked) || label.feasibility === "BLOCKED" && (!blocked || safe)) throw new Error(`feasibility/job mismatch: ${task.id}`);
  }
}
