import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/domain/style";
import { runCandidateDMechanicalV3 } from "./mechanical-adapter";
import { reviewsFromFrozenV15 } from "../../../../tools/eval/candidate-d-safe-edit-replay";
import { frozenSentenceIntent, replayCandidateDMechanical } from "../../../../tools/eval/candidate-d-mechanical-replay";

type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
const corpus = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8")) as { cases: Case[] };
const outputs = readFileSync("data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl", "utf8").trim().split("\n")
  .map(line => JSON.parse(line) as Parameters<typeof reviewsFromFrozenV15>[1]);
function get(id = "AC48V2-036") {
  const row = corpus.cases.find(row => row.caseId === id)!;
  const v15 = outputs.find(row => row.caseId === id && row.arm === "V15")!;
  const input = { request: { source: row.source, profile: PRESETS.natural }, objective: row.objective,
    sentenceEdit: frozenSentenceIntent(row.source, row.objective) };
  return { row, v15, input, reviews: reviewsFromFrozenV15(row, v15) };
}

describe("Candidate D final mechanical sentence route", () => {
  it("recovers exact 036 RAW with explicit intent while retaining the classifier state", async () => {
    const { input, v15, reviews } = get();
    const editor = vi.fn(async () => v15.raw);
    const result = await runCandidateDMechanicalV3(input, editor, reviews);
    expect(result.state.kind).toBe("CANNOT_SAFELY_COMPLETE");
    expect(result.terminal).toEqual({ status: "COMPLETED", text: v15.raw });
    expect(result.verificationRoute).toBe("V15_SENTENCE_EDIT");
    expect(editor).toHaveBeenCalledTimes(1);
  });

  it("requires unique complete-sentence scope and exact input binding before reading RAW", async () => {
    const { input, v15, reviews } = get();
    const intent = input.sentenceEdit!;
    for (const sentenceEdit of [undefined, { ...intent, source: intent.source + "!" },
      { ...intent, objective: intent.objective + "!" }, { ...intent, sourceSentence: "discussion" },
      { ...intent, sourceSentence: input.request.source }]) {
      const editor = vi.fn(async () => v15.raw);
      expect((await runCandidateDMechanicalV3({ ...input, sentenceEdit }, editor, reviews)).terminal.status).toBe("ABSTAINED");
      expect(editor).not.toHaveBeenCalled();
    }
    const source = intent.sourceSentence + " " + intent.sourceSentence;
    const editor = vi.fn(async () => source);
    expect((await runCandidateDMechanicalV3({ ...input, request: { ...input.request, source },
      sentenceEdit: { ...intent, source } }, editor, [])).terminal.status).toBe("ABSTAINED");
    expect(editor).not.toHaveBeenCalled();
  });

  it("rejects out-of-scope changes, deletion and multiple replacement sentences", async () => {
    const { row, input, v15, reviews } = get();
    const sentence = input.sentenceEdit!.sourceSentence;
    for (const raw of [v15.raw.replace("fictional", "real"), row.source.replace(sentence, ""),
      row.source.replace(sentence, "Groups discussed transcription choices. They ranked the formats.")]) {
      const result = await runCandidateDMechanicalV3(input, async () => raw, reviews);
      expect(result.terminal).toMatchObject({ status: "ABSTAINED", reason: "SENTENCE_EDIT_SCOPE_NOT_VERIFIED" });
    }
  });

  it("requires unchanged V15 verification and exact unique objective-satisfying review", async () => {
    const { input, row, v15, reviews } = get();
    const review = reviews[0];
    for (const evidence of [[], [review, review], [{ ...review, candidate: row.source }],
      [{ ...review, objective: "Other objective" }], [{ ...review, source: row.source + "!" }],
      [{ ...review, review: { ...v15.result.review, verdict: "REJECT" } }],
      [{ ...review, review: { ...v15.result.review, objectiveSatisfied: false } }],
      [{ ...review, review: { ...v15.result.review, unsupportedInformation: true } }],
      [{ ...review, review: { ...v15.result.review, extraField: true } }]]) {
      expect((await runCandidateDMechanicalV3(input, async () => v15.raw, evidence)).terminal.status).toBe("ABSTAINED");
    }
    expect((await runCandidateDMechanicalV3(input, async () => row.source, reviews)).terminal.status).toBe("ABSTAINED");
    const raw = row.source.replace(input.sentenceEdit!.sourceSentence, "The exercise required groups to rank the formats.");
    const result = await runCandidateDMechanicalV3(input, async () => raw, [{ ...review, candidate: raw }]);
    expect(result.terminal.status).toBe("ABSTAINED");
  });

  it("leaves 022 and every excluded case abstained", async () => {
    for (const id of ["022", "044", "015", "017", "023", "024", "037", "041", "040", "043", "047", "048"]) {
      const { input, v15, reviews } = get("AC48V2-" + id);
      expect((await runCandidateDMechanicalV3(input, async () => v15.raw, reviews)).terminal.status, id).toBe("ABSTAINED");
    }
  });

  it("cannot use sentence intent to license factual changes or override KEEP/required updates", async () => {
    const { row, input, v15, reviews } = get("AC48V2-022");
    const factualIntent = { kind: "SENTENCE_EDIT" as const, source: row.source, objective: row.objective,
      sourceSentence: "The telephone extension currently printed here is 218." };
    expect((await runCandidateDMechanicalV3({ ...input, sentenceEdit: factualIntent }, async () => v15.raw, reviews)).terminal)
      .toMatchObject({ status: "ABSTAINED", reason: "SENTENCE_EDIT_NOT_VERIFIED" });
    for (const row of corpus.cases.filter(row => ["already_good", "explicit_supplied_update"].includes(row.primaryStratum))) {
      const { input, v15, reviews } = get(row.caseId);
      const editor = vi.fn(async () => row.source);
      const result = await runCandidateDMechanicalV3({ ...input,
        quality: row.primaryStratum === "already_good" ? { kind: "NO_MATERIAL_DEFECT", evidence: "Frozen fixture" } : undefined,
        sentenceEdit: { kind: "SENTENCE_EDIT", source: row.source, objective: row.objective, sourceSentence: row.source },
      }, editor, reviews);
      if (row.primaryStratum === "already_good") {
        expect(result.terminal).toEqual({ status: "KEEP", text: row.source });
        expect(editor).not.toHaveBeenCalled();
      } else {
        expect(result.state.kind).toBe("REQUIRED_UPDATE");
        expect(result.terminal.status).toBe("ABSTAINED");
        expect(v15.raw).not.toBe(row.source);
      }
    }
  });

  it("validates the frozen 48-case comparison and all hard invariants", async () => {
    const replay = await replayCandidateDMechanical();
    expect(replay.decision).toBe("A — MECHANICAL RECOVERY COMPLETE");
    expect(replay.rows).toHaveLength(48);
    expect(replay.comparisonToV2).toMatchObject({ changedCases: ["AC48V2-036"], recovered036: true, recovered022: false });
    expect(replay.summary).toMatchObject({ suppliedUpdates: { total: 8, completed: 8 }, alreadyGood: { total: 8, keep: 8 },
      editorCallsOnKeep: 0, staleSourceSuccesses: 0, correctUpdateRawRetained: 8,
      dispositions: { COMPLETED: 22, KEEP: 8, ABSTAINED: 18 }, safeV15FinalsRecovered: { recovered: 11, total: 23 },
      unsafeV15FinalsRejected: { rejected: 12, total: 12 }, unauthorizedFactualChangesAccepted: 0,
      apparentSafetyConcerns: [], verifiedRawReturns: 22, sourceReturns: 8, liveModelCalls: 0 });
  });
});
