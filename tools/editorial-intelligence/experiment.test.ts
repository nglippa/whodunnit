import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { blind, judgePacket, protocol, runHoldout, runPair, signTest, summarize, validateDiagnosis,
  validateHoldout, validateJudgment, type Caller, type Judgment, type Pair, type Receipt } from "./experiment";

const rawHoldout = JSON.parse(readFileSync("data/experiments/editorial-intelligence-v1/holdout.json", "utf8"));
const frozen = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8"));
const holdout = validateHoldout(rawHoldout, frozen.cases.map((row: { source: string }) => row.source));
const row = holdout.cases[0];
const diagnosis = (source: string) => ({ naturalness: "ALREADY_NATURAL", naturalnessEvidence: [{ quote: source, reason: "Concrete fixture" }],
  objectiveChangeNeed: "OPTIONAL", objectiveReason: "Optional editing fixture", defects: [],
  voiceToPreserve: [{ quote: source, reason: "Preserve fixture voice" }], untouched: [], scope: "KEEP", scopeReason: "Already works" });
let serial = 0;
function receipt(data: unknown, model = protocol.editorModel as string, provenance: Receipt["provenance"] = "test"): Receipt {
  return { provenance, model, requestId: "test-request-" + serial++, inputTokens: 20, outputTokens: 10,
    reasoningTokens: null, costUsd: null, latencyMs: 5, data };
}
function editor(): Caller {
  return { available: true, model: protocol.editorModel, invoke: vi.fn(async request => {
    const payload = request.payload as { source: string };
    return receipt(request.stage === "diagnosis" ? diagnosis(payload.source) : { disposition: "UNCHANGED", text: payload.source });
  }) };
}
const rating = (source: string) => ({ naturalness: 4, voiceFidelity: 4, restraint: 4,
  objectiveCompletion: "YES" as const, factualIntegrity: "SAFE" as const,
  evidence: [{ from: "SOURCE" as const, quote: source, reason: "Bound fixture evidence" }] });

async function experimentFixture() {
  const pairs: Pair[] = [];
  for (const row of holdout.cases) pairs.push(await runPair(row, editor()));
  const blinded = blind(pairs, "unit-test-only-seed");
  const judgments: Judgment[] = blinded.map(item => ({ caseId: item.packet.caseId,
    X: rating(item.packet.source), Y: rating(item.packet.source), safePreference: "TIE", reason: "Test fixture tie" }));
  const judges = judgments.map(result => receipt(result, protocol.judgeModel));
  return { pairs, blinded, judgments, judges };
}

describe("isolated editorial intelligence experiment", () => {
  it("validates 12 fresh unique cases, two per required stratum", () => {
    expect(holdout.cases).toHaveLength(12);
    expect(() => validateHoldout(rawHoldout, [row.source])).toThrow("Development source reused");
    expect(() => validateHoldout({ ...rawHoldout, cases: rawHoldout.cases.slice(1) }, [])).toThrow();
    expect(() => validateHoldout({ ...rawHoldout, cases: rawHoldout.cases.map(() => row) }, [])).toThrow("Duplicate");
  });

  it("requires SOURCE evidence and consistent objective-aware diagnosis", () => {
    expect(validateDiagnosis(diagnosis(row.source), row.source).scope).toBe("KEEP");
    expect(() => validateDiagnosis({ ...diagnosis(row.source), defects: [{ quote: "not in source", reason: "invented" }] }, row.source)).toThrow("evidence absent");
    expect(() => validateDiagnosis({ ...diagnosis(row.source), objectiveChangeNeed: "REQUIRED" }, row.source)).toThrow("KEEP conflicts");
    expect(() => validateDiagnosis({ ...diagnosis(row.source), scope: "ABSTAIN" }, row.source)).toThrow("Inconsistent");
  });

  it("uses the exact same editor and equal total output caps, recording the extra diagnosis call", async () => {
    const caller = editor(), pair = await runPair(row, caller);
    expect(pair.calls.map(call => call.stage)).toEqual(["direct", "diagnosis", "reconstruction"]);
    const requests = vi.mocked(caller.invoke).mock.calls.map(([request]) => request);
    expect(requests.map(request => request.model)).toEqual(Array(3).fill(protocol.editorModel));
    expect(requests[0].maxOutputTokens).toBe(requests[1].maxOutputTokens + requests[2].maxOutputTokens);
    expect(requests.every(request => request.reasoningEffort === "high" && request.attempts === 1 && !request.tools && !request.sessionMemory)).toBe(true);
    expect((requests[2].payload as { diagnosis: unknown }).diagnosis).toEqual(pair.diagnosis);
    expect((requests[0].payload as { diagnosis?: unknown }).diagnosis).toBeUndefined();
    expect((await runPair(row, editor(), true)).calls.map(call => call.stage)).toEqual(["diagnosis", "reconstruction", "direct"]);
  });

  it("stops before generation when editor or independent judge capacity is missing", async () => {
    const caller = editor();
    await expect(runPair(row, { ...caller, available: false })).rejects.toThrow("unavailable");
    await expect(runHoldout(holdout, caller, { ...caller, available: false, model: protocol.judgeModel })).rejects.toThrow("before generation");
    expect(caller.invoke).not.toHaveBeenCalled();
  });

  it("rejects model substitution, missing accounting and malformed finals without retry", async () => {
    for (const result of [receipt({}, "substitute"), { ...receipt({}), requestId: "" },
      { ...receipt({}), inputTokens: NaN }, { ...receipt({}), outputTokens: 999999 },
      receipt({ disposition: "UNCHANGED", text: "different source" })]) {
      const caller: Caller = { available: true, model: protocol.editorModel, invoke: vi.fn(async () => result) };
      await expect(runPair(row, caller)).rejects.toThrow();
      expect(caller.invoke).toHaveBeenCalledTimes(1);
    }
  });

  it("stops a diagnosis with fabricated evidence before reconstruction", async () => {
    const caller: Caller = { available: true, model: protocol.editorModel, invoke: vi.fn(async () =>
      receipt({ ...diagnosis("fabricated source"), scope: "LOCAL" })) };
    await expect(runPair(row, caller, true)).rejects.toThrow("evidence absent");
    expect(caller.invoke).toHaveBeenCalledTimes(1);
  });

  it("counterbalances blind positions and excludes arm/model/diagnosis metadata from judge packets", async () => {
    const { blinded } = await experimentFixture();
    expect(blinded.filter(item => item.mapping.X === "A")).toHaveLength(6);
    for (const item of blinded) {
      expect(Object.keys(item.packet).sort()).toEqual(["X", "Y", "caseId", "objective", "source"]);
      expect(typeof item.packet.X).toBe("string");
      expect(typeof item.packet.Y).toBe("string");
    }
    const caller = editor();
    await expect(judgePacket(blinded[0].packet, caller)).rejects.toThrow("Independent");
    expect(caller.invoke).not.toHaveBeenCalled();
  });

  it("does not count SAFE/PARTIAL as a successful preferred final or accept invented judge evidence", async () => {
    const { blinded, judgments } = await experimentFixture();
    const packet = blinded[0].packet, judgment = judgments[0];
    expect(() => validateJudgment({ ...judgment, X: { ...judgment.X, objectiveCompletion: "PARTIAL" }, safePreference: "X" }, packet)).toThrow("partial");
    expect(() => validateJudgment({ ...judgment, X: { ...judgment.X, evidence: [{ from: "SOURCE", quote: "fabricated", reason: "bad" }] } }, packet)).toThrow("evidence absent");
    expect(() => validateJudgment({ ...judgment, caseId: "different" }, packet)).toThrow("case mismatch");
  });

  it("requires a meaningful paired blind advantage and preserves unknown costs", async () => {
    const { pairs, blinded, judgments, judges } = await experimentFixture();
    const livePairs = pairs.map(pair => ({ ...pair, calls: pair.calls.map(call => ({ ...call, receipt: { ...call.receipt, provenance: "live" as const } })) }));
    const liveJudges = (values: Judgment[]) => judges.map((call, i) => ({ ...call, data: values[i], provenance: "live" as const }));
    const preferences = judgments.map((judgment, i) => ({ ...judgment, safePreference:
      (i < 10 ? blinded[i].mapping.X === "B" ? "X" : "Y" : blinded[i].mapping.X === "A" ? "X" : "Y") as "X" | "Y" }));
    const result = summarize(livePairs, blinded, preferences, liveJudges(preferences));
    expect(result.decision).toBe("A — SPECIALIZED DIAGNOSIS IMPROVES EDITORIAL QUALITY");
    expect(result.preference).toMatchObject({ A: 2, B: 10 });
    expect(result.inference.A.costUsd).toBeNull();
    expect(result.inference.B.reasoningTokens).toBeNull();
    expect(result.inference.B.inputTokens).toBe(2 * result.inference.A.inputTokens);
    expect(summarize(livePairs, blinded, judgments, liveJudges(judgments)).decision).toBe("B — NO MEANINGFUL IMPROVEMENT");
    expect(summarize(pairs, blinded, preferences, judges.map((call, i) => ({ ...call, data: preferences[i] }))).decision).toBe("C — EXPERIMENT INCOMPLETE");
    expect(signTest(9, 3)).toBeGreaterThan(0.05);
    expect(signTest(10, 2)).toBeLessThan(0.05);
  });

  it("rejects specialization if it loses factual integrity or completion on any paired case", async () => {
    const { pairs, blinded, judgments, judges } = await experimentFixture();
    const livePairs = pairs.map(pair => ({ ...pair, calls: pair.calls.map(call => ({ ...call, receipt: { ...call.receipt, provenance: "live" as const } })) }));
    const liveJudges = (values: Judgment[]) => judges.map((call, i) => ({ ...call, data: values[i], provenance: "live" as const }));
    for (const regression of [{ factualIntegrity: "UNSAFE" }, { objectiveCompletion: "PARTIAL" }]) {
      const preferences = judgments.map((judgment, i) => {
        const bLabel = blinded[i].mapping.X === "B" ? "X" : "Y", aLabel = bLabel === "X" ? "Y" : "X";
        return { ...judgment, ...(i === 11 ? { [bLabel]: { ...judgment[bLabel], ...regression } } : {}),
          safePreference: i < 10 ? bLabel : aLabel } as Judgment;
      });
      expect(summarize(livePairs, blinded, preferences, liveJudges(preferences))).toMatchObject({ decision: "B — NO MEANINGFUL IMPROVEMENT", pairedNoRegression: false });
    }
    const partialRegression = judgments.map((judgment, i) => {
      const b = blinded[i].mapping.X === "B" ? "X" : "Y", a = b === "X" ? "Y" : "X";
      return i === 11 ? { ...judgment,
        [a]: { ...judgment[a], factualIntegrity: "UNCERTAIN", objectiveCompletion: "PARTIAL" },
        [b]: { ...judgment[b], factualIntegrity: "UNSAFE", objectiveCompletion: "NO" }, safePreference: "NEITHER_SAFE" } as Judgment
        : { ...judgment, safePreference: i < 10 ? b : a } as Judgment;
    });
    expect(summarize(livePairs, blinded, partialRegression, liveJudges(partialRegression)))
      .toMatchObject({ decision: "B — NO MEANINGFUL IMPROVEMENT", pairedNoRegression: false });
  });

  it("rejects duplicate, incomplete or tampered blinded results", async () => {
    const { pairs, blinded, judgments, judges } = await experimentFixture();
    expect(() => summarize(pairs, blinded, judgments.slice(1), judges)).toThrow("inventory");
    const tampered = blinded.map((item, i) => i ? item : { ...item, packet: { ...item.packet, source: "other" } });
    expect(() => summarize(pairs, tampered, judgments, judges)).toThrow("mapping/input mismatch");
    expect(() => summarize(pairs, blinded, judgments.map(() => judgments[0]), judges)).toThrow("inventory");
    expect(() => summarize(pairs, blinded, judgments, judges.map(call => ({ ...call, data: "other judgment" })))).toThrow("not bound");
  });
});
