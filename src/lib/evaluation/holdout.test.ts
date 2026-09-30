import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertComparableBaseline, evaluateHoldoutText, lengthBand, sha256Bytes, summarizeHoldout, validateFrozenHoldout, type HoldoutResult } from "./holdout";

const text = "I checked the north gate at dawn. The latch held, and the hinge no longer scraped the frame. I left a note for Mara to check it after the rain.";
const docs = Array.from({ length: 60 }, (_, i) => ({ id: `C${String(i + 1).padStart(3, "0")}`, cohort: "clean", genre: "note", text: `${text} Note number ${i + 1}.`, provenance: "synthetic-newly-authored" }));
const labels = docs.map(({ id }) => ({ id, disposition: "LEAVE_ALONE", concepts: [], rationale: "A concrete note with no requested transformation.", ambiguous: false }));
function frozen(documentData: unknown = docs, labelData: unknown = labels) {
  const documentsRaw = `${JSON.stringify(documentData)}\n`;
  const labelsRaw = `${JSON.stringify(labelData)}\n`;
  const manifestRaw = JSON.stringify({ version: "1.0.0", created: "2026-09-30", documentsSha256: sha256Bytes(documentsRaw), labelsSha256: sha256Bytes(labelsRaw), reviewsSha256: sha256Bytes("[]\n"), provenance: "synthetic-newly-authored", creatorRoles: ["creator"], reviewerRole: "reviewer", frozenBeforeEvaluation: true });
  return { documentsRaw, labelsRaw, manifestRaw };
}

describe("frozen independent holdout", () => {
  it("keeps the tracked exam fingerprinted without evaluating its text", () => {
    const folder = path.join(process.cwd(), "data/evaluation/holdout/frozen");
    const raw = (name: string) => readFileSync(path.join(folder, name), "utf8");
    const { documents, labels, manifest } = validateFrozenHoldout(raw("documents.json"), raw("labels.json"), raw("manifest.json"), raw("blind-review.json"));
    expect(documents.length).toBeGreaterThanOrEqual(60);
    expect(labels).toHaveLength(documents.length);
    expect(manifest.frozenBeforeEvaluation).toBe(true);
    expect(documents[0]).not.toHaveProperty("disposition");
    expect(documents[0]).not.toHaveProperty("concepts");
  });
  it("rejects byte changes after freezing and validates the schema", () => {
    const data = frozen();
    expect(validateFrozenHoldout(data.documentsRaw, data.labelsRaw, data.manifestRaw).documents).toHaveLength(60);
    expect(() => validateFrozenHoldout(`${data.documentsRaw} `, data.labelsRaw, data.manifestRaw)).toThrow(/fingerprint/);
    expect(() => validateFrozenHoldout(data.documentsRaw, `${data.labelsRaw} `, data.manifestRaw)).toThrow(/fingerprint/);
    expect(() => validateFrozenHoldout(data.documentsRaw, data.labelsRaw, data.manifestRaw, "changed")).toThrow(/fingerprint/);
    expect(() => validateFrozenHoldout(...Object.values(frozen(docs.slice(0, 59))) as [string, string, string])).toThrow();
  });

  it("rejects orphaned, duplicate, and invalid annotations", () => {
    const orphan = labels.map((label, i) => i === 0 ? { ...label, id: "C999" } : label);
    const duplicate = labels.map((label, i) => i === 1 ? { ...label, id: "C001" } : label);
    const invalid = labels.map((label, i) => i === 0 ? { ...label, disposition: "MAYBE" } : label);
    for (const candidate of [orphan, duplicate, invalid]) {
      const { documentsRaw, labelsRaw, manifestRaw } = frozen(docs, candidate);
      expect(() => validateFrozenHoldout(documentsRaw, labelsRaw, manifestRaw)).toThrow();
    }
  });

  it("refuses a post-fix comparison if the exam changed", () => {
    const { manifest } = validateFrozenHoldout(...Object.values(frozen()) as [string, string, string]);
    const baseline = { kind: "deterministic-holdout-audit", run: "baseline-62259e8", engineBaselineCommit: "62259e8", holdoutVersion: manifest.version, documentsSha256: manifest.documentsSha256, labelsSha256: manifest.labelsSha256 };
    expect(() => assertComparableBaseline(baseline, manifest)).not.toThrow();
    expect(() => assertComparableBaseline({ ...baseline, labelsSha256: "changed" }, manifest)).toThrow(/differs/);
    expect(() => assertComparableBaseline({ ...baseline, run: "post-fix" }, manifest)).toThrow();
  });

  it("separates ambiguous annotations from hard planner error counts", () => {
    const evaluated = evaluateHoldoutText(text);
    const results: HoldoutResult[] = [
      { id: "C001", cohort: "clean", ...evaluated, planner: "LIGHT_EDIT", actionableFindings: 2 },
      { id: "P001", cohort: "problematic", ...evaluated, planner: "UNCHANGED", actionableFindings: 0 },
      { id: "M001", cohort: "mixed", ...evaluated, planner: "LIGHT_EDIT", actionableFindings: 1 },
    ];
    const gold = [
      { id: "C001", disposition: "LEAVE_ALONE" as const, concepts: [], rationale: "Concrete, complete prose.", ambiguous: false },
      { id: "P001", disposition: "SUBSTANTIVE_RECONSTRUCTION" as const, concepts: ["FORMULAIC" as const], rationale: "Generic and repetitive prose.", ambiguous: false },
      { id: "M001", disposition: "LIGHT_EDIT" as const, concepts: ["FORMULAIC" as const], rationale: "A small generic aside.", ambiguous: true },
    ];
    const report = summarizeHoldout(results, gold);
    expect(report.plannerMatrix.LEAVE_ALONE.LIGHT_EDIT).toBe(1);
    expect(report.plannerMatrix.SUBSTANTIVE_RECONSTRUCTION.UNCHANGED).toBe(1);
    expect(report.counts.ambiguous).toBe(1);
    expect(report.clean.actionableDocuments).toBe(1);
    expect(report.problematic.anyActionable).toBe(0);
    expect(report).not.toHaveProperty("score");
    expect(JSON.stringify(report)).not.toContain(text);
  });

  it("runs deterministic planning on text alone and reports length bands", () => {
    const result = evaluateHoldoutText(text);
    expect(result.v1WouldCallModel).toBe(true);
    expect(["UNCHANGED", "LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION"]).toContain(result.planner);
    expect(result.runtimeMs.total).toBeGreaterThanOrEqual(0);
    expect(result.pressure.localizedShare).toBeGreaterThanOrEqual(0);
    expect(lengthBand(79)).toBe("VERY_SHORT");
    expect(lengthBand(80)).toBe("SHORT");
    expect(lengthBand(200)).toBe("MEDIUM");
    expect(lengthBand(600)).toBe("LONG");
  });
});
