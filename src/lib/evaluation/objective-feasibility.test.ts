import { describe, expect, it } from "vitest";
import { editingTaskSchema, objectiveJobSchema, objectiveLabelSchema, validateObjectiveCorpus } from "./objective-feasibility-schema";
import { objectiveSemanticRequest } from "./objective-feasibility";

const source = { id: "S001", genre: "memo", creator: "A", text: "The release moved to Friday. The vendor had not certified the package by Wednesday. We will send an update after the test." };
const task = { id: "T001", sourceId: source.id, objective: "Make this concise.", objectiveCreator: "B" };
const job = { operation: "COMPRESS", requirement: "Make this concise", scope: "LOCAL", feasibility: "SAFE", sourceEvidence: ["The release moved to Friday."], missing: [], dependency: "INDEPENDENT", rationale: "The source includes the status to compress." } as const;

describe("objective-conditioned development evaluation", () => {
  it("keeps the source fixed while transporting distinct objectives in v3's existing context", () => {
    const concise = objectiveSemanticRequest(source.text, "Make this concise.");
    const causal = objectiveSemanticRequest(source.text, "Explain why the release moved.");
    expect(concise.source).toBe(causal.source);
    expect(concise.plannerRationale).toContain("Author's note: Make this concise.");
    expect(causal.plannerRationale).toContain("Author's note: Explain why the release moved.");
    expect(concise).not.toHaveProperty("gold");
    expect(concise).not.toHaveProperty("expectedFeasibility");
  });

  it("rejects a partial label without both safe and blocked requested work", () => {
    expect(objectiveLabelSchema.safeParse({ taskId: task.id, feasibility: "PARTIALLY_SAFE", scope: "LOCAL", confidence: 0.9, jobs: [job], rationale: "Some requested work is blocked." }).success).toBe(false);
  });

  it("requires evidence for safe work and an exact missing proposition for blocked work", () => {
    expect(objectiveJobSchema.safeParse({ ...job, sourceEvidence: [] }).success).toBe(false);
    expect(objectiveJobSchema.safeParse({ ...job, feasibility: "BLOCKED", sourceEvidence: [], missing: [] }).success).toBe(false);
  });

  it("checks task references, exact source evidence, and complete labels", () => {
    const label = objectiveLabelSchema.parse({ taskId: task.id, feasibility: "FULLY_SAFE", scope: "LOCAL", confidence: 0.9, jobs: [job], rationale: "A concise edit is possible." });
    const parsedTask = editingTaskSchema.parse(task);
    expect(() => validateObjectiveCorpus([source], [parsedTask], [label])).not.toThrow();
    expect(() => validateObjectiveCorpus([source], [parsedTask], [{ ...label, jobs: [{ ...label.jobs[0], sourceEvidence: ["invented fact"] }] }])).toThrow("source evidence absent");
  });
});
