import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyObjectiveState, exactAuthorizedUpdate, selectCandidateDTerminal } from "./control";

type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
type Output = { caseId: string; arm: string; raw?: string };
const root = process.cwd();
const corpus = JSON.parse(readFileSync(resolve(root, "data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json"), "utf8")) as { cases: Case[] };
const outputs = readFileSync(resolve(root, "data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl"), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line) as Output);
const rawFor = (caseId: string) => outputs.find((row) => row.caseId === caseId && row.arm === "V15")?.raw;
const updates = corpus.cases.filter((row) => row.primaryStratum === "explicit_supplied_update");
const good = corpus.cases.filter((row) => row.primaryStratum === "already_good");

describe("Candidate D first control slice", () => {
  it("binds all eight frozen supplied updates and rejects obsolete SOURCE", () => {
    expect(updates).toHaveLength(8);
    for (const row of updates) {
      const state = classifyObjectiveState(row.source, row.objective);
      expect(state.kind, row.caseId).toBe("REQUIRED_UPDATE");
      if (state.kind !== "REQUIRED_UPDATE") continue;
      expect(state.deltas.length, row.caseId).toBeGreaterThan(0);
      for (const delta of state.deltas) {
        expect(row.source.slice(delta.sourceStart, delta.sourceEnd), row.caseId).toBe(delta.oldText);
        expect(row.objective.slice(delta.objectiveStart, delta.objectiveEnd), row.caseId).toBe(delta.newText);
        expect(delta.sourceClaim, row.caseId).toContain(delta.oldText);
      }
      expect(exactAuthorizedUpdate(state), row.caseId).toBe(rawFor(row.caseId));
      expect(selectCandidateDTerminal(state, row.source), row.caseId).toMatchObject({ status: "ABSTAINED", text: null });
      expect(selectCandidateDTerminal(state, rawFor(row.caseId)), row.caseId).toMatchObject({ status: "COMPLETED", text: rawFor(row.caseId) });
    }
  });

  it("keeps all eight already-good sources without an editor", () => {
    expect(good).toHaveLength(8);
    for (const row of good) {
      const state = classifyObjectiveState(row.source, row.objective,
        { kind: "NO_MATERIAL_DEFECT", evidence: `Frozen already-good case ${row.caseId}` });
      expect(state.kind, row.caseId).toBe("KEEP");
      expect(selectCandidateDTerminal(state), row.caseId).toEqual({ status: "KEEP", text: row.source });
      expect(classifyObjectiveState(row.source, row.objective).kind, row.caseId).toBe("EDIT");
    }
  });

  it("does not let a good-prose assessment override a factual update", () => {
    const row = updates[0];
    const state = classifyObjectiveState(row.source, row.objective,
      { kind: "NO_MATERIAL_DEFECT", evidence: "Stylistically sound source" });
    expect(state.kind).toBe("REQUIRED_UPDATE");
    expect(selectCandidateDTerminal(state, row.source)).toMatchObject({ status: "ABSTAINED", text: null });
  });

  it("abstains for five confirmed missing-value stale-fallback cases", () => {
    for (const id of [10, 11, 12, 33, 34]) {
      const row = corpus.cases.find((item) => item.caseId === `AC48V2-${String(id).padStart(3, "0")}`)!;
      const state = classifyObjectiveState(row.source, row.objective);
      expect(state.kind, row.caseId).toBe("CANNOT_SAFELY_COMPLETE");
      expect(selectCandidateDTerminal(state, row.source), row.caseId).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("covers localized stale fallbacks without guessing unsupported discourse links", () => {
    for (const id of [45, 46]) {
      const row = corpus.cases.find((item) => item.caseId === `AC48V2-${String(id).padStart(3, "0")}`)!;
      const state = classifyObjectiveState(row.source, row.objective);
      expect(state.kind, row.caseId).toBe("REQUIRED_UPDATE");
      if (state.kind !== "REQUIRED_UPDATE") continue;
      expect(exactAuthorizedUpdate(state), row.caseId).toBe(rawFor(row.caseId));
      expect(selectCandidateDTerminal(state, row.source), row.caseId).toMatchObject({ status: "ABSTAINED", text: null });
      expect(selectCandidateDTerminal(state, rawFor(row.caseId)), row.caseId).toMatchObject({ status: "COMPLETED" });
    }
    // 022 needs a cross-sentence referent: Soren is named in the preceding sentence.
    // 044 replaces a phrase with a differently shaped date. Neither is bound by this slice.
    for (const id of [22, 44]) {
      const row = corpus.cases.find((item) => item.caseId === `AC48V2-${String(id).padStart(3, "0")}`)!;
      const state = classifyObjectiveState(row.source, row.objective);
      expect(state.kind, row.caseId).toBe("CANNOT_SAFELY_COMPLETE");
      expect(selectCandidateDTerminal(state, row.source), row.caseId).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("uses money roles rather than monetary order", () => {
    const row = updates.find((item) => item.caseId === "AC48V2-029")!;
    const reversed = "Update the total charge to £576 and the hourly rate to £48. Keep twelve hours and the payment terms unchanged.";
    const state = classifyObjectiveState(row.source, reversed);
    expect(state.kind).toBe("REQUIRED_UPDATE");
    if (state.kind === "REQUIRED_UPDATE") expect(exactAuthorizedUpdate(state)).toBe(rawFor(row.caseId));
    expect(classifyObjectiveState(row.source, "Update the amounts to £48 and £576.").kind)
      .toBe("CANNOT_SAFELY_COMPLETE");
  });

  it("abstains when update authority is ambiguous or a replacement is absent", () => {
    const examples = [
      ["The route is 7 kilometres.", "Update the route length; the new figure is not supplied."],
      ["Room Alder is open. Room Alder has a lift.", "Replace Room Alder with Room Willow."],
      ["The loan lasts fourteen days.", "Update the loan period to twenty-one days, but also keep fourteen days."],
      ["The route is 7 kilometres.", "Do not update the route to 8 kilometres."],
      ["The rate is £45. The wall is blue.", "Update the rate to £48 and replace the wall color with red."],
    ] as const;
    for (const [source, objective] of examples) {
      const state = classifyObjectiveState(source, objective);
      expect(state.kind, objective).toBe("CANNOT_SAFELY_COMPLETE");
      expect(selectCandidateDTerminal(state, source)).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("rejects incomplete changes and unrelated mutations across preservation dimensions", () => {
    const row = updates.find((item) => item.caseId === "AC48V2-007")!;
    const state = classifyObjectiveState(row.source, row.objective);
    expect(state.kind).toBe("REQUIRED_UPDATE");
    if (state.kind !== "REQUIRED_UPDATE") return;
    const correct = exactAuthorizedUpdate(state);
    const mutations = [
      correct.replace("32 visitors", "40 visitors"), // missing required number update
      correct.replace("There is no guarantee", "There is a guarantee"), // negation
      correct.replace("32 visitors", "30 visitors"), // invented number
      correct.replace("Saturday, February 7", "Sunday, February 8"), // date
      correct.replace("may change what we can see", "will change what we can see"), // certainty
      correct.replace("quieter than the later one", "louder than the later one"), // comparison
      correct.replace("school portal", "district portal"), // unrelated entity / claim
      correct.replace("indoor demonstration will still go ahead", "indoor demonstration will be canceled"), // unrelated claim
    ];
    for (const candidate of mutations) {
      expect(candidate).not.toBe(correct);
      expect(selectCandidateDTerminal(state, candidate)).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("does not presume that an ordinary edit is complete before an editor is connected", () => {
    const source = "This sentence is awkward but true.";
    const state = classifyObjectiveState(source, "Rewrite this sentence for clarity.");
    expect(state.kind).toBe("EDIT");
    expect(selectCandidateDTerminal(state, source)).toMatchObject({ status: "NEEDS_EDITOR", text: null });
  });
});
