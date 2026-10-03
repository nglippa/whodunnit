import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exclusiveAtomicDirectory } from "./holdout-v3-reviews";
import { constructSupplementalPackets, validateSupplementalSubmission, writeSupplementalSubmissionFiles, type SupplementalSubmission } from "./holdout-v3-supplemental";

const selected = ["002", "007", "012", "017", "030", "031", "035", "038", "040", "043", "045", "054", "059", "063", "064", "067", "072", "080", "094", "095", "106", "110"];
const selectedSet = new Set([...selected.map(value => `V3-${value}`), "V3-082", "V3-028", "V3-086"]);
const ids = Array.from({ length: 119 }, (_, i) => `V3-${String(i + 1).padStart(3, "0")}`);
const makeInputs = () => {
  const withSecondReview = new Set(ids.filter(caseId => !selectedSet.has(caseId)).slice(0, 60));
  const mapping = ids.map((caseId, i) => ({ itemId: `blind-${String(i + 1).padStart(32, "0")}`, caseId, outputA: i % 2 ? "RAW" as const : "FINAL" as const, outputB: i % 2 ? "FINAL" as const : "RAW" as const, identical: false, rawSha256: "a".repeat(64), finalSha256: "b".repeat(64), secondReview: withSecondReview.has(caseId) }));
  const primaryPacket = mapping.map(({ itemId }, i) => ({ itemId, source: `source-${i}`, objective: `objective-${i}`, outputA: `A-${i}`, outputB: `B-${i}` }));
  const selection = selected.map(value => ({ caseId: `V3-${value}`, reasonCodes: ["SEALED_REASON"] }));
  return { frozenCaseIds: ids, mapping, primaryPacket, selection, auditPacketSha256: Array(5).fill("c".repeat(64)), auditResponseRows: [
    { caseId: "V3-028", goodRetentionStatus: "GOOD_LOST", vagueUpdateObserved: "NO" },
    { caseId: "V3-086", goodRetentionStatus: "GOOD_LOST", vagueUpdateObserved: "NO" },
    { caseId: "V3-082", goodRetentionStatus: "OTHER", vagueUpdateObserved: "YES" },
  ] };
};
const dirs: string[] = [];
const tempDir = () => { const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "v3-supplemental-test-"))); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("V3 additive supplemental blind reviews", () => {
  it("creates the exact 25-case union, sorted 13/12 by opaque ID, with no custodian fields in reviewer packets", () => {
    const result = constructSupplementalPackets(makeInputs());
    expect(result.reviewerPackets.map(packet => [packet.reviewerId, packet.rows.length])).toEqual([["S1", 13], ["S2", 12]]);
    const all = result.reviewerPackets.flatMap(packet => packet.rows);
    expect(new Set(all.map(row => row.itemId)).size).toBe(25);
    expect(all.map(row => row.itemId)).toEqual([...all.map(row => row.itemId)].sort());
    for (const row of all) expect(Object.keys(row).sort()).toEqual(["itemId", "objective", "outputA", "outputB", "source"]);
    expect(JSON.stringify(result.reviewerPackets)).not.toMatch(/caseId|reasonCodes|RAW|FINAL|secondReview|trace/);
    expect(result.custodian).toHaveLength(25);
    expect(result.custodian.find(row => row.caseId === "V3-082")?.reasonCodes).toContain("CONFIRMED_VAGUE_MISSING_INFORMATION");
    expect(result.custodian.filter(row => ["V3-028", "V3-086"].includes(row.caseId)).every(row => row.reasonCodes.includes("AUDITED_POSSIBLE_GOOD_EDIT_LOSS"))).toBe(true);
    expect(result.commitments.assignmentCounts).toEqual([13, 12]);
  });

  it("preserves primary A/B orientation and rejects missing, extra, fixed-second, or unsupported additions", () => {
    const input = makeInputs(), built = constructSupplementalPackets(input);
    for (const custodianRow of built.custodian) {
      const source = input.primaryPacket.find(row => row.itemId === custodianRow.itemId)!;
      const reviewerRow = built.reviewerPackets.flatMap(packet => packet.rows).find(row => row.itemId === custodianRow.itemId)!;
      expect(reviewerRow).toEqual(source);
    }
    expect(() => constructSupplementalPackets({ ...input, selection: input.selection.slice(1) })).toThrow();
    expect(() => constructSupplementalPackets({ ...input, mapping: input.mapping.map((row, i) => i === 27 ? { ...row, secondReview: true } : row) })).toThrow("already assigned");
    expect(() => constructSupplementalPackets({ ...input, auditResponseRows: input.auditResponseRows.filter(row => row.caseId !== "V3-028") })).toThrow("good-loss evidence");
    expect(() => constructSupplementalPackets({ ...input, auditResponseRows: input.auditResponseRows.map(row => row.caseId === "V3-082" ? { ...row, vagueUpdateObserved: "NO" } : row) })).toThrow("vague-update confirmation");
  });

  it("validates the original nine-label envelope against exact reviewer IDs", () => {
    const built = constructSupplementalPackets(makeInputs()), packet = built.reviewerPackets[0]!;
    const labels = { objectiveSatisfied: "YES", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "N/A" } as const;
    const submission: SupplementalSubmission = { protocol: "v3-blind-review-submission-v1", reviewerId: "S1", rows: packet.rows.map(row => ({ itemId: row.itemId, outputA: labels, outputB: labels, pairwise: "EQUIVALENT", evidence: { outputA: "Evidence A", outputB: "Evidence B", pairwise: "Pair evidence" } })) };
    expect(validateSupplementalSubmission(submission, "S1", packet.rows.map(row => row.itemId))).toEqual(submission);
    expect(() => validateSupplementalSubmission({ ...submission, rows: submission.rows.slice(1) }, "S1", packet.rows.map(row => row.itemId))).toThrow("inventory mismatch");
    expect(() => validateSupplementalSubmission({ ...submission, reviewerId: "S2" }, "S1", packet.rows.map(row => row.itemId))).toThrow("reviewer mismatch");
    expect(() => validateSupplementalSubmission({ ...submission, rows: submission.rows.map((row, i) => i ? row : { ...row, outputA: { ...labels, meaningPreserved: "PARTIAL" } }) }, "S1", packet.rows.map(row => row.itemId))).toThrow();
  });

  it("atomically stores exact original bytes, canonical response and commitment without overwriting", () => {
    const result = constructSupplementalPackets(makeInputs()), packet = result.reviewerPackets[0]!, root = tempDir(), destination = resolve(root, "submissions/S1");
    mkdirSync(resolve(root, "submissions"));
    const labels = { objectiveSatisfied: "YES", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "N/A" } as const;
    const submission: SupplementalSubmission = { protocol: "v3-blind-review-submission-v1", reviewerId: "S1", rows: packet.rows.map(row => ({ itemId: row.itemId, outputA: labels, outputB: labels, pairwise: "EQUIVALENT", evidence: { outputA: "A", outputB: "B", pairwise: "P" } })) };
    const original = Buffer.from(JSON.stringify(submission, null, 4) + "\n"), commitment = { protocol: "test" };
    exclusiveAtomicDirectory(destination, staging => writeSupplementalSubmissionFiles(staging, original, submission, commitment));
    expect(readFileSync(resolve(destination, "original-response.json")).equals(original)).toBe(true);
    expect(JSON.parse(readFileSync(resolve(destination, "response.json"), "utf8"))).toEqual(submission);
    expect(JSON.parse(readFileSync(resolve(destination, "commitment.json"), "utf8"))).toEqual(commitment);
    expect(() => exclusiveAtomicDirectory(destination, () => undefined)).toThrow("already exists");
    const partial = resolve(root, "submissions/partial");
    expect(() => exclusiveAtomicDirectory(partial, staging => { writeFileSync(resolve(staging, "partial"), "x"); throw new Error("injected failure"); })).toThrow("injected failure");
    expect(existsSync(partial)).toBe(false);
  });
});
