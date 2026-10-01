import { z } from "zod";

/** Evaluation labels only. These are editorial judgments, not reconstruction instructions. */
export const editingJobSchema = z.object({
  id: z.string().min(2),
  operation: z.enum(["COMPRESS", "REORGANIZE", "CLARIFY", "SIMPLIFY", "DEDUPLICATE", "SURFACE_EXISTING_INFORMATION", "ADD_INFORMATION", "OTHER"]),
  objective: z.string().min(8),
  scope: z.enum(["LOCAL", "DISTRIBUTED", "DOCUMENT_WIDE"]),
  sourceEvidence: z.array(z.string().min(3)).min(1).max(4),
  feasibility: z.enum(["SAFE", "PARTIAL", "BLOCKED"]),
  missingInformation: z.array(z.object({
    proposition: z.string().min(8),
    necessity: z.enum(["REQUIRED_FOR_TRUTH", "WOULD_IMPROVE"]),
  }).strict()).max(5),
  prohibitedInferences: z.array(z.string().min(8)).max(5),
  rationale: z.string().min(12),
}).strict().superRefine((job, ctx) => {
  if (job.feasibility !== "SAFE" && !job.missingInformation.some((fact) => fact.necessity === "REQUIRED_FOR_TRUTH")) {
    ctx.addIssue({ code: "custom", message: "partial or blocked job needs an exact required missing proposition" });
  }
  if (job.feasibility !== "SAFE" && job.prohibitedInferences.length === 0) {
    ctx.addIssue({ code: "custom", message: "partial or blocked job needs a prohibited inference" });
  }
});

export const editingJobDocumentSchema = z.object({
  id: z.string().min(2), text: z.string().min(20), genre: z.string().min(2), creator: z.string().min(1),
}).strict();

export const editingJobLabelSchema = z.object({
  id: z.string().min(2),
  scope: z.enum(["LEAVE_ALONE", "LOCAL", "DISTRIBUTED_LIGHT", "SUBSTANTIVE", "AMBIGUOUS"]),
  feasibility: z.enum(["SAFE", "PARTIALLY_SAFE", "BLOCKED", "UNDETERMINED"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(12),
  coupling: z.enum(["INDEPENDENT", "PARTIALLY_COUPLED", "GLOBALLY_COUPLED", "NOT_APPLICABLE"]),
  couplingRationale: z.string().min(8),
  jobs: z.array(editingJobSchema).max(8),
  scopeDisputed: z.boolean().optional(),
  feasibilityDisputed: z.boolean().optional(),
  ambiguityReason: z.string().optional(),
}).strict().superRefine((label, ctx) => {
  const jobFeasibility = label.jobs.map((job) => job.feasibility);
  if (label.scope === "LEAVE_ALONE" && (label.jobs.length > 0 || label.feasibility !== "SAFE")) {
    ctx.addIssue({ code: "custom", message: "leave-alone writing has no material editing jobs" });
  }
  if (label.feasibility === "SAFE" && jobFeasibility.some((value) => value !== "SAFE")) {
    ctx.addIssue({ code: "custom", message: "safe document cannot contain a blocked job" });
  }
  if (label.feasibility === "PARTIALLY_SAFE" &&
    (!jobFeasibility.some((value) => value === "SAFE" || value === "PARTIAL") ||
      !jobFeasibility.some((value) => value === "BLOCKED" || value === "PARTIAL"))) {
    ctx.addIssue({ code: "custom", message: "partially safe document needs executable and blocked work" });
  }
  if (label.feasibility === "BLOCKED" && !jobFeasibility.includes("BLOCKED")) {
    ctx.addIssue({ code: "custom", message: "blocked document needs a blocked material job" });
  }
});

export type EditingJobDocument = z.infer<typeof editingJobDocumentSchema>;
export type EditingJobLabel = z.infer<typeof editingJobLabelSchema>;

export function validateEditingJobLabels(documents: EditingJobDocument[], labels: EditingJobLabel[]): void {
  if (documents.length !== labels.length) throw new Error("editing-job labels must cover every document");
  const documentIds = new Set(documents.map((document) => document.id));
  if (documentIds.size !== documents.length) throw new Error("duplicate editing-job document ID");
  for (const [i, label] of labels.entries()) {
    const document = documents[i];
    if (label.id !== document.id) throw new Error(`editing-job label order mismatch: ${label.id}`);
    const jobIds = new Set<string>();
    for (const job of label.jobs) {
      if (jobIds.has(job.id)) throw new Error(`duplicate editing-job ID: ${label.id}/${job.id}`);
      jobIds.add(job.id);
      if (job.sourceEvidence.some((span) => !document.text.includes(span))) throw new Error(`editing-job evidence absent: ${label.id}/${job.id}`);
    }
  }
}
