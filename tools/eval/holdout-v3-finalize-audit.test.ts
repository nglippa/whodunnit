import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertExactFinalAuditIds, finalAuditInterpretation } from "./holdout-v3-finalize-audit";
import { type AuditResponse } from "./holdout-v3-audit";

const archive = resolve("data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1");
const read = (name: string) => JSON.parse(readFileSync(resolve(archive, name), "utf8"));
describe("final additive V3 audit", () => {
  it("rejects duplicate and missing inventories", () => {
    expect(() => assertExactFinalAuditIds(["V3-001", "V3-001"], ["V3-001", "V3-002"], "test")).toThrow("inventory mismatch");
    expect(() => assertExactFinalAuditIds(["V3-001"], ["V3-001", "V3-002"], "test")).toThrow("inventory mismatch");
  });
  it("preserves unresolved adjudication instead of coercing good loss", () => {
    const rows = read("interpretations.json");
    for (const caseId of ["V3-091", "V3-113"]) {
      const row = rows.find((value: { caseId: string }) => value.caseId === caseId);
      expect(finalAuditInterpretation(row.firstAuditJudgment as AuditResponse["rows"][number], row.adjudication)).toMatchObject({ rawClass: "DISPUTED", materialGoodEditLost: "DISPUTED" });
    }
    expect(rows.find((row: { caseId: string }) => row.caseId === "V3-095").interpretation).toMatchObject({ rawClass: "DISPUTED", finalClass: "DISPUTED", materialGoodEditLost: null });
  });
  it("verifies every archived input byte and generated table commitment", () => {
    const commitments = read("commitments.json");
    const hash = (name: string) => createHash("sha256").update(readFileSync(resolve(archive, name))).digest("hex");
    for (const [name, expected] of Object.entries(commitments.inputs)) expect(hash(name)).toBe(expected);
    expect(hash("interpretations.json")).toBe(commitments.interpretationSha256);
    expect(hash("summary.json")).toBe(commitments.summarySha256);
    const rows = read("interpretations.json");
    expect(rows).toHaveLength(119);
    expect(rows.filter((row: { firstAuditJudgment: unknown }) => row.firstAuditJudgment)).toHaveLength(85);
    expect(rows.find((row: { caseId: string }) => row.caseId === "V3-105").evidenceFlags[0]).toContain("CONTAMINATION");
    expect(read("summary.json")).toMatchObject({ rawClasses: { GOOD_RAW: 68, BAD_RAW: 13, OTHER: 35, DISPUTED: 3 }, finalClasses: { GOOD_FINAL: 47, OTHER: 71, DISPUTED: 1 }, materialGoodEditsLost: 25, unsafeFinal: [] });
  });
});
