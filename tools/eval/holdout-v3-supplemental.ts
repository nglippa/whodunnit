/** Additive, write-once blind review packets for the fixed V3 supplemental cohort. */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertNoSymlinkComponents, blindItemSchema, exclusiveBlindWrite } from "./holdout-v3-blind";
import { exclusiveAtomicDirectory } from "./holdout-v3-reviews";
import { validateAuditResponse, verifyPinnedAuditBundle } from "./holdout-v3-audit";
import { V3_MANIFEST_SHA256, verifyV3Integrity } from "./holdout-v3-runner";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const v3Root = resolve("data/evaluation/holdout-v3"), runRoot = resolve(v3Root, "run"), blindRoot = resolve(runRoot, "blind-output-v1");
const primaryPacketSha256 = "beb80708146b9e4811618959ce58091e601bd2268d9bbc24200bca382ca05261";
const mappingSha256 = "83ff9146f2914868c56441ba16c394f30cc3637469a85a0613ceca84f320489b";
const selectionSha256 = "ffd5f7305d944e55cb463939674c01461fd10289b2cb8d43c23ad4ec0aa86d06";
const auditQueueSha256 = "4b02c80bb0065f896bc9d2fd740da72423abde9ff12d3e0e51d6026aba9b5992";
const auditCommitmentsSha256 = "fc371e6cad2707f9cc7bb1f86a1b049d34ae52376dd4fbc09c60190773497993";
const auditResponseCanonicalSha256 = ["04d3c7623f9548718ee397fe43598e7dd7d092144a4d0f6ca83599f71c80b8aa", "89bd779035a02097c5d91bfc90c9862739d58334d27dca89e40c4280053cbd56", "1f5ec363d1704dfdb22b92de679f8b9ca6f4d64af6c7a79dfd8607389727e0c0", "835c21788fce8c23897bab340e3b5e99cf98394a2ee56a60ec97de76fe6b0662", "65992998a55eeeee2c089e33c9abaeb473afcdd20d86895ba27bd6d874d1dae3"] as const;
const auditResponseOriginalSha256 = ["11fb373513c89e3d79bebe5ed92549ae5c8b90dbbf788396cf74d2c9dab351eb", "82252a62c81f4903098ae9b599c12eab76b09c99ff56986c67478056d0efb7ef", "757e52b19f08537ef2beff51399ad62f41478e3fb281ab610c908120a7a4810c", "01b45c1a08d0b8cacacb4b7082e35ef9642fe7f95de5d73e3ef017f7ace97233", "348a2c05363691029db55a4892aa7ca64c16956144df19079751dd8dbcd711fa"] as const;
const selectionIds = ["V3-002", "V3-007", "V3-012", "V3-017", "V3-030", "V3-031", "V3-035", "V3-038", "V3-040", "V3-043", "V3-045", "V3-054", "V3-059", "V3-063", "V3-064", "V3-067", "V3-072", "V3-080", "V3-094", "V3-095", "V3-106", "V3-110"] as const;
const supplementalReasons = new Map<string, string>([["V3-082", "CONFIRMED_VAGUE_MISSING_INFORMATION"], ["V3-028", "AUDITED_POSSIBLE_GOOD_EDIT_LOSS"], ["V3-086", "AUDITED_POSSIBLE_GOOD_EDIT_LOSS"]]);
const supplementalReviewers = ["S1", "S2"] as const;

const mappingSchema = z.array(z.object({ itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), caseId: z.string().regex(/^V3-\d{3}$/), outputA: z.enum(["RAW", "FINAL"]), outputB: z.enum(["RAW", "FINAL"]), identical: z.boolean(), rawSha256: z.string().regex(/^[a-f0-9]{64}$/), finalSha256: z.string().regex(/^[a-f0-9]{64}$/), secondReview: z.boolean() }).strict()).length(119);
const selectionSchema = z.object({ protocol: z.literal("v3-supplemental-second-review-v1"), audience: z.literal("CUSTODIAN_ONLY"), selected: z.array(z.object({ caseId: z.string().regex(/^V3-\d{3}$/), reasonCodes: z.array(z.string()).min(1) }).strict()).length(22) }).passthrough();
const blindPacketSchema = z.array(blindItemSchema).length(119);
const auditOutputLabelsSchema = z.object({
  objectiveSatisfied: z.enum(["YES", "PARTIAL", "NO"]), editoriallyUseful: z.enum(["YES", "PARTIAL", "NO"]), meaningPreserved: z.enum(["YES", "NO", "UNCERTAIN"]),
  unauthorizedSemanticChange: z.enum(["YES", "NO", "UNCERTAIN"]), unsupportedInformation: z.enum(["YES", "NO", "UNCERTAIN"]), voicePreserved: z.enum(["YES", "NO", "UNCERTAIN"]),
  overedited: z.enum(["YES", "NO"]), underedited: z.enum(["YES", "NO"]), unnecessaryChangeToGoodSource: z.enum(["YES", "NO", "N/A"]),
}).strict();
const supplementalRowSchema = z.object({ itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), outputA: auditOutputLabelsSchema, outputB: auditOutputLabelsSchema, pairwise: z.enum(["OUTPUT_A_BETTER", "OUTPUT_B_BETTER", "EQUIVALENT", "NEITHER"]), evidence: z.object({ outputA: z.string().trim().min(1).max(2_000), outputB: z.string().trim().min(1).max(2_000), pairwise: z.string().trim().min(1).max(2_000) }).strict() }).strict();
export const supplementalSubmissionSchema = z.object({ protocol: z.literal("v3-blind-review-submission-v1"), reviewerId: z.enum(supplementalReviewers), rows: z.array(supplementalRowSchema).min(1) }).strict();
export type SupplementalSubmission = z.infer<typeof supplementalSubmissionSchema>;
type MappedInput = z.infer<typeof mappingSchema>[number];
type SelectionRow = z.infer<typeof selectionSchema>["selected"][number];
type SupplementalInput = { primaryPacket: z.infer<typeof blindPacketSchema>; mapping: MappedInput[]; selection: SelectionRow[]; frozenCaseIds: string[]; auditPacketSha256: string[]; auditResponseRows: Array<{ caseId: string; goodRetentionStatus: string; vagueUpdateObserved: string }> };

function safeRead(path: string) {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error("unsafe supplemental input file"); return readFileSync(fd); }
  finally { closeSync(fd); }
}
function readPinned(path: string, expectedSha256: string, description: string) {
  const bytes = safeRead(path);
  if (hash(bytes) !== expectedSha256) throw new Error(`${description} hash mismatch`);
  return bytes;
}
function parseJson(bytes: Buffer): unknown { return JSON.parse(bytes.toString("utf8")) as unknown; }
function exactIds(actual: readonly string[], expected: readonly string[], context: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || [...actual].sort().join("\0") !== [...expected].sort().join("\0")) throw new Error(`${context} inventory mismatch`);
}

export function constructSupplementalPackets(input: SupplementalInput) {
  const mapByCase = new Map(input.mapping.map(row => [row.caseId, row]));
  const packetByItem = new Map(input.primaryPacket.map(item => [item.itemId, item]));
  exactIds(input.mapping.map(row => row.caseId), input.frozenCaseIds, "supplemental mapping/frozen");
  exactIds(input.primaryPacket.map(row => row.itemId), input.mapping.map(row => row.itemId), "supplemental primary packet/mapping");
  exactIds(input.selection.map(row => row.caseId), selectionIds, "sealed original supplemental selection");
  if (input.auditResponseRows.filter(row => row.caseId === "V3-028").every(row => row.goodRetentionStatus !== "GOOD_LOST") || input.auditResponseRows.filter(row => row.caseId === "V3-086").every(row => row.goodRetentionStatus !== "GOOD_LOST")) throw new Error("audited good-loss evidence missing for additive cases");
  if (input.auditResponseRows.filter(row => row.caseId === "V3-082").every(row => row.vagueUpdateObserved !== "YES")) throw new Error("audited vague-update confirmation missing");
  const reasonsByCase = new Map<string, string[]>();
  for (const row of input.selection) reasonsByCase.set(row.caseId, [...row.reasonCodes]);
  for (const [caseId, reason] of supplementalReasons) reasonsByCase.set(caseId, [...(reasonsByCase.get(caseId) ?? []), reason]);
  const selectedIds = [...reasonsByCase.keys()];
  exactIds(selectedIds, [...selectionIds, ...supplementalReasons.keys()], "25-case supplemental union");
  const rows = [...reasonsByCase].map(([caseId, reasonCodes]) => {
    const mapping = mapByCase.get(caseId), blind = mapping && packetByItem.get(mapping.itemId);
    if (!mapping || !blind || mapping.secondReview) throw new Error("supplemental item missing or already assigned a fixed second review");
    const packetRow = blindItemSchema.parse({ itemId: blind.itemId, source: blind.source, objective: blind.objective, outputA: blind.outputA, outputB: blind.outputB });
    if (Object.keys(packetRow).sort().join(",") !== "itemId,objective,outputA,outputB,source") throw new Error("reviewer field allowlist mismatch");
    return { caseId, itemId: mapping.itemId, outputA: mapping.outputA, outputB: mapping.outputB, reasonCodes: [...new Set(reasonCodes)].sort(), packetRow };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId));
  if (rows.length !== 25) throw new Error("supplemental union must contain exactly 25 cases");
  const reviewerAssignments = [rows.slice(0, 13), rows.slice(13)];
  const reviewerPackets = reviewerAssignments.map((assigned, index) => ({ protocol: "v3-supplemental-blind-review-packet-v1", reviewerId: supplementalReviewers[index]!, rows: assigned.map(row => row.packetRow) }));
  const custodian = rows.map(row => ({ caseId: row.caseId, itemId: row.itemId, outputA: row.outputA, outputB: row.outputB, reasonCodes: row.reasonCodes }));
  const commitments = {
    protocol: "v3-supplemental-blind-review-commitments-v1", frozenManifestSha256: V3_MANIFEST_SHA256,
    primaryPacketSha256, mappingSha256, selectionSha256, auditQueueSha256, auditCommitmentsSha256,
    auditResponses: auditResponseCanonicalSha256.map((canonicalSha256, index) => ({ auditorId: `A${index + 1}`, packetSha256: input.auditPacketSha256[index]!, originalSha256: auditResponseOriginalSha256[index]!, canonicalSha256 })),
    selectedCount: rows.length, assignmentCounts: reviewerPackets.map(packet => packet.rows.length),
    packetSha256: reviewerPackets.map(packet => hash(serialize(packet))), custodianMappingSha256: hash(serialize(custodian)),
  };
  return { reviewerPackets, custodian, commitments };
}

function loadSupplementalInput(): SupplementalInput {
  const frozen = verifyV3Integrity();
  const primaryBytes = readPinned(resolve(blindRoot, "primary/packet.json"), primaryPacketSha256, "primary blind packet");
  const mappingBytes = readPinned(resolve(blindRoot, "custodian/mapping.json"), mappingSha256, "blind custodian mapping");
  const selectionBytes = readPinned(resolve(runRoot, "post-review-v1/supplemental-second-selection.json"), selectionSha256, "sealed supplemental selection");
  const queueBytes = readPinned(resolve(runRoot, "audit-v1/queue.json"), auditQueueSha256, "sealed audit queue");
  const auditCommitmentBytes = readPinned(resolve(runRoot, "audit-v1/commitments.json"), auditCommitmentsSha256, "sealed audit commitments");
  void queueBytes;
  void auditCommitmentBytes;
  const auditPacketSha256: string[] = [];
  const primaryPacket = blindPacketSchema.parse(parseJson(primaryBytes)), mapping = mappingSchema.parse(parseJson(mappingBytes));
  const selection = selectionSchema.parse(parseJson(selectionBytes)).selected;
  if (frozen.length !== 119) throw new Error("frozen inventory changed");
  const auditResponseRows: SupplementalInput["auditResponseRows"] = [];
  for (let index = 0; index < 5; index++) {
    const auditorId = `A${index + 1}`, sealed = verifyPinnedAuditBundle(auditorId);
    auditPacketSha256.push(sealed.packetSha256);
    const directory = resolve(runRoot, `audit-v1/responses/${auditorId}`);
    const original = safeRead(resolve(directory, "original-response.json")), canonical = safeRead(resolve(directory, "response.json")), commitment = z.object({ protocol: z.literal("v3-trace-audit-response-commitment-v1"), packetId: z.literal(auditorId), rowCount: z.literal(17), originalResponseSha256: z.string(), canonicalResponseSha256: z.string() }).passthrough().parse(parseJson(safeRead(resolve(directory, "commitment.json"))));
    if (hash(original) !== auditResponseOriginalSha256[index] || hash(canonical) !== auditResponseCanonicalSha256[index] || commitment.originalResponseSha256 !== hash(original) || commitment.canonicalResponseSha256 !== hash(canonical) || commitment.packetSha256 !== sealed.packetSha256) throw new Error(`audit response ${auditorId} commitment mismatch`);
    const response = validateAuditResponse(parseJson(canonical), sealed.packet.rows.map(row => row.caseId));
    for (const row of response.rows) auditResponseRows.push({ caseId: row.caseId, goodRetentionStatus: row.goodRetentionStatus, vagueUpdateObserved: row.vagueUpdateObserved });
  }
  return { primaryPacket, mapping, selection, frozenCaseIds: frozen.map(row => row.id), auditPacketSha256, auditResponseRows };
}

function exclusiveWriteBytes(path: string, bytes: Buffer) {
  assertNoSymlinkComponents(path);
  const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd: number | undefined;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); writeFileSync(fd, bytes); fsyncSync(fd); fsyncSync(parent); }
  finally { if (fd !== undefined) closeSync(fd); closeSync(parent); }
}
export function readPrivateSupplementalResponse(path: string) {
  const absolute = resolve(path), allowedRoots = ["/private/tmp", realpathSync(tmpdir())];
  if (!allowedRoots.some(base => absolute.startsWith(`${base}${sep}`))) throw new Error("response input must be in a private temporary directory");
  assertNoSymlinkComponents(absolute);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { const s = fstatSync(fd); if (!s.isFile() || s.nlink !== 1 || (s.mode & 0o777) !== 0o600) throw new Error("response input must be a private regular file with mode 0600"); return readFileSync(fd); }
  finally { closeSync(fd); }
}
export function validateSupplementalSubmission(value: unknown, reviewerId: typeof supplementalReviewers[number], assignedIds: readonly string[]) {
  const parsed = supplementalSubmissionSchema.parse(value);
  if (parsed.reviewerId !== reviewerId) throw new Error("supplemental submission reviewer mismatch");
  exactIds(parsed.rows.map(row => row.itemId), assignedIds, "supplemental reviewer response");
  return parsed;
}
export function writeSupplementalSubmissionFiles(staging: string, original: Buffer, canonical: SupplementalSubmission, commitment: unknown) {
  exclusiveWriteBytes(resolve(staging, "original-response.json"), original);
  exclusiveBlindWrite(resolve(staging, "response.json"), canonical);
  exclusiveBlindWrite(resolve(staging, "commitment.json"), commitment);
}
function publishedArtifacts() {
  const expected = constructSupplementalPackets(loadSupplementalInput()), output = resolve(blindRoot, "supplemental-v1");
  for (const packet of expected.reviewerPackets) {
    const bytes = safeRead(resolve(output, `${packet.reviewerId}/packet.json`));
    if (hash(bytes) !== expected.commitments.packetSha256[supplementalReviewers.indexOf(packet.reviewerId)] || !isDeepStrictEqual(parseJson(bytes), packet)) throw new Error("supplemental reviewer packet changed");
  }
  const custodianBytes = safeRead(resolve(output, "custodian/mapping.json"));
  if (hash(custodianBytes) !== expected.commitments.custodianMappingSha256 || !isDeepStrictEqual(parseJson(custodianBytes), expected.custodian)) throw new Error("supplemental custodian mapping changed");
  const commitmentsBytes = safeRead(resolve(output, "commitments.json"));
  if (!isDeepStrictEqual(parseJson(commitmentsBytes), expected.commitments)) throw new Error("supplemental commitments changed");
  return { expected, output };
}
export function persistSupplementalSubmission(reviewerId: typeof supplementalReviewers[number], originalBytes: Buffer, submissionValue: unknown) {
  const { expected, output } = publishedArtifacts(), index = supplementalReviewers.indexOf(reviewerId), packet = expected.reviewerPackets[index]!;
  const submission = validateSupplementalSubmission(submissionValue, reviewerId, packet.rows.map(row => row.itemId));
  const canonicalBytes = Buffer.from(serialize(submission));
  const commitment = { protocol: "v3-supplemental-blind-review-submission-commitment-v1", reviewerId, rowCount: submission.rows.length, packetSha256: expected.commitments.packetSha256[index], originalResponseSha256: hash(originalBytes), canonicalResponseSha256: hash(canonicalBytes) };
  const destination = resolve(output, `submissions/${reviewerId}`);
  exclusiveAtomicDirectory(destination, staging => writeSupplementalSubmissionFiles(staging, originalBytes, submission, commitment));
  return { reviewerId, rowCount: submission.rows.length, originalResponseSha256: hash(originalBytes), canonicalResponseSha256: hash(canonicalBytes) };
}
export function buildSupplementalV1() {
  const input = loadSupplementalInput(), artifacts = constructSupplementalPackets(input), output = resolve(blindRoot, "supplemental-v1");
  exclusiveAtomicDirectory(output, staging => {
    for (const packet of artifacts.reviewerPackets) {
      const folder = resolve(staging, packet.reviewerId);
      mkdirSync(folder, { mode: 0o700 });
      exclusiveBlindWrite(resolve(folder, "packet.json"), packet);
    }
    const custodian = resolve(staging, "custodian");
    mkdirSync(custodian, { mode: 0o700 });
    exclusiveBlindWrite(resolve(custodian, "mapping.json"), artifacts.custodian);
    exclusiveBlindWrite(resolve(staging, "commitments.json"), artifacts.commitments);
  });
  return { output, reviewerCounts: artifacts.reviewerPackets.map(packet => packet.rows.length), packetSha256: artifacts.commitments.packetSha256, custodianMappingSha256: artifacts.commitments.custodianMappingSha256, directoryMode: statSync(output).mode & 0o777 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "build" && process.argv.length === 3) process.stdout.write(JSON.stringify(buildSupplementalV1()) + "\n");
    else if (process.argv[2] === "submit" && process.argv.length === 5) {
      const reviewerId = process.argv[3] as typeof supplementalReviewers[number];
      if (!supplementalReviewers.includes(reviewerId)) throw new Error("invalid supplemental reviewer");
      const bytes = readPrivateSupplementalResponse(process.argv[4]!);
      process.stdout.write(JSON.stringify(persistSupplementalSubmission(reviewerId, bytes, JSON.parse(bytes.toString("utf8")) as unknown)) + "\n");
    } else throw new Error("usage: holdout-v3-supplemental.ts build | submit <S1|S2> <private-response.json>");
  } catch (error) {
    process.stderr.write(`${process.argv[2] === "submit" ? "Supplemental submission rejected" : error instanceof Error ? error.message : "Supplemental review operation failed"}\n`);
    process.exitCode = 1;
  }
}
