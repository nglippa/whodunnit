/** Additive post-unblinding report. Reads sealed originals; never invokes models or writes labels. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { verifyV3Integrity, V3_MANIFEST_SHA256 } from "./holdout-v3-runner";
import { classifyReviewOutput } from "./holdout-v3-postreview";
import { reviewSubmissionSchema, V3_ORIGINAL_REVIEW_SHA256 } from "./holdout-v3-reviews";
import { assertNoSymlinkComponents } from "./holdout-v3-blind";
import { verifyPinnedAuditBundle, validateAuditResponse, parseAuditReplayArtifact, V3_REPLAY_SHA256, V3_EXPLICIT_UPDATE_IDS, V3_VAGUE_MISSING_IDS } from "./holdout-v3-audit";
import { blindItemSchema } from "./holdout-v3-blind";
import { supplementalSubmissionSchema, validateSupplementalSubmission, type SupplementalSubmission } from "./holdout-v3-supplemental";
const root = resolve("data/evaluation/holdout-v3"), run = resolve(root, "run");
const hashes: Record<string, string> = {};
const supplementalRoot = resolve(run, "blind-output-v1/supplemental-v1");
const supplementalPins = {
  commitments: "1a29025aa470ddade15af127f4ad58eb6abf66b1603e09a96e6785192772c32b",
  mapping: "068e970e25096795482a9635d9a1f76efed037a45549b3607bd9f444db95fcf6",
  packets: { S1: "9483d692ac2e7c1b1e86b6d4e4bb1d3831a27467d51632de56e1a100b1684f2b", S2: "f85eaae93284f6151187ad766b57b37f95a508ee7297a067f9672f9f479af702" },
  submissions: {
    S1: { original: "7889cb3479a5b2f88de879682b51b2e68c9fa86b8b97fea4fa4bf0da92ff92ab", canonical: "a80c0c9b9d4d2c2cbb159b512483ff8e54595f4d74bdef3fa1b6840cf7040309", commitment: "cc1b79231bfbdbff04deed2236617b31ee09b6def924776e87e9ed4efe7aa8cd" },
    S2: { original: "af1a90c9cb4b6aeb1f4c5077bd8eab33d176210359c7c6e204ccf6e97f8490a4", canonical: "af1a90c9cb4b6aeb1f4c5077bd8eab33d176210359c7c6e204ccf6e97f8490a4", commitment: "ffacee01dc2dcdf5bf17fac189da9ec0511ebeb3d8dd1fd89a6f3475a256fff6" },
  },
} as const;
function read(path: string, expected?: string): unknown {
  assertNoSymlinkComponents(path);
  const bytes = readFileSync(path), hash = createHash("sha256").update(bytes).digest("hex");
  if (expected && hash !== expected) throw new Error(`report input seal mismatch: ${path}`);
  hashes[path] = hash;
  return JSON.parse(bytes.toString("utf8"));
}
function tally(values: readonly unknown[]) { const counts: Record<string, number> = {}; for (const value of values) { const key = String(value ?? "MISSING"); counts[key] = (counts[key] ?? 0) + 1; } return counts; }
const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, fraction: denominator ? numerator / denominator : null });
const mappingSchema = z.array(z.object({ itemId: z.string(), caseId: z.string(), outputA: z.enum(["RAW", "FINAL"]), outputB: z.enum(["RAW", "FINAL"]) }).passthrough());
const supplementalMappingSchema = z.array(z.object({ caseId: z.string().regex(/^V3-\d{3}$/), itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), outputA: z.enum(["RAW", "FINAL"]), outputB: z.enum(["RAW", "FINAL"]), reasonCodes: z.array(z.string()).min(1) }).strict()).length(25);
const supplementalPacketSchema = z.object({ protocol: z.literal("v3-supplemental-blind-review-packet-v1"), reviewerId: z.enum(["S1", "S2"]), rows: z.array(blindItemSchema) }).strict();
const supplementalCommitmentsSchema = z.object({ protocol: z.literal("v3-supplemental-blind-review-commitments-v1"), frozenManifestSha256: z.string(), primaryPacketSha256: z.string(), mappingSha256: z.string(), selectionSha256: z.string(), auditQueueSha256: z.string(), auditCommitmentsSha256: z.string(), auditResponses: z.array(z.object({ auditorId: z.string(), packetSha256: z.string(), originalSha256: z.string(), canonicalSha256: z.string() }).strict()).length(5), selectedCount: z.literal(25), assignmentCounts: z.tuple([z.literal(13), z.literal(12)]), packetSha256: z.tuple([z.string(), z.string()]), custodianMappingSha256: z.string() }).strict();
const supplementalSubmissionCommitmentSchema = z.object({ protocol: z.literal("v3-supplemental-blind-review-submission-commitment-v1"), reviewerId: z.enum(["S1", "S2"]), rowCount: z.number().int().positive(), packetSha256: z.string(), originalResponseSha256: z.string(), canonicalResponseSha256: z.string() }).strict();
const adjudicationSchema = z.object({ protocol: z.literal("v3-independent-additive-adjudication-draft-v1"), classificationBasis: z.string(), rows: z.array(z.object({ caseId: z.string(), raw: z.enum(["GOOD_RAW", "BAD_RAW", "OTHER", "DISPUTED"]), final: z.enum(["GOOD_FINAL", "BAD_FINAL", "OTHER", "DISPUTED"]), materialGoodEditLost: z.union([z.boolean(), z.literal("DISPUTED")]), unsafeFinal: z.boolean() }).passthrough()) }).passthrough();
export function materialMetrics(rows: readonly { raw: string; final: string; disputed: boolean }[]) {
  const good = rows.filter(r => r.raw === "GOOD" && !r.disputed), bad = rows.filter(r => r.raw === "BAD" && !r.disputed);
  return { denominator: rows.length, raw: tally(rows.map(r => r.disputed ? "DISPUTED" : r.raw)), final: tally(rows.map(r => r.disputed ? "DISPUTED" : r.final)), rawLabelsWithoutDisputeFilter: tally(rows.map(r => r.raw)), finalLabelsWithoutDisputeFilter: tally(rows.map(r => r.final)), goodRetention: ratio(good.filter(r => r.final === "GOOD").length, good.length), goodLoss: ratio(good.filter(r => r.final !== "GOOD").length, good.length), badCatch: ratio(bad.filter(r => r.final !== "BAD").length, bad.length), badEscape: ratio(bad.filter(r => r.final === "BAD").length, bad.length) };
}

type SupplementalReviewer = "S1" | "S2";
type SupplementalBytes = { packet: Buffer; original: Buffer; canonical: Buffer; submissionCommitment: Buffer };
type SupplementalReportPins = { commitments: string; mapping: string; packets: Record<SupplementalReviewer, string>; submissions: Record<SupplementalReviewer, { original: string; canonical: string; commitment: string }> };
export function buildSupplementalReviewTier(input: { commitmentsBytes: Buffer; mappingBytes: Buffer; reviewers: Record<SupplementalReviewer, SupplementalBytes> }, pins: SupplementalReportPins = supplementalPins) {
  const commitments = supplementalCommitmentsSchema.parse(JSON.parse(input.commitmentsBytes.toString("utf8")) as unknown);
  if (createHash("sha256").update(input.commitmentsBytes).digest("hex") !== pins.commitments || createHash("sha256").update(input.mappingBytes).digest("hex") !== pins.mapping) throw new Error("supplemental top-level artifact pin mismatch");
  const mapping = supplementalMappingSchema.parse(JSON.parse(input.mappingBytes.toString("utf8")) as unknown);
  const byItem = new Map(mapping.map(row => [row.itemId, row]));
  if (byItem.size !== 25 || new Set(mapping.map(row => row.caseId)).size !== 25 || mapping.some(row => row.outputA === row.outputB)) throw new Error("supplemental custodian mapping inventory invalid");
  if (commitments.selectedCount !== 25 || commitments.assignmentCounts[0] !== 13 || commitments.assignmentCounts[1] !== 12 || commitments.custodianMappingSha256 !== pins.mapping) throw new Error("supplemental commitments inventory mismatch");
  const outputs: Array<{ caseId: string; itemId: string; reviewerId: SupplementalReviewer; raw: SupplementalSubmission["rows"][number]["outputA"]; final: SupplementalSubmission["rows"][number]["outputA"]; pairwise: string; pairedRawFinal: { anyDifference: boolean; differingFields: string[] } }> = [];
  const reviewerStats: Record<string, unknown> = {};
  const observedItemIds: string[] = [];
  for (const reviewerId of ["S1", "S2"] as const) {
    const bytes = input.reviewers[reviewerId], packetHash = createHash("sha256").update(bytes.packet).digest("hex"), expected = pins.submissions[reviewerId];
    if (packetHash !== pins.packets[reviewerId] || commitments.packetSha256[reviewerId === "S1" ? 0 : 1] !== packetHash) throw new Error(`supplemental ${reviewerId} packet pin mismatch`);
    const packet = supplementalPacketSchema.parse(JSON.parse(bytes.packet.toString("utf8")) as unknown);
    if (packet.reviewerId !== reviewerId || packet.rows.length !== (reviewerId === "S1" ? 13 : 12)) throw new Error(`supplemental ${reviewerId} packet inventory mismatch`);
    const originalHash = createHash("sha256").update(bytes.original).digest("hex"), canonicalHash = createHash("sha256").update(bytes.canonical).digest("hex"), commitmentHash = createHash("sha256").update(bytes.submissionCommitment).digest("hex");
    if (originalHash !== expected.original || canonicalHash !== expected.canonical || commitmentHash !== expected.commitment) throw new Error(`supplemental ${reviewerId} submission artifact pin mismatch`);
    const original = supplementalSubmissionSchema.parse(JSON.parse(bytes.original.toString("utf8")) as unknown), canonical = supplementalSubmissionSchema.parse(JSON.parse(bytes.canonical.toString("utf8")) as unknown);
    if (!isDeepStrictEqual(original, canonical)) throw new Error(`supplemental ${reviewerId} original/canonical response mismatch`);
    const submission = validateSupplementalSubmission(original, reviewerId, packet.rows.map(row => row.itemId));
    const submissionCommitment = supplementalSubmissionCommitmentSchema.parse(JSON.parse(bytes.submissionCommitment.toString("utf8")) as unknown);
    if (submissionCommitment.reviewerId !== reviewerId || submissionCommitment.rowCount !== submission.rows.length || submissionCommitment.packetSha256 !== packetHash || submissionCommitment.originalResponseSha256 !== originalHash || submissionCommitment.canonicalResponseSha256 !== canonicalHash) throw new Error(`supplemental ${reviewerId} response commitment mismatch`);
    for (const row of submission.rows) {
      const mapped = byItem.get(row.itemId);
      if (!mapped) throw new Error("supplemental reviewer item missing from custodian mapping");
      observedItemIds.push(row.itemId);
      const raw = mapped.outputA === "RAW" ? row.outputA : row.outputB, final = mapped.outputA === "FINAL" ? row.outputA : row.outputB;
      const labelFields = Object.keys(raw) as Array<keyof typeof raw>;
      const differingFields = labelFields.filter(field => raw[field] !== final[field]);
      const pairwise = row.pairwise === "OUTPUT_A_BETTER" ? mapped.outputA === "RAW" ? "RAW_BETTER" : "FINAL_BETTER" : row.pairwise === "OUTPUT_B_BETTER" ? mapped.outputB === "RAW" ? "RAW_BETTER" : "FINAL_BETTER" : row.pairwise;
      outputs.push({ caseId: mapped.caseId, itemId: row.itemId, reviewerId, raw, final, pairwise, pairedRawFinal: { anyDifference: differingFields.length > 0, differingFields } });
    }
    const fieldCounts = (side: "raw" | "final") => Object.fromEntries(Object.keys(submission.rows[0]!.outputA).map(field => [field, tally(submission.rows.map(row => {
      const map = byItem.get(row.itemId)!;
      return (side === "raw" ? map.outputA === "RAW" ? row.outputA : row.outputB : map.outputA === "FINAL" ? row.outputA : row.outputB)[field as keyof typeof row.outputA];
    }))]));
    reviewerStats[reviewerId] = { count: submission.rows.length, rawFieldCounts: fieldCounts("raw"), finalFieldCounts: fieldCounts("final"), pairwise: tally(outputs.filter(row => row.reviewerId === reviewerId).map(row => row.pairwise)), rawFinalDisagreementCount: outputs.filter(row => row.reviewerId === reviewerId && row.pairedRawFinal.anyDifference).length, originalResponseSha256: originalHash, canonicalResponseSha256: canonicalHash };
  }
  if (observedItemIds.length !== 25 || new Set(observedItemIds).size !== 25 || [...byItem.keys()].some(id => !observedItemIds.includes(id))) throw new Error("supplemental reviewer union coverage mismatch");
  return { protocol: "v3-verified-supplemental-blind-tier-v1", status: "VERIFIED_SEPARATE_TIER", selection: "OUTCOME_TRIGGERED", note: "Supplemental selection was outcome-triggered; these ratings are an additive separate tier and are not merged into original primary or fixed-second labels.", denominator: outputs.length, reviewerStats, pairedRawFinal: { rawFieldCounts: Object.fromEntries(Object.keys(outputs[0]!.raw).map(field => [field, tally(outputs.map(row => row.raw[field as keyof typeof row.raw]))])), finalFieldCounts: Object.fromEntries(Object.keys(outputs[0]!.final).map(field => [field, tally(outputs.map(row => row.final[field as keyof typeof row.final]))])), disagreementCount: outputs.filter(row => row.pairedRawFinal.anyDifference).length }, rows: outputs.sort((a, b) => a.caseId.localeCompare(b.caseId)) };
}

function readSupplementalReviewTier() {
  read(resolve(supplementalRoot, "commitments.json"), supplementalPins.commitments);
  read(resolve(supplementalRoot, "custodian/mapping.json"), supplementalPins.mapping);
  const readBytes = (relative: string, expected: string) => { read(resolve(supplementalRoot, relative), expected); return readFileSync(resolve(supplementalRoot, relative)); };
  const reviewers = Object.fromEntries(((["S1", "S2"] as const).map(id => [id, {
    packet: readBytes(`${id}/packet.json`, supplementalPins.packets[id]),
    original: readBytes(`submissions/${id}/original-response.json`, supplementalPins.submissions[id].original),
    canonical: readBytes(`submissions/${id}/response.json`, supplementalPins.submissions[id].canonical),
    submissionCommitment: readBytes(`submissions/${id}/commitment.json`, supplementalPins.submissions[id].commitment),
  }])) as Array<[SupplementalReviewer, SupplementalBytes]>) as Record<SupplementalReviewer, SupplementalBytes>;
  return buildSupplementalReviewTier({ commitmentsBytes: readFileSync(resolve(supplementalRoot, "commitments.json")), mappingBytes: readFileSync(resolve(supplementalRoot, "custodian/mapping.json")), reviewers });
}
const finalRowSchema = z.object({
  caseId: z.string().regex(/^V3-\d{3}$/),
  interpretationSource: z.enum(["FIRST_MANDATORY_AUDIT", "ADDITIVE_ADJUDICATION_12", "ADDITIVE_REMAINING_34"]),
  originalBlindLabels: z.array(z.unknown()), firstAuditJudgment: z.unknown().nullable(),
  adjudication: z.unknown().nullable(), evidenceFlags: z.array(z.string()),
  interpretation: z.object({ rawClass: z.enum(["GOOD_RAW", "BAD_RAW", "OTHER", "DISPUTED"]),
    finalClass: z.enum(["GOOD_FINAL", "BAD_FINAL", "OTHER", "DISPUTED"]),
    materialGoodEditLost: z.union([z.boolean(), z.literal("DISPUTED"), z.null()]), unsafeFinal: z.boolean(),
    repair: z.string(), fallback: z.string(), evidence: z.string().min(1),
  }).passthrough(),
}).strict();
type FinalRow = z.infer<typeof finalRowSchema>;
export function finalMaterialMetrics(rows: readonly FinalRow[]) {
  const good = rows.filter(r => r.interpretation.rawClass === "GOOD_RAW");
  const bad = rows.filter(r => r.interpretation.rawClass === "BAD_RAW");
  const uncertainGood = good.filter(r => r.interpretation.finalClass === "DISPUTED" || (r.interpretation.materialGoodEditLost === "DISPUTED" || r.interpretation.materialGoodEditLost === null));
  const resolvedGood = good.filter(r => !uncertainGood.includes(r));
  const resolvedBad = bad.filter(r => r.interpretation.finalClass !== "DISPUTED");
  return { denominator: rows.length, raw: tally(rows.map(r => r.interpretation.rawClass)), final: tally(rows.map(r => r.interpretation.finalClass)),
    goodRetained: ratio(resolvedGood.filter(r => r.interpretation.finalClass === "GOOD_FINAL").length, resolvedGood.length),
    goodLost: ratio(resolvedGood.filter(r => r.interpretation.materialGoodEditLost === true).length, resolvedGood.length),
    unresolvedGoodOutcomeIds: uncertainGood.map(r => r.caseId),
    badCaught: ratio(resolvedBad.filter(r => r.interpretation.finalClass !== "BAD_FINAL").length, resolvedBad.length),
    badEscaped: ratio(resolvedBad.filter(r => r.interpretation.finalClass === "BAD_FINAL").length, resolvedBad.length),
    unresolvedBadOutcomeIds: bad.filter(r => !resolvedBad.includes(r)).map(r => r.caseId),
    disputedRawIds: rows.filter(r => r.interpretation.rawClass === "DISPUTED").map(r => r.caseId),
    disputedFinalIds: rows.filter(r => r.interpretation.finalClass === "DISPUTED").map(r => r.caseId),
    materialGoodLossIds: rows.filter(r => r.interpretation.materialGoodEditLost === true).map(r => r.caseId),
    disputedGoodLossIds: rows.filter(r => r.interpretation.materialGoodEditLost === "DISPUTED").map(r => r.caseId),
    unsafeFinalIds: rows.filter(r => r.interpretation.unsafeFinal).map(r => r.caseId),
    repair: tally(rows.map(r => r.interpretation.repair)), fallback: tally(rows.map(r => r.interpretation.fallback)),
  };
}
function readFinalInterpretationTier(caseIds: readonly string[], alreadyGoodIds: readonly string[]) {
  const archive = resolve(run, "post-review-v1/final-audit-v1");
  const commitment = z.object({ protocol: z.literal("v3-final-audit-commitments-v1"), inputs: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), interpretationSha256: z.string(), summarySha256: z.string() }).strict().parse(read(resolve(archive, "commitments.json"), "1305359c909863eb877204b72d63337cf4fbd37ca6d7f5fcf1eb46883c70dcd4"));
  for (const [relative, seal] of Object.entries(commitment.inputs)) {
    if (resolve(archive, relative).startsWith(archive + "/") === false) throw new Error("final archive input path escapes root");
    read(resolve(archive, relative), seal);
  }
  const rows = z.array(finalRowSchema).length(119).parse(read(resolve(archive, "interpretations.json"), commitment.interpretationSha256));
  if (new Set(rows.map(r => r.caseId)).size !== 119 || caseIds.some(id => !rows.some(r => r.caseId === id))) throw new Error("final archive membership mismatch");
  const originals = z.object({ rows: z.array(z.object({ caseId: z.string() }).passthrough()) }).passthrough().parse(read(resolve(archive, "inputs/run/post-review-v1/unblinded-labels.json"), commitment.inputs["inputs/run/post-review-v1/unblinded-labels.json"]));
  for (const row of rows) {
    if (!isDeepStrictEqual(row.originalBlindLabels, originals.rows.filter(r => r.caseId === row.caseId))) throw new Error("final archive changed original blind labels");
  }
  const summary = z.object({ caseCount: z.literal(119), mandatoryAuditCount: z.literal(85), additiveCorrectionCount: z.literal(12), additionalAuditCount: z.literal(34), rawClasses: z.record(z.string(), z.number()), finalClasses: z.record(z.string(), z.number()), materialGoodEditsLost: z.number(), disputedGoodLoss: z.array(z.string()), unsafeFinal: z.array(z.string()) }).passthrough().parse(read(resolve(archive, "summary.json"), commitment.summarySha256));
  const metrics = finalMaterialMetrics(rows);
  const equalCounts = (a: Record<string, number>, b: Record<string, number>) => Object.keys({...a, ...b}).every(key => (a[key] ?? 0) === (b[key] ?? 0));
  if (!equalCounts(metrics.raw, summary.rawClasses) || !equalCounts(metrics.final, summary.finalClasses) || metrics.materialGoodLossIds.length !== summary.materialGoodEditsLost || !isDeepStrictEqual(metrics.disputedGoodLossIds, summary.disputedGoodLoss) || !isDeepStrictEqual(metrics.unsafeFinalIds, summary.unsafeFinal)) throw new Error("final archive/reporter summary mismatch");
  const stratum = (ids: readonly string[]) => ({ eligible: ids.length, ...finalMaterialMetrics(rows.filter(r => ids.includes(r.caseId))) });
  return { protocol: "v3-verified-final-material-interpretation-tier-v1", status: "SEALED_POST_UNBLIND_INTERPRETATION", provenance: "Independent adjudication was authored after unblinding. The archive preserves original authored bytes and their hashes; this is an archival seal, not a preregistered judgment commitment.", definition: "Final material classes drive outcome denominators. Original audit disagreement flags remain separately visible and do not automatically censor resolved final interpretations.", metrics, interpretationSources: tally(rows.map(r => r.interpretationSource)), strata: { explicitUpdate: stratum(V3_EXPLICIT_UPDATE_IDS), vagueMissing: stratum(V3_VAGUE_MISSING_IDS), anyPrereviewerLeaveAlone: stratum(alreadyGoodIds) }, disagreements: { originalAuditFlagCount: rows.filter(r => z.object({ disputedOrUncertain: z.string() }).passthrough().safeParse(r.firstAuditJudgment).data?.disputedOrUncertain === "YES").length, unresolvedRawIds: metrics.disputedRawIds, unresolvedFinalIds: metrics.disputedFinalIds, evidenceFlags: rows.filter(r => r.evidenceFlags.length).map(r => ({ caseId: r.caseId, flags: r.evidenceFlags })) }, failureTypes: { originalAuditLossCause: tally(rows.map(r => z.object({ lossCause: z.string() }).passthrough().safeParse(r.firstAuditJudgment).data?.lossCause ?? "NO_FIRST_AUDIT")), originalAuditEscapeType: tally(rows.map(r => z.object({ badFinalEscapeType: z.string() }).passthrough().safeParse(r.firstAuditJudgment).data?.badFinalEscapeType ?? "NO_FIRST_AUDIT")), operationallyIncorrectFinalIds: rows.filter(r => r.interpretation.operationallyIncorrectFinal === true || (z.object({ operationallyIncorrectFinal: z.boolean().optional() }).passthrough().safeParse(r.adjudication).data?.operationallyIncorrectFinal === true)).map(r => r.caseId) }, summary, rows };
}
export function reportV3(adjudicationPath = "/private/tmp/whodunnit-v3-independent-adjudication.json", supplementalPath?: string) {
  for (const key of Object.keys(hashes)) delete hashes[key];
  const cases = verifyV3Integrity();
  const replay = parseAuditReplayArtifact(read(resolve(run, "replay.json"), V3_REPLAY_SHA256));
  const mapping = mappingSchema.parse(read(resolve(run, "blind-output-v1/custodian/mapping.json"), "83ff9146f2914868c56441ba16c394f30cc3637469a85a0613ceca84f320489b"));
  const byItem = new Map(mapping.map(r => [r.itemId, r]));
  const original = Object.entries(V3_ORIGINAL_REVIEW_SHA256).flatMap(([reviewerId, seal]) => {
    const phase = reviewerId.startsWith("O1") ? "primary" : "second";
    return reviewSubmissionSchema.parse(read(resolve(run, `blind-output-v1/review-originals-v1/${phase}/${reviewerId}/submission.json`), seal)).rows.map(row => {
      const map = byItem.get(row.itemId); if (!map || map.outputA === map.outputB) throw new Error("unknown/orientation-invalid blind item");
      const raw = map.outputA === "RAW" ? row.outputA : row.outputB, final = map.outputA === "FINAL" ? row.outputA : row.outputB;
      const pairwise = row.pairwise === "OUTPUT_A_BETTER" ? map.outputA : row.pairwise === "OUTPUT_B_BETTER" ? map.outputB : row.pairwise;
      return { caseId: map.caseId, reviewerId, phase, raw, final, pairwise };
    });
  });
  if (original.length !== 179 || original.filter(r => r.phase === "primary").length !== 119) throw new Error("original label coverage mismatch");
  const audits = ["A1", "A2", "A3", "A4", "A5"].flatMap(id => {
    const { packet } = verifyPinnedAuditBundle(id);
    const commitment = z.object({ originalResponseSha256: z.string(), canonicalResponseSha256: z.string() }).passthrough().parse(read(resolve(run, `audit-v1/responses/${id}/commitment.json`)));
    const raw = validateAuditResponse(read(resolve(run, `audit-v1/responses/${id}/original-response.json`), commitment.originalResponseSha256), packet.rows.map(r => r.caseId));
    const canonical = validateAuditResponse(read(resolve(run, `audit-v1/responses/${id}/response.json`), commitment.canonicalResponseSha256), packet.rows.map(r => r.caseId));
    if (JSON.stringify(raw) !== JSON.stringify(canonical)) throw new Error("audit original/canonical mismatch");
    return raw.rows;
  });
  const adjudication = adjudicationSchema.parse(read(resolve(adjudicationPath)));
  if (new Set(adjudication.rows.map(r => r.caseId)).size !== adjudication.rows.length || adjudication.rows.some(r => !audits.some(a => a.caseId === r.caseId))) throw new Error("adjudication references duplicate or unaudited case");
  const corrections = new Map(adjudication.rows.map(r => [r.caseId, r]));
  const audited = audits.map(r => ({ raw: r.rawMaterialClass, final: r.finalMaterialClass, disputed: r.disputedOrUncertain === "YES" }));
  const adjudicated = audits.map(r => { const correction = corrections.get(r.caseId); return correction ? { raw: correction.raw.replace("_RAW", ""), final: correction.final.replace("_FINAL", ""), disputed: correction.raw === "DISPUTED" || correction.final === "DISPUTED" } : { raw: r.rawMaterialClass, final: r.finalMaterialClass, disputed: r.disputedOrUncertain === "YES" }; });
  const blindSummary = (rows: typeof original) => ({ denominator: rows.length, coreProxyTransitions: materialMetrics(rows.map(r => ({ raw: classifyReviewOutput(r.raw) === "STRICT_GOOD" ? "GOOD" : classifyReviewOutput(r.raw) === "BAD_PROXY" ? "BAD" : classifyReviewOutput(r.raw), final: classifyReviewOutput(r.final) === "STRICT_GOOD" ? "GOOD" : classifyReviewOutput(r.final) === "BAD_PROXY" ? "BAD" : classifyReviewOutput(r.final), disputed: classifyReviewOutput(r.raw) === "UNCERTAIN" || classifyReviewOutput(r.final) === "UNCERTAIN" }))), raw: tally(rows.map(r => classifyReviewOutput(r.raw))), final: tally(rows.map(r => classifyReviewOutput(r.final))), pairwise: tally(rows.map(r => r.pairwise)), rawFields: Object.fromEntries(Object.keys(rows[0]?.raw ?? {}).map(key => [key, tally(rows.map(r => r.raw[key as keyof typeof r.raw]))])), finalFields: Object.fromEntries(Object.keys(rows[0]?.final ?? {}).map(key => [key, tally(rows.map(r => r.final[key as keyof typeof r.final]))])) });
  const strata = (ids: readonly string[]) => { const selected = audits.filter(r => ids.includes(r.caseId)); return { eligible: ids.length, audited: selected.length, unauditedIds: ids.filter(id => !selected.some(r => r.caseId === id)), auditedMetrics: materialMetrics(selected.map(r => ({ raw: r.rawMaterialClass, final: r.finalMaterialClass, disputed: r.disputedOrUncertain === "YES" }))), adjudicatedMetrics: materialMetrics(audits.flatMap((r, i) => ids.includes(r.caseId) ? [adjudicated[i]!] : [])) }; };
  const prelabels = ["R1A", "R1B", "R2A", "R2B"].flatMap(id => z.array(z.object({ id: z.string(), reviewerId: z.string(), expectedEditScope: z.string(), missingInformationPreventsFulfillment: z.boolean().nullable() }).passthrough()).parse(read(resolve(root, `frozen/review-${id}.json`))));
  const alreadyGoodIds = [...new Set(prelabels.filter(r => r.expectedEditScope === "LEAVE_ALONE").map(r => r.id))];
  const queue = z.object({ rows: z.array(z.object({ caseId: z.string(), reasonCodes: z.array(z.string()) })) }).passthrough().parse(read(resolve(run, "audit-v1/queue.json")));
  const finalInterpretation = readFinalInterpretationTier(cases.map(r => r.id), alreadyGoodIds);
  const supplementalTier = readSupplementalReviewTier();
  const supplementalArtifact = supplementalPath ? read(resolve(supplementalPath)) : undefined;
  return { protocol: "v3-additive-post-unblinding-report-v1", status: "SEALED_FINAL_INTERPRETATION_WITH_SEPARATE_BLIND_TIERS", manifestSha256: V3_MANIFEST_SHA256, strategy: replay.strategy, finalInterpretation, definitions: { blind: "STRICT_GOOD is the six-field sealed-label proxy, not material editorial improvement; BAD_PROXY is a semantic label proxy.", material: adjudication.classificationBasis, dispute: "Audit disputedOrUncertain=YES excludes both outputs from definitive catch/loss denominators unless an additive adjudication resolves them. Raw counts remain visible.", population: "119 frozen cases; 179 original output review observations; 85 mandatory audited cases. Audited rates describe selected cases, not an unbiased population estimate.", alreadyGood: "Any frozen prereviewer LEAVE_ALONE; disagreements retained; overlaps between strata are allowed." }, corpus: { cases: cases.length, provenance: tally(cases.map(r => r.provenance)), genre: tally(cases.map(r => r.genre)), lengthBand: tally(cases.map(r => r.lengthBand)), objectiveType: tally(replay.rows.map(r => r.trace.objectiveType)) }, prereview: { denominator: prelabels.length, scope: tally(prelabels.map(r => r.expectedEditScope)), missingInformation: tally(prelabels.map(r => r.missingInformationPreventsFulfillment)), byReviewer: Object.fromEntries(["R1A", "R1B", "R2A", "R2B"].map(id => [id, tally(prelabels.filter(r => r.reviewerId === id).map(r => r.expectedEditScope))])) }, blind: { primary: blindSummary(original.filter(r => r.phase === "primary")), second: blindSummary(original.filter(r => r.phase === "second")), byReviewer: Object.fromEntries(Object.keys(V3_ORIGINAL_REVIEW_SHA256).map(id => [id, blindSummary(original.filter(r => r.reviewerId === id))])), rows: original }, auditedInterpretation: { metrics: materialMetrics(audited), fields: Object.fromEntries(["goodRetentionStatus", "badOutcomeStatus", "catchOrEscape", "lossCause", "badFinalEscapeType", "repairQuality", "fallbackQuality", "alreadyGoodSource"].map(key => [key, tally(audits.map(r => r[key as keyof typeof r]))])), rows: audits }, adjudicatedInterpretation: { status: "ADDITIVE_DRAFT", explicitAdjudicationCount: adjudication.rows.length, metrics: materialMetrics(adjudicated), rows: audits.map((r, i) => ({ caseId: r.caseId, ...adjudicated[i], basis: corrections.has(r.caseId) ? "ADDITIVE_DRAFT" : "ORIGINAL_AUDIT" })), corrections: adjudication.rows }, trace: { denominator: replay.rows.length, fields: Object.fromEntries(["deterministicVerdict", "semanticVerdict", "repairRequested", "repairAccepted", "outcome", "fallbackReason", "repairClassification"].map(key => [key, tally(replay.rows.map(r => r.trace[key]))])) }, coverage: { mandatory: queue.rows.length, completed: audits.length, missingIds: queue.rows.filter(r => !audits.some(a => a.caseId === r.caseId)).map(r => r.caseId), byReason: Object.fromEntries([...new Set(queue.rows.flatMap(r => r.reasonCodes))].sort().map(reason => [reason, strata(queue.rows.filter(r => r.reasonCodes.includes(reason)).map(r => r.caseId))])) }, strata: { explicitUpdate: strata(V3_EXPLICIT_UPDATE_IDS), vagueMissing: strata(V3_VAGUE_MISSING_IDS), anyPrereviewerLeaveAlone: strata(alreadyGoodIds) }, supplemental: supplementalArtifact === undefined ? supplementalTier : { ...supplementalTier, externalArtifact: supplementalArtifact }, inputHashes: hashes, unresolved: ["Supplemental ratings were outcome-triggered and are reported as a separate tier; they are not merged with original primary/second labels.", "Final interpretation covers all 119; RAW V3-091/V3-095/V3-113 and FINAL V3-095 remain disputed.", "Stale authorized-update source fallback (V3-012/V3-089) is an objective failure; redefining BAD to include stale source would require consistent alternate metrics.", "Final material interpretations cover the frozen corpus only; post-unblind judgment and outcome-triggered supplemental selection limit generalization."] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(reportV3(process.argv[2], process.argv[3]), null, 2) + "\n"); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "V3 report failed"}\n`); process.exitCode = 1; }
}
