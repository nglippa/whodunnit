import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { constructReviewShards, exclusiveAtomicDirectory, persistReviewSubmission, submitReviewFile, validateReviewSubmission, writeOriginalReviewArchive, writeReviewShards, V3_BLIND_PRIMARY_PACKET_SHA256, V3_BLIND_SECOND_PACKET_SHA256, V3_REVIEW_SHARD_MANIFEST_FILE_SHA256, type ReviewSubmission } from "./holdout-v3-reviews";

const primary = Array.from({ length: 119 }, (_, index) => ({ itemId: `blind-${String(index).padStart(32, "0")}`, source: `synthetic source ${index}`, objective: `synthetic objective ${index}`, outputA: `synthetic A ${index}`, outputB: `synthetic B ${index}` }));
const second = primary.slice(0, 60);
const allowedFields = ["itemId", "source", "objective", "outputA", "outputB"];
const result = () => constructReviewShards(primary, second);
const rowFor = (itemId: string) => ({
  itemId,
  outputA: { objectiveSatisfied: "YES", editoriallyUseful: "PARTIAL", meaningPreserved: "UNCERTAIN", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "YES", unnecessaryChangeToGoodSource: "N/A" },
  outputB: { objectiveSatisfied: "PARTIAL", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "UNCERTAIN", voicePreserved: "UNCERTAIN", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "NO" },
  pairwise: "OUTPUT_B_BETTER",
  evidence: { outputA: "Brief synthetic evidence for A.", outputB: "Brief synthetic evidence for B.", pairwise: "Brief synthetic comparison." },
});
function submission(reviewerId: string, ids: string[]): ReviewSubmission {
  return { protocol: "v3-blind-review-submission-v1", reviewerId: reviewerId as ReviewSubmission["reviewerId"], rows: ids.map(rowFor) };
}
const tempDirs: string[] = [];
function tempDir() { const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "v3-review-tooling-test-"))); tempDirs.push(dir); return dir; }
function writePrivateSubmission(root: string, value: unknown, name = "private-submission.json") {
  const path = resolve(root, name);
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return path;
}
function prepareBlindRoot() {
  const root = tempDir();
  mkdirSync(resolve(root, "primary")); mkdirSync(resolve(root, "second"));
  writeFileSync(resolve(root, "primary/packet.json"), JSON.stringify(primary, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(resolve(root, "second/packet.json"), JSON.stringify(second, null, 2) + "\n", { mode: 0o600 });
  const manifest = writeReviewShards(primary, second, resolve(root, "review-shards-v1"), { primary: createHash("sha256").update(readFileSync(resolve(root, "primary/packet.json"))).digest("hex"), second: createHash("sha256").update(readFileSync(resolve(root, "second/packet.json"))).digest("hex") });
  return { root, manifest };
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("V3 blind reviewer shards and immutable submissions", () => {
  it("covers the primary and second sets exactly with balanced deterministic opaque-ID shards", () => {
    const { shards, manifest } = result();
    expect(shards.map(row => [row.reviewerId, row.phase, row.packet.length])).toEqual([["O1A", "primary", 30], ["O1B", "primary", 30], ["O1C", "primary", 30], ["O1D", "primary", 29], ["O2A", "second", 30], ["O2B", "second", 30]]);
    expect(shards.filter(row => row.phase === "primary").flatMap(row => row.itemIds).sort()).toEqual(primary.map(row => row.itemId));
    expect(shards.filter(row => row.phase === "second").flatMap(row => row.itemIds).sort()).toEqual(second.map(row => row.itemId));
    expect(new Set(shards.flatMap(row => row.phase === "primary" ? row.itemIds : [])).size).toBe(119);
    for (const shard of shards) {
      expect(shard.packet.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify([...allowedFields].sort()))).toBe(true);
      expect(JSON.stringify(shard.packet)).not.toMatch(/reviewerId|caseId|trace|category|label|creatorId|RAW|FINAL/);
      expect(shard.itemIds).toEqual([...shard.itemIds].sort());
    }
    expect(manifest.shards.map(({ reviewerId, phase }) => [reviewerId, phase])).toEqual(shards.map(({ reviewerId, phase }) => [reviewerId, phase]));
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects duplicate, missing, extra, unsorted, or malformed packet rows", () => {
    expect(() => constructReviewShards(primary.slice(1), second)).toThrow();
    expect(() => constructReviewShards([...primary.slice(0, -1), primary[0]!], second)).toThrow();
    expect(() => constructReviewShards(primary.map((row, i) => i === 2 ? { ...row, itemId: "unexpected" } : row), second)).toThrow();
    expect(() => constructReviewShards([...primary].reverse(), second)).toThrow("sorted");
    expect(() => constructReviewShards(primary, second.map((row, i) => i === 0 ? { ...row, extra: "secret" } : row))).toThrow();
    expect(() => constructReviewShards(primary, [...second.slice(1), { ...primary[118]!, itemId: "blind-ffffffffffffffffffffffffffffffff" }])).toThrow("exactly match primary fields");
    for (const field of ["source", "objective", "outputA", "outputB"] as const) {
      expect(() => constructReviewShards(primary, second.map((row, i) => i === 0 ? { ...row, [field]: `${row[field]} changed` } : row))).toThrow("exactly match primary fields");
    }
    expect(() => constructReviewShards(primary, second.map((row, i) => i === 0 ? { ...row, outputA: row.outputB, outputB: row.outputA } : row))).toThrow("exactly match primary fields");
  });

  it("validates exact reviewer assignment and rejects missing, duplicate, extra IDs and invalid labels", () => {
    const { shards, manifest } = result();
    const shard = shards[0]!;
    const valid = submission(shard.reviewerId, shard.itemIds);
    expect(validateReviewSubmission(valid, manifest, shard.phase, shard.reviewerId)).toEqual(valid);
    expect(() => validateReviewSubmission(submission(shard.reviewerId, shard.itemIds.slice(1)), manifest, shard.phase, shard.reviewerId)).toThrow("exactly match");
    expect(() => validateReviewSubmission(submission(shard.reviewerId, [...shard.itemIds.slice(1), shard.itemIds[0]!]), manifest, shard.phase, shard.reviewerId)).not.toThrow();
    const duplicate = { ...valid, rows: [...valid.rows.slice(1), valid.rows[1]!] };
    expect(() => validateReviewSubmission(duplicate, manifest, shard.phase, shard.reviewerId)).toThrow("exactly match");
    const extra = { ...valid, rows: [...valid.rows, rowFor("blind-ffffffffffffffffffffffffffffffff")] };
    expect(() => validateReviewSubmission(extra, manifest, shard.phase, shard.reviewerId)).toThrow("exactly match");
    expect(() => validateReviewSubmission({ ...valid, reviewerId: "O2A" }, manifest, shard.phase, shard.reviewerId)).toThrow();
    const invalidEnum = { ...valid, rows: valid.rows.map((row, i) => i === 0 ? { ...row, outputA: { ...row.outputA, objectiveSatisfied: "MAYBE" } } : row) };
    expect(() => validateReviewSubmission(invalidEnum, manifest, shard.phase, shard.reviewerId)).toThrow();
    const missingEvidence = { ...valid, rows: valid.rows.map((row, i) => i === 0 ? { ...row, evidence: { ...row.evidence, pairwise: " " } } : row) };
    expect(() => validateReviewSubmission(missingEvidence, manifest, shard.phase, shard.reviewerId)).toThrow();
    const tamperedManifest = { ...manifest, primaryPacketSha256: "0".repeat(64) };
    expect(() => validateReviewSubmission(valid, tamperedManifest, shard.phase, shard.reviewerId)).toThrow("manifest hash");
  });

  it("writes shards and submission commitments exclusively, without leaking custodian metadata", () => {
    const dir = tempDir(), shardDir = resolve(dir, "shards"), submissionsDir = resolve(dir, "submissions");
    const manifest = writeReviewShards(primary, second, shardDir);
    const reviewerPacket = JSON.parse(readFileSync(resolve(shardDir, "reviewers/O1A/packet.json"), "utf8"));
    expect(reviewerPacket).toHaveLength(30);
    expect(Object.keys(reviewerPacket[0]).sort()).toEqual([...allowedFields].sort());
    expect(existsSync(resolve(shardDir, "reviewers/O1A/assignments.json"))).toBe(false);
    const review = submission("O1A", manifest.shards.find(row => row.reviewerId === "O1A")!.itemIds);
    const commitment = persistReviewSubmission(review, manifest, "primary", "O1A", submissionsDir);
    const bytes = readFileSync(resolve(submissionsDir, "primary/O1A/submission.json"));
    expect(commitment.submissionSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(JSON.parse(readFileSync(resolve(submissionsDir, "primary/O1A/commitment.json"), "utf8"))).toEqual(commitment);
    expect(() => persistReviewSubmission(review, manifest, "primary", "O1A", submissionsDir)).toThrow();
    const secondIds = manifest.shards.find(row => row.reviewerId === "O2A")!.itemIds;
    const secondReview = submission("O2A", secondIds);
    const secondCommitment = persistReviewSubmission(secondReview, manifest, "second", "O2A", submissionsDir);
    expect(secondCommitment.rowCount).toBe(30);
    expect(existsSync(resolve(submissionsDir, "second/O2A/submission.json"))).toBe(true);
    expect(existsSync(resolve(submissionsDir, "second/O2A/commitment.json"))).toBe(true);
    expect(() => writeReviewShards(primary, second, shardDir)).toThrow("already exists");
    mkdirSync(resolve(dir, "unrelated"));
  });

  it("rejects synthetic packet inputs because they do not match pinned production hashes", () => {
    const { root, manifest } = prepareBlindRoot();
    const input = writePrivateSubmission(root, submission("O1A", manifest.shards.find(row => row.reviewerId === "O1A")!.itemIds));
    expect(() => submitReviewFile("O1A", input, root)).toThrow("pinned blind packet hash mismatch");
    expect(existsSync(resolve(root, "review-submissions-v1/primary/O1A"))).toBe(false);
  });

  it("rejects private submission symlinks, broad permissions, wrong reviewer, extra IDs and invalid schema before writing", () => {
    const { root, manifest } = prepareBlindRoot();
    const ids = manifest.shards.find(row => row.reviewerId === "O1A")!.itemIds;
    const symlinkTarget = writePrivateSubmission(root, submission("O1A", ids), "safe-input.json");
    const symlink = resolve(root, "linked-input.json"); symlinkSync(symlinkTarget, symlink);
    expect(() => submitReviewFile("O1A", symlink, root)).toThrow();
    const broad = writePrivateSubmission(root, submission("O1A", ids), "broad-input.json"); chmodSync(broad, 0o644);
    expect(() => submitReviewFile("O1A", broad, root)).toThrow("private regular file");
    const wrongReviewer = writePrivateSubmission(root, submission("O1A", ids), "wrong-reviewer.json");
    expect(() => submitReviewFile("O2A", wrongReviewer, root)).toThrow();
    const extraId = writePrivateSubmission(root, { ...submission("O1A", ids), rows: [...submission("O1A", ids).rows, rowFor("blind-ffffffffffffffffffffffffffffffff")] }, "extra-id.json");
    expect(() => submitReviewFile("O1A", extraId, root)).toThrow("pinned blind packet hash mismatch");
    const badLabelSubmission = submission("O1A", ids);
    badLabelSubmission.rows[0]!.outputA.objectiveSatisfied = "INVALID" as never;
    const badLabel = writePrivateSubmission(root, badLabelSubmission, "bad-label.json");
    expect(() => submitReviewFile("O1A", badLabel, root)).toThrow();
    const extraField = writePrivateSubmission(root, { ...submission("O1A", ids), phase: "second" }, "wrong-phase.json");
    expect(() => submitReviewFile("O1A", extraField, root)).toThrow();
    expect(existsSync(resolve(root, "review-submissions-v1/primary/O1A/submission.json"))).toBe(false);
  });

  it("rejects edited source packets or shard packets before accepting a submission", () => {
    for (const editedPath of ["primary/packet.json", "review-shards-v1/reviewers/O1A/packet.json"]) {
      const { root, manifest } = prepareBlindRoot();
      const input = writePrivateSubmission(root, submission("O1A", manifest.shards.find(row => row.reviewerId === "O1A")!.itemIds));
      const path = resolve(root, editedPath), bytes = readFileSync(path);
      writeFileSync(path, Buffer.concat([bytes, Buffer.from(" ") ]));
      expect(() => submitReviewFile("O1A", input, root)).toThrow();
      expect(existsSync(resolve(root, "review-submissions-v1/primary/O1A/submission.json"))).toBe(false);
    }
  });

  it("cleans failed staging writes and publishes complete submission directories atomically", () => {
    const root = tempDir(), destination = resolve(root, "primary/O1A");
    expect(() => exclusiveAtomicDirectory(destination, staging => {
      writeFileSync(resolve(staging, "submission.json"), "partial");
      throw new Error("injected second-file failure");
    })).toThrow("injected second-file failure");
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(resolve(root, "primary"))).toEqual([]);
    exclusiveAtomicDirectory(destination, staging => {
      writeFileSync(resolve(staging, "submission.json"), "complete");
      writeFileSync(resolve(staging, "commitment.json"), "hash");
    });
    expect(readdirSync(destination).sort()).toEqual(["commitment.json", "submission.json"]);
    expect(() => exclusiveAtomicDirectory(destination, () => undefined)).toThrow("already exists");
  });

  it("archives exact original bytes with commitments, rejects parsed-object drift, and refuses overwrite", () => {
    const destination = resolve(tempDir(), "review-originals-v1");
    const shards = result().shards;
    const records = shards.map(shard => {
      const value = submission(shard.reviewerId, shard.itemIds);
      const originalBytes = Buffer.from(JSON.stringify(value, null, 4) + "\n");
      const canonicalBytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
      return { reviewerId: shard.reviewerId, phase: shard.phase, originalBytes, canonicalBytes };
    });
    const originalPins = Object.fromEntries(records.map(row => [row.reviewerId, createHash("sha256").update(row.originalBytes).digest("hex")])) as Record<(typeof records)[number]["reviewerId"], string>;
    const canonicalPins = Object.fromEntries(records.map(row => [row.reviewerId, createHash("sha256").update(row.canonicalBytes).digest("hex")])) as Record<(typeof records)[number]["reviewerId"], string>;
    const sourceHashes = { primaryPacketSha256: V3_BLIND_PRIMARY_PACKET_SHA256, secondPacketSha256: V3_BLIND_SECOND_PACKET_SHA256, shardManifestFileSha256: V3_REVIEW_SHARD_MANIFEST_FILE_SHA256 };
    const archived = writeOriginalReviewArchive(destination, records, sourceHashes, originalPins, canonicalPins);
    expect(archived.reviewers.every(row => row.parsedObjectsIdentical)).toBe(true);
    for (const record of records) expect(readFileSync(resolve(destination, record.phase, record.reviewerId, "submission.json")).equals(record.originalBytes)).toBe(true);
    expect(archived.inventorySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => writeOriginalReviewArchive(destination, records, sourceHashes, originalPins, canonicalPins)).toThrow("already exists");

    const mismatched = records.map((row, index) => index === 0 ? { ...row, canonicalBytes: Buffer.from(JSON.stringify({ ...JSON.parse(row.canonicalBytes.toString("utf8")), changed: true })) } : row);
    const changedCanonicalPins = Object.fromEntries(mismatched.map(row => [row.reviewerId, createHash("sha256").update(row.canonicalBytes).digest("hex")])) as typeof canonicalPins;
    expect(() => writeOriginalReviewArchive(resolve(tempDir(), "mismatch"), mismatched, sourceHashes, originalPins, changedCanonicalPins)).toThrow("parsed original and canonical submission objects differ");
  });
});
