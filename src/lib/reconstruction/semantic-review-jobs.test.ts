import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { assessSemanticJobs, buildSemanticJobPlan, semanticJobRequest, validateSemanticJobReview, type SemanticJobClientV4, type SemanticReviewV4 } from "./semantic-review-jobs";

const source = "The release moved to Friday. The team posted the status in the project channel.\n\nThe next update is due Monday.";
const objective = "Make this shorter and explain why the release moved.";
const span = (text: string) => ({ start: source.indexOf(text), end: source.indexOf(text) + text.length, text });
const safeJob: SemanticReviewV4["jobs"][number] = { operation: "COMPRESS", objectiveRequirement: "Make this shorter", scope: "LOCAL", feasibility: "SAFE",
  sourceEvidence: [span("The release moved to Friday.")], missingProposition: null, prohibitedInference: null, dependency: "INDEPENDENT", confidence: 0.9, rationale: "The status can be shortened without changing facts." };
const blockedJob: SemanticReviewV4["jobs"][number] = { operation: "ADD_CAUSE", objectiveRequirement: "explain why the release moved", scope: "LOCAL", feasibility: "BLOCKED",
  sourceEvidence: [], missingProposition: "The actual cause of the release delay", prohibitedInference: "Do not infer the cause from the update schedule", dependency: "INDEPENDENT", confidence: 0.9,
  rationale: "The source states the new date but gives no cause." };
const mixed: SemanticReviewV4 = { sourceDiagnosis: "LEAVE_ALONE", requestedScope: "LOCAL_EDIT", jobs: [safeJob, blockedJob], counterevidence: [], noEditReason: null };

describe("objective-conditioned semantic jobs", () => {
  it("separates clean source diagnosis from blocked requested facts", () => {
    expect(validateSemanticJobReview(source, objective, mixed)).toEqual(mixed);
    const assessment = assessSemanticJobs(source, mixed);
    expect(assessment.feasibility).toBe("PARTIALLY_SAFE");
    expect(assessment.authorizedJobIndices).toEqual([0]);
    expect(assessment.blockedJobIndices).toEqual([1]);
    expect(assessment.finalScope).toBe("LOCAL_EDIT");
  });

  it("derives fully safe and blocked task outcomes from jobs", () => {
    expect(assessSemanticJobs(source, { ...mixed, jobs: [safeJob] }).feasibility).toBe("FULLY_SAFE");
    const blocked = assessSemanticJobs(source, { ...mixed, jobs: [blockedJob] });
    expect(blocked.feasibility).toBe("BLOCKED");
    expect(blocked.execution).toBe("BLOCKED_PENDING_INFORMATION");
  });

  it("withholds a safe job coupled to missing information", () => {
    const assessment = assessSemanticJobs(source, { ...mixed, jobs: [{ ...safeJob, dependency: "COUPLED" }, blockedJob] });
    expect(assessment.authorizedJobIndices).toEqual([]);
    expect(assessment.withheldJobIndices).toEqual([0]);
    expect(assessment.execution).toBe("BLOCKED_PENDING_INFORMATION");
  });

  it("rejects invented evidence, misquoted requirements, and unsafe additive work", () => {
    expect(() => validateSemanticJobReview(source, objective, { ...mixed, jobs: [{ ...safeJob, sourceEvidence: [{ start: 0, end: 5, text: "false" }] }] })).toThrow("evidence");
    expect(() => validateSemanticJobReview(source, objective, { ...mixed, jobs: [{ ...safeJob, objectiveRequirement: "Add a result" }] })).toThrow("objective substring");
    expect(() => validateSemanticJobReview(source, objective, { ...mixed, jobs: [{ ...safeJob, operation: "ADD_CAUSE" }] })).toThrow("additive fact");
    expect(() => validateSemanticJobReview(source, objective, { ...mixed, jobs: [{ ...blockedJob, missingProposition: null }] })).toThrow("missing proposition");
  });

  it("requires distributed cited evidence for substantive authorization", () => {
    const broad = { ...safeJob, operation: "REORGANIZE" as const, scope: "DOCUMENT_WIDE" as const, dependency: "COUPLED" as const,
      sourceEvidence: [span("The release moved to Friday."), span("The next update is due Monday.")] };
    const review = { ...mixed, requestedScope: "SUBSTANTIVE_RECONSTRUCTION" as const, jobs: [broad] };
    expect(assessSemanticJobs(source, review).finalScope).toBe("SUBSTANTIVE_RECONSTRUCTION");
    expect(assessSemanticJobs(source, { ...review, jobs: [{ ...broad, sourceEvidence: [broad.sourceEvidence[0]] }] }).finalScope).toBe("DISTRIBUTED_LIGHT_EDIT");
  });

  it("exposes an explicit objective without gold metadata", () => {
    const request = semanticJobRequest({ source, profile: PRESETS.natural }, objective);
    expect(request.requestedObjective).toBe(objective);
    expect(request.source).toBe(source);
    expect(request).not.toHaveProperty("gold");
  });

  it("fails closed on unavailable, malformed, and timed-out reviewers with text-free telemetry", async () => {
    const input = { source, profile: PRESETS.natural };
    expect((await buildSemanticJobPlan(input, objective, null)).telemetry.execution).toBe("BLOCKED_PENDING_REVIEW");
    const invalid: SemanticJobClientV4 = { model: "fake", async review() { return { review: { sourceDiagnosis: "LEAVE_ALONE" } }; } };
    expect((await buildSemanticJobPlan(input, objective, invalid)).telemetry.outcome).toBe("invalid");
    const timed: SemanticJobClientV4 = { model: "fake", review(_request, signal) { return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })); } };
    expect((await buildSemanticJobPlan(input, objective, timed, 5)).telemetry.outcome).toBe("timeout");
    const good: SemanticJobClientV4 = { model: "fake", async review() { return { review: mixed, meta: { inputTokens: 140, outputTokens: 90 } }; } };
    const result = await buildSemanticJobPlan(input, objective, good);
    expect(result.telemetry.outcome).toBe("accepted");
    expect(result.telemetry.authorizedJobs).toBe(1);
    expect(result.telemetry.inputTokens).toBe(140);
    expect(JSON.stringify(result.telemetry)).not.toContain(source);
    expect(JSON.stringify(result.telemetry)).not.toContain(objective);
  });
});
