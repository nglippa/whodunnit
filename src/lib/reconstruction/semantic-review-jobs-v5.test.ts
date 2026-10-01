import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { assessSemanticJobReviewV5, semanticJobRequestV5, type SemanticReviewV5 } from "./semantic-review-jobs-v5";

const source = "The team may move the event indoors if attendance stays below 50. The venue is booked for Friday.";
const objective = "Clarify the indoor option and explain why attendance might fall.";
const span = (body: string, text: string) => ({ start: body.indexOf(text), end: body.indexOf(text) + text.length, text });
const evidence = span(source, "The team may move the event indoors if attendance stays below 50.");
const review: SemanticReviewV5 = {
  sourceDiagnosis: "LEAVE_ALONE", requestedScope: "LOCAL_EDIT", noEditReason: null,
  requirements: [
    { id: "R1", objectiveSpan: span(objective, "Clarify the indoor option"), type: "TRANSFORM", materiality: "REQUIRED" },
    { id: "R2", objectiveSpan: span(objective, "and explain why attendance might fall."), type: "TRANSFORM", materiality: "REQUIRED" },
  ],
  jobs: [
    { operation: "CLARIFY_EXISTING", requirementIds: ["R1"], instruction: "State the indoor move as a conditional possibility.", scope: "LOCAL", feasibility: "SAFE",
      sourceEvidence: [evidence], missingProposition: null, dependency: "INDEPENDENT", confidence: 0.9, mustNotInfer: [],
      mustPreserve: [
        { sourceSpan: evidence, kind: "HEDGE", instruction: "Keep the move possible, not certain." },
        { sourceSpan: evidence, kind: "CONDITION", instruction: "Keep the attendance condition attached." },
        { sourceSpan: evidence, kind: "QUANTITY", instruction: "Keep the below-fifty threshold unchanged." },
      ] },
    { operation: "ADD_CAUSE", requirementIds: ["R2"], instruction: "Explain why attendance may fall below the threshold.", scope: "LOCAL", feasibility: "BLOCKED",
      sourceEvidence: [], missingProposition: "The actual reason attendance might fall", dependency: "INDEPENDENT", confidence: 0.9,
      mustPreserve: [], mustNotInfer: ["Do not infer a cause from the indoor contingency."] },
  ],
};

describe("semantic-review.v5 source-grounded job planning", () => {
  it("derives partial feasibility while keeping an independent safe job", () => {
    const result = assessSemanticJobReviewV5(source, objective, review);
    expect(result.outcome).toBe("accepted");
    expect(result.feasibility).toBe("PARTIALLY_SAFE");
    expect(result.authorizedJobIndices).toEqual([0]);
    expect(result.blockedJobIndices).toEqual([1]);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.uncoveredObjectiveText).toEqual([]);
    expect(JSON.stringify(result.telemetry)).not.toContain(source);
    expect(JSON.stringify(result.telemetry)).not.toContain(objective);
  });

  it("withholds one unsafe job without erasing independent safe work", () => {
    const bad = { ...review.jobs[1], feasibility: "SAFE" as const, sourceEvidence: [evidence], missingProposition: null,
      mustPreserve: review.jobs[0].mustPreserve };
    const result = assessSemanticJobReviewV5(source, objective, { ...review, jobs: [review.jobs[0], bad] });
    expect(result.outcome).toBe("partial_validation");
    expect(result.authorizedJobIndices).toEqual([0]);
    expect(result.withheldJobIndices).toEqual([1]);
    expect(result.uncoveredRequirementIds).toEqual(["R2"]);
  });

  it("withholds a job that loses a known conditional marker", () => {
    const bad = { ...review.jobs[0], mustPreserve: review.jobs[0].mustPreserve.filter((item) => item.kind !== "CONDITION") };
    const result = assessSemanticJobReviewV5(source, objective, { ...review, jobs: [bad, review.jobs[1]] });
    expect(result.jobs[0].issueCodes).toContain("PRESERVATION");
    expect(result.authorizedJobIndices).toEqual([]);
    expect(result.blockedJobIndices).toEqual([1]);
  });

  it("records objective omissions without hiding otherwise safe jobs", () => {
    const result = assessSemanticJobReviewV5(source, objective, { ...review, requirements: [review.requirements[0]], jobs: [review.jobs[0]] });
    expect(result.uncoveredObjectiveText).toContain("and explain why attendance might fall.");
    expect(result.authorizedJobIndices).toEqual([0]);
    expect(result.feasibility).toBe("PARTIALLY_SAFE");
  });

  it("keeps v5 requests separate from gold labels and production", () => {
    const request = semanticJobRequestV5({ source, profile: PRESETS.natural }, objective);
    expect(request.requestedObjective).toBe(objective);
    expect(request.source).toBe(source);
    expect(request).not.toHaveProperty("gold");
  });
});
