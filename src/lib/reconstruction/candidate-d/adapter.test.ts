import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runCandidateDControlV1 } from "./adapter";
import { replayCandidateD } from "../../../../tools/eval/candidate-d-frozen-replay";

type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
const corpus = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8")) as { cases: Case[] };
const outputs = readFileSync("data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl", "utf8")
  .trim().split("\n").map(line => JSON.parse(line) as { caseId: string; arm: string; raw: string });
const rawFor = (id: string) => outputs.find(row => row.caseId === id && row.arm === "V15")!.raw;

describe("Candidate D thin control adapter", () => {
  it("never invokes the editor on the eight KEEP fixtures", async () => {
    const editor = vi.fn(async () => { throw new Error("Must not execute"); });
    for (const row of corpus.cases.filter(row => row.primaryStratum === "already_good")) {
      const result = await runCandidateDControlV1({ ...row,
        quality: { kind: "NO_MATERIAL_DEFECT", evidence: "Explicit frozen fixture assessment" } }, editor);
      expect(result.terminal).toEqual({ status: "KEEP", text: row.source });
      expect(result.editorCalls).toBe(0);
    }
    expect(editor).not.toHaveBeenCalled();
  });

  it("retains all supplied-update RAWs and cannot fall back to stale SOURCE", async () => {
    for (const row of corpus.cases.filter(row => row.primaryStratum === "explicit_supplied_update")) {
      const raw = rawFor(row.caseId);
      const editor = vi.fn(async () => raw);
      const result = await runCandidateDControlV1(row, editor);
      expect(editor).toHaveBeenCalledExactlyOnceWith({ source: row.source, objective: row.objective });
      expect(result.terminal).toEqual({ status: "COMPLETED", text: raw });
      expect((await runCandidateDControlV1(row, async () => row.source)).terminal)
        .toMatchObject({ status: "ABSTAINED", text: null });
      if (result.state.kind !== "REQUIRED_UPDATE") throw new Error("Expected update");
      for (const delta of result.state.deltas) {
        const incomplete = raw.replace(delta.newText, delta.oldText);
        expect(incomplete).not.toBe(raw);
        expect((await runCandidateDControlV1(row, async () => incomplete)).terminal)
          .toMatchObject({ status: "ABSTAINED", text: null });
      }
    }
  });

  it("does not publish editor failures, invalid RAW, or unrelated mutations", async () => {
    const row = corpus.cases.find(row => row.caseId === "AC48V2-007")!;
    for (const editor of [
      async () => { throw new Error("private provider data"); }, async () => "",
      async () => rawFor(row.caseId).replace("There is no guarantee", "There is a guarantee"),
    ]) {
      const result = await runCandidateDControlV1(row, editor);
      expect(result.terminal).toMatchObject({ status: "ABSTAINED", text: null });
      expect(result.editorCalls).toBe(1);
      expect(JSON.stringify(result.terminal)).not.toContain("private provider data");
    }
  });

  it("abstains without editor access when a replacement cannot be bound", async () => {
    const editor = vi.fn(async () => "invented replacement");
    const row = corpus.cases.find(row => row.caseId === "AC48V2-012")!;
    expect((await runCandidateDControlV1(row, editor)).terminal).toMatchObject({ status: "ABSTAINED", text: null });
    expect(editor).not.toHaveBeenCalled();
  });

  it("reads general-edit RAW but does not pretend preservation proves objective completion", async () => {
    const row = corpus.cases.find(row => row.caseId === "AC48V2-015")!;
    const result = await runCandidateDControlV1(row, async () => rawFor(row.caseId));
    expect(result.state.kind).toBe("EDIT");
    expect(result.editorCalls).toBe(1);
    expect(result.terminal).toEqual({ status: "ABSTAINED", text: null, reason: "EDIT_VERIFICATION_UNSUPPORTED" });
  });

  it("replays all frozen cases with explicit disposition and comparison evidence", async () => {
    const replay = await replayCandidateD();
    expect(replay.rows).toHaveLength(48);
    expect(replay.summary).toMatchObject({
      suppliedUpdates: { total: 8, completed: 8 }, alreadyGood: { total: 8, keep: 8 },
      editorCallsOnKeep: 0, staleSourceAccepted: 0, correctUpdateRawRetained: 8,
      dispositions: { KEEP: 8, COMPLETED: 11, ABSTAINED: 29 },
      mechanicalDifferences: { IDENTICAL: 7, CHANGED: 12, WITHHELD: 29 }, liveModelCalls: 0,
      apparentSafetyRegressions: [],
    });
    for (const row of replay.rows) {
      if (row.disposition === "ABSTAINED") {
        expect(row.final).toBeNull();
        expect(row.reason).toEqual(expect.any(String));
        expect(row.changesAgainstV15Final).toBeNull();
      } else {
        expect(row.final).toEqual(expect.any(String));
        expect(row.inheritedSafety.length).toBeGreaterThan(0);
        expect(row.inheritedSafety.every(label => label === "SAFE")).toBe(true);
      }
    }
    expect(replay.summary.withheldPreviouslySafeFinals).toHaveLength(23);
    expect(replay.decision).toBe("B — ADAPTER WORKS, REPLAY EXPOSES FAILURES");
  });
});
