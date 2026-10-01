import { describe, expect, it } from "vitest";
import { entailmentLabelSchema, entailmentTaskSchema, validateEntailmentLabels } from "./plan-entailment-schema";

const task = entailmentTaskSchema.parse({ id: "A001", source: "The team may reopen the room if the inspection passes next Friday.",
  objective: "Make the next step clearer, but keep the inspection condition.", genre: "project update", creator: "A" });
const label = entailmentLabelSchema.parse({ id: "A001", feasibility: "FULLY_SAFE", confidence: 0.9, rationale: "The step and its condition are both present.",
  requirements: [{ id: "R1", text: "Make the next step clearer", type: "TRANSFORM", materiality: "REQUIRED" },
    { id: "R2", text: "keep the inspection condition", type: "PRESERVE", materiality: "REQUIRED" }],
  constraints: [{ id: "C1", sourceQuote: "if the inspection passes next Friday", mustPreserve: "Reopening remains conditional on the inspection.", kind: "CONDITION" }],
  jobs: [{ id: "J1", operation: "CLARIFY_EXISTING", requirementIds: ["R1", "R2"], feasibility: "SAFE", sourceEvidence: ["may reopen the room if the inspection passes next Friday"],
    missingProposition: null, mustPreserveIds: ["C1"], mustNotInfer: ["Do not state that reopening is certain."], coupling: "INDEPENDENT" }],
});

describe("plan entailment development labels", () => {
  it("accepts source-backed jobs with linked requirements and preservation constraints", () => {
    expect(() => validateEntailmentLabels([task], [label])).not.toThrow();
  });

  it("rejects absent evidence and broken label references", () => {
    expect(() => validateEntailmentLabels([task], [{ ...label, constraints: [{ ...label.constraints[0], sourceQuote: "if approval passes" }] }])).toThrow("constraint quote absent");
    expect(() => validateEntailmentLabels([task], [{ ...label, jobs: [{ ...label.jobs[0], requirementIds: ["R3"] }] }])).toThrow("unknown requirement");
    expect(() => validateEntailmentLabels([task], [{ ...label, jobs: [{ ...label.jobs[0], sourceEvidence: ["certain reopening"] }] }])).toThrow("job evidence absent");
  });

  it("requires a missing proposition for blocked work and safe work for partial feasibility", () => {
    expect(() => validateEntailmentLabels([task], [{ ...label, feasibility: "PARTIALLY_SAFE" }])).toThrow("feasibility/job mismatch");
    expect(() => validateEntailmentLabels([task], [{ ...label, feasibility: "BLOCKED", jobs: [{ ...label.jobs[0], feasibility: "BLOCKED", missingProposition: null }] }])).toThrow("blocked job without missing fact");
  });
});
