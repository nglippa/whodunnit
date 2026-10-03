import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { auditPacketSha256, deriveAuditQueue, parseAuditReplayArtifact, readPrivateAuditResponse, validateAuditResponse, validateReviewPhaseMembership, verifyAuditArtifactHash, writeAuditResponseArtifacts, V3_EXPLICIT_UPDATE_IDS, V3_PRIOR_PROVISIONAL_QUEUE, V3_VAGUE_MISSING_IDS, type AuditOutputLabels, type AuditResponse, type V3UpdateStratum } from "./holdout-v3-audit";
import { V3_MANIFEST_SHA256 } from "./holdout-v3-runner";
import { exclusiveAtomicDirectory } from "./holdout-v3-reviews";

const caseIds = Array.from({ length: 119 }, (_, index) => `V3-${String(index + 1).padStart(3, "0")}`);
const good = { objectiveSatisfied: "YES", editoriallyUseful: "YES", meaningPreserved: "YES", unauthorizedSemanticChange: "NO", unsupportedInformation: "NO", voicePreserved: "YES", overedited: "NO", underedited: "NO", unnecessaryChangeToGoodSource: "NO" } as const;
const bad: AuditOutputLabels = { ...good, unsupportedInformation: "YES" };
const primaryRow = (caseId: string, final: AuditOutputLabels = good, pairwise: "EQUIVALENT" | "OUTPUT_A_BETTER" = "EQUIVALENT") => ({ caseId, blindItemId: `blind-${caseId.slice(3).padStart(32, "0")}`, reviewerId: "O1A" as const, phase: "primary" as const, outputASide: "RAW" as const, outputBSide: "FINAL" as const, labels: { itemId: `blind-${caseId.slice(3).padStart(32, "0")}`, outputA: good, outputB: final, pairwise, evidence: { outputA: "a", outputB: "b", pairwise: "comparison" } } });
const secondRow = (caseId: string, output: AuditOutputLabels = good, pairwise: "EQUIVALENT" | "OUTPUT_A_BETTER" = "EQUIVALENT") => ({ ...primaryRow(caseId), reviewerId: "O2A" as const, phase: "second" as const, labels: { ...primaryRow(caseId).labels, outputA: output, pairwise } });
const updateStratum: V3UpdateStratum = {
  protocol: "v3-authorized-update-stratum-v1" as const,
  provenance: { source: "synthetic reviewed stratum fixture", sourceFields: ["source", "objective"], reviewer: "middle analyst", priorProvisional: V3_PRIOR_PROVISIONAL_QUEUE },
  explicitUpdateCaseIds: [...V3_EXPLICIT_UPDATE_IDS],
  vagueMissingCaseIds: [...V3_VAGUE_MISSING_IDS],
  subtypeNotes: {},
};
const validResponse: AuditResponse = { protocol: "v3-trace-audit-response-v1", auditorId: "auditor-test", rows: [{ caseId: "V3-001", rawMaterialClass: "OTHER", finalMaterialClass: "OTHER", goodRetentionStatus: "NOT_GOOD_RAW", badOutcomeStatus: "NOT_BAD", catchOrEscape: "NOT_APPLICABLE", lossCause: "NONE", badFinalEscapeType: "NONE", repairQuality: "NO_REPAIR", fallbackQuality: "NO_FALLBACK", explicitUpdateObserved: "NO", explicitUpdateEvidence: "Not an update request.", vagueUpdateObserved: "NO", vagueUpdateEvidence: "Not an update request.", alreadyGoodSource: "NO", alreadyGoodEvidence: "No evidence supplied.", disputedOrUncertain: "NO", evidence: "Synthetic schema fixture." }] };
const privateTemp = () => realpathSync(tmpdir());
const fixture = (opts: { second?: string; repair?: string; repairCall?: string; fallback?: string; finalBad?: string; pairwiseConflict?: string } = {}, strata: V3UpdateStratum = updateStratum) => deriveAuditQueue({
  caseIds,
  postLabels: [
    ...caseIds.map(id => primaryRow(id, opts.finalBad === id ? bad : good, opts.pairwiseConflict === id ? "OUTPUT_A_BETTER" : "EQUIVALENT")),
    ...(opts.second ? [secondRow(opts.second, bad, opts.pairwiseConflict === opts.second ? "EQUIVALENT" : "OUTPUT_A_BETTER")] : []),
  ],
  replayRows: caseIds.map(id => ({ id, source: "source", objective: "objective", candidate: "raw", final: "final", candidateVerification: null, finalVerification: { findings: [] }, review: null, semanticCalls: [], calls: opts.repairCall === id ? [{ stage: "repair", result: null, technicalFailure: "repair-failed" }] : [], technicalFailures: [], trace: { repairRequested: opts.repair === id, repairAccepted: false, repairClassification: null, outcome: opts.fallback === id ? "source-fallback" : "accepted", fallbackReason: opts.fallback === id ? "verifier-rejected" : null } })),
  fixedCleanSample: ["V3-001"], updateStratum: strata,
});

describe("V3 mandatory audit queue and response contract", () => {
  it("unions label, reviewer disagreement, repair/fallback, update-stratum, and fixed-sample reasons", () => {
    const queue = fixture({ second: "V3-002", repair: "V3-030", fallback: "V3-030", finalBad: "V3-004", pairwiseConflict: "V3-002" });
    const byId = new Map(queue.map(item => [item.caseId, item.reasonCodes]));
    expect(byId.get("V3-001")).toContain("FIXED_CLEAN_SAMPLE");
    expect(byId.get("V3-002")).toEqual(expect.arrayContaining(["OUTPUT_LABEL_DISAGREEMENT", "PAIRWISE_DISAGREEMENT"]));
    expect(byId.get("V3-003")).toContain("EXPLICIT_UPDATE");
    expect(byId.get("V3-030")).toEqual(expect.arrayContaining(["REPAIR_ATTEMPT", "FALLBACK"]));
    expect(byId.get("V3-030")).not.toContain("EXPLICIT_UPDATE");
    expect(fixture({ repairCall: "V3-031" }).find(item => item.caseId === "V3-031")?.reasonCodes).toContain("REPAIR_ATTEMPT");
    expect(byId.get("V3-004")).toEqual(expect.arrayContaining(["FINAL_BAD_PROXY", "FINAL_UNSUPPORTED_INFORMATION"]));
    expect(byId.get("V3-072")).toEqual(expect.arrayContaining(["EXPLICIT_UPDATE", "VAGUE_UPDATE"]));
    expect(byId.get("V3-082")).toContain("VAGUE_UPDATE");
    expect(byId.has("V3-005")).toBe(false);
  });

  it("fails closed on a missing primary review or altered reviewed update stratum", () => {
    expect(() => deriveAuditQueue({ caseIds, postLabels: caseIds.slice(1).map(id => primaryRow(id)), replayRows: caseIds.map(id => ({ id, source: "s", objective: "o", candidate: "c", final: "f", candidateVerification: null, finalVerification: {}, review: null, semanticCalls: [], calls: [], technicalFailures: [], trace: {} })), fixedCleanSample: [], updateStratum })).toThrow("primary label inventory mismatch");
    const altered = { ...updateStratum, explicitUpdateCaseIds: V3_EXPLICIT_UPDATE_IDS.slice(1) };
    expect(() => fixture({}, altered)).toThrow("explicit-update stratum inventory mismatch");
  });

  it("validates exact audit assignments and rejects malformed enums", () => {
    expect(validateAuditResponse(validResponse, ["V3-001"]).rows).toHaveLength(1);
    expect(() => validateAuditResponse(validResponse, ["V3-001", "V3-002"])).toThrow("audit response inventory mismatch");
    expect(() => validateAuditResponse({ ...validResponse, rows: [{ ...validResponse.rows[0], rawMaterialClass: "MAYBE" }] }, ["V3-001"])).toThrow();
  });

  it("allows primary rows to have an additional second-review assignment", () => {
    expect(() => validateReviewPhaseMembership("primary", true)).not.toThrow();
    expect(() => validateReviewPhaseMembership("primary", false)).not.toThrow();
    expect(() => validateReviewPhaseMembership("second", true)).not.toThrow();
    expect(() => validateReviewPhaseMembership("second", false)).toThrow("second-phase row lacks frozen second-review assignment");
  });

  it("requires captured call records and commits the full serialized packet object", () => {
    const rows = caseIds.map(id => ({ id, source: "s", objective: "o", candidate: "c", final: "f", candidateVerification: null, finalVerification: {}, review: null, semanticCalls: [], calls: [{ stage: "repair", result: { replacement: "candidate" }, technicalFailure: null }], trace: {}, technicalFailures: [] }));
    const artifact = { strategy: "reconstruction-v15", mode: "replay", manifestSha256: V3_MANIFEST_SHA256, caseCount: 119, technicalFailures: [], contractErrors: [], rows };
    expect(parseAuditReplayArtifact(artifact).rows[0]!.calls).toHaveLength(1);
    const missingCalls: unknown = { ...artifact, rows: rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "calls"))) };
    expect(() => parseAuditReplayArtifact(missingCalls)).toThrow();
    const packet = { protocol: "v3-trace-audit-packet-v1", packetId: "A1", queueSha256: "1".repeat(64), rowCount: 1, rows: [{ caseId: "V3-001" }] };
    const packetHash = auditPacketSha256(packet);
    const expected = createHash("sha256").update(JSON.stringify(packet, null, 2) + "\n").digest("hex");
    const rowsOnly = createHash("sha256").update(JSON.stringify(packet.rows, null, 2) + "\n").digest("hex");
    expect(packetHash).toBe(expected);
    expect(packetHash).not.toBe(rowsOnly);
  });

  it("rejects hash drift and preserves original response bytes beside canonical JSON", () => {
    const bytes = Buffer.from('{"protocol":"v3-trace-audit-response-v1","auditorId":"test","rows":[]}  \n');
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(() => verifyAuditArtifactHash(bytes, expected, "fixture")).not.toThrow();
    expect(() => verifyAuditArtifactHash(bytes, "0".repeat(64), "fixture")).toThrow("fixture hash mismatch");
    const parent = mkdtempSync(join(privateTemp(), "v3-audit-byte-test-"));
    const target = join(parent, "A1");
    try {
      exclusiveAtomicDirectory(target, staging => writeAuditResponseArtifacts(staging, bytes, validResponse, { protocol: "fixture" }));
      expect(readFileSync(join(target, "original-response.json"))).toEqual(bytes);
      expect(JSON.parse(readFileSync(join(target, "response.json"), "utf8"))).toEqual(validResponse);
      expect(lstatSync(join(target, "original-response.json")).mode & 0o777).toBe(0o600);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

  it("rejects symlinks, nonprivate modes, and paths outside a private temp directory", () => {
    const parent = mkdtempSync(join(privateTemp(), "v3-audit-input-test-"));
    const input = join(parent, "response.json"), link = join(parent, "linked.json");
    try {
      writeFileSync(input, JSON.stringify(validResponse), { mode: 0o600 }); chmodSync(input, 0o600);
      expect(readPrivateAuditResponse(input)).toEqual(readFileSync(input));
      chmodSync(input, 0o644);
      expect(() => readPrivateAuditResponse(input)).toThrow("mode 0600");
      chmodSync(input, 0o600); symlinkSync(input, link);
      expect(() => readPrivateAuditResponse(link)).toThrow();
      expect(() => readPrivateAuditResponse(resolve("tools/eval/holdout-v3-audit.ts"))).toThrow("private temporary directory");
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

  it("removes partial staging and does not publish on an exclusive-write failure", () => {
    const parent = mkdtempSync(join(privateTemp(), "v3-audit-partial-test-")), target = join(parent, "A1");
    try {
      expect(() => exclusiveAtomicDirectory(target, staging => {
        writeFileSync(join(staging, "response.json"), "occupied", { mode: 0o600 });
        writeAuditResponseArtifacts(staging, Buffer.from("original"), validResponse, { protocol: "fixture" });
      })).toThrow();
      expect(() => lstatSync(target)).toThrow();
      expect(readdirSync(parent)).toEqual([]);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});
