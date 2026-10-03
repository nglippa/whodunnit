/** Additive, post-unblind interpretation archive. Never invokes models or edits earlier artifacts. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertNoSymlinkComponents } from "./holdout-v3-blind";
import { exclusiveAtomicDirectory } from "./holdout-v3-reviews";
import { validateAuditResponse, verifyPinnedAuditBundle, type AuditResponse } from "./holdout-v3-audit";

const root = resolve("data/evaluation/holdout-v3");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const id = z.string().regex(/^V3-\d{3}$/);
const loss = z.union([z.boolean(), z.literal("DISPUTED")]);
const correctionRow = z.object({ caseId: id, raw: z.enum(["GOOD_RAW", "BAD_RAW", "OTHER", "DISPUTED"]), final: z.enum(["GOOD_FINAL", "BAD_FINAL", "OTHER", "DISPUTED"]), materialGoodEditLost: loss, unsafeFinal: z.boolean(), repair: z.string(), fallback: z.string(), evidence: z.string().min(1) }).passthrough();
const remainingRow = z.object({ caseId: id, rawClass: z.enum(["GOOD_RAW", "BAD_RAW", "OTHER", "DISPUTED"]), finalClass: z.enum(["GOOD_FINAL", "BAD_FINAL", "OTHER", "DISPUTED"]), materialGoodEditLost: loss.nullable(), repair: z.string(), fallback: z.string(), evidence: z.string().min(1), source: z.string(), objective: z.string(), raw: z.string(), final: z.string(), frozenPrelabels: z.array(z.unknown()), blindOutputReviews: z.array(z.unknown()), v15Trace: z.unknown(), candidateVerification: z.unknown(), semanticCalls: z.array(z.unknown()) }).passthrough();
export function assertExactFinalAuditIds(actual: string[], expected: string[], description: string) {
  if (new Set(actual).size !== actual.length || [...actual].sort().join("\0") !== [...expected].sort().join("\0")) throw new Error(`${description} inventory mismatch`);
}
export function finalAuditInterpretation(first: AuditResponse["rows"][number], correction?: z.infer<typeof correctionRow>) {
  return correction ? { rawClass: correction.raw, finalClass: correction.final, materialGoodEditLost: correction.materialGoodEditLost, unsafeFinal: correction.unsafeFinal, repair: correction.repair, fallback: correction.fallback, evidence: correction.evidence } : { rawClass: first.rawMaterialClass === "OTHER" ? "OTHER" : `${first.rawMaterialClass}_RAW`, finalClass: first.finalMaterialClass === "OTHER" ? "OTHER" : `${first.finalMaterialClass}_FINAL`, materialGoodEditLost: first.goodRetentionStatus === "GOOD_LOST", unsafeFinal: first.finalMaterialClass === "BAD", repair: first.repairQuality, fallback: first.fallbackQuality, evidence: first.evidence };
}
export function finalizeV3Audit(adjudicationPath: string, remainingPath: string) {
  const archived = new Map<string, Buffer>();
  const read = (path: string, archiveName: string) => { assertNoSymlinkComponents(path); const bytes = readFileSync(path); archived.set(archiveName, bytes); return JSON.parse(bytes.toString("utf8")); };
  const correction = z.object({ protocol: z.literal("v3-independent-additive-adjudication-draft-v1"), rows: z.array(correctionRow).length(12) }).passthrough().parse(read(resolve(adjudicationPath), "independent-adjudication.original.json"));
  const remaining = z.object({ protocol: z.literal("v3-additive-post-unblind-remaining-audit-v1"), caseCount: z.literal(34), exactCaseIds: z.array(id).length(34), inputFileSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), sealedQueueSha256: z.string(), rows: z.array(remainingRow).length(34) }).passthrough().parse(read(resolve(remainingPath), "remaining-audit.original.json"));
  for (const [file, expected] of Object.entries(remaining.inputFileSha256)) {
    if (!/^(frozen|run)\/[a-zA-Z0-9/.-]+\.json$/.test(file) || file.includes("..")) throw new Error("unsafe input commitment path");
    read(resolve(root, file), `inputs/${file}`);
    if (hash(archived.get(`inputs/${file}`)!) !== expected) throw new Error(`${file} hash mismatch`);
  }
  const replay = JSON.parse(archived.get("inputs/run/replay.json")!.toString()) as { rows: Array<Record<string, unknown> & { id: string }> };
  const prelabels = JSON.parse(archived.get("inputs/frozen/labels.json")!.toString()) as Array<{ id: string }>;
  const labels = JSON.parse(archived.get("inputs/run/post-review-v1/unblinded-labels.json")!.toString()) as { rows: Array<{ caseId: string }> };
  const frozenCases = JSON.parse(archived.get("inputs/frozen/cases.json")!.toString()) as Array<{ id: string }>;
  const allIds = frozenCases.map(row => row.id).sort();
  if (allIds.length !== 119) throw new Error("frozen case count mismatch");
  assertExactFinalAuditIds(replay.rows.map(row => row.id), allIds, "replay");
  const firstRows: AuditResponse["rows"] = [];
  for (let i = 1; i <= 5; i++) {
    const packetId = `A${i}`, sealed = verifyPinnedAuditBundle(packetId);
    const commitment = read(resolve(root, `run/audit-v1/responses/${packetId}/commitment.json`), `first-audit/${packetId}/commitment.json`);
    const original = read(resolve(root, `run/audit-v1/responses/${packetId}/original-response.json`), `first-audit/${packetId}/original-response.json`);
    const canonical = read(resolve(root, `run/audit-v1/responses/${packetId}/response.json`), `first-audit/${packetId}/response.json`);
    if (commitment.protocol !== "v3-trace-audit-response-commitment-v1" || commitment.packetId !== packetId || commitment.rowCount !== 17 || commitment.packetSha256 !== sealed.packetSha256 || commitment.queueSha256 !== sealed.queueSha256 || commitment.replaySha256 !== sealed.replaySha256 || remaining.sealedQueueSha256 !== sealed.queueSha256 || hash(archived.get(`first-audit/${packetId}/original-response.json`)!) !== commitment.originalResponseSha256 || hash(archived.get(`first-audit/${packetId}/response.json`)!) !== commitment.canonicalResponseSha256) throw new Error(`${packetId} response commitment mismatch`);
    const ids = sealed.packet.rows.map(row => row.caseId);
    const parsed = validateAuditResponse(canonical, ids);
    if (parsed.auditorId !== packetId || !isDeepStrictEqual(validateAuditResponse(original, ids), parsed)) throw new Error(`${packetId} original/canonical mismatch`);
    firstRows.push(...parsed.rows);
  }
  const firstIds = firstRows.map(row => row.caseId);
  assertExactFinalAuditIds(firstIds, firstIds, "first audits");
  assertExactFinalAuditIds(correction.rows.map(row => row.caseId), ["V3-012", "V3-028", "V3-031", "V3-072", "V3-079", "V3-082", "V3-086", "V3-089", "V3-091", "V3-106", "V3-113", "V3-114"], "adjudication");
  if (correction.rows.some(row => !firstIds.includes(row.caseId))) throw new Error("correction outside mandatory audit");
  assertExactFinalAuditIds(remaining.rows.map(row => row.caseId), allIds.filter(caseId => !firstIds.includes(caseId)), "remaining audits");
  assertExactFinalAuditIds(remaining.exactCaseIds, remaining.rows.map(row => row.caseId), "remaining declared IDs");
  for (const row of remaining.rows) {
    const original = replay.rows.find(value => value.id === row.caseId)!;
    for (const [field, expected] of Object.entries({ source: original.source, objective: original.objective, raw: original.candidate, final: original.final, v15Trace: original.trace, candidateVerification: original.candidateVerification, semanticCalls: original.semanticCalls, frozenPrelabels: prelabels.filter(value => value.id === row.caseId), blindOutputReviews: labels.rows.filter(value => value.caseId === row.caseId) })) {
      if (!isDeepStrictEqual(row[field], expected)) throw new Error(`${row.caseId} ${field} evidence mismatch`);
    }
  }
  const rows = allIds.map(caseId => {
    const first = firstRows.find(row => row.caseId === caseId), override = correction.rows.find(row => row.caseId === caseId), extra = remaining.rows.find(row => row.caseId === caseId);
    return { caseId, interpretationSource: override ? "ADDITIVE_ADJUDICATION_12" : first ? "FIRST_MANDATORY_AUDIT" : "ADDITIVE_REMAINING_34", originalBlindLabels: labels.rows.filter(row => row.caseId === caseId), firstAuditJudgment: first ?? null, adjudication: override ?? null, interpretation: first ? finalAuditInterpretation(first, override) : { rawClass: extra!.rawClass, finalClass: extra!.finalClass, materialGoodEditLost: extra!.materialGoodEditLost, unsafeFinal: extra!.finalClass === "BAD_FINAL", repair: extra!.repair, fallback: extra!.fallback, evidence: extra!.evidence }, evidenceFlags: caseId === "V3-105" ? ["O2A_REVIEWER_EVIDENCE_CONTAMINATION: unrelated handy/gloves/invitation evidence; original labels retained, evidence excluded from substantive support"] : [] };
  });
  const count = (field: "rawClass" | "finalClass") => Object.fromEntries([...new Set(rows.map(row => row.interpretation[field]))].sort().map(value => [value, rows.filter(row => row.interpretation[field] === value).length]));
  const summary = { caseCount: 119, mandatoryAuditCount: 85, additiveCorrectionCount: 12, additionalAuditCount: 34, rawClasses: count("rawClass"), finalClasses: count("finalClass"), materialGoodEditsLost: rows.filter(row => row.interpretation.materialGoodEditLost === true).length, disputedGoodLoss: rows.filter(row => row.interpretation.materialGoodEditLost === "DISPUTED").map(row => row.caseId), unsafeFinal: rows.filter(row => row.interpretation.unsafeFinal).map(row => row.caseId), limitations: ["Post-unblind interpretations are not a replacement for blinded measurements.", "Material usefulness and semantic safety remain judgment-based; disputed cases are unresolved.", "Stale source fallback in V3-012 and V3-089 is objective failure; neither is an unsupported rewrite escape.", "V3-105 O2A evidence is contaminated and excluded from substantive support; original labels remain immutable.", "Original audit disagreement flags remain available in firstAuditJudgment and are not erased by aggregate classes."] };
  const destination = resolve(root, "run/post-review-v1/final-audit-v1");
  const commitments = { protocol: "v3-final-audit-commitments-v1", inputs: Object.fromEntries([...archived].map(([name, bytes]) => [name, hash(bytes)])), interpretationSha256: hash(Buffer.from(encode(rows))), summarySha256: hash(Buffer.from(encode(summary))) };
  exclusiveAtomicDirectory(destination, staging => {
    for (const [name, bytes] of archived) { const path = resolve(staging, name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, bytes, { flag: "wx", mode: 0o444 }); }
    for (const [name, value] of Object.entries({ "interpretations.json": rows, "summary.json": summary, "commitments.json": commitments })) writeFileSync(resolve(staging, name), encode(value), { flag: "wx", mode: 0o444 });
  });
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(encode(finalizeV3Audit(process.argv[2] ?? "/private/tmp/whodunnit-v3-independent-adjudication.json", process.argv[3] ?? "/private/tmp/whodunnit-v3-remaining-audit.json")));
}
