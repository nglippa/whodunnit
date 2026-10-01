import { z } from "zod";
import { extractClaims } from "@/lib/semantics/claims";
import { CONDITIONAL_MARKERS } from "@/lib/semantics/lexicon";
import type { PlanInput } from "./rewrite-plan";
import { buildRewritePlan } from "./rewrite-plan";
import { editingScopeSchema, semanticRequest, type SemanticReviewRequest } from "./semantic-review";
import { RECONSTRUCTION_V9 } from "./strategies";

const spanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(600) }).strict();
const requirementSchema = z.object({ id: z.string().regex(/^R\d+$/), objectiveSpan: spanSchema, type: z.enum(["TRANSFORM", "PRESERVE", "PROHIBIT"]), materiality: z.enum(["REQUIRED", "OPTIONAL"]) }).strict();
const preserveKindSchema = z.enum(["CONDITION", "HEDGE", "NEGATION", "EXCEPTION", "QUANTITY", "TIME", "ATTRIBUTION", "CAUSAL_STATUS", "ACTOR", "OTHER"]);
const preservationSchema = z.object({ sourceSpan: spanSchema, kind: preserveKindSchema, instruction: z.string().min(8).max(240) }).strict();
const operationSchema = z.enum(["COMPRESS", "DEDUPLICATE", "REORGANIZE", "CLARIFY_EXISTING", "SIMPLIFY_REGISTER", "SURFACE_EXISTING", "SUMMARIZE_EXISTING", "ADD_CAUSE", "ADD_EVIDENCE", "ADD_EXAMPLE", "ADD_OWNER", "ADD_DATE", "ADD_OUTCOME", "STRENGTHEN_CLAIM", "OTHER"]);
const additive = new Set(["ADD_CAUSE", "ADD_EVIDENCE", "ADD_EXAMPLE", "ADD_OWNER", "ADD_DATE", "ADD_OUTCOME", "STRENGTHEN_CLAIM"]);

export const semanticJobSchemaV5 = z.object({
  operation: operationSchema,
  requirementIds: z.array(requirementSchema.shape.id).min(1).max(8),
  instruction: z.string().min(10).max(350),
  scope: z.enum(["LOCAL", "DISTRIBUTED", "DOCUMENT_WIDE"]),
  feasibility: z.enum(["SAFE", "BLOCKED"]),
  sourceEvidence: z.array(spanSchema).max(6),
  missingProposition: z.string().min(8).max(200).nullable(),
  mustPreserve: z.array(preservationSchema).max(10),
  mustNotInfer: z.array(z.string().min(8).max(240)).max(6),
  dependency: z.enum(["INDEPENDENT", "COUPLED"]),
  confidence: z.number().min(0).max(1),
}).strict();

/** Full schema guides structured reviewers; the envelope permits job-local salvage on replay. */
export const semanticReviewSchemaV5 = z.object({
  sourceDiagnosis: editingScopeSchema,
  requestedScope: editingScopeSchema,
  requirements: z.array(requirementSchema).min(1).max(8),
  jobs: z.array(semanticJobSchemaV5).max(8),
  noEditReason: z.string().min(10).max(250).nullable(),
}).strict();
const envelopeSchema = z.object({ ...semanticReviewSchemaV5.shape, jobs: z.array(z.unknown()).max(8) }).strict();
export type SemanticJobV5 = z.infer<typeof semanticJobSchemaV5>;
export type SemanticReviewV5 = z.infer<typeof semanticReviewSchemaV5>;
export interface SemanticJobRequestV5 extends SemanticReviewRequest { requestedObjective: string }

export function semanticJobRequestV5(input: PlanInput, objective: string): SemanticJobRequestV5 {
  if (!objective.trim()) throw new Error("explicit editing objective required");
  return { ...semanticRequest(input, buildRewritePlan(input, RECONSTRUCTION_V9)), requestedObjective: objective };
}

function matches(text: string, span: z.infer<typeof spanSchema>): boolean {
  return span.end > span.start && text.slice(span.start, span.end) === span.text;
}

function uncoveredObjective(objective: string, spans: z.infer<typeof spanSchema>[]): string[] {
  const covered = Array.from({ length: objective.length }, () => false);
  for (const { start, end } of spans) for (let i = start; i < end && i < covered.length; i++) covered[i] = true;
  const gaps: string[] = [];
  let start = -1;
  for (let i = 0; i <= objective.length; i++) {
    if (i < objective.length && !covered[i] && start < 0) start = i;
    if ((i === objective.length || covered[i]) && start >= 0) {
      const gap = objective.slice(start, i).trim();
      if (/[\p{L}\p{N}]/u.test(gap)) gaps.push(gap);
      start = -1;
    }
  }
  return gaps;
}

/** Existing claim markers provide a conservative checklist, not semantic entailment proof. */
function expectedPreservationKinds(source: string, evidence: z.infer<typeof spanSchema>[]): Set<z.infer<typeof preserveKindSchema>> {
  const kinds = new Set<z.infer<typeof preserveKindSchema>>();
  const conditional = new Set(CONDITIONAL_MARKERS.map((marker) => marker.toLowerCase()));
  for (const claim of extractClaims(source)) {
    if (!evidence.some((span) => span.start < claim.span.end && span.end > claim.span.start)) continue;
    if (claim.polarity === "negative") kinds.add("NEGATION");
    if (claim.modality === "possible" || claim.modality === "probable") kinds.add("HEDGE");
    if (claim.temporal.some((marker) => conditional.has(marker.toLowerCase()))) kinds.add("CONDITION");
    if (claim.quantities.length) kinds.add("QUANTITY");
    if (claim.causal.length || claim.strength.some((marker) => marker.scale === "causation")) kinds.add("CAUSAL_STATUS");
  }
  return kinds;
}

export type JobIssueCode = "SCHEMA" | "OBJECTIVE_REFERENCE" | "SOURCE_EVIDENCE" | "MISSING_FACT" | "ADDITIVE_FACT" | "PRESERVATION";
export interface JobValidationV5 { index: number; valid: boolean; issueCodes: JobIssueCode[]; job: SemanticJobV5 | null }
export interface JobPlanAssessmentV5 {
  outcome: "accepted" | "partial_validation" | "invalid";
  sourceDiagnosis: SemanticReviewV5["sourceDiagnosis"] | null;
  requestedScope: SemanticReviewV5["requestedScope"] | null;
  feasibility: "FULLY_SAFE" | "PARTIALLY_SAFE" | "BLOCKED" | null;
  execution: "UNCHANGED" | "EDIT_AUTHORIZED_JOBS" | "BLOCKED_PENDING_INFORMATION" | "BLOCKED_PENDING_REVIEW";
  authorizedJobIndices: number[];
  blockedJobIndices: number[];
  withheldJobIndices: number[];
  uncoveredRequirementIds: string[];
  uncoveredObjectiveText: string[];
  jobs: JobValidationV5[];
  telemetry: { outcome: "accepted" | "partial_validation" | "invalid"; safeJobs: number; blockedJobs: number; authorizedJobs: number; withheldJobs: number; uncoveredRequirements: number };
}

/** Fail closed per job so a malformed job cannot erase independent safe work. */
export function assessSemanticJobReviewV5(source: string, objective: string, raw: unknown): JobPlanAssessmentV5 {
  const empty: JobPlanAssessmentV5 = { outcome: "invalid", sourceDiagnosis: null, requestedScope: null, feasibility: null, execution: "BLOCKED_PENDING_REVIEW",
    authorizedJobIndices: [], blockedJobIndices: [], withheldJobIndices: [], uncoveredRequirementIds: [], uncoveredObjectiveText: [], jobs: [],
    telemetry: { outcome: "invalid", safeJobs: 0, blockedJobs: 0, authorizedJobs: 0, withheldJobs: 0, uncoveredRequirements: 0 } };
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.requirements.some((req) => !matches(objective, req.objectiveSpan))) return empty;
  const review = parsed.data;
  const ids = new Set(review.requirements.map((req) => req.id));
  if (ids.size !== review.requirements.length) return empty;
  if (review.jobs.length === 0) {
    if (!review.noEditReason) return empty;
    const uncoveredObjectiveText = uncoveredObjective(objective, review.requirements.map((req) => req.objectiveSpan));
    if (uncoveredObjectiveText.length) return { ...empty, uncoveredObjectiveText };
    return { ...empty, outcome: "accepted", sourceDiagnosis: review.sourceDiagnosis, requestedScope: review.requestedScope,
      feasibility: "FULLY_SAFE", execution: "UNCHANGED", telemetry: { ...empty.telemetry, outcome: "accepted" } };
  }
  const jobs: JobValidationV5[] = review.jobs.map((candidate, index) => {
    const parsedJob = semanticJobSchemaV5.safeParse(candidate);
    if (!parsedJob.success) return { index, valid: false, issueCodes: ["SCHEMA"], job: null };
    const job = parsedJob.data;
    const issues: JobIssueCode[] = [];
    if (job.requirementIds.some((id) => !ids.has(id))) issues.push("OBJECTIVE_REFERENCE");
    if (job.sourceEvidence.some((span) => !matches(source, span)) || job.mustPreserve.some((item) => !matches(source, item.sourceSpan))) issues.push("SOURCE_EVIDENCE");
    if (job.feasibility === "SAFE") {
      if (!job.sourceEvidence.length || job.missingProposition) issues.push("MISSING_FACT");
      if (additive.has(job.operation)) issues.push("ADDITIVE_FACT");
      const kinds = expectedPreservationKinds(source, job.sourceEvidence);
      for (const kind of kinds) if (!job.mustPreserve.some((item) => item.kind === kind && job.sourceEvidence.some((span) => item.sourceSpan.start < span.end && item.sourceSpan.end > span.start))) issues.push("PRESERVATION");
    } else if (!job.missingProposition || !job.mustNotInfer.length) issues.push("MISSING_FACT");
    return { index, valid: issues.length === 0, issueCodes: [...new Set(issues)], job };
  });
  const valid = jobs.filter((item) => item.valid && item.job).map((item) => item as JobValidationV5 & { job: SemanticJobV5 });
  const blocked = valid.filter((item) => item.job.feasibility === "BLOCKED").map((item) => item.index);
  const safe = valid.filter((item) => item.job.feasibility === "SAFE").map((item) => item.index);
  const invalid = jobs.filter((item) => !item.valid).map((item) => item.index);
  const authorized = safe.filter((index) => (blocked.length === 0 && invalid.length === 0) || jobs[index].job?.dependency === "INDEPENDENT");
  const withheld = safe.filter((index) => !authorized.includes(index)).concat(invalid);
  const covered = new Set(valid.flatMap((item) => item.job.requirementIds));
  const uncoveredRequirementIds = review.requirements.filter((req) => req.materiality === "REQUIRED" && !covered.has(req.id)).map((req) => req.id);
  const uncoveredObjectiveText = uncoveredObjective(objective, review.requirements.map((req) => req.objectiveSpan));
  const needsReview = invalid.length > 0 || uncoveredRequirementIds.length > 0 || uncoveredObjectiveText.length > 0;
  const feasibility = authorized.length === 0 ? "BLOCKED" : blocked.length || needsReview ? "PARTIALLY_SAFE" : "FULLY_SAFE";
  const execution = authorized.length ? "EDIT_AUTHORIZED_JOBS" : blocked.length ? "BLOCKED_PENDING_INFORMATION" : needsReview ? "BLOCKED_PENDING_REVIEW" : "UNCHANGED";
  const outcome = invalid.length ? "partial_validation" : "accepted";
  return { outcome, sourceDiagnosis: review.sourceDiagnosis, requestedScope: review.requestedScope, feasibility, execution,
    authorizedJobIndices: authorized, blockedJobIndices: blocked, withheldJobIndices: withheld, uncoveredRequirementIds, uncoveredObjectiveText, jobs,
    telemetry: { outcome, safeJobs: safe.length, blockedJobs: blocked.length, authorizedJobs: authorized.length, withheldJobs: withheld.length, uncoveredRequirements: uncoveredRequirementIds.length + uncoveredObjectiveText.length } };
}
