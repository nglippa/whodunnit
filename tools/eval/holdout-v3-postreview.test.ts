import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSupplementalSelection, classifyReviewOutput, constructPostReviewArtifacts, deriveCleanPool, rankAuditSample, summarizeInitialMetrics } from "./holdout-v3-postreview";

const seed = "bac22382bae2468130ac244cdedd671c0bdbfe001a8ed688531768f6e1639188";
const expectedSample = ["V3-033", "V3-075", "V3-027", "V3-057", "V3-028", "V3-090", "V3-052", "V3-119", "V3-053", "V3-066", "V3-005", "V3-083", "V3-099", "V3-032", "V3-076"];
const supplementalIds = ["V3-002", "V3-007", "V3-012", "V3-017", "V3-030", "V3-031", "V3-035", "V3-038", "V3-040", "V3-043", "V3-045", "V3-054", "V3-059", "V3-063", "V3-064", "V3-067", "V3-072", "V3-080", "V3-094", "V3-095", "V3-106", "V3-110"];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const rank = (ids: string[]) => [...ids].sort((a, b) => digest(`${seed}\0${a}`).localeCompare(digest(`${seed}\0${b}`)) || a.localeCompare(b));
const baseGood = { objectiveSatisfied: "YES", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "NO" } as const;
const labels = (kind: "good" | "bad" | "other") => kind === "good" ? { ...baseGood } : kind === "bad" ? { ...baseGood, meaningPreserved: "NO" as const } : { ...baseGood, objectiveSatisfied: "PARTIAL" as const };
const row = (itemId: string, rawKind: "good" | "bad" | "other", finalKind: "good" | "bad" | "other", swap: boolean) => {
  const raw = labels(rawKind), final = labels(finalKind);
  return { itemId, outputA: swap ? final : raw, outputB: swap ? raw : final, pairwise: "EQUIVALENT" as const, evidence: { outputA: "synthetic evidence A", outputB: "synthetic evidence B", pairwise: "synthetic comparison" } };
};
function makeFixture() {
  const allIds = Array.from({ length: 119 }, (_, index) => `V3-${String(index + 1).padStart(3, "0")}`);
  const supplemental = new Set(supplementalIds);
  const expectedSet = new Set(expectedSample);
  const cutoff = digest(`${seed}\0${expectedSample.at(-1)}`);
  const tailClean = rank(allIds.filter(id => !supplemental.has(id) && !expectedSet.has(id) && digest(`${seed}\0${id}`).localeCompare(cutoff) > 0)).slice(0, 48);
  const cleanPool = [...expectedSample, ...tailClean];
  const noSecondClean = cleanPool.slice(0, 37), fixedClean = cleanPool.filter(id => !noSecondClean.includes(id));
  const noSecond = new Set([...supplementalIds, ...noSecondClean]);
  const fixed = allIds.filter(id => !noSecond.has(id));
  const remainingFixed = fixed.filter(id => !fixedClean.includes(id));
  const retainedExcluded = remainingFixed.slice(0, 10), fixedLoss = remainingFixed.slice(10, 14), primaryBad = remainingFixed.slice(14, 24), primaryOther = remainingFixed.slice(24);
  const primaryItems = allIds.map((caseId, index) => {
    const kind = noSecondClean.includes(caseId) || supplemental.has(caseId) || fixedClean.includes(caseId) || retainedExcluded.includes(caseId) || fixedLoss.includes(caseId) ? "good" : primaryBad.includes(caseId) ? "bad" : "other";
    const finalKind = noSecondClean.includes(caseId) || fixedClean.includes(caseId) || retainedExcluded.includes(caseId) ? "good" : "other";
    const itemId = `blind-${String(index).padStart(32, "0")}`;
    return { caseId, itemId, row: row(itemId, kind, finalKind, Number(caseId.slice(3)) % 2 === 1) };
  });
  const fixedItems = primaryItems.filter(item => !noSecond.has(item.caseId));
  const secondItems = fixedItems.map(item => {
    let rawKind: "good" | "bad" | "other", finalKind: "good" | "bad" | "other";
    if (fixedClean.includes(item.caseId)) { rawKind = "good"; finalKind = "good"; }
    else if (retainedExcluded.includes(item.caseId)) { rawKind = retainedExcluded.indexOf(item.caseId) < 6 ? "good" : "other"; finalKind = "other"; }
    else if (fixedLoss.includes(item.caseId)) { rawKind = "good"; finalKind = "other"; }
    else if (primaryBad.includes(item.caseId) || primaryOther.includes(item.caseId)) {
      const slot = primaryBad.concat(primaryOther).indexOf(item.caseId);
      rawKind = slot < 13 ? "good" : slot < 17 ? "bad" : "other";
      finalKind = slot < 4 ? "good" : "other";
    } else { throw new Error("fixture grouping error"); }
    return { ...item, row: row(item.itemId, rawKind, finalKind, Number(item.caseId.slice(3)) % 2 === 1) };
  });
  const primarySorted = [...primaryItems].sort((a, b) => a.itemId.localeCompare(b.itemId));
  const secondSorted = [...secondItems].sort((a, b) => a.itemId.localeCompare(b.itemId));
  const primaryReviewers = ["O1A", "O1B", "O1C", "O1D"] as const, secondReviewers = ["O2A", "O2B"] as const;
  const records = [
    ...primarySorted.map((item, index) => ({ ...item, reviewerId: primaryReviewers[Math.min(3, Math.floor(index / 30))]!, phase: "primary" as const, outputASide: Number(item.caseId.slice(3)) % 2 === 1 ? "FINAL" as const : "RAW" as const, outputBSide: Number(item.caseId.slice(3)) % 2 === 1 ? "RAW" as const : "FINAL" as const, originalRow: item.row })),
    ...secondSorted.map((item, index) => ({ ...item, reviewerId: secondReviewers[Math.floor(index / 30)]!, phase: "second" as const, outputASide: Number(item.caseId.slice(3)) % 2 === 1 ? "FINAL" as const : "RAW" as const, outputBSide: Number(item.caseId.slice(3)) % 2 === 1 ? "RAW" as const : "FINAL" as const, originalRow: item.row })),
  ];
  const mapping = primaryItems.map(item => ({ itemId: item.itemId, caseId: item.caseId, outputA: Number(item.caseId.slice(3)) % 2 === 1 ? "FINAL" as const : "RAW" as const, outputB: Number(item.caseId.slice(3)) % 2 === 1 ? "RAW" as const : "FINAL" as const, identical: false, rawSha256: "1".repeat(64), finalSha256: "2".repeat(64), secondReview: !noSecond.has(item.caseId) }));
  const fixedSecondCaseIds = new Set(fixed);
  return { records, mapping, fixedSecondCaseIds, cleanPool, primaryItems, secondItems };
}

describe("V3 post-review label-only audit selection", () => {
  it("classifies strict good, bad proxy, uncertainty, and other without using pairwise", () => {
    expect(classifyReviewOutput(labels("good"))).toBe("STRICT_GOOD");
    expect(classifyReviewOutput(labels("bad"))).toBe("BAD_PROXY");
    expect(classifyReviewOutput({ ...baseGood, objectiveSatisfied: "PARTIAL" })).toBe("OTHER");
    expect(classifyReviewOutput({ ...baseGood, voicePreserved: "UNCERTAIN" })).toBe("UNCERTAIN");
  });

  it("computes a 63-case clean pool and the pinned deterministic 15-case sample", () => {
    const fixture = makeFixture();
    expect(deriveCleanPool(fixture.records)).toEqual(fixture.cleanPool.sort());
    expect(fixture.cleanPool).toHaveLength(63);
    expect(rankAuditSample(fixture.cleanPool)).toEqual(expectedSample);
  });

  it("keeps the six-core STRICT_GOOD class separate from clean-pool flags", () => {
    const fixture = makeFixture();
    const excludedId = fixture.cleanPool.find(id => !expectedSample.includes(id))!;
    const records = fixture.records.map(record => {
      if (record.caseId !== excludedId) return record;
      const markOveredited = (value: typeof record.originalRow.outputA) => ({ ...value, overedited: "YES" as const });
      return { ...record, originalRow: { ...record.originalRow, outputA: markOveredited(record.originalRow.outputA), outputB: markOveredited(record.originalRow.outputB) } };
    });
    expect(classifyReviewOutput({ ...baseGood, overedited: "YES" })).toBe("STRICT_GOOD");
    const cleanPool = deriveCleanPool(records);
    expect(cleanPool).toHaveLength(62);
    expect(cleanPool).not.toContain(excludedId);
    expect(rankAuditSample(cleanPool)).toEqual(expectedSample);
    expect(buildSupplementalSelection(records, fixture.fixedSecondCaseIds).selected.map(item => item.caseId)).toEqual([...supplementalIds].sort());
  });

  it("derives exact supplemental cases and custodian-only label reason codes", () => {
    const fixture = makeFixture();
    const selection = buildSupplementalSelection(fixture.records, fixture.fixedSecondCaseIds);
    expect(selection.audience).toBe("CUSTODIAN_ONLY");
    expect(selection.selected.map(item => item.caseId)).toEqual([...supplementalIds].sort());
    expect(selection.selected.every(item => item.reasonCodes.includes("POSSIBLE_GOOD_LOSS"))).toBe(true);
  });

  it("keeps reviewer metrics separate and fails closed on count drift", () => {
    const fixture = makeFixture();
    const summary = summarizeInitialMetrics(fixture.records, {});
    expect(summary.primary).toMatchObject({ reviewedCount: 119, raw: { STRICT_GOOD: 99, BAD_PROXY: 10 }, retained: 73, possibleLoss: 26 });
    expect(summary.second).toMatchObject({ reviewedCount: 60, raw: { STRICT_GOOD: 49, BAD_PROXY: 4 }, retained: 30, possibleLoss: 19 });
    expect(Object.keys(summary.byReviewer)).toEqual(["O1A", "O1B", "O1C", "O1D", "O2A", "O2B"]);
    expect(() => summarizeInitialMetrics(fixture.records.slice(1), {})).toThrow("reviewer coverage mismatch");
  });

  it("emits label-only unblinded rows and immutable seed/rule selections", () => {
    const fixture = makeFixture();
    const artifacts = constructPostReviewArtifacts(fixture.records, fixture.mapping, fixture.fixedSecondCaseIds, {}, { blindPrimary: "pinned" });
    expect(artifacts.unblindedLabels.reviewCount).toBe(179);
    expect(artifacts.unblindedLabels.rows.every(item => Object.keys(item).sort().join(",") === ["blindItemId", "caseId", "labels", "outputASide", "outputBSide", "phase", "reviewerId"].sort().join(","))).toBe(true);
    expect(artifacts.auditSelection).toMatchObject({ traceValuesRead: false, cleanPoolCount: 63, selectedCount: 15, seed });
    expect(artifacts.auditSelection.selectedIds).toEqual(expectedSample);
    expect(artifacts.supplementalSecondSelection.selected.map(item => item.caseId)).toEqual([...supplementalIds].sort());
    expect(Object.keys(artifacts.unblindedLabels.rows[0]!.labels)).toEqual(["itemId", "outputA", "outputB", "pairwise", "evidence"]);
  });
});
