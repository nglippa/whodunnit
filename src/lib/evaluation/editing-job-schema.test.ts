import { describe, expect, it } from "vitest";
import { editingJobLabelSchema, validateEditingJobLabels } from "./editing-job-schema";

const partial = {
  id: "sample",
  scope: "DISTRIBUTED_LIGHT",
  feasibility: "PARTIALLY_SAFE",
  confidence: 0.8,
  rationale: "Repetition can be compressed, while the cause is absent.",
  coupling: "INDEPENDENT",
  couplingRationale: "The two jobs can be separated.",
  jobs: [
    { id: "compress", operation: "COMPRESS", objective: "Shorten the repeated status", scope: "DISTRIBUTED", sourceEvidence: ["The launch slipped."], feasibility: "SAFE", missingInformation: [], prohibitedInferences: [], rationale: "The same status appears again." },
    { id: "cause", operation: "ADD_INFORMATION", objective: "Explain the launch delay", scope: "LOCAL", sourceEvidence: ["The launch slipped."], feasibility: "BLOCKED", missingInformation: [{ proposition: "The actual reason for the delay", necessity: "REQUIRED_FOR_TRUTH" }], prohibitedInferences: ["Do not infer that staffing caused the delay."], rationale: "The source never names a cause." },
  ],
} as const;

describe("editing-job evaluation labels", () => {
  it("represents safe and blocked work in one document", () => {
    const label = editingJobLabelSchema.parse(partial);
    expect(() => validateEditingJobLabels([{ id: "sample", genre: "memo", creator: "synthetic", text: "The launch slipped. The launch slipped." }], [label])).not.toThrow();
  });

  it("rejects missing facts without a prohibited inference or source evidence", () => {
    const missingGuard = { ...partial, jobs: [partial.jobs[0], { ...partial.jobs[1], prohibitedInferences: [] }] };
    expect(() => editingJobLabelSchema.parse(missingGuard)).toThrow();
    const label = editingJobLabelSchema.parse(partial);
    expect(() => validateEditingJobLabels([{ id: "sample", genre: "memo", creator: "synthetic", text: "The launch moved." }], [label])).toThrow(/evidence absent/);
  });

  it("rejects a document-level partial label without both executable and blocked work", () => {
    expect(() => editingJobLabelSchema.parse({ ...partial, jobs: [partial.jobs[0]] })).toThrow(/executable and blocked/);
  });
});
