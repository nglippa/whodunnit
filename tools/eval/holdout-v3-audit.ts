/** Custodian-only trace audit packet builder. Does not invoke a model. */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertNoSymlinkComponents, blindItemSchema, exclusiveBlindWrite } from "./holdout-v3-blind";
import { ReviewSubmission, reviewSubmissionSchema, V3_BLIND_PRIMARY_PACKET_SHA256, V3_BLIND_SECOND_PACKET_SHA256, V3_CANONICAL_REVIEW_SHA256, V3_ORIGINAL_REVIEW_SHA256, V3_REVIEW_SHARD_MANIFEST_FILE_SHA256, exclusiveAtomicDirectory } from "./holdout-v3-reviews";
import { V3_MANIFEST_SHA256, verifyV3Integrity } from "./holdout-v3-runner";

const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const root = resolve("data/evaluation/holdout-v3");
const run = resolve(root, "run");
const blindRoot = resolve(run, "blind-output-v1");
const postRoot = resolve(run, "post-review-v1");
export const V3_REPLAY_SHA256 = "8e707a25181e6fa15e6eb1a1c97a10fb61d172fe82f35cfb04e880d3a284cc24";
const V3_MAPPING_SHA256 = "83ff9146f2914868c56441ba16c394f30cc3637469a85a0613ceca84f320489b";
const V3_POST_LABELS_SHA256 = "6ac4c2b10473266e4856b9d2d320dfc408f3d6875b406849cd8fb81435eaeb2b";
const V3_POST_METRICS_SHA256 = "2a7eebaa9029996241361b26c3f4904ce405a43c363fa3cbf5df6a0a462d54eb";
const V3_AUDIT_SELECTION_SHA256 = "295273dfb4161ae77583790b94a897a1cdfa920f79540d0b01f889e7a14360e9";
const V3_SUPPLEMENTAL_SHA256 = "ffd5f7305d944e55cb463939674c01461fd10289b2cb8d43c23ad4ec0aa86d06";
const V3_ORIGINAL_ARCHIVE_INVENTORY_SHA256 = "623bc4c25c33337fb8b4f070aa9fd98328bce12798848170064efc2581df0209";
const V3_ORIGINAL_ARCHIVE_INVENTORY_DIGEST = "08c3b69ac692fb84cd53f707f0e260b3606fae27d33f499b63bc3946f6ba571e";
const V3_AUDIT_STRATA_SHA256 = "0ceea0303f675718c63675bfe6d0cddf445ead47963ddd670572802176785b8c";
const V3_AUDIT_QUEUE_FILE_SHA256 = "4b02c80bb0065f896bc9d2fd740da72423abde9ff12d3e0e51d6026aba9b5992";
const V3_AUDIT_COMMITMENTS_FILE_SHA256 = "fc371e6cad2707f9cc7bb1f86a1b049d34ae52376dd4fbc09c60190773497993";
const V3_AUDIT_PACKET_SHA256 = ["ae6fe049ce9d2705830d922052ed5da5b839257e6f5468822db10cc4485ea730", "36a5d635d1efcffb8eb1ab67ae5c1a3cc8df35f3f43a530870c674501a86c5a4", "968abb8aff2af918ce0e58159a6f4e59d7ab8540f1816717576cabcb92fa47a6", "adaa19a9d1e0a2934854280da2dfb0181e7732b3561c96c568351fbf21acc239", "55b561b49ba5296c8b053dacf3f376eec47ae52f59dccd8340fda57dc34220a6"] as const;
export const V3_PRIOR_PROVISIONAL_QUEUE = { count: 85, sha256: "704d16e0322a215e9d6dfaa547c658a746e3fb04121a2b1e38787425edefb21e", status: "SUPERSEDED_METADATA_ONLY" } as const;
export const V3_EXPLICIT_UPDATE_IDS = ["V3-003", "V3-012", "V3-021", "V3-027", "V3-036", "V3-045", "V3-055", "V3-063", "V3-071", "V3-072", "V3-075", "V3-080", "V3-089"] as const;
export const V3_VAGUE_MISSING_IDS = ["V3-008", "V3-017", "V3-031", "V3-040", "V3-072", "V3-082", "V3-096", "V3-106", "V3-114"] as const;
const reviewerIds = ["O1A", "O1B", "O1C", "O1D", "O2A", "O2B"] as const;
const prelabelReviewers = ["R1A", "R1B", "R2A", "R2B"] as const;
const expectedRows = { O1A: 30, O1B: 30, O1C: 30, O1D: 29, O2A: 30, O2B: 30 } as const;
const updateStratumSchema = z.object({
  protocol: z.literal("v3-authorized-update-stratum-v1"), provenance: z.object({ source: z.string().min(1), sourceFields: z.array(z.enum(["authorizedFactualChanges", "preservedFacts", "missingInformationPreventsFulfillment", "notes", "source", "objective"])).min(1), reviewer: z.string().min(1), priorProvisional: z.object({ count: z.number().int(), sha256: z.string().length(64), status: z.literal("SUPERSEDED_METADATA_ONLY") }).strict() }).strict(),
  explicitUpdateCaseIds: z.array(z.string().regex(/^V3-\d{3}$/)).length(13), vagueMissingCaseIds: z.array(z.string().regex(/^V3-\d{3}$/)).length(9), subtypeNotes: z.record(z.string(), z.string()),
}).strict();
export type V3UpdateStratum = z.infer<typeof updateStratumSchema>;
const outputSchema = z.object({
  objectiveSatisfied: z.enum(["YES", "PARTIAL", "NO"]), editoriallyUseful: z.enum(["YES", "PARTIAL", "NO"]),
  meaningPreserved: z.enum(["YES", "NO", "UNCERTAIN"]), unauthorizedSemanticChange: z.enum(["YES", "NO", "UNCERTAIN"]),
  unsupportedInformation: z.enum(["YES", "NO", "UNCERTAIN"]), voicePreserved: z.enum(["YES", "NO", "UNCERTAIN"]),
  overedited: z.enum(["YES", "NO"]), underedited: z.enum(["YES", "NO"]), unnecessaryChangeToGoodSource: z.enum(["YES", "NO", "N/A"]),
}).strict();
export type AuditOutputLabels = z.infer<typeof outputSchema>;
const reviewRowSchema = z.object({ itemId: z.string(), outputA: outputSchema, outputB: outputSchema, pairwise: z.enum(["OUTPUT_A_BETTER", "OUTPUT_B_BETTER", "EQUIVALENT", "NEITHER"]), evidence: z.object({ outputA: z.string(), outputB: z.string(), pairwise: z.string() }).strict() }).strict();
const replayRowSchema = z.object({ id: z.string().regex(/^V3-\d{3}$/), source: z.string(), objective: z.string(), candidate: z.string(), final: z.string(), candidateVerification: z.unknown().nullable(), finalVerification: z.unknown(), review: z.unknown().nullable(), semanticCalls: z.array(z.unknown()), calls: z.array(z.unknown()), trace: z.record(z.string(), z.unknown()), technicalFailures: z.array(z.unknown()) }).passthrough();
const prelabelSchema = z.object({ id: z.string().regex(/^V3-\d{3}$/), reviewerId: z.enum(prelabelReviewers), expectedEditScope: z.string(), authorizedFactualChanges: z.array(z.string()), preservedFacts: z.array(z.string()), intentionalVoice: z.array(z.string()), missingInformationPreventsFulfillment: z.boolean().nullable(), notes: z.string() }).strict();
const postLabelRowSchema = z.object({ caseId: z.string().regex(/^V3-\d{3}$/), blindItemId: z.string(), reviewerId: z.enum(reviewerIds), phase: z.enum(["primary", "second"]), outputASide: z.enum(["RAW", "FINAL"]), outputBSide: z.enum(["RAW", "FINAL"]), labels: reviewRowSchema }).strict();
export type AuditReason = "RAW_BAD_PROXY" | "FINAL_BAD_PROXY" | "POSSIBLE_GOOD_LOSS" | "OUTPUT_LABEL_DISAGREEMENT" | "PAIRWISE_DISAGREEMENT" | "REPAIR_ATTEMPT" | "FALLBACK" | "EXPLICIT_UPDATE" | "VAGUE_UPDATE" | "FINAL_UNSUPPORTED_INFORMATION" | "FINAL_UNAUTHORIZED_CHANGE" | "FIXED_CLEAN_SAMPLE";
export type AuditQueueItem = { caseId: string; reasonCodes: AuditReason[] };
export function validateReviewPhaseMembership(phase: "primary" | "second", secondReview: boolean) {
  if (phase === "second" && !secondReview) throw new Error("second-phase row lacks frozen second-review assignment");
}

function safeRead(path: string): Buffer {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error("unsafe audit input file"); return readFileSync(fd); }
  finally { closeSync(fd); }
}
function readPinned(path: string, expected: string, description: string): Buffer {
  const bytes = safeRead(path);
  verifyAuditArtifactHash(bytes, expected, description);
  return bytes;
}
export function verifyAuditArtifactHash(bytes: Buffer, expected: string, description: string) {
  if (digest(bytes) !== expected) throw new Error(`${description} hash mismatch`);
}
function parseJson(bytes: Buffer): unknown { return JSON.parse(bytes.toString("utf8")) as unknown; }
function exactIds(actual: readonly string[], expected: readonly string[], description: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || [...actual].sort().join("\0") !== [...expected].sort().join("\0")) throw new Error(`${description} inventory mismatch`);
}
function mappedLabels(row: z.infer<typeof postLabelRowSchema>) {
  const rawKey = row.outputASide === "RAW" ? "outputA" : "outputB", finalKey = row.outputASide === "FINAL" ? "outputA" : "outputB";
  return { raw: row.labels[rawKey], final: row.labels[finalKey], pairwise: row.labels.pairwise };
}
function badProxy(label: z.infer<typeof outputSchema>) {
  return label.meaningPreserved === "NO" || label.unauthorizedSemanticChange === "YES" || label.unsupportedInformation === "YES";
}
function strictGood(label: z.infer<typeof outputSchema>) {
  return label.objectiveSatisfied === "YES" && label.editoriallyUseful === "YES" && label.meaningPreserved === "YES" && label.unauthorizedSemanticChange === "NO" && label.unsupportedInformation === "NO" && label.voicePreserved === "YES";
}
export function deriveAuditQueue(input: {
  caseIds: readonly string[];
  postLabels: readonly z.infer<typeof postLabelRowSchema>[];
  replayRows: readonly z.infer<typeof replayRowSchema>[];
  fixedCleanSample: readonly string[];
  updateStratum: V3UpdateStratum;
}): AuditQueueItem[] {
  const all = new Set(input.caseIds), primary = new Map<string, z.infer<typeof postLabelRowSchema>>(), second = new Map<string, z.infer<typeof postLabelRowSchema>>();
  for (const row of input.postLabels) {
    if (!all.has(row.caseId)) throw new Error("label case outside frozen inventory");
    const target = row.phase === "primary" ? primary : second;
    if (target.has(row.caseId)) throw new Error("duplicate case review phase");
    target.set(row.caseId, row);
  }
  exactIds([...primary.keys()], input.caseIds, "primary label");
  const replay = new Map(input.replayRows.map(row => [row.id, row]));
  exactIds([...replay.keys()], input.caseIds, "replay");
  exactIds(input.updateStratum.explicitUpdateCaseIds, V3_EXPLICIT_UPDATE_IDS, "explicit-update stratum");
  exactIds(input.updateStratum.vagueMissingCaseIds, V3_VAGUE_MISSING_IDS, "vague/missing-update stratum");
  if (!isDeepStrictEqual(input.updateStratum.provenance.priorProvisional, V3_PRIOR_PROVISIONAL_QUEUE)) throw new Error("superseded provisional queue provenance mismatch");
  const explicitIds = new Set(input.updateStratum.explicitUpdateCaseIds), vagueIds = new Set(input.updateStratum.vagueMissingCaseIds);
  for (const id of [...explicitIds, ...vagueIds]) if (!all.has(id) || id === "V3-030") throw new Error("invalid authorized update stratum membership");
  const reasons = new Map<string, Set<AuditReason>>();
  const add = (id: string, reason: AuditReason) => { const set = reasons.get(id) ?? new Set<AuditReason>(); set.add(reason); reasons.set(id, set); };
  for (const caseId of input.caseIds) {
    const primaryRow = primary.get(caseId)!;
    const primaryMapped = mappedLabels(primaryRow);
    const candidate = replay.get(caseId)!;
    if (badProxy(primaryMapped.raw)) add(caseId, "RAW_BAD_PROXY");
    if (badProxy(primaryMapped.final)) add(caseId, "FINAL_BAD_PROXY");
    if (strictGood(primaryMapped.raw) && !strictGood(primaryMapped.final)) add(caseId, "POSSIBLE_GOOD_LOSS");
    const secondRow = second.get(caseId);
    if (secondRow) {
      const secondMapped = mappedLabels(secondRow);
      if (JSON.stringify(primaryMapped.raw) !== JSON.stringify(secondMapped.raw) || JSON.stringify(primaryMapped.final) !== JSON.stringify(secondMapped.final)) add(caseId, "OUTPUT_LABEL_DISAGREEMENT");
      if (primaryMapped.pairwise !== secondMapped.pairwise) add(caseId, "PAIRWISE_DISAGREEMENT");
      if (badProxy(secondMapped.raw)) add(caseId, "RAW_BAD_PROXY");
      if (badProxy(secondMapped.final)) add(caseId, "FINAL_BAD_PROXY");
      if (strictGood(secondMapped.raw) && !strictGood(secondMapped.final)) add(caseId, "POSSIBLE_GOOD_LOSS");
    }
    for (const row of [primaryRow, ...(secondRow ? [secondRow] : [])]) {
      const labels = mappedLabels(row);
      if (labels.final.unsupportedInformation === "YES") add(caseId, "FINAL_UNSUPPORTED_INFORMATION");
      if (labels.final.unauthorizedSemanticChange === "YES") add(caseId, "FINAL_UNAUTHORIZED_CHANGE");
    }
    const trace = candidate.trace;
    const repairCallObserved = candidate.calls.some(call => !!call && typeof call === "object" && "stage" in call && (call as { stage?: unknown }).stage === "repair");
    if (repairCallObserved || trace.repairRequested === true || trace.repairAccepted === true || trace.repairClassification !== null && trace.repairClassification !== undefined) add(caseId, "REPAIR_ATTEMPT");
    if (trace.outcome === "source-fallback" || trace.fallbackReason !== null && trace.fallbackReason !== undefined) add(caseId, "FALLBACK");
    if (explicitIds.has(caseId)) add(caseId, "EXPLICIT_UPDATE");
    if (vagueIds.has(caseId)) add(caseId, "VAGUE_UPDATE");
  }
  for (const caseId of input.fixedCleanSample) {
    if (!all.has(caseId)) throw new Error("fixed clean sample contains unknown case");
    add(caseId, "FIXED_CLEAN_SAMPLE");
  }
  return [...reasons].map(([caseId, codes]) => ({ caseId, reasonCodes: [...codes].sort() as AuditReason[] })).sort((a, b) => a.caseId.localeCompare(b.caseId));
}

const materialSchema = z.enum(["GOOD", "BAD", "OTHER", "UNCERTAIN", "DISPUTED"]);
const yesNoUncertain = z.enum(["YES", "NO", "UNCERTAIN"]);
const auditResponseRowSchema = z.object({
  caseId: z.string().regex(/^V3-\d{3}$/), rawMaterialClass: materialSchema, finalMaterialClass: materialSchema,
  goodRetentionStatus: z.enum(["GOOD_RETAINED", "GOOD_LOST", "NOT_GOOD_RAW", "UNCERTAIN", "DISPUTED"]),
  badOutcomeStatus: z.enum(["BAD_CAUGHT", "BAD_ESCAPED", "NOT_BAD", "UNCERTAIN", "DISPUTED"]),
  catchOrEscape: z.enum(["CAUGHT", "ESCAPED", "NOT_APPLICABLE", "UNCERTAIN", "DISPUTED"]),
  lossCause: z.enum(["NONE", "DETERMINISTIC_FALSE_REJECTION", "SEMANTIC_FALSE_REJECTION", "REPAIR_DEGRADATION", "UNNECESSARY_FALLBACK", "DISPUTED", "UNCERTAIN", "OTHER"]),
  badFinalEscapeType: z.enum(["NONE", "MEANING_DRIFT", "UNSUPPORTED_INFORMATION", "UNAUTHORIZED_UPDATE", "NEGATION", "CERTAINTY", "ATTRIBUTION", "CAUSALITY", "ACTOR", "DATE", "NUMBER", "STATUS", "VOICE_MEANING_INTERACTION", "OTHER", "DISPUTED", "UNCERTAIN"]),
  repairQuality: z.enum(["EDITORIALLY_USEFUL_REPAIR", "SAFE_REVERSION", "FAILED_REPAIR", "HARMFUL_REPAIR", "DISPUTED", "UNCERTAIN", "NO_REPAIR"]),
  fallbackQuality: z.enum(["NECESSARY_SAFETY_FALLBACK", "UNNECESSARY_GOOD_EDIT_LOSS", "SOURCE_ALREADY_BEST", "EDITOR_ALREADY_RETURNED_SOURCE", "DISPUTED", "UNCERTAIN", "NO_FALLBACK"]),
  explicitUpdateObserved: yesNoUncertain, explicitUpdateEvidence: z.string().trim().min(1).max(1000),
  vagueUpdateObserved: yesNoUncertain, vagueUpdateEvidence: z.string().trim().min(1).max(1000),
  alreadyGoodSource: yesNoUncertain, alreadyGoodEvidence: z.string().trim().min(1).max(1000), disputedOrUncertain: yesNoUncertain, evidence: z.string().trim().min(1).max(2000),
}).strict();
export const auditResponseSchema = z.object({ protocol: z.literal("v3-trace-audit-response-v1"), auditorId: z.string().trim().min(1).max(80), rows: z.array(auditResponseRowSchema).min(1) }).strict();
export type AuditResponse = z.infer<typeof auditResponseSchema>;
export function validateAuditResponse(value: unknown, expectedCaseIds: readonly string[]): AuditResponse {
  const parsed = auditResponseSchema.parse(value), ids = parsed.rows.map(row => row.caseId);
  exactIds(ids, expectedCaseIds, "audit response");
  return parsed;
}

const queueReasonSchema = z.enum(["RAW_BAD_PROXY", "FINAL_BAD_PROXY", "POSSIBLE_GOOD_LOSS", "OUTPUT_LABEL_DISAGREEMENT", "PAIRWISE_DISAGREEMENT", "REPAIR_ATTEMPT", "FALLBACK", "EXPLICIT_UPDATE", "VAGUE_UPDATE", "FINAL_UNSUPPORTED_INFORMATION", "FINAL_UNAUTHORIZED_CHANGE", "FIXED_CLEAN_SAMPLE"]);
const sealedQueueSchema = z.object({ protocol: z.literal("v3-mandatory-trace-audit-queue-v1"), rowCount: z.literal(85), queueSha256: z.string().length(64), rows: z.array(z.object({ caseId: z.string().regex(/^V3-\d{3}$/), reasonCodes: z.array(queueReasonSchema).min(1) }).strict()).length(85) }).strict();
const sealedPacketSchema = z.object({ protocol: z.literal("v3-trace-audit-packet-v1"), packetId: z.enum(["A1", "A2", "A3", "A4", "A5"]), queueSha256: z.string().length(64), rowCount: z.literal(17), rows: z.array(z.object({ caseId: z.string().regex(/^V3-\d{3}$/), reasonCodes: z.array(queueReasonSchema).min(1) }).passthrough()).length(17) }).passthrough();
const auditCommitmentsSchema = z.object({ protocol: z.literal("v3-trace-audit-input-commitments-v1"), sourceCommitments: z.object({ replaySha256: z.string().length(64) }).passthrough(), queueSha256: z.string().length(64), packetCounts: z.array(z.literal(17)).length(5), packetSha256: z.array(z.string().length(64)).length(5) }).passthrough();
export type SealedAuditPacket = z.infer<typeof sealedPacketSchema>;
export function verifyPinnedAuditBundle(packetId: string) {
  const index = ["A1", "A2", "A3", "A4", "A5"].indexOf(packetId);
  if (index < 0) throw new Error("unknown audit packet ID");
  const replayBytes = readPinned(resolve(run, "replay.json"), V3_REPLAY_SHA256, "V3 replay");
  parseAuditReplayArtifact(parseJson(replayBytes));
  const queueBytes = readPinned(resolve(run, "audit-v1/queue.json"), V3_AUDIT_QUEUE_FILE_SHA256, "audit queue");
  const queue = sealedQueueSchema.parse(parseJson(queueBytes));
  if (digest(serialize(queue.rows)) !== queue.queueSha256) throw new Error("audit queue semantic hash mismatch");
  const commitmentBytes = readPinned(resolve(run, "audit-v1/commitments.json"), V3_AUDIT_COMMITMENTS_FILE_SHA256, "audit commitments");
  const commitments = auditCommitmentsSchema.parse(parseJson(commitmentBytes));
  if (commitments.queueSha256 !== queue.queueSha256 || commitments.sourceCommitments.replaySha256 !== V3_REPLAY_SHA256) throw new Error("audit source commitment mismatch");
  const queueRows = new Map(queue.rows.map(row => [row.caseId, row]));
  const allPacketIds: string[] = [];
  let target: SealedAuditPacket | undefined;
  for (let packetIndex = 0; packetIndex < 5; packetIndex++) {
    const id = `A${packetIndex + 1}`;
    const packetBytes = readPinned(resolve(run, `audit-v1/packet-${id}.json`), V3_AUDIT_PACKET_SHA256[packetIndex]!, `audit packet ${id}`);
    const packet = sealedPacketSchema.parse(parseJson(packetBytes));
    if (packet.packetId !== id || packet.queueSha256 !== queue.queueSha256 || commitments.packetSha256[packetIndex] !== V3_AUDIT_PACKET_SHA256[packetIndex] || auditPacketSha256(packet) !== V3_AUDIT_PACKET_SHA256[packetIndex]) throw new Error(`audit packet ${id} commitment mismatch`);
    const packetIds = packet.rows.map(row => row.caseId);
    exactIds(packetIds, packetIds, `audit packet ${id}`);
    allPacketIds.push(...packetIds);
    for (const row of packet.rows) {
      const queued = queueRows.get(row.caseId);
      if (!queued || !isDeepStrictEqual(queued.reasonCodes, row.reasonCodes)) throw new Error(`audit packet ${id} queue membership mismatch`);
    }
    if (id === packetId) target = packet;
  }
  exactIds(allPacketIds, queue.rows.map(row => row.caseId), "audit packet union/queue");
  if (!target) throw new Error("audit packet missing");
  return { packetId, packet: target, packetSha256: V3_AUDIT_PACKET_SHA256[index]!, queueSha256: queue.queueSha256, replaySha256: V3_REPLAY_SHA256 };
}
export function readPrivateAuditResponse(inputPath: string): Buffer {
  const absolute = resolve(inputPath);
  const canonicalTmp = realpathSync(tmpdir());
  const allowedRoots = ["/private/tmp", canonicalTmp];
  if (!allowedRoots.some(base => absolute.startsWith(`${base}${sep}`))) throw new Error("response input must be in a private temporary directory");
  assertNoSymlinkComponents(absolute);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) throw new Error("response input must be a private regular file with mode 0600");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function writeExclusiveBytes(path: string, bytes: Buffer) {
  assertNoSymlinkComponents(path);
  const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    if (!fstatSync(fd).isFile()) throw new Error("unsafe response artifact");
    writeFileSync(fd, bytes); fsyncSync(fd); fsyncSync(parent);
  } finally { if (fd !== undefined) closeSync(fd); closeSync(parent); }
}
export function writeAuditResponseArtifacts(stagingPath: string, originalBytes: Buffer, canonical: AuditResponse, commitment: unknown) {
  writeExclusiveBytes(resolve(stagingPath, "original-response.json"), originalBytes);
  exclusiveBlindWrite(resolve(stagingPath, "response.json"), canonical);
  exclusiveBlindWrite(resolve(stagingPath, "commitment.json"), commitment);
}
export function persistAuditResponse(packetId: string, originalBytes: Buffer, responseValue: unknown) {
  const sealed = verifyPinnedAuditBundle(packetId), response = validateAuditResponse(responseValue, sealed.packet.rows.map(row => row.caseId));
  const canonicalBytes = Buffer.from(serialize(response));
  const commitment = { protocol: "v3-trace-audit-response-commitment-v1", packetId, rowCount: response.rows.length, packetSha256: sealed.packetSha256, queueSha256: sealed.queueSha256, replaySha256: sealed.replaySha256, originalResponseSha256: digest(originalBytes), canonicalResponseSha256: digest(canonicalBytes) };
  const destination = resolve(run, `audit-v1/responses/${packetId}`);
  exclusiveAtomicDirectory(destination, staging => writeAuditResponseArtifacts(staging, originalBytes, response, commitment));
  return { packetId, rowCount: response.rows.length, originalResponseSha256: digest(originalBytes), canonicalResponseSha256: digest(canonicalBytes) };
}

function validateUpdateStratum(bytes: Buffer, expectedSha256: string): V3UpdateStratum {
  if (digest(bytes) !== expectedSha256) throw new Error("authorized update-stratum artifact hash mismatch");
  return updateStratumSchema.parse(parseJson(bytes));
}
function parseSubmission(bytes: Buffer, reviewerId: typeof reviewerIds[number]): ReviewSubmission {
  const parsed = reviewSubmissionSchema.parse(parseJson(bytes));
  if (parsed.reviewerId !== reviewerId || parsed.rows.length !== expectedRows[reviewerId]) throw new Error("sealed review submission inventory mismatch");
  return parsed;
}
export function parseAuditReplayArtifact(value: unknown) {
  return z.object({ strategy: z.literal("reconstruction-v15"), mode: z.literal("replay"), manifestSha256: z.literal(V3_MANIFEST_SHA256), caseCount: z.literal(119), technicalFailures: z.array(z.unknown()).length(0), contractErrors: z.array(z.unknown()).length(0), rows: z.array(replayRowSchema).length(119) }).strict().parse(value);
}
export function auditPacketSha256(packet: unknown) { return digest(serialize(packet)); }
function loadAuditInputs(updateStratumSha256: string) {
  const frozen = verifyV3Integrity(), caseIds = frozen.map(row => row.id);
  const replayBytes = readPinned(resolve(run, "replay.json"), V3_REPLAY_SHA256, "V3 replay");
  const replay = parseAuditReplayArtifact(parseJson(replayBytes));
  const mappingBytes = readPinned(resolve(blindRoot, "custodian/mapping.json"), V3_MAPPING_SHA256, "blind mapping");
  const mapping = z.array(z.object({ itemId: z.string(), caseId: z.string().regex(/^V3-\d{3}$/), outputA: z.enum(["RAW", "FINAL"]), outputB: z.enum(["RAW", "FINAL"]), identical: z.boolean(), rawSha256: z.string(), finalSha256: z.string(), secondReview: z.boolean() }).strict()).length(119).parse(parseJson(mappingBytes));
  exactIds(mapping.map(row => row.caseId), caseIds, "blind mapping/frozen");
  if (mapping.some(row => row.outputA === row.outputB) || mapping.filter(row => row.secondReview).length !== 60) throw new Error("invalid blind mapping orientation");
  const primaryPacketBytes = readPinned(resolve(blindRoot, "primary/packet.json"), V3_BLIND_PRIMARY_PACKET_SHA256, "primary blind packet");
  const secondPacketBytes = readPinned(resolve(blindRoot, "second/packet.json"), V3_BLIND_SECOND_PACKET_SHA256, "second blind packet");
  const primaryPacket = z.array(blindItemSchema).length(119).parse(parseJson(primaryPacketBytes));
  const secondPacket = z.array(blindItemSchema).length(60).parse(parseJson(secondPacketBytes));
  const frozenById = new Map(frozen.map(row => [row.id, row])), replayById = new Map(replay.rows.map(row => [row.id, row])), mappingByItemId = new Map(mapping.map(row => [row.itemId, row]));
  const packetIds = (rows: z.infer<typeof blindItemSchema>[], expectedPhase: "primary" | "second") => {
    for (const packet of rows) {
      const blind = mappingByItemId.get(packet.itemId);
      if (!blind) throw new Error(`${expectedPhase} blind packet mapping mismatch`);
      validateReviewPhaseMembership(expectedPhase, blind.secondReview);
      const item = frozenById.get(blind.caseId), replayRow = replayById.get(blind.caseId);
      if (!item || !replayRow || packet.source !== item.source || packet.objective !== item.objective) throw new Error("blind packet/frozen case mismatch");
      const raw = replayRow.candidate, final = replayRow.final;
      if (digest(raw) !== blind.rawSha256 || digest(final) !== blind.finalSha256 || packet.outputA !== (blind.outputA === "RAW" ? raw : final) || packet.outputB !== (blind.outputB === "RAW" ? raw : final)) throw new Error("blind packet/replay orientation or text commitment mismatch");
    }
    return rows.map(row => row.itemId);
  };
  exactIds(packetIds(primaryPacket, "primary"), mapping.map(row => row.itemId), "primary blind packet/mapping");
  exactIds(packetIds(secondPacket, "second"), mapping.filter(row => row.secondReview).map(row => row.itemId), "second blind packet/mapping");
  const labelsBytes = readPinned(resolve(postRoot, "unblinded-labels.json"), V3_POST_LABELS_SHA256, "post-review labels");
  const labels = z.object({ protocol: z.literal("v3-unblinded-output-labels-v1"), traceAccess: z.literal("NONE"), inputHashes: z.record(z.string(), z.unknown()), reviewCount: z.literal(179), rows: z.array(postLabelRowSchema).length(179) }).strict().parse(parseJson(labelsBytes));
  const mapByCaseId = new Map(mapping.map(row => [row.caseId, row]));
  for (const row of labels.rows) {
    const mappingRow = mapByCaseId.get(row.caseId);
    if (!mappingRow || row.blindItemId !== mappingRow.itemId || row.outputASide !== mappingRow.outputA || row.outputBSide !== mappingRow.outputB) throw new Error("post-review label/mapping assignment mismatch");
    validateReviewPhaseMembership(row.phase, mappingRow.secondReview);
  }
  const metricBytes = readPinned(resolve(postRoot, "initial-metrics.json"), V3_POST_METRICS_SHA256, "post-review metrics");
  const selectionBytes = readPinned(resolve(postRoot, "audit-selection.json"), V3_AUDIT_SELECTION_SHA256, "pre-trace audit selection");
  const supplementalBytes = readPinned(resolve(postRoot, "supplemental-second-selection.json"), V3_SUPPLEMENTAL_SHA256, "supplemental selection");
  const selection = z.object({ protocol: z.literal("v3-pre-trace-audit-selection-v1"), cleanPoolCount: z.literal(63), seed: z.string(), selectedCount: z.literal(15), selectedIds: z.array(z.string()).length(15), traceValuesRead: z.literal(false) }).passthrough().parse(parseJson(selectionBytes));
  const prelabelAssignmentBytes = safeRead(resolve(root, "frozen/assignments.json"));
  const prelabelAssignment = z.object({ primary: z.record(z.string(), z.enum(["R1A", "R1B"])), second: z.record(z.string(), z.enum(["R2A", "R2B"])) }).passthrough().parse(parseJson(prelabelAssignmentBytes));
  const prelabels = prelabelReviewers.flatMap(reviewer => z.array(prelabelSchema).parse(parseJson(safeRead(resolve(root, `frozen/review-${reviewer}.json`)))));
  if (prelabels.length !== 191 || prelabels.some(row => !caseIds.includes(row.id))) throw new Error("frozen prereview labels inventory mismatch");
  for (const reviewer of prelabelReviewers) {
    const phase = reviewer.startsWith("R1") ? "primary" : "second";
    const expected = Object.entries(prelabelAssignment[phase]).filter(([, assigned]) => assigned === reviewer).map(([caseId]) => caseId);
    exactIds(prelabels.filter(row => row.reviewerId === reviewer).map(row => row.id), expected, `frozen prereview ${reviewer}`);
  }
  const shardManifestBytes = readPinned(resolve(blindRoot, "review-shards-v1/custodian/assignments.json"), V3_REVIEW_SHARD_MANIFEST_FILE_SHA256, "review shard manifest");
  const originalInventoryBytes = readPinned(resolve(blindRoot, "review-originals-v1/inventory.json"), V3_ORIGINAL_ARCHIVE_INVENTORY_SHA256, "review originals inventory");
  const originalInventory = z.object({ inventorySha256: z.string() }).passthrough().parse(parseJson(originalInventoryBytes));
  const { inventorySha256, ...inventoryCore } = originalInventory;
  if (digest(serialize(inventoryCore)) !== inventorySha256 || inventorySha256 !== V3_ORIGINAL_ARCHIVE_INVENTORY_DIGEST) throw new Error("review originals archive seal mismatch");
  const reviewSubmissionHashes: Record<string, { original: string; canonical: string }> = {};
  for (const reviewerId of reviewerIds) {
    const phase = reviewerId.startsWith("O1") ? "primary" : "second";
    const originalPath = resolve(blindRoot, `review-originals-v1/${phase}/${reviewerId}/submission.json`);
    const canonicalPath = resolve(blindRoot, `review-submissions-v1/${phase}/${reviewerId}/submission.json`);
    const original = safeRead(originalPath), canonical = safeRead(canonicalPath);
    if (digest(original) !== V3_ORIGINAL_REVIEW_SHA256[reviewerId] || digest(canonical) !== V3_CANONICAL_REVIEW_SHA256[reviewerId]) throw new Error(`immutable reviewer submission mismatch: ${reviewerId}`);
    if (!isDeepStrictEqual(parseSubmission(original, reviewerId), parseSubmission(canonical, reviewerId))) throw new Error(`original/canonical reviewer mismatch: ${reviewerId}`);
    reviewSubmissionHashes[reviewerId] = { original: digest(original), canonical: digest(canonical) };
  }
  const updateBytes = safeRead(resolve(root, "audit-strata-v1.json"));
  const updateStratum = validateUpdateStratum(updateBytes, updateStratumSha256);
  const secondCaseIds = mapping.filter(row => row.secondReview).map(row => row.caseId);
  exactIds(labels.rows.filter(row => row.phase === "second").map(row => row.caseId), secondCaseIds, "second review labels/mapping");
  const queue = deriveAuditQueue({ caseIds, postLabels: labels.rows, replayRows: replay.rows, fixedCleanSample: selection.selectedIds, updateStratum });
  const sourceCommitments = {
    manifestSha256: V3_MANIFEST_SHA256, replaySha256: digest(replayBytes), mappingSha256: digest(mappingBytes),
    primaryPacketSha256: digest(primaryPacketBytes), secondPacketSha256: digest(secondPacketBytes),
    shardManifestSha256: digest(shardManifestBytes), reviewSubmissionHashes,
    reviewOriginalInventorySha256: digest(originalInventoryBytes), reviewOriginalInventoryDigest: inventorySha256,
    postReviewLabelsSha256: digest(labelsBytes), postReviewMetricsSha256: digest(metricBytes), auditSelectionSha256: digest(selectionBytes), supplementalSelectionSha256: digest(supplementalBytes),
    frozenAssignmentSha256: digest(prelabelAssignmentBytes), frozenPrelabelSha256: Object.fromEntries(prelabelReviewers.map(reviewer => [`${reviewer}.json`, digest(safeRead(resolve(root, `frozen/review-${reviewer}.json`)))])),
    authorizedUpdateStratumSha256: digest(updateBytes),
  };
  return { caseIds, mapping, replay: replay.rows, labels: labels.rows, prelabels, queue, selection, sourceCommitments };
}

export function buildAuditArtifacts(input: ReturnType<typeof loadAuditInputs>) {
  const queueBytes = serialize(input.queue), queueSha256 = digest(queueBytes);
  const frozenById = new Map(verifyV3Integrity().map(row => [row.id, row]));
  const replayById = new Map(input.replay.map(row => [row.id, row]));
  const mappingById = new Map(input.mapping.map(row => [row.caseId, row]));
  const labelsById = new Map<string, z.infer<typeof postLabelRowSchema>[]>();
  for (const row of input.labels) labelsById.set(row.caseId, [...(labelsById.get(row.caseId) ?? []), row]);
  const prelabelsById = new Map<string, z.infer<typeof prelabelSchema>[]>();
  for (const row of input.prelabels) prelabelsById.set(row.id, [...(prelabelsById.get(row.id) ?? []), row]);
  const packets = Array.from({ length: 5 }, (_, index) => {
    const baseSize = Math.floor(input.queue.length / 5), extra = input.queue.length % 5;
    const start = index * baseSize + Math.min(index, extra), size = baseSize + (index < extra ? 1 : 0);
    return input.queue.slice(start, start + size).map(entry => {
    const item = frozenById.get(entry.caseId)!, replay = replayById.get(entry.caseId)!, mapping = mappingById.get(entry.caseId)!;
    if (!item || !replay || !mapping) throw new Error("audit packet source inventory mismatch");
    const outputLabels = (labelsById.get(entry.caseId) ?? []).map(row => ({ reviewerId: row.reviewerId, phase: row.phase, rawFinalOrientation: { outputA: row.outputASide, outputB: row.outputBSide }, labels: row.labels }));
    return {
      caseId: entry.caseId, reasonCodes: entry.reasonCodes, source: item.source, objective: item.objective,
      raw: replay.candidate, final: replay.final,
      primarySecondBlindLabels: outputLabels, prereviewLabels: prelabelsById.get(entry.caseId) ?? [],
      trace: { candidateVerification: replay.candidateVerification, finalVerification: replay.finalVerification, semanticReview: replay.review, semanticCalls: replay.semanticCalls, calls: replay.calls, findings: { candidate: (replay.candidateVerification as { findings?: unknown[] } | null)?.findings ?? [], final: (replay.finalVerification as { findings?: unknown[] } | null)?.findings ?? [] }, repair: { requested: replay.trace.repairRequested, accepted: replay.trace.repairAccepted, classification: replay.trace.repairClassification }, fallback: { outcome: replay.trace.outcome, reason: replay.trace.fallbackReason }, technicalFailures: replay.technicalFailures },
    };
    });
  });
  const packetArtifacts = packets.map((rows, index) => ({ protocol: "v3-trace-audit-packet-v1", packetId: `A${index + 1}`, queueSha256, rowCount: rows.length, rows }));
  return {
    queue: { protocol: "v3-mandatory-trace-audit-queue-v1", rowCount: input.queue.length, queueSha256, rows: input.queue },
    packets: packetArtifacts,
    commitments: { protocol: "v3-trace-audit-input-commitments-v1", sourceCommitments: input.sourceCommitments, priorProvisionalQueue: V3_PRIOR_PROVISIONAL_QUEUE, queueSha256, packetCounts: packetArtifacts.map(packet => packet.rowCount), packetSha256: packetArtifacts.map(packet => auditPacketSha256(packet)) },
  };
}

export function initAuditV1() {
  if (!/^[a-f0-9]{64}$/.test(V3_AUDIT_STRATA_SHA256)) throw new Error("independent audit must pin the reviewed strata artifact before building packets");
  const inputs = loadAuditInputs(V3_AUDIT_STRATA_SHA256), artifacts = buildAuditArtifacts(inputs), output = resolve(run, "audit-v1");
  exclusiveAtomicDirectory(output, staging => {
    exclusiveBlindWrite(resolve(staging, "queue.json"), artifacts.queue);
    exclusiveBlindWrite(resolve(staging, "commitments.json"), artifacts.commitments);
    for (const packet of artifacts.packets) exclusiveBlindWrite(resolve(staging, `packet-${packet.packetId}.json`), packet);
  });
  const dirMode = statSync(output).mode & 0o777;
  return { output, count: artifacts.queue.rowCount, queueSha256: artifacts.queue.queueSha256, packetCounts: artifacts.commitments.packetCounts, dirMode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "build" && process.argv.length === 3) {
      process.stdout.write(JSON.stringify(initAuditV1()) + "\n");
    } else if (process.argv[2] === "submit" && process.argv.length === 5) {
      const packetId = process.argv[3]!;
      verifyPinnedAuditBundle(packetId);
      const original = readPrivateAuditResponse(process.argv[4]!);
      const response = JSON.parse(original.toString("utf8")) as unknown;
      process.stdout.write(JSON.stringify(persistAuditResponse(packetId, original, response)) + "\n");
    } else {
      throw new Error("usage: node --import tsx tools/eval/holdout-v3-audit.ts build | submit <A1..A5> <private-response.json>");
    }
  } catch (error) {
    if (process.argv[2] === "submit") process.stderr.write("Audit response rejected; no submission committed.\n");
    else process.stderr.write(`${error instanceof Error ? error.message : "V3 audit packet initialization failed"}\n`);
    process.exitCode = 1;
  }
}
