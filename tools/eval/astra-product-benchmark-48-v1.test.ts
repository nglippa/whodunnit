import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const base = resolve("data/evaluation/astra-product-benchmark-48-v1");
const rows = () => readFileSync(resolve(base, "outputs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));

describe("astra product benchmark storage", () => {
  test("keeps one explicit slot for every case and arm", () => {
    const output = rows();
    expect(output).toHaveLength(192);
    expect(new Set(output.map(row => `${row.caseId}/${row.arm}`)).size).toBe(192);
    for (const arm of ["SOURCE", "V15", "C", "ASTRA"])
      expect(output.filter(row => row.arm === arm)).toHaveLength(48);
  });

  test("keeps completed arms independent and preserves retry history", () => {
    const output = rows();
    for (const astra of output.filter(row => row.arm === "ASTRA")) {
      expect(astra).toMatchObject({
        status: "success", requestedModel: "gpt-6-astra", reasoningEffort: "high",
        runtimeModelMetadata: { model: "gpt-6-astra", effort: "high" },
        toolInvocationObserved: false, judged: false, validity: "valid",
        generationRoute: "top-level authenticated native session",
      });
      expect(output.find(row => row.caseId === astra.caseId && row.arm === "SOURCE"))
        .toMatchObject({ status: "success", modelCalls: 0 });
      const v15 = output.find(row => row.caseId === astra.caseId && row.arm === "V15");
      expect(v15).toMatchObject({ status: "success" });
      expect(v15.rawSha256).toEqual(expect.any(String));
      expect(output.find(row => row.caseId === astra.caseId && row.arm === "C"))
        .toMatchObject({
          status: "success", rawInputEqualityAsserted: true,
          v15RawSha256: v15.rawSha256, cInputSha256: v15.rawSha256,
        });
    }
    expect(output.find(row => row.caseId === "AC48V2-001" && row.arm === "V15").attemptHistory)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        status: "technical-failure", category: "editor-unavailable", modelCallsAttempted: 1,
      })]));
    expect(output.find(row => row.caseId === "AC48V2-001" && row.arm === "C").attemptHistory)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        status: "technical-failure", category: "missing-valid-v15-raw",
      })]));
  });

  test("records the account cost guard as an assumption, not certification", () => {
    const provenance = JSON.parse(readFileSync(resolve(base, "provenance.json"), "utf8"));
    expect(provenance.accountBackedCaller.confirmedNoIncrementalCostFlag).toEqual({
      valuePassedToFrozenImplementations: true,
      basis: "Internal product-benchmark assumption that the authenticated account subscription does not create a per-call API charge.",
      certification: "NOT_CERTIFIED_OR_INDEPENDENTLY_VERIFIED",
    });
  });

  test("source-copy Astra records use exact packet bytes", () => {
    const output = rows();
    for (const caseId of ["AC48V2-003", "AC48V2-004"]) {
      const packet = JSON.parse(readFileSync(resolve(base, "astra-packets", `${caseId}.json`), "utf8"));
      expect(output.find(row => row.caseId === caseId && row.arm === "ASTRA")?.text).toBe(packet.source);
    }
  });
});
