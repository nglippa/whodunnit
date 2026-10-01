import { z } from "zod";
import type { CallMeta, StructuredCaller } from "@/lib/ai/provider";
import { getPrompt } from "@/lib/prompts";
import type { PlanInput } from "./rewrite-plan";
import { buildRewritePlan } from "./rewrite-plan";
import { editingScopeSchema, semanticRequest, type SemanticReviewRequest } from "./semantic-review";
import { RECONSTRUCTION_V8 } from "./strategies";

const evidenceSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(600) }).strict();
const operationSchema = z.enum(["COMPRESS", "DEDUPLICATE", "REORGANIZE", "CLARIFY_EXISTING", "SIMPLIFY_REGISTER", "SURFACE_EXISTING", "SUMMARIZE_EXISTING", "ADD_CAUSE", "ADD_EVIDENCE", "ADD_EXAMPLE", "ADD_OWNER", "ADD_DATE", "ADD_OUTCOME", "STRENGTHEN_CLAIM", "OTHER"]);
const additive = new Set(["ADD_CAUSE", "ADD_EVIDENCE", "ADD_EXAMPLE", "ADD_OWNER", "ADD_DATE", "ADD_OUTCOME", "STRENGTHEN_CLAIM"]);

export const semanticJobSchemaV4 = z.object({
  operation: operationSchema,
  objectiveRequirement: z.string().min(3).max(280),
  scope: z.enum(["LOCAL", "DISTRIBUTED", "DOCUMENT_WIDE"]),
  feasibility: z.enum(["SAFE", "BLOCKED"]),
  sourceEvidence: z.array(evidenceSchema).max(5),
  missingProposition: z.string().min(8).max(200).nullable(),
  prohibitedInference: z.string().min(8).max(200).nullable(),
  dependency: z.enum(["INDEPENDENT", "COUPLED"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(10).max(350),
}).strict();

export const semanticReviewSchemaV4 = z.object({
  sourceDiagnosis: editingScopeSchema,
  requestedScope: editingScopeSchema,
  jobs: z.array(semanticJobSchemaV4).max(6),
  counterevidence: z.array(evidenceSchema).max(4),
  noEditReason: z.string().min(10).max(250).nullable(),
}).strict();
export type SemanticReviewV4 = z.infer<typeof semanticReviewSchemaV4>;
export type SemanticJobV4 = SemanticReviewV4["jobs"][number];
export type ObjectiveFeasibility = "FULLY_SAFE" | "PARTIALLY_SAFE" | "BLOCKED";
export type JobExecution = "UNCHANGED" | "EDIT_AUTHORIZED_JOBS" | "BLOCKED_PENDING_INFORMATION" | "BLOCKED_PENDING_REVIEW";

export interface SemanticJobRequestV4 extends SemanticReviewRequest { requestedObjective: string }
export interface SemanticJobClientV4 {
  readonly model: string;
  review(request: SemanticJobRequestV4, signal: AbortSignal): Promise<{ review: unknown; meta?: CallMeta }>;
}

export function structuredSemanticJobReviewer(caller: StructuredCaller): SemanticJobClientV4 {
  return {
    model: caller.info.model ?? caller.info.provider,
    async review(request) {
      const { data, meta } = await caller.callStructured(semanticReviewSchemaV4, "semantic-review", getPrompt({ id: "semantic-review", version: 4 }).system, JSON.stringify(request));
      return { review: data, meta };
    },
  };
}

export function semanticJobRequest(input: PlanInput, objective: string): SemanticJobRequestV4 {
  if (!objective.trim()) throw new Error("explicit editing objective required");
  const plan = buildRewritePlan(input, RECONSTRUCTION_V8);
  return { ...semanticRequest(input, plan), requestedObjective: objective };
}

function paragraphIndex(source: string, start: number): number { return source.slice(0, start).split(/\n\s*\n/).length - 1; }

/** Exact quotations are necessary evidence, not proof that the semantic claim is true. */
export function validateSemanticJobReview(source: string, objective: string, raw: unknown): SemanticReviewV4 {
  const review = semanticReviewSchemaV4.parse(raw);
  if (review.jobs.length === 0 && !review.noEditReason) throw new Error("no-job review needs a no-edit reason");
  if (review.jobs.length > 0 && review.noEditReason) throw new Error("no-edit reason contradicts requested jobs");
  const spans = [...review.counterevidence, ...review.jobs.flatMap((job) => job.sourceEvidence)];
  if (spans.some(({ start, end, text }) => end <= start || source.slice(start, end) !== text)) throw new Error("job-review evidence does not match source");
  for (const job of review.jobs) {
    if (!objective.includes(job.objectiveRequirement)) throw new Error("job requirement is not an exact objective substring");
    if (job.feasibility === "SAFE") {
      if (job.sourceEvidence.length === 0) throw new Error("safe job needs source evidence");
      if (job.missingProposition || job.prohibitedInference) throw new Error("safe job cannot require missing facts");
      if (additive.has(job.operation)) throw new Error("additive fact operation cannot be authorized as safe; surface existing information instead");
    } else if (!job.missingProposition || !job.prohibitedInference) throw new Error("blocked job needs missing proposition and prohibited inference");
  }
  return review;
}

export interface JobAssessment {
  sourceDiagnosis: SemanticReviewV4["sourceDiagnosis"];
  requestedScope: SemanticReviewV4["requestedScope"];
  feasibility: ObjectiveFeasibility;
  execution: JobExecution;
  authorizedJobIndices: number[];
  blockedJobIndices: number[];
  withheldJobIndices: number[];
  finalScope: "LEAVE_ALONE" | "LOCAL_EDIT" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
}

/** Authorization is provisional planning; generation still needs independent meaning checks. */
export function assessSemanticJobs(source: string, review: SemanticReviewV4): JobAssessment {
  const safe = review.jobs.flatMap((job, index) => job.feasibility === "SAFE" ? [index] : []);
  const blocked = review.jobs.flatMap((job, index) => job.feasibility === "BLOCKED" ? [index] : []);
  const feasibility: ObjectiveFeasibility = blocked.length === 0 ? "FULLY_SAFE" : safe.length === 0 ? "BLOCKED" : "PARTIALLY_SAFE";
  const authorized = safe.filter((index) => blocked.length === 0 || review.jobs[index].dependency === "INDEPENDENT");
  const withheld = safe.filter((index) => !authorized.includes(index));
  const eligible = authorized.map((index) => review.jobs[index]);
  const substantive = review.requestedScope === "SUBSTANTIVE_RECONSTRUCTION" && eligible.some((job) =>
    job.scope === "DOCUMENT_WIDE" && job.dependency === "COUPLED" && job.confidence >= 0.7 &&
    new Set(job.sourceEvidence.map((span) => paragraphIndex(source, span.start))).size >= 2,
  );
  const finalScope = eligible.length === 0 ? "LEAVE_ALONE" as const : substantive ? "SUBSTANTIVE_RECONSTRUCTION" as const
    : eligible.some((job) => job.scope !== "LOCAL") ? "DISTRIBUTED_LIGHT_EDIT" as const : "LOCAL_EDIT" as const;
  const execution: JobExecution = eligible.length ? "EDIT_AUTHORIZED_JOBS" : blocked.length || withheld.length ? "BLOCKED_PENDING_INFORMATION" : "UNCHANGED";
  return { sourceDiagnosis: review.sourceDiagnosis, requestedScope: review.requestedScope, feasibility, execution,
    authorizedJobIndices: authorized, blockedJobIndices: blocked, withheldJobIndices: withheld, finalScope };
}

export interface JobPlanningResult {
  review: SemanticReviewV4 | null;
  assessment: JobAssessment | null;
  telemetry: { outcome: "accepted" | "unavailable" | "invalid" | "error" | "timeout"; model: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number; safeJobs: number; blockedJobs: number; authorizedJobs: number; feasibility: ObjectiveFeasibility | null; execution: JobExecution };
}

export async function buildSemanticJobPlan(input: PlanInput, objective: string, client: SemanticJobClientV4 | null, timeoutMs = 8000): Promise<JobPlanningResult> {
  const empty = (outcome: JobPlanningResult["telemetry"]["outcome"], model: string | null, latencyMs = 0): JobPlanningResult => ({
    review: null, assessment: null, telemetry: { outcome, model, inputTokens: null, outputTokens: null, latencyMs, safeJobs: 0, blockedJobs: 0, authorizedJobs: 0, feasibility: null, execution: "BLOCKED_PENDING_REVIEW" },
  });
  if (!client) return empty("unavailable", null);
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const reply = await Promise.race([
      client.review(semanticJobRequest(input, objective), controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("review timeout")), { once: true })),
    ]);
    let review: SemanticReviewV4;
    try { review = validateSemanticJobReview(input.source, objective, reply.review); }
    catch { return empty("invalid", client.model, Math.round(performance.now() - started)); }
    const assessment = assessSemanticJobs(input.source, review);
    return { review, assessment, telemetry: { outcome: "accepted", model: client.model, inputTokens: reply.meta?.inputTokens ?? null, outputTokens: reply.meta?.outputTokens ?? null,
      latencyMs: Math.round(performance.now() - started), safeJobs: review.jobs.length - assessment.blockedJobIndices.length, blockedJobs: assessment.blockedJobIndices.length,
      authorizedJobs: assessment.authorizedJobIndices.length, feasibility: assessment.feasibility, execution: assessment.execution } };
  } catch { return empty(controller.signal.aborted ? "timeout" : "error", client.model, Math.round(performance.now() - started)); }
  finally { clearTimeout(timer); }
}
