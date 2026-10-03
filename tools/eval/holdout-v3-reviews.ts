/** Offline blind-review shard and immutable submission tooling. Never calls a provider. */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertNoSymlinkComponents, blindItemSchema, exclusiveBlindWrite } from "./holdout-v3-blind";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const reviewerIds = ["O1A", "O1B", "O1C", "O1D", "O2A", "O2B"] as const;
const primaryReviewers = reviewerIds.slice(0, 4);
const secondReviewers = reviewerIds.slice(4);
const primaryIdSchema = z.enum(primaryReviewers);
const secondIdSchema = z.enum(secondReviewers);
const label = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

const outputLabelsSchema = z.object({
  objectiveSatisfied: label(["YES", "PARTIAL", "NO"]),
  editoriallyUseful: label(["YES", "PARTIAL", "NO"]),
  meaningPreserved: label(["YES", "NO", "UNCERTAIN"]),
  unauthorizedSemanticChange: label(["YES", "NO", "UNCERTAIN"]),
  unsupportedInformation: label(["YES", "NO", "UNCERTAIN"]),
  voicePreserved: label(["YES", "NO", "UNCERTAIN"]),
  overedited: label(["YES", "NO"]),
  underedited: label(["YES", "NO"]),
  unnecessaryChangeToGoodSource: label(["YES", "NO", "N/A"]),
}).strict();
const pairwiseSchema = label(["OUTPUT_A_BETTER", "OUTPUT_B_BETTER", "EQUIVALENT", "NEITHER"]);
const evidenceSchema = z.object({ outputA: z.string().trim().min(1).max(2_000), outputB: z.string().trim().min(1).max(2_000), pairwise: z.string().trim().min(1).max(2_000) }).strict();
const submissionRowSchema = z.object({ itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), outputA: outputLabelsSchema, outputB: outputLabelsSchema, pairwise: pairwiseSchema, evidence: evidenceSchema }).strict();
export const reviewSubmissionSchema = z.object({ protocol: z.literal("v3-blind-review-submission-v1"), reviewerId: z.enum(reviewerIds), rows: z.array(submissionRowSchema).min(1) }).strict();
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type ReviewReviewerId = typeof reviewerIds[number];
export type ReviewPhase = "primary" | "second";
export type ReviewShard = { reviewerId: ReviewReviewerId; phase: ReviewPhase; itemIds: string[]; packet: z.infer<typeof blindItemSchema>[]; packetSha256: string };
export type ReviewAssignmentManifest = { protocol: "v3-blind-review-shards-v1"; primaryPacketSha256: string; secondPacketSha256: string; manifestSha256: string; shards: Array<{ reviewerId: ReviewReviewerId; phase: ReviewPhase; itemIds: string[]; packetSha256: string }> };
export const V3_BLIND_PRIMARY_PACKET_SHA256 = "beb80708146b9e4811618959ce58091e601bd2268d9bbc24200bca382ca05261";
export const V3_BLIND_SECOND_PACKET_SHA256 = "f09c7a3ae36861ea51c6fd03b891c797b27d1e6b45ba83ee1bb65c1f4233142c";
export const V3_REVIEW_SHARD_MANIFEST_FILE_SHA256 = "bb9364424c2a672b311b03afec8c8c9fa94541c5e1f119d5e6caf1b23810701c";
export const V3_ORIGINAL_REVIEW_SHA256: Record<ReviewReviewerId, string> = {
  O1A: "3ff44c8a2d7bd1852bf66addf48550bf9772c9c2c82b194ca443ee6cb4ce0a52",
  O1B: "98899959652a3e08406316d6aaf83f7abc5af87e411db5fd69a2a0539b914134",
  O1C: "01aee393d3c19007383fe54be449bf826c32ea643036edafc9ed622d1793cda6",
  O1D: "3889d8e1df94f6ad0f76e5746172293c250179f37149ebed973f2ed5ecacad3b",
  O2A: "f13486950564b19140101d5c174f0ddde1f254be5f73d56d7682ed7c7e238074",
  O2B: "3597343e470063208c160f42b7524316b4e590d80a58c7649e452d88ecf91051",
};
export const V3_CANONICAL_REVIEW_SHA256: Record<ReviewReviewerId, string> = {
  O1A: "3ff44c8a2d7bd1852bf66addf48550bf9772c9c2c82b194ca443ee6cb4ce0a52",
  O1B: "7975ae2ce2e5fd5c72f282ca0e7558e571526ede552fcbf07ccc6c3546894adc",
  O1C: "01aee393d3c19007383fe54be449bf826c32ea643036edafc9ed622d1793cda6",
  O1D: "3889d8e1df94f6ad0f76e5746172293c250179f37149ebed973f2ed5ecacad3b",
  O2A: "bbf3e39281e7e4e73413b8b79a94cadd806d1201487d57e3894a022c54f2c972",
  O2B: "9b1703573ad2fb4e3dee62c66dda19d70eb3e303c6cdfb6c18dc7f8eb4032d8a",
};

function exactKeys(row: unknown) {
  const parsed = blindItemSchema.parse(row);
  if (Object.keys(parsed).sort().join("\0") !== ["itemId", "objective", "outputA", "outputB", "source"].sort().join("\0")) throw new Error("blind packet field allowlist mismatch");
  return parsed;
}
function validatedPacket(value: unknown, expectedCount: number, context: string) {
  const rows = z.array(blindItemSchema).length(expectedCount).parse(value).map(exactKeys);
  const ids = rows.map(row => row.itemId);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) throw new Error(`${context} packet must have unique, sorted opaque IDs`);
  return rows;
}
function chunks<T>(rows: T[], count: number): T[][] {
  const result: T[][] = [];
  const base = Math.floor(rows.length / count), extra = rows.length % count;
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const size = base + (index < extra ? 1 : 0);
    result.push(rows.slice(offset, offset + size)); offset += size;
  }
  return result;
}
export function constructReviewShards(primaryValue: unknown, secondValue: unknown, inputPacketHashes?: { primary: string; second: string }) {
  const primary = validatedPacket(primaryValue, 119, "primary");
  const second = validatedPacket(secondValue, 60, "second");
  if (inputPacketHashes && (!/^[a-f0-9]{64}$/.test(inputPacketHashes.primary) || !/^[a-f0-9]{64}$/.test(inputPacketHashes.second))) throw new Error("invalid source packet hash");
  const primaryById = new Map(primary.map(row => [row.itemId, row]));
  if (second.some(row => {
    const source = primaryById.get(row.itemId);
    return !source || source.source !== row.source || source.objective !== row.objective || source.outputA !== row.outputA || source.outputB !== row.outputB;
  })) throw new Error("second packet rows must exactly match primary fields by opaque ID");
  const shards: ReviewShard[] = [];
  chunks(primary, 4).forEach((packet, index) => shards.push({ reviewerId: primaryReviewers[index]!, phase: "primary", itemIds: packet.map(row => row.itemId), packet, packetSha256: hash(serialize(packet)) }));
  chunks(second, 2).forEach((packet, index) => shards.push({ reviewerId: secondReviewers[index]!, phase: "second", itemIds: packet.map(row => row.itemId), packet, packetSha256: hash(serialize(packet)) }));
  const core = { protocol: "v3-blind-review-shards-v1" as const, primaryPacketSha256: inputPacketHashes?.primary ?? hash(serialize(primary)), secondPacketSha256: inputPacketHashes?.second ?? hash(serialize(second)), shards: shards.map(({ reviewerId, phase, itemIds, packetSha256 }) => ({ reviewerId, phase, itemIds, packetSha256 })) };
  return { shards, manifest: { ...core, manifestSha256: hash(serialize(core)) } satisfies ReviewAssignmentManifest };
}

function validateAssignmentManifest(value: unknown): ReviewAssignmentManifest {
  const schema = z.object({
    protocol: z.literal("v3-blind-review-shards-v1"),
    primaryPacketSha256: z.string().regex(/^[a-f0-9]{64}$/),
    secondPacketSha256: z.string().regex(/^[a-f0-9]{64}$/),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    shards: z.array(z.object({ reviewerId: z.enum(reviewerIds), phase: z.enum(["primary", "second"]), itemIds: z.array(z.string().regex(/^blind-[a-f0-9]{32}$/)), packetSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(6),
  }).strict().parse(value);
  const { manifestSha256, ...core } = schema;
  if (hash(serialize(core)) !== manifestSha256) throw new Error("assignment manifest hash mismatch");
  const pairKeys = schema.shards.map(row => `${row.phase}:${row.reviewerId}`);
  if (new Set(pairKeys).size !== 6 || primaryReviewers.some(id => !pairKeys.includes(`primary:${id}`)) || secondReviewers.some(id => !pairKeys.includes(`second:${id}`))) throw new Error("reviewer assignment roster mismatch");
  const idsByPhase = { primary: [] as string[], second: [] as string[] };
  for (const [index, id] of primaryReviewers.entries()) {
    const shard = schema.shards.find(row => row.reviewerId === id && row.phase === "primary");
    if (!shard || shard.itemIds.length !== (index === 3 ? 29 : 30) || new Set(shard.itemIds).size !== shard.itemIds.length || shard.itemIds.some((itemId, itemIndex) => itemIndex > 0 && shard.itemIds[itemIndex - 1]! >= itemId)) throw new Error("invalid primary reviewer assignment");
    idsByPhase.primary.push(...shard.itemIds);
  }
  for (const id of secondReviewers) {
    const shard = schema.shards.find(row => row.reviewerId === id && row.phase === "second");
    if (!shard || shard.itemIds.length !== 30 || new Set(shard.itemIds).size !== shard.itemIds.length || shard.itemIds.some((itemId, itemIndex) => itemIndex > 0 && shard.itemIds[itemIndex - 1]! >= itemId)) throw new Error("invalid second reviewer assignment");
    idsByPhase.second.push(...shard.itemIds);
  }
  if (new Set(idsByPhase.primary).size !== 119 || new Set(idsByPhase.second).size !== 60 || idsByPhase.second.some(id => !idsByPhase.primary.includes(id))) throw new Error("invalid assignment coverage");
  return schema;
}

function expectedReviewer(reviewId: unknown, phase: ReviewPhase) {
  return phase === "primary" ? primaryIdSchema.parse(reviewId) : secondIdSchema.parse(reviewId);
}
export function validateReviewSubmission(value: unknown, manifest: ReviewAssignmentManifest, phase: ReviewPhase, reviewerId: string): ReviewSubmission {
  manifest = validateAssignmentManifest(manifest);
  const reviewer = expectedReviewer(reviewerId, phase);
  const entry = manifest.shards.find(shard => shard.phase === phase && shard.reviewerId === reviewer);
  if (!entry) throw new Error("reviewer assignment is absent from sealed manifest");
  const submission = reviewSubmissionSchema.parse(value);
  if (submission.reviewerId !== reviewer) throw new Error("submission reviewer does not match assignment");
  const actual = submission.rows.map(row => row.itemId);
  if (new Set(actual).size !== actual.length || actual.length !== entry.itemIds.length || [...actual].sort().join("\0") !== [...entry.itemIds].sort().join("\0")) throw new Error("submission IDs must exactly match assigned opaque IDs");
  return submission;
}

function ensureDirectory(path: string) {
  assertNoSymlinkComponents(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe review artifact directory");
}
function syncDirectory(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
/** Publish a complete private directory atomically, with no overwrite and staging cleanup on failure. */
export function exclusiveAtomicDirectory(targetPath: string, action: (stagingPath: string) => void) {
  const target = resolve(targetPath), parent = resolve(target, "..");
  ensureDirectory(parent);
  assertNoSymlinkComponents(target);
  if (lstatSync(target, { throwIfNoEntry: false })) throw new Error("submission already exists");
  const staging = mkdtempSync(resolve(parent, ".review-submission-pending-"));
  let published = false;
  try {
    action(staging);
    syncDirectory(staging);
    assertNoSymlinkComponents(target);
    if (lstatSync(target, { throwIfNoEntry: false })) throw new Error("submission already exists");
    renameSync(staging, target);
    published = true;
    syncDirectory(parent);
  } catch (error) {
    if (!published) {
      try { rmSync(staging, { recursive: true, force: true }); }
      catch { throw new Error("submission staging cleanup failed; a private partial staging directory may remain"); }
    }
    throw error;
  }
}
function exclusiveWriteBytes(path: string, bytes: Buffer) {
  assertNoSymlinkComponents(path);
  const parent = openSync(resolve(path, ".."), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    if (!fstatSync(fd).isFile()) throw new Error("unsafe archived submission file");
    writeFileSync(fd, bytes); fsyncSync(fd); fsyncSync(parent);
  } finally { if (fd !== undefined) closeSync(fd); closeSync(parent); }
}
function safeRead(path: string) {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error("unsafe review input file"); return readFileSync(fd); } finally { closeSync(fd); }
}
function safeReadPrivateSubmission(path: string) {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 2_000_000) throw new Error("submission input must be a private regular file under 2 MB");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
/** Writes reviewer-only five-field packet files and a custodian-only assignment/hash manifest. Exclusive; never overwrites. */
export function writeReviewShards(primaryValue: unknown, secondValue: unknown, destination: string, inputPacketHashes?: { primary: string; second: string }) {
  const { shards, manifest } = constructReviewShards(primaryValue, secondValue, inputPacketHashes);
  const target = resolve(destination);
  assertNoSymlinkComponents(target);
  if (lstatSync(target, { throwIfNoEntry: false })) throw new Error("review shard destination already exists");
  mkdirSync(target, { mode: 0o700 });
  const reviewerRoot = resolve(target, "reviewers"), custodianRoot = resolve(target, "custodian");
  ensureDirectory(reviewerRoot); ensureDirectory(custodianRoot);
  for (const shard of shards) {
    const folder = resolve(reviewerRoot, shard.reviewerId);
    ensureDirectory(folder);
    exclusiveBlindWrite(resolve(folder, "packet.json"), shard.packet);
  }
  exclusiveBlindWrite(resolve(custodianRoot, "assignments.json"), manifest);
  return manifest;
}

/** Persist validated labels and their byte commitment once; labels are never replaced. */
export function persistReviewSubmission(value: unknown, manifest: ReviewAssignmentManifest, phase: ReviewPhase, reviewerId: string, destination: string) {
  manifest = validateAssignmentManifest(manifest);
  const submission = validateReviewSubmission(value, manifest, phase, reviewerId);
  const bytes = Buffer.from(serialize(submission));
  const commitment = { protocol: "v3-blind-review-submission-commitment-v1", phase, reviewerId, submissionSha256: hash(bytes), rowCount: submission.rows.length };
  const folder = resolve(destination, phase, reviewerId);
  exclusiveAtomicDirectory(folder, staging => {
    exclusiveBlindWrite(resolve(staging, "submission.json"), submission);
    exclusiveBlindWrite(resolve(staging, "commitment.json"), commitment);
  });
  return commitment;
}

function loadVerifiedReviewManifest(blindOutputRoot: string) {
  const root = resolve(blindOutputRoot);
  const primaryBytes = safeRead(resolve(root, "primary/packet.json"));
  const secondBytes = safeRead(resolve(root, "second/packet.json"));
  if (hash(primaryBytes) !== V3_BLIND_PRIMARY_PACKET_SHA256 || hash(secondBytes) !== V3_BLIND_SECOND_PACKET_SHA256) throw new Error("pinned blind packet hash mismatch");
  const primary = JSON.parse(primaryBytes.toString("utf8")) as unknown;
  const second = JSON.parse(secondBytes.toString("utf8")) as unknown;
  const expected = constructReviewShards(primary, second, { primary: hash(primaryBytes), second: hash(secondBytes) });
  const manifestPath = resolve(root, "review-shards-v1/custodian/assignments.json");
  const manifestBytes = safeRead(manifestPath);
  if (hash(manifestBytes) !== V3_REVIEW_SHARD_MANIFEST_FILE_SHA256) throw new Error("pinned review shard manifest hash mismatch");
  const manifest = validateAssignmentManifest(JSON.parse(manifestBytes.toString("utf8")));
  if (!isDeepStrictEqual(manifest, expected.manifest)) throw new Error("sealed review assignment differs from immutable source packets");
  for (const shard of expected.shards) {
    const packetPath = resolve(root, `review-shards-v1/reviewers/${shard.reviewerId}/packet.json`);
    const bytes = safeRead(packetPath);
    if (hash(bytes) !== shard.packetSha256 || hash(bytes) !== manifest.shards.find(row => row.reviewerId === shard.reviewerId)?.packetSha256) throw new Error("review shard hash verification failed");
  }
  return manifest;
}

/** Validate a private JSON submission against immutable source packets, shard hashes, and its assigned opaque IDs. */
export function submitReviewFile(reviewerId: string, submissionPath: string, blindOutputRoot = resolve("data/evaluation/holdout-v3/run/blind-output-v1")) {
  let phase: ReviewPhase;
  if (primaryIdSchema.safeParse(reviewerId).success) phase = "primary";
  else { secondIdSchema.parse(reviewerId); phase = "second"; }
  const bytes = safeReadPrivateSubmission(resolve(submissionPath));
  const submission = reviewSubmissionSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (submission.reviewerId !== reviewerId) throw new Error("submission reviewer does not match CLI reviewer");
  const manifest = loadVerifiedReviewManifest(blindOutputRoot);
  return persistReviewSubmission(submission, manifest, phase, reviewerId, resolve(blindOutputRoot, "review-submissions-v1"));
}

export type OriginalReviewArchiveRecord = { reviewerId: ReviewReviewerId; phase: ReviewPhase; originalBytes: Buffer; canonicalBytes: Buffer };
export function writeOriginalReviewArchive(destination: string, records: readonly OriginalReviewArchiveRecord[], sourceHashes: { primaryPacketSha256: string; secondPacketSha256: string; shardManifestFileSha256: string }, originalPins: Record<ReviewReviewerId, string> = V3_ORIGINAL_REVIEW_SHA256, canonicalPins: Record<ReviewReviewerId, string> = V3_CANONICAL_REVIEW_SHA256) {
  if (records.length !== 6 || records.map(row => row.reviewerId).join(",") !== reviewerIds.join(",")) throw new Error("original review archive requires the exact reviewer inventory");
  if (sourceHashes.primaryPacketSha256 !== V3_BLIND_PRIMARY_PACKET_SHA256 || sourceHashes.secondPacketSha256 !== V3_BLIND_SECOND_PACKET_SHA256 || sourceHashes.shardManifestFileSha256 !== V3_REVIEW_SHARD_MANIFEST_FILE_SHA256) throw new Error("original review archive source pins mismatch");
  const entries = records.map(record => {
    const expectedPhase: ReviewPhase = record.reviewerId.startsWith("O1") ? "primary" : "second";
    const expectedCount = record.reviewerId === "O1D" ? 29 : expectedPhase === "primary" ? 30 : 30;
    if (record.phase !== expectedPhase || hash(record.originalBytes) !== originalPins[record.reviewerId] || hash(record.canonicalBytes) !== canonicalPins[record.reviewerId]) throw new Error("original or canonical review byte pin mismatch");
    const originalValue = JSON.parse(record.originalBytes.toString("utf8")) as unknown;
    const canonicalValue = JSON.parse(record.canonicalBytes.toString("utf8")) as unknown;
    if (!isDeepStrictEqual(originalValue, canonicalValue)) throw new Error("parsed original and canonical submission objects differ");
    const original = reviewSubmissionSchema.parse(originalValue);
    const canonical = reviewSubmissionSchema.parse(canonicalValue);
    if (original.reviewerId !== record.reviewerId || canonical.reviewerId !== record.reviewerId || original.rows.length !== expectedCount || canonical.rows.length !== expectedCount) throw new Error("original review archive reviewer/count mismatch");
    return { reviewerId: record.reviewerId, phase: record.phase, rowCount: original.rows.length, originalSha256: hash(record.originalBytes), canonicalSha256: hash(record.canonicalBytes), parsedObjectsIdentical: true as const, originalBytes: record.originalBytes };
  });
  const core = { protocol: "v3-blind-review-originals-v1", sourceHashes, reviewers: entries.map(({ reviewerId, phase, rowCount, originalSha256, canonicalSha256, parsedObjectsIdentical }) => ({ reviewerId, phase, rowCount, originalSha256, canonicalSha256, parsedObjectsIdentical })) };
  const inventory = { ...core, inventorySha256: hash(serialize(core)) };
  exclusiveAtomicDirectory(destination, staging => {
    for (const entry of entries) {
      const folder = resolve(staging, entry.phase, entry.reviewerId);
      ensureDirectory(folder);
      exclusiveWriteBytes(resolve(folder, "submission.json"), entry.originalBytes);
      exclusiveBlindWrite(resolve(folder, "commitment.json"), { protocol: "v3-blind-review-original-commitment-v1", reviewerId: entry.reviewerId, phase: entry.phase, rowCount: entry.rowCount, originalSha256: entry.originalSha256, canonicalSha256: entry.canonicalSha256, parsedObjectsIdentical: entry.parsedObjectsIdentical });
    }
    exclusiveBlindWrite(resolve(staging, "inventory.json"), inventory);
  });
  const inventoryBytes = Buffer.from(serialize(inventory));
  return { inventorySha256: inventory.inventorySha256, inventoryFileSha256: hash(inventoryBytes), reviewers: inventory.reviewers };
}

export function archiveOriginalReviewSubmissions(blindOutputRoot = resolve("data/evaluation/holdout-v3/run/blind-output-v1")) {
  const root = resolve(blindOutputRoot);
  const manifest = loadVerifiedReviewManifest(root);
  const records: OriginalReviewArchiveRecord[] = [];
  for (const reviewerId of reviewerIds) {
    const phase: ReviewPhase = reviewerId.startsWith("O1") ? "primary" : "second";
    const originalPath = resolve("/private/tmp", `whodunnit-v3-${reviewerId}-submission.json`);
    const canonicalPath = resolve(root, `review-submissions-v1/${phase}/${reviewerId}/submission.json`);
    const commitmentPath = resolve(root, `review-submissions-v1/${phase}/${reviewerId}/commitment.json`);
    const originalBytes = safeReadPrivateSubmission(originalPath);
    const canonicalBytes = safeRead(canonicalPath);
    if (hash(originalBytes) !== V3_ORIGINAL_REVIEW_SHA256[reviewerId] || hash(canonicalBytes) !== V3_CANONICAL_REVIEW_SHA256[reviewerId]) throw new Error("review submission byte pin mismatch");
    const originalValue = JSON.parse(originalBytes.toString("utf8")) as unknown;
    const canonicalValue = JSON.parse(canonicalBytes.toString("utf8")) as unknown;
    if (!isDeepStrictEqual(originalValue, canonicalValue)) throw new Error("parsed original and canonical submission objects differ");
    const submission = validateReviewSubmission(originalValue, manifest, phase, reviewerId);
    const commitment = JSON.parse(safeRead(commitmentPath).toString("utf8")) as { reviewerId?: string; phase?: string; rowCount?: number; submissionSha256?: string };
    if (commitment.reviewerId !== reviewerId || commitment.phase !== phase || commitment.rowCount !== submission.rows.length || commitment.submissionSha256 !== hash(canonicalBytes)) throw new Error("canonical submission commitment mismatch");
    records.push({ reviewerId, phase, originalBytes, canonicalBytes });
  }
  return writeOriginalReviewArchive(resolve(root, "review-originals-v1"), records, { primaryPacketSha256: V3_BLIND_PRIMARY_PACKET_SHA256, secondPacketSha256: V3_BLIND_SECOND_PACKET_SHA256, shardManifestFileSha256: V3_REVIEW_SHARD_MANIFEST_FILE_SHA256 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (command === "shard" && process.argv.length === 3) {
      const root = resolve("data/evaluation/holdout-v3/run/blind-output-v1");
      const primaryPath = resolve(root, "primary/packet.json"), secondPath = resolve(root, "second/packet.json");
      const primaryBytes = safeRead(primaryPath), secondBytes = safeRead(secondPath);
      const primary = JSON.parse(primaryBytes.toString("utf8")) as unknown, second = JSON.parse(secondBytes.toString("utf8")) as unknown;
      const destination = resolve(root, "review-shards-v1");
      const manifest = writeReviewShards(primary, second, destination, { primary: hash(primaryBytes), second: hash(secondBytes) });
      process.stdout.write(JSON.stringify({ primaryReviewerCount: 4, secondReviewerCount: 2, manifestSha256: manifest.manifestSha256, destination }) + "\n");
    } else if (command === "submit" && process.argv.length === 5) {
      const reviewerId = process.argv[3]!;
      const commitment = submitReviewFile(reviewerId, process.argv[4]!);
      process.stdout.write(JSON.stringify({ reviewerId, count: commitment.rowCount, submissionSha256: commitment.submissionSha256 }) + "\n");
    } else if (command === "archive-originals" && process.argv.length === 3) {
      const archive = archiveOriginalReviewSubmissions();
      process.stdout.write(JSON.stringify({ reviewerCount: archive.reviewers.length, inventorySha256: archive.inventorySha256, inventoryFileSha256: archive.inventoryFileSha256, destination: resolve("data/evaluation/holdout-v3/run/blind-output-v1/review-originals-v1") }) + "\n");
    } else {
      process.stderr.write("usage: node --import tsx tools/eval/holdout-v3-reviews.ts shard | submit <O1A|O1B|O1C|O1D|O2A|O2B> <private-submission.json> | archive-originals\n");
      process.exitCode = 2;
    }
  } catch {
    process.stderr.write("Review operation failed; inspect canonical submission state before retrying.\n");
    process.exitCode = 1;
  }
}
