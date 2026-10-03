import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSupplementalReviewTier, finalMaterialMetrics, materialMetrics } from "./holdout-v3-report";
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
function supplementalFixture() {
  const mapping = Array.from({ length: 25 }, (_, i) => ({ caseId: `V3-${String(i + 1).padStart(3, "0")}`, itemId: `blind-${String(i + 1).padStart(32, "0")}`, outputA: i % 2 ? "RAW" : "FINAL", outputB: i % 2 ? "FINAL" : "RAW", reasonCodes: ["CUSTODIAN_REASON"] }));
  const mappingBytes = Buffer.from(JSON.stringify(mapping)), reviewerPackets = {} as Record<"S1" | "S2", Buffer>, reviewerSubmission = {} as Record<"S1" | "S2", { packet: Buffer; original: Buffer; canonical: Buffer; submissionCommitment: Buffer }>;
  const labels = (better: boolean) => ({ objectiveSatisfied: better ? "YES" : "PARTIAL", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "N/A" });
  for (const [reviewerId, start, end] of [["S1", 0, 13], ["S2", 13, 25]] as const) {
    const packet = { protocol: "v3-supplemental-blind-review-packet-v1", reviewerId, rows: mapping.slice(start, end).map((row, offset) => ({ itemId: row.itemId, source: `source-${start + offset}`, objective: `objective-${start + offset}`, outputA: `A-${start + offset}`, outputB: `B-${start + offset}` })) };
    const packetBytes = Buffer.from(JSON.stringify(packet)), rows = packet.rows.map((row, offset) => ({ itemId: row.itemId, outputA: labels(offset % 2 === 0), outputB: labels(offset % 2 !== 0), pairwise: "EQUIVALENT", evidence: { outputA: "synthetic A evidence", outputB: "synthetic B evidence", pairwise: "synthetic pairwise evidence" } }));
    const response = Buffer.from(JSON.stringify({ protocol: "v3-blind-review-submission-v1", reviewerId, rows }));
    const subCommit = Buffer.from(JSON.stringify({ protocol: "v3-supplemental-blind-review-submission-commitment-v1", reviewerId, rowCount: rows.length, packetSha256: digest(packetBytes), originalResponseSha256: digest(response), canonicalResponseSha256: digest(response) }));
    reviewerPackets[reviewerId] = packetBytes; reviewerSubmission[reviewerId] = { packet: packetBytes, original: response, canonical: response, submissionCommitment: subCommit };
  }
  const custodianMappingSha256 = digest(mappingBytes), commitments = { protocol: "v3-supplemental-blind-review-commitments-v1", frozenManifestSha256: "a".repeat(64), primaryPacketSha256: "b".repeat(64), mappingSha256: "c".repeat(64), selectionSha256: "d".repeat(64), auditQueueSha256: "e".repeat(64), auditCommitmentsSha256: "f".repeat(64), auditResponses: Array.from({ length: 5 }, (_, i) => ({ auditorId: `A${i + 1}`, packetSha256: "1".repeat(64), originalSha256: "2".repeat(64), canonicalSha256: "3".repeat(64) })), selectedCount: 25, assignmentCounts: [13, 12], packetSha256: [digest(reviewerPackets.S1), digest(reviewerPackets.S2)], custodianMappingSha256 };
  const commitmentsBytes = Buffer.from(JSON.stringify(commitments));
  const pins = { commitments: digest(commitmentsBytes), mapping: custodianMappingSha256, packets: { S1: digest(reviewerPackets.S1), S2: digest(reviewerPackets.S2) }, submissions: Object.fromEntries(([["S1", reviewerSubmission.S1], ["S2", reviewerSubmission.S2]] as const).map(([id, row]) => [id, { original: digest(row.original), canonical: digest(row.canonical), commitment: digest(row.submissionCommitment) }])) as Record<"S1" | "S2", { original: string; canonical: string; commitment: string }> };
  return { input: { commitmentsBytes, mappingBytes, reviewers: reviewerSubmission }, pins };
}
describe("additive V3 metrics", () => {
  it("keeps disputed good/bad cases out of definitive denominators", () => {
    const report = materialMetrics([
      { raw: "GOOD", final: "OTHER", disputed: false },
      { raw: "GOOD", final: "OTHER", disputed: true },
      { raw: "BAD", final: "OTHER", disputed: false },
      { raw: "BAD", final: "BAD", disputed: true },
    ]);
    expect(report.goodLoss).toEqual({ numerator: 1, denominator: 1, fraction: 1 });
    expect(report.badCatch).toEqual({ numerator: 1, denominator: 1, fraction: 1 });
    expect(report.raw.DISPUTED).toBe(2);
    expect(report.rawLabelsWithoutDisputeFilter.GOOD).toBe(2);
  });
  it("does not invent a rate with no classified cases", () => {
    expect(materialMetrics([]).badCatch.fraction).toBeNull();
  });
  it("validates and reports the supplemental tier separately with paired field counts and per-case flags", () => {
    const fixture = supplementalFixture(), report = buildSupplementalReviewTier(fixture.input, fixture.pins);
    expect(report.selection).toBe("OUTCOME_TRIGGERED");
    expect(report.denominator).toBe(25);
    expect(report.reviewerStats.S1).toMatchObject({ count: 13 });
    expect(report.reviewerStats.S2).toMatchObject({ count: 12 });
    expect(report.rows).toHaveLength(25);
    expect(report.rows.every(row => Object.keys(row).includes("pairedRawFinal") && typeof row.pairedRawFinal.anyDifference === "boolean")).toBe(true);
    expect(report.pairedRawFinal.rawFieldCounts.objectiveSatisfied).toEqual({ PARTIAL: 13, YES: 12 });
    expect(report.pairedRawFinal.finalFieldCounts.objectiveSatisfied).toEqual({ YES: 13, PARTIAL: 12 });
    expect(report.rows.some(row => row.pairedRawFinal.anyDifference)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("CUSTODIAN_REASON");
  });
  it("rejects pin drift, altered original/canonical content, and duplicate or missing assignments", () => {
    const fixture = supplementalFixture();
    expect(() => buildSupplementalReviewTier(fixture.input, { ...fixture.pins, mapping: "0".repeat(64) })).toThrow("top-level artifact pin mismatch");
    const drifted = { ...fixture.input, reviewers: { ...fixture.input.reviewers, S1: { ...fixture.input.reviewers.S1, canonical: Buffer.from("{}")} } };
    expect(() => buildSupplementalReviewTier(drifted, fixture.pins)).toThrow("submission artifact pin mismatch");
    const mapping = JSON.parse(fixture.input.mappingBytes.toString("utf8")); mapping[0].itemId = mapping[1].itemId;
    const mappingBytes = Buffer.from(JSON.stringify(mapping)), pins = { ...fixture.pins, mapping: digest(mappingBytes), commitments: fixture.pins.commitments };
    expect(() => buildSupplementalReviewTier({ ...fixture.input, mappingBytes }, pins)).toThrow();
  });
});

describe("sealed final interpretation denominators", () => {
  it("preserves disputed final outcomes without calling them losses or catches", () => {
    const row = (caseId: string, rawClass: "GOOD_RAW" | "BAD_RAW", finalClass: "GOOD_FINAL" | "OTHER" | "DISPUTED", lost: boolean | "DISPUTED") => ({
      caseId, interpretationSource: "FIRST_MANDATORY_AUDIT" as const, originalBlindLabels: [], firstAuditJudgment: null, adjudication: null, evidenceFlags: [],
      interpretation: { rawClass, finalClass, materialGoodEditLost: lost, unsafeFinal: false, repair: "NONE", fallback: "NONE", evidence: "fixture" },
    });
    const report = finalMaterialMetrics([row("V3-001", "GOOD_RAW", "GOOD_FINAL", false), row("V3-002", "GOOD_RAW", "DISPUTED", "DISPUTED"), row("V3-003", "BAD_RAW", "DISPUTED", false)]);
    expect(report.goodRetained).toEqual({ numerator: 1, denominator: 1, fraction: 1 });
    expect(report.unresolvedGoodOutcomeIds).toEqual(["V3-002"]);
    expect(report.badCaught).toEqual({ numerator: 0, denominator: 0, fraction: null });
    expect(report.unresolvedBadOutcomeIds).toEqual(["V3-003"]);
  });
});
