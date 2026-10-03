/** Custodian-only, pre-trace V3 review unblinding and selection. Never invokes models or reads replay traces. */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertNoSymlinkComponents, blindItemSchema, exclusiveBlindWrite } from "./holdout-v3-blind";
import { V3_MANIFEST_SHA256, verifyV3Integrity } from "./holdout-v3-runner";
import {
  ReviewAssignmentManifest, ReviewPhase, ReviewReviewerId, ReviewSubmission, V3_BLIND_PRIMARY_PACKET_SHA256,
  V3_BLIND_SECOND_PACKET_SHA256, V3_CANONICAL_REVIEW_SHA256, V3_ORIGINAL_REVIEW_SHA256,
  V3_REVIEW_SHARD_MANIFEST_FILE_SHA256, reviewSubmissionSchema, validateReviewSubmission, exclusiveAtomicDirectory,
} from "./holdout-v3-reviews";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const outputReviewers = ["O1A", "O1B", "O1C", "O1D", "O2A", "O2B"] as const;
const expectedReviewerCounts = { O1A: 30, O1B: 30, O1C: 30, O1D: 29, O2A: 30, O2B: 30 } as const;
const mappingSha256 = "83ff9146f2914868c56441ba16c394f30cc3637469a85a0613ceca84f320489b";
const originalsInventorySha256 = "623bc4c25c33337fb8b4f070aa9fd98328bce12798848170064efc2581df0209";
const originalsInventoryDigest = "08c3b69ac692fb84cd53f707f0e260b3606fae27d33f499b63bc3946f6ba571e";
const secondIds = ["V3-002", "V3-007", "V3-012", "V3-017", "V3-030", "V3-031", "V3-035", "V3-038", "V3-040", "V3-043", "V3-045", "V3-054", "V3-059", "V3-063", "V3-064", "V3-067", "V3-072", "V3-080", "V3-094", "V3-095", "V3-106", "V3-110"] as const;
const auditSeed = "bac22382bae2468130ac244cdedd671c0bdbfe001a8ed688531768f6e1639188";
const expectedAuditSample = ["V3-033", "V3-075", "V3-027", "V3-057", "V3-028", "V3-090", "V3-052", "V3-119", "V3-053", "V3-066", "V3-005", "V3-083", "V3-099", "V3-032", "V3-076"] as const;
const coreGoodFields = ["objectiveSatisfied", "editoriallyUseful", "meaningPreserved", "unauthorizedSemanticChange", "unsupportedInformation", "voicePreserved"] as const;
const frozenReviewSchema = z.object({
  id: z.string().regex(/^V3-\d{3}$/), reviewerId: z.enum(["R1A", "R1B", "R2A", "R2B"]),
  expectedEditScope: z.enum(["LEAVE_ALONE", "LOCAL_EDIT", "DISTRIBUTED_LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "INSUFFICIENT_INFORMATION", "AMBIGUOUS"]),
  authorizedFactualChanges: z.array(z.string()), preservedFacts: z.array(z.string()), intentionalVoice: z.array(z.string()),
  missingInformationPreventsFulfillment: z.boolean().nullable(), notes: z.string(),
}).strict();
const mappingRowSchema = z.object({ itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), caseId: z.string().regex(/^V3-\d{3}$/), outputA: z.enum(["RAW", "FINAL"]), outputB: z.enum(["RAW", "FINAL"]), identical: z.boolean(), rawSha256: z.string().regex(/^[a-f0-9]{64}$/), finalSha256: z.string().regex(/^[a-f0-9]{64}$/), secondReview: z.boolean() }).strict();
type OutputLabel = ReviewSubmission["rows"][number]["outputA"];
type ReviewRecord = { itemId: string; caseId: string; reviewerId: ReviewReviewerId; phase: ReviewPhase; outputASide: "RAW" | "FINAL"; outputBSide: "RAW" | "FINAL"; originalRow: ReviewSubmission["rows"][number] };
type OutputClass = "STRICT_GOOD" | "BAD_PROXY" | "UNCERTAIN" | "OTHER";

export function classifyReviewOutput(label: OutputLabel): OutputClass {
  if (label.meaningPreserved === "NO" || label.unauthorizedSemanticChange === "YES" || label.unsupportedInformation === "YES") return "BAD_PROXY";
  if (label.objectiveSatisfied === "YES" && label.editoriallyUseful === "YES" && label.meaningPreserved === "YES" && label.unauthorizedSemanticChange === "NO" && label.unsupportedInformation === "NO" && label.voicePreserved === "YES") return "STRICT_GOOD";
  if (Object.values(label).some(value => value === "UNCERTAIN")) return "UNCERTAIN";
  return "OTHER";
}
function mapToRawFinal(record: ReviewRecord, value: ReviewRecord["originalRow"]) {
  const rawSide = record.outputASide === "RAW" ? "outputA" : "outputB";
  const finalSide = record.outputASide === "FINAL" ? "outputA" : "outputB";
  return { raw: value[rawSide], final: value[finalSide] };
}
function emptyClassCounts() { return { STRICT_GOOD: 0, BAD_PROXY: 0, UNCERTAIN: 0, OTHER: 0 }; }
function add(counts: ReturnType<typeof emptyClassCounts>, classification: OutputClass) { counts[classification]++; }
function summarizeOneReviewer(records: readonly ReviewRecord[]) {
  const raw = emptyClassCounts(), final = emptyClassCounts();
  let retained = 0, possibleLoss = 0;
  for (const record of records) {
    const outputs = mapToRawFinal(record, record.originalRow);
    const rawClass = classifyReviewOutput(outputs.raw), finalClass = classifyReviewOutput(outputs.final);
    add(raw, rawClass); add(final, finalClass);
    if (rawClass === "STRICT_GOOD" && finalClass === "STRICT_GOOD") retained++;
    if (rawClass === "STRICT_GOOD" && finalClass !== "STRICT_GOOD") possibleLoss++;
  }
  return { reviewerId: records[0]?.reviewerId ?? null, phase: records[0]?.phase ?? null, reviewedCount: records.length, raw, final, retained, possibleLoss };
}
export function summarizeInitialMetrics(records: readonly ReviewRecord[], prelabelScopes: Record<string, Record<string, number>>) {
  const byReviewer = Object.fromEntries(outputReviewers.map(reviewerId => {
    const rows = records.filter(row => row.reviewerId === reviewerId);
    if (rows.length !== expectedReviewerCounts[reviewerId]) throw new Error(`reviewer coverage mismatch: ${reviewerId}`);
    return [reviewerId, summarizeOneReviewer(rows)];
  }));
  const summarizePhase = (phase: ReviewPhase) => {
    const phaseRows = records.filter(row => row.phase === phase);
    const raw = emptyClassCounts(), final = emptyClassCounts();
    let retained = 0, possibleLoss = 0;
    for (const row of phaseRows) {
      const outputs = mapToRawFinal(row, row.originalRow), rawClass = classifyReviewOutput(outputs.raw), finalClass = classifyReviewOutput(outputs.final);
      add(raw, rawClass); add(final, finalClass);
      if (rawClass === "STRICT_GOOD" && finalClass === "STRICT_GOOD") retained++;
      if (rawClass === "STRICT_GOOD" && finalClass !== "STRICT_GOOD") possibleLoss++;
    }
    return { reviewedCount: phaseRows.length, raw, final, retained, possibleLoss };
  };
  const primary = summarizePhase("primary"), second = summarizePhase("second");
  const expected = { primary: { rawStrictGood: 99, rawBadProxy: 10, retained: 73, possibleLoss: 26 }, second: { rawStrictGood: 49, rawBadProxy: 4, retained: 30, possibleLoss: 19 } };
  if (primary.reviewedCount !== 119 || primary.raw.STRICT_GOOD !== expected.primary.rawStrictGood || primary.raw.BAD_PROXY !== expected.primary.rawBadProxy || primary.retained !== expected.primary.retained || primary.possibleLoss !== expected.primary.possibleLoss) throw new Error(`primary preliminary metrics differ from sealed expected counts (${JSON.stringify({ reviewedCount: primary.reviewedCount, raw: primary.raw, retained: primary.retained, possibleLoss: primary.possibleLoss })})`);
  if (second.reviewedCount !== 60 || second.raw.STRICT_GOOD !== expected.second.rawStrictGood || second.raw.BAD_PROXY !== expected.second.rawBadProxy || second.retained !== expected.second.retained || second.possibleLoss !== expected.second.possibleLoss) throw new Error("second preliminary metrics differ from sealed expected counts");
  return { protocol: "v3-initial-label-metrics-v1", primary, second, expected, checksPassed: true, byReviewer, prelabelScopes };
}

function sameCoreLabels(first: OutputLabel, second: OutputLabel) {
  return coreGoodFields.every(field => first[field] === second[field]);
}
function cleanPoolEligible(label: OutputLabel) {
  return classifyReviewOutput(label) === "STRICT_GOOD" && label.overedited === "NO" && label.underedited === "NO" && (label.unnecessaryChangeToGoodSource === "NO" || label.unnecessaryChangeToGoodSource === "N/A");
}
export function deriveCleanPool(records: readonly ReviewRecord[]) {
  const byCase = new Map<string, ReviewRecord[]>();
  for (const row of records) byCase.set(row.caseId, [...(byCase.get(row.caseId) ?? []), row]);
  const pool: string[] = [];
  for (const [caseId, rows] of byCase) {
    const primary = rows.filter(row => row.phase === "primary"), second = rows.filter(row => row.phase === "second");
    if (primary.length !== 1 || second.length > 1) throw new Error("review cardinality mismatch in audit pool");
    const available = [...primary, ...second];
    const good = available.every(row => {
      const outputs = mapToRawFinal(row, row.originalRow);
      return cleanPoolEligible(outputs.raw) && cleanPoolEligible(outputs.final);
    });
    const agreement = second.length === 0 || (sameCoreLabels(mapToRawFinal(primary[0]!, primary[0]!.originalRow).raw, mapToRawFinal(second[0]!, second[0]!.originalRow).raw) && sameCoreLabels(mapToRawFinal(primary[0]!, primary[0]!.originalRow).final, mapToRawFinal(second[0]!, second[0]!.originalRow).final));
    if (good && agreement) pool.push(caseId);
  }
  return pool.sort();
}
export function rankAuditSample(cleanPool: readonly string[], seed = auditSeed) {
  return [...cleanPool].sort((a, b) => digest(`${seed}\0${a}`).localeCompare(digest(`${seed}\0${b}`)) || a.localeCompare(b)).slice(0, 15);
}
export function supplementalReasonCodes(record: ReviewRecord) {
  const outputs = mapToRawFinal(record, record.originalRow), reasons: string[] = [];
  const rawClass = classifyReviewOutput(outputs.raw), finalClass = classifyReviewOutput(outputs.final);
  if (rawClass === "BAD_PROXY") reasons.push("RAW_BAD_PROXY");
  if (finalClass === "BAD_PROXY") reasons.push("FINAL_BAD_PROXY");
  if (rawClass === "STRICT_GOOD" && finalClass !== "STRICT_GOOD") reasons.push("POSSIBLE_GOOD_LOSS");
  if (rawClass === "UNCERTAIN") reasons.push("RAW_UNCERTAIN");
  if (finalClass === "UNCERTAIN") reasons.push("FINAL_UNCERTAIN");
  if (outputs.raw.objectiveSatisfied === "PARTIAL") reasons.push("RAW_OBJECTIVE_PARTIAL");
  if (outputs.raw.editoriallyUseful === "PARTIAL") reasons.push("RAW_USEFULNESS_PARTIAL");
  if (outputs.final.objectiveSatisfied === "PARTIAL") reasons.push("FINAL_OBJECTIVE_PARTIAL");
  if (outputs.final.editoriallyUseful === "PARTIAL") reasons.push("FINAL_USEFULNESS_PARTIAL");
  return reasons;
}
export function buildSupplementalSelection(records: readonly ReviewRecord[], fixedSecondCaseIds: ReadonlySet<string>) {
  const primary = records.filter(row => row.phase === "primary");
  const selected = primary.filter(row => !fixedSecondCaseIds.has(row.caseId)).map(row => ({ caseId: row.caseId, reasonCodes: supplementalReasonCodes(row) })).filter(row => row.reasonCodes.length > 0).sort((a, b) => a.caseId.localeCompare(b.caseId));
  if (selected.length !== 22 || !isDeepStrictEqual(selected.map(row => row.caseId), [...secondIds].sort())) throw new Error("supplemental label-only selection differs from sealed 22-case IDs");
  return { protocol: "v3-supplemental-second-review-v1", audience: "CUSTODIAN_ONLY", rationale: "Supplement cases lacking fixed second review where sealed primary labels indicate a BAD proxy, possible good-output loss, uncertainty, or partial objective/usefulness.", reasonRule: "RAW_BAD_PROXY OR FINAL_BAD_PROXY OR (RAW_STRICT_GOOD AND FINAL_NOT_STRICT_GOOD) OR RAW/FINAL_UNCERTAIN OR RAW/FINAL objectiveSatisfied=PARTIAL OR editoriallyUseful=PARTIAL", selected };
}

function readBytes(path: string) {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error("unsafe post-review input file"); return readFileSync(fd); } finally { closeSync(fd); }
}
function parseJson(bytes: Buffer) { return JSON.parse(bytes.toString("utf8")) as unknown; }
function exactSet(actual: readonly string[], expected: readonly string[], context: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || [...actual].sort().join("\0") !== [...expected].sort().join("\0")) throw new Error(`${context} inventory mismatch`);
}
function validateFrozenPrelabels() {
  const cases = verifyV3Integrity();
  const frozenRoot = resolve("data/evaluation/holdout-v3/frozen");
  const assignmentBytes = readBytes(resolve(frozenRoot, "assignments.json"));
  const assignment = z.object({ primary: z.record(z.string(), z.enum(["R1A", "R1B"])), second: z.record(z.string(), z.enum(["R2A", "R2B"])) }).passthrough().parse(parseJson(assignmentBytes));
  const rows: z.infer<typeof frozenReviewSchema>[] = [];
  for (const reviewerId of ["R1A", "R1B", "R2A", "R2B"] as const) {
    const bytes = readBytes(resolve(frozenRoot, `review-${reviewerId}.json`));
    const reviews = z.array(frozenReviewSchema).parse(parseJson(bytes));
    const expectedIds = Object.entries(reviewerId.startsWith("R1") ? assignment.primary : assignment.second).filter(([, reviewer]) => reviewer === reviewerId).map(([id]) => id);
    exactSet(reviews.map(row => row.id), expectedIds, `frozen prelabels ${reviewerId}`);
    if (reviews.some(row => row.reviewerId !== reviewerId)) throw new Error("frozen prelabel reviewer mismatch");
    rows.push(...reviews);
  }
  if (cases.length !== 119 || rows.length !== 191) throw new Error("frozen prelabel inventory mismatch");
  const scopes: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const reviewer = scopes[row.reviewerId] ??= {};
    reviewer[row.expectedEditScope] = (reviewer[row.expectedEditScope] ?? 0) + 1;
  }
  return { caseIds: cases.map(item => item.id), scopes, hashes: Object.fromEntries(["assignments.json", "review-R1A.json", "review-R1B.json", "review-R2A.json", "review-R2B.json"].map(name => [name, digest(readBytes(resolve(frozenRoot, name)))])) };
}

function loadPostReviewInputs(blindRoot: string) {
  const root = resolve(blindRoot);
  const primaryBytes = readBytes(resolve(root, "primary/packet.json")), secondBytes = readBytes(resolve(root, "second/packet.json"));
  if (digest(primaryBytes) !== V3_BLIND_PRIMARY_PACKET_SHA256 || digest(secondBytes) !== V3_BLIND_SECOND_PACKET_SHA256) throw new Error("blind packet hash mismatch");
  const primaryPacket = z.array(blindItemSchema).length(119).parse(parseJson(primaryBytes));
  const secondPacket = z.array(blindItemSchema).length(60).parse(parseJson(secondBytes));
  const secondPacketIds = secondPacket.map(row => row.itemId);
  if (new Set(primaryPacket.map(row => row.itemId)).size !== 119) throw new Error("primary packet item IDs are not unique");
  exactSet(secondPacketIds, [...new Set(secondPacketIds)], "second packet");
  const mappingBytes = readBytes(resolve(root, "custodian/mapping.json"));
  if (digest(mappingBytes) !== mappingSha256) throw new Error("blind mapping hash mismatch");
  const mapping = z.array(mappingRowSchema).length(119).parse(parseJson(mappingBytes));
  const primaryIds = primaryPacket.map(row => row.itemId), mappingIds = mapping.map(row => row.itemId);
  exactSet(mappingIds, primaryIds, "mapping/primary");
  const mappingByItem = new Map(mapping.map(row => [row.itemId, row]));
  exactSet(secondPacketIds, mapping.filter(row => row.secondReview).map(row => row.itemId), "second packet/mapping");
  for (const row of secondPacket) if (!mappingByItem.get(row.itemId)?.secondReview) throw new Error("second packet membership mismatch");
  if (mapping.filter(row => row.secondReview).length !== 60 || mapping.some(row => row.outputA === row.outputB)) throw new Error("invalid blind mapping orientation or second set");

  const assignmentBytes = readBytes(resolve(root, "review-shards-v1/custodian/assignments.json"));
  if (digest(assignmentBytes) !== V3_REVIEW_SHARD_MANIFEST_FILE_SHA256) throw new Error("review assignment manifest hash mismatch");
  const assignment = parseJson(assignmentBytes) as ReviewAssignmentManifest;
  const archiveRoot = resolve(root, "review-originals-v1"), archiveInventoryBytes = readBytes(resolve(archiveRoot, "inventory.json"));
  if (digest(archiveInventoryBytes) !== originalsInventorySha256) throw new Error("original review archive inventory hash mismatch");
  const inventory = z.object({ protocol: z.literal("v3-blind-review-originals-v1"), sourceHashes: z.object({ primaryPacketSha256: z.string(), secondPacketSha256: z.string(), shardManifestFileSha256: z.string() }).strict(), reviewers: z.array(z.object({ reviewerId: z.enum(outputReviewers), phase: z.enum(["primary", "second"]), rowCount: z.number(), originalSha256: z.string(), canonicalSha256: z.string(), parsedObjectsIdentical: z.literal(true) }).strict()).length(6), inventorySha256: z.string() }).strict().parse(parseJson(archiveInventoryBytes));
  const { inventorySha256, ...inventoryCore } = inventory;
  if (digest(serialize(inventoryCore)) !== inventorySha256 || inventorySha256 !== originalsInventoryDigest) throw new Error("original review archive inventory seal mismatch");
  if (inventory.sourceHashes.primaryPacketSha256 !== V3_BLIND_PRIMARY_PACKET_SHA256 || inventory.sourceHashes.secondPacketSha256 !== V3_BLIND_SECOND_PACKET_SHA256 || inventory.sourceHashes.shardManifestFileSha256 !== V3_REVIEW_SHARD_MANIFEST_FILE_SHA256) throw new Error("original review archive source hash mismatch");

  const records: ReviewRecord[] = [];
  const originalHashes: Record<string, string> = {}, canonicalHashes: Record<string, string> = {};
  for (const reviewerId of outputReviewers) {
    const phase: ReviewPhase = reviewerId.startsWith("O1") ? "primary" : "second";
    const archiveEntry = inventory.reviewers.find(row => row.reviewerId === reviewerId);
    if (!archiveEntry || archiveEntry.phase !== phase || archiveEntry.rowCount !== expectedReviewerCounts[reviewerId]) throw new Error(`original archive reviewer inventory mismatch: ${reviewerId}`);
    const archiveDirectory = resolve(archiveRoot, phase, reviewerId);
    const originalBytes = readBytes(resolve(archiveDirectory, "submission.json")), commitmentBytes = readBytes(resolve(archiveDirectory, "commitment.json"));
    const canonicalBytes = readBytes(resolve(root, `review-submissions-v1/${phase}/${reviewerId}/submission.json`));
    if (digest(originalBytes) !== V3_ORIGINAL_REVIEW_SHA256[reviewerId] || digest(canonicalBytes) !== V3_CANONICAL_REVIEW_SHA256[reviewerId] || !isDeepStrictEqual(parseJson(originalBytes), parseJson(canonicalBytes))) throw new Error(`original/canonical review mismatch: ${reviewerId}`);
    if (archiveEntry.originalSha256 !== digest(originalBytes) || archiveEntry.canonicalSha256 !== digest(canonicalBytes) || archiveEntry.parsedObjectsIdentical !== true) throw new Error(`original archive commitment mismatch: ${reviewerId}`);
    const commitment = z.object({ protocol: z.literal("v3-blind-review-original-commitment-v1"), reviewerId: z.enum(outputReviewers), phase: z.enum(["primary", "second"]), rowCount: z.number(), originalSha256: z.string(), canonicalSha256: z.string(), parsedObjectsIdentical: z.literal(true) }).strict().parse(parseJson(commitmentBytes));
    if (commitment.reviewerId !== reviewerId || commitment.phase !== phase || commitment.rowCount !== archiveEntry.rowCount || commitment.originalSha256 !== archiveEntry.originalSha256 || commitment.canonicalSha256 !== archiveEntry.canonicalSha256) throw new Error(`original archive reviewer commitment mismatch: ${reviewerId}`);
    const parsed = reviewSubmissionSchema.parse(parseJson(originalBytes));
    const valid = validateReviewSubmission(parsed, assignment, phase, reviewerId);
    if (valid.rows.length !== expectedReviewerCounts[reviewerId]) throw new Error(`reviewer response count mismatch: ${reviewerId}`);
    originalHashes[reviewerId] = digest(originalBytes); canonicalHashes[reviewerId] = digest(canonicalBytes);
    for (const row of valid.rows) {
      const blind = mappingByItem.get(row.itemId);
      if (!blind) throw new Error("review references unknown blind item");
      records.push({ itemId: row.itemId, caseId: blind.caseId, reviewerId, phase, outputASide: blind.outputA, outputBSide: blind.outputB, originalRow: row });
    }
  }
  const prelabels = validateFrozenPrelabels();
  exactSet(mapping.map(row => row.caseId), prelabels.caseIds, "blind mapping/frozen cases");
  if (records.filter(row => row.phase === "primary").length !== 119 || records.filter(row => row.phase === "second").length !== 60) throw new Error("unblinded reviewer coverage mismatch");
  return { records, mapping, fixedSecondCaseIds: new Set(mapping.filter(row => row.secondReview).map(row => row.caseId)), inputHashes: { frozenManifestSha256: V3_MANIFEST_SHA256, primaryPacketSha256: digest(primaryBytes), secondPacketSha256: digest(secondBytes), mappingSha256: digest(mappingBytes), reviewShardManifestFileSha256: digest(assignmentBytes), originalArchiveInventoryFileSha256: digest(archiveInventoryBytes), originalArchiveInventorySha256: inventorySha256, originalSubmissionSha256: originalHashes, canonicalSubmissionSha256: canonicalHashes, frozenPrelabelSha256: prelabels.hashes }, prelabelScopes: prelabels.scopes };
}

export function constructPostReviewArtifacts(records: readonly ReviewRecord[], mapping: readonly z.infer<typeof mappingRowSchema>[], fixedSecondCaseIds: ReadonlySet<string>, prelabelScopes: Record<string, Record<string, number>>, inputHashes: Record<string, unknown>) {
  if (records.length !== 179 || new Set(records.map(row => `${row.reviewerId}:${row.itemId}`)).size !== 179) throw new Error("review row inventory mismatch");
  const metrics = summarizeInitialMetrics(records, prelabelScopes);
  const primaryMap = new Map(mapping.map(row => [row.itemId, row]));
  const unblindedRows = records.map(record => {
    const mappingRow = primaryMap.get(record.itemId);
    if (!mappingRow || mappingRow.caseId !== record.caseId) throw new Error("unblinded label mapping mismatch");
    return { caseId: record.caseId, blindItemId: record.itemId, reviewerId: record.reviewerId, phase: record.phase, outputASide: record.outputASide, outputBSide: record.outputBSide, labels: record.originalRow };
  }).sort((a, b) => a.caseId.localeCompare(b.caseId) || a.reviewerId.localeCompare(b.reviewerId));
    const cleanPool = deriveCleanPool(records);
  if (cleanPool.length !== 63) throw new Error("pre-trace clean pool differs from sealed expected count");
  const sample = rankAuditSample(cleanPool);
  if (!isDeepStrictEqual(sample, expectedAuditSample)) throw new Error("pre-trace audit sample differs from sealed IDs");
  const supplemental = buildSupplementalSelection(records, fixedSecondCaseIds);
  return {
    unblindedLabels: { protocol: "v3-unblinded-output-labels-v1", traceAccess: "NONE", inputHashes, reviewCount: unblindedRows.length, rows: unblindedRows },
    initialMetrics: metrics,
    auditSelection: { protocol: "v3-pre-trace-audit-selection-v1", traceValuesRead: false, cleanPoolPredicate: "Every available primary/second RAW and FINAL output is STRICT_GOOD; if second exists, primary/second agree on six GOOD-core fields for RAW and FINAL; pairwise is excluded.", cleanPoolCount: cleanPool.length, cleanPoolIds: cleanPool, seed: auditSeed, ranking: "Ascending SHA-256 over UTF-8 seed + U+0000 + caseId; caseId ascending tie-break", selectedCount: sample.length, selectedIds: sample },
    supplementalSecondSelection: supplemental,
  };
}

export function initPostReview(output = resolve("data/evaluation/holdout-v3/run/post-review-v1")) {
  const root = resolve("data/evaluation/holdout-v3/run/blind-output-v1");
  const inputs = loadPostReviewInputs(root);
  const artifacts = constructPostReviewArtifacts(inputs.records, inputs.mapping, inputs.fixedSecondCaseIds, inputs.prelabelScopes, inputs.inputHashes);
  exclusiveAtomicDirectory(output, staging => {
    exclusiveBlindWrite(resolve(staging, "unblinded-labels.json"), artifacts.unblindedLabels);
    exclusiveBlindWrite(resolve(staging, "initial-metrics.json"), artifacts.initialMetrics);
    exclusiveBlindWrite(resolve(staging, "audit-selection.json"), artifacts.auditSelection);
    exclusiveBlindWrite(resolve(staging, "supplemental-second-selection.json"), artifacts.supplementalSecondSelection);
  });
  return { output: resolve(output), reviewCount: artifacts.unblindedLabels.reviewCount, cleanPoolCount: artifacts.auditSelection.cleanPoolCount, supplementalSecondCount: artifacts.supplementalSecondSelection.selected.length, fileHashes: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, digest(serialize(value))])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] !== "init" || process.argv.length !== 3) throw new Error("usage: node --import tsx tools/eval/holdout-v3-postreview.ts init");
    process.stdout.write(JSON.stringify(initPostReview()) + "\n");
  } catch {
    process.stderr.write("Post-review initialization failed; no audit artifacts should be used.\n");
    process.exitCode = 1;
  }
}
