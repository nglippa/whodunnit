import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/domain/style";
import { runCandidateDSafeEditV2, type FrozenEditReview } from "./safe-edit-adapter";
import { replayCandidateDSafeEdit, reviewsFromFrozenV15 } from "../../../../tools/eval/candidate-d-safe-edit-replay";

type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
const corpus = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8")) as { cases: Case[] };
type V15Row = Parameters<typeof reviewsFromFrozenV15>[1];
const outputs = readFileSync("data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl", "utf8")
  .trim().split("\n").map(line => JSON.parse(line) as V15Row);
const get = (id: string) => {
  const row = corpus.cases.find(item => item.caseId === id)!;
  const v15 = outputs.find(item => item.caseId === id && item.arm === "V15")!;
  return { row, v15, input: { request: { source: row.source, profile: PRESETS.natural }, objective: row.objective }, reviews: reviewsFromFrozenV15(row, v15) };
};
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "Verified unchanged objective-valid text.", issue: null };

function evidence(source: string, objective: string, candidate: string, review: unknown = pass): FrozenEditReview {
  return { source, objective, candidate, review };
}

describe("Candidate D safe ordinary EDIT routing", () => {
  it("reuses the V15 deterministic and frozen semantic verification for accepted ordinary RAW", async () => {
    const { input, v15, reviews } = get("AC48V2-013");
    const editor = vi.fn(async () => v15.raw);
    const result = await runCandidateDSafeEditV2(input, editor, reviews);
    expect(result.state.kind).toBe("EDIT");
    expect(result.terminal).toEqual({ status: "COMPLETED", text: v15.raw });
    expect(result.verificationRoute).toBe("V15_RAW");
    expect(editor).toHaveBeenCalledTimes(1);
  });

  it("does not accept a deterministic rejection with a manufactured PASS review", async () => {
    const { input, row, v15 } = get("AC48V2-015");
    const result = await runCandidateDSafeEditV2(input, async () => v15.raw, [evidence(row.source, row.objective, v15.raw)]);
    expect(result.terminal).toMatchObject({ status: "ABSTAINED", text: null });
    expect(result.rawFallbackReason).toBe("hard-meaning-failure");
  });

  it("does not treat a SAFE V15 SOURCE fallback as objective-verified", async () => {
    for (const id of ["AC48V2-017", "AC48V2-024", "AC48V2-040", "AC48V2-041", "AC48V2-043", "AC48V2-048"]) {
      const { input, v15, reviews } = get(id);
      const result = await runCandidateDSafeEditV2(input, async () => v15.raw, reviews);
      expect(result.terminal, id).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("requires the exact SOURCE, objective and candidate binding and a valid PASS schema", async () => {
    const { input, row, v15, reviews } = get("AC48V2-013");
    const original = reviews[0];
    for (const forged of [
      [{ ...original, source: row.source + "!" }],
      [{ ...original, objective: "A different objective" }],
      [{ ...original, candidate: "A different reviewed candidate" }],
      [original, original],
      [{ ...original, review: { ...pass, objectiveSatisfied: false } }],
      [{ ...original, review: { ...pass, unsupportedInformation: true } }],
      [{ ...original, review: { ...pass, verdict: "REJECT" } }],
      [{ ...original, review: { ...pass, extraField: true } }],
    ]) {
      expect((await runCandidateDSafeEditV2(input, async () => v15.raw, forged)).terminal)
        .toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("verifies SOURCE separately rather than reusing the RAW review", async () => {
    const { input, row, v15, reviews } = get("AC48V2-018");
    // SOURCE is judged objective-valid but there is no saved V15 review of SOURCE.
    expect((await runCandidateDSafeEditV2(input, async () => row.source, reviews)).terminal)
      .toMatchObject({ status: "ABSTAINED", text: null });
    expect(v15.raw).not.toBe(row.source);
    // Positive control: an independent bound SOURCE PASS permits valid fallback.
    const source = "We met by the gate. The path was quiet.";
    const objective = "Lightly improve the flow if useful; the existing wording may be retained.";
    const result = await runCandidateDSafeEditV2({ request: { source, profile: PRESETS.natural }, objective },
      async () => source + " The price is $99.", [evidence(source, objective, source)]);
    expect(result.verificationRoute).toBe("V15_SOURCE");
    expect(result.terminal).toEqual({ status: "COMPLETED", text: source });
  });

  it("keeps V15 blocking protections for unauthorized numbers, dates, negation and quotations", async () => {
    const { input, row, v15 } = get("AC48V2-013");
    const mutants = [
      v15.raw.replace("may not touch", "may touch"),
      v15.raw.replace("A Map of Almost Home", "A Map of Home"),
      v15.raw + " Admission costs $99.",
      v15.raw + " The exhibit closes on November 4.",
    ];
    for (const raw of mutants) {
      expect(raw).not.toBe(v15.raw);
      const result = await runCandidateDSafeEditV2(input, async () => raw, [evidence(row.source, row.objective, raw)]);
      expect(result.terminal).toMatchObject({ status: "ABSTAINED", text: null });
    }
  });

  it("cannot reuse captured RAW review for an unrelated semantic substitution", async () => {
    const { input, v15, reviews } = get("AC48V2-013");
    const raw = v15.raw.replace("wheelchairs", "bicycles");
    expect(raw).not.toBe(v15.raw);
    expect((await runCandidateDSafeEditV2(input, async () => raw, reviews)).terminal)
      .toMatchObject({ status: "ABSTAINED", text: null });
  });

  it("preserves strict updates, missing-value abstentions and zero-call KEEP", async () => {
    for (const row of corpus.cases.filter(row => row.primaryStratum === "explicit_supplied_update")) {
      const { input, v15 } = get(row.caseId);
      const completed = await runCandidateDSafeEditV2(input, async () => v15.raw, []);
      expect(completed.terminal).toEqual({ status: "COMPLETED", text: v15.raw });
      expect(completed.state.kind).toBe("REQUIRED_UPDATE");
      if (completed.state.kind !== "REQUIRED_UPDATE") throw new Error("Expected update state");
      for (const delta of completed.state.deltas) {
        const incomplete = v15.raw.replace(delta.newText, delta.oldText);
        expect(incomplete).not.toBe(v15.raw);
        expect((await runCandidateDSafeEditV2(input, async () => incomplete,
          [evidence(row.source, row.objective, incomplete)])).terminal)
          .toMatchObject({ status: "ABSTAINED", text: null });
      }
      expect((await runCandidateDSafeEditV2(input, async () => row.source, [evidence(row.source, row.objective, row.source)])).terminal)
        .toMatchObject({ status: "ABSTAINED", text: null });
    }
    const editor = vi.fn(async () => "Must not be read");
    for (const row of corpus.cases.filter(row => row.primaryStratum === "already_good")) {
      const { input } = get(row.caseId);
      const result = await runCandidateDSafeEditV2({ ...input, quality: { kind: "NO_MATERIAL_DEFECT", evidence: "Fixture quality assessment" } }, editor, []);
      expect(result.terminal).toEqual({ status: "KEEP", text: row.source });
      expect(result.editorCalls).toBe(0);
    }
    const { input } = get("AC48V2-012");
    expect((await runCandidateDSafeEditV2(input, editor, [])).terminal).toMatchObject({ status: "ABSTAINED", text: null });
    expect(editor).not.toHaveBeenCalled();
  });

  it("preserves rejected and repaired review provenance", () => {
    const { row, v15 } = get("AC48V2-043");
    expect(reviewsFromFrozenV15(row, v15)[0].candidate).toBe(v15.raw);
    expect(v15.text).toBe(row.source);
    const repaired = { ...v15, text: "A separately repaired text", result: { ...v15.result,
      trace: { ...v15.result.trace, outcome: "repaired" as const } } };
    expect(reviewsFromFrozenV15(row, repaired)[0].candidate).toBe(repaired.text);
    expect(reviewsFromFrozenV15(row, { ...v15, result: { ...v15.result, candidate: "mismatched RAW" } })).toEqual([]);
  });

  it("recovers safe coverage while retaining the old replay and reporting actual failures", async () => {
    const replay = await replayCandidateDSafeEdit();
    expect(replay.abstentionAudit).toHaveLength(29);
    expect(replay.rows).toHaveLength(48);
    expect(replay.summary).toMatchObject({
      suppliedUpdates: { total: 8, completed: 8 }, alreadyGood: { total: 8, keep: 8 },
      editorCallsOnKeep: 0, staleSourceSuccesses: 0, correctUpdateRawRetained: 8,
      dispositions: { COMPLETED: 21, KEEP: 8, ABSTAINED: 19 },
      safeV15FinalsRecovered: { recovered: 10, total: 23 },
      unsafeV15FinalsRejected: { rejected: 12, total: 12 },
      unauthorizedFactualChangesAccepted: 0, apparentSafetyConcerns: [], verifiedRawReturns: 21, sourceReturns: 8, verifiedSourceFallbacks: 0,
      recoveredObjectiveLabels: { YES: 9, PARTIAL: 1 }, liveModelCalls: 0,
    });
    expect(replay.decision).toBe("B — PARTIAL COVERAGE RECOVERED");
    const changed = replay.rows.filter(row => row.changedFromPrevious);
    expect(changed).toHaveLength(10);
    expect(changed.every(row => row.classification === "EDIT" && row.verificationRoute === "V15_RAW" && row.equalsV15Final)).toBe(true);
  });
});
