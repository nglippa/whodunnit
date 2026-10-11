/** Offline consumer of Candidate D's unchanged public adapter. No model callers. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertCaseInputExact } from "../../scripts/astra-control-execution-bindings";
import { runCandidateDMechanicalV3 } from "../../src/lib/reconstruction/candidate-d/mechanical-adapter";
import { verifyFrozenV15Candidate } from "../../src/lib/reconstruction/candidate-d/safe-edit-adapter";
import { holdoutSchema, finalSchema } from "../editorial-intelligence/experiment";

export const artifactPath = ".evaluations/candidate-d-direct-editor-12-v1/replay.json";
const run = ".evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1";
const reviewRoot = "data/experiments/editorial-intelligence-v1/full-ai-review";
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (path: string) => sha(readFileSync(path));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1; return counts;
}, {});

export async function replayDirectEditorThroughCandidateD() {
  const inputs: Record<string, string> = {};
  const pin = (path: string) => { inputs[path] = hashFile(path); return readJson(path); };
  const holdoutPath = `${run}/holdout.json`;
  const holdout = holdoutSchema.parse(pin(holdoutPath));
  const manifest = pin(`${run}/manifest.json`);
  if (inputs[holdoutPath] !== manifest.holdoutSha256 ||
      inputs[holdoutPath] !== hashFile("data/experiments/editorial-intelligence-v1/holdout.json"))
    throw new Error("Original holdout changed");
  const freeze = pin(`${reviewRoot}/judgment-freeze.json`);
  const judgmentPath = `${reviewRoot}/judgments.final.json`;
  const judgments = pin(judgmentPath);
  if (inputs[judgmentPath] !== freeze.judgmentSha256 ||
      inputs[judgmentPath] !== "0d2483cceea15c08b3af8627b7ea6c6290a710ad685dd9c51154c77449b1ee44")
    throw new Error("Frozen editorial judgments changed");
  const assessment = pin(`${reviewRoot}/unblinded-report.json`);
  const packetsPath = `${reviewRoot}/comparison-packets.json`;
  const packets = pin(packetsPath);
  if (inputs[packetsPath] !== freeze.packetSha256 || assessment.judgmentSha256 !== freeze.judgmentSha256)
    throw new Error("Frozen judgment binding changed");
  const rows = [];
  for (const row of holdout.cases) {
    const directory = `${run}/attempts/${row.id}/direct`;
    const accepted = pin(`${directory}/result.json`);
    const raw = readFileSync(`${directory}/response.raw`);
    inputs[`${directory}/response.raw`] = sha(raw);
    const metadataPath = `${directory}/metadata.raw.json`;
    const metadata = pin(metadataPath);
    const requestPath = `${run}/requests/${row.id}-direct.json`;
    const capturedRequest = pin(requestPath);
    if (accepted.status !== "accepted" || sha(raw) !== accepted.rawSha256 ||
        inputs[metadataPath] !== accepted.metadataSha256 || inputs[requestPath] !== accepted.requestSha256 ||
        metadata.selectedModel !== "gpt-6-astra" || capturedRequest.model !== "gpt-6-astra" ||
        capturedRequest.payload.source !== row.source || capturedRequest.payload.objective !== row.objective)
      throw new Error(`Captured direct input binding changed: ${row.id}`);
    const direct = finalSchema.parse(JSON.parse(raw.toString("utf8")));
    if (!isDeepStrictEqual(direct, accepted.output.data) || direct.text === null ||
        (direct.disposition === "UNCHANGED") !== (direct.text === row.source))
      throw new Error(`Invalid captured direct final: ${row.id}`);
    const savedText = direct.text;
    const reportRows = assessment.cases.filter((item: { caseId: string }) => item.caseId === row.id);
    const packetRows = packets.filter((item: { caseId: string }) => item.caseId === row.id);
    const judgmentRows = judgments.judgments.filter((item: { caseId: string }) => item.caseId === row.id);
    if (reportRows.length !== 1 || packetRows.length !== 1 || judgmentRows.length !== 1)
      throw new Error("Judgment inventory mismatch");
    const prior = reportRows[0], packet = packetRows[0];
    const directSide = prior.XArm === "direct" ? "X" : "Y";
    if (packet.source !== row.source || packet.objective !== row.objective || packet[directSide] !== direct.text ||
        !isDeepStrictEqual(prior.directAssessment, judgmentRows[0][directSide]))
      throw new Error("Direct final not bound to frozen judgment");
    const request = assertCaseInputExact(row.source, row.objective);
    let savedRawReads = 0;
    // Only SOURCE, OBJECTIVE, natural profile and the saved editor text reach D.
    // No quality oracle, sentence intent, editorial labels or fabricated PASS.
    const result = await runCandidateDMechanicalV3({ request, objective: row.objective }, async input => {
      if (input.source !== row.source || input.objective !== row.objective) throw new Error("Replay input changed");
      savedRawReads++; return savedText;
    }, []);
    if (savedRawReads !== result.editorCalls) throw new Error("Frozen editor callback accounting mismatch");
    // Trace-only offline recheck explains an EDIT route's rejection. It does not
    // provide extra evidence to D or change its selection. Omit unstable timings.
    const checked = result.state.kind === "EDIT"
      ? await verifyFrozenV15Candidate(request, row.objective, direct.text, []) : null;
    const final = result.terminal.text;
    const byteIdentical = final !== null && Buffer.from(final).equals(Buffer.from(direct.text));
    const frozenSafeComplete = prior.directAssessment.meaningIntegrity === "SAFE" &&
      prior.directAssessment.objectiveCompletion === "YES";
    rows.push({ caseId: row.id, caseType: row.stratum, source: row.source, objective: row.objective,
      directText: direct.text, directTextSha256: sha(direct.text), capturedRawSha256: sha(raw),
      directDisposition: direct.disposition, directEqualsSource: direct.text === row.source,
      sourceQualityInput: "UNKNOWN", capturedSemanticReviews: 0, sentenceEditIntent: null,
      classification: result.state.kind,
      classificationReason: "reason" in result.state ? result.state.reason : null,
      disposition: result.terminal.status, reason: "reason" in result.terminal ? result.terminal.reason : null,
      verificationRoute: result.verificationRoute, rawFallbackReason: result.rawFallbackReason,
      savedRawReads, liveModelCalls: 0, final, finalSha256: final === null ? null : sha(final),
      byteIdenticalDirectReturn: byteIdentical, sourceReturn: final === row.source,
      sourceFallback: final === row.source && direct.text !== row.source,
      modifiedOrReplaced: final !== null && !byteIdentical,
      falseAbstentionUnderFrozenJudgment: final === null && frozenSafeComplete,
      legitimateSafetyInterventionUnderFrozenJudgment: !byteIdentical && !frozenSafeComplete,
      frozenDirectAssessment: prior.directAssessment,
      deliveredAssessment: byteIdentical ? prior.directAssessment : null,
      rawDiagnostic: checked === null ? null : {
        outcome: checked.trace.outcome, fallbackReason: checked.trace.fallbackReason,
        candidateVerification: checked.candidateVerification,
        deterministicVerdict: checked.trace.deterministicVerdict,
        semanticVerificationRequested: checked.trace.semanticVerificationRequested,
        semanticVerdict: checked.trace.semanticVerdict, voiceVerdict: checked.trace.voiceVerdict,
      },
    });
  }
  if (rows.length !== 12 || new Set(rows.map(row => row.caseId)).size !== 12) throw new Error("Expected twelve direct outputs");
  const summary = {
    totalDirectOutputsReplayed: rows.length, byteIdenticalDirectReturns: rows.filter(row => row.byteIdenticalDirectReturn).length,
    modifiedOrReplaced: rows.filter(row => row.modifiedOrReplaced).length, sourceReturns: rows.filter(row => row.sourceReturn).length,
    sourceFallbacks: rows.filter(row => row.sourceFallback).length, explicitAbstentions: rows.filter(row => row.disposition === "ABSTAINED").length,
    incorrectlyWithheldUnderFrozenJudgments: rows.filter(row => row.falseAbstentionUnderFrozenJudgment).length,
    legitimateSafetyInterventionsUnderFrozenJudgments: rows.filter(row => row.legitimateSafetyInterventionUnderFrozenJudgment).length,
    dispositions: tally(rows.map(row => row.disposition)), classifications: tally(rows.map(row => row.classification)),
    reasons: tally(rows.map(row => row.reason ?? "NONE")),
    rawDiagnosticReasons: tally(rows.flatMap(row => row.rawDiagnostic ? [row.rawDiagnostic.fallbackReason ?? "NONE"] : [])),
    classificationAbstentionsBeforeRawRead: rows.filter(row => row.savedRawReads === 0).length,
    savedRawCallbackReads: rows.reduce((n, row) => n + row.savedRawReads, 0),
    frozenDirectSafe: rows.filter(row => row.frozenDirectAssessment.meaningIntegrity === "SAFE").length,
    frozenDirectObjectiveComplete: rows.filter(row => row.frozenDirectAssessment.objectiveCompletion === "YES").length,
    publishedSafe: rows.filter(row => row.deliveredAssessment?.meaningIntegrity === "SAFE").length,
    publishedObjectiveComplete: rows.filter(row => row.deliveredAssessment?.objectiveCompletion === "YES").length,
    liveModelCalls: 0,
  };
  return { version: "candidate-d-direct-editor-12-v1", adapterVersion: "candidate-d-mechanical-v3",
    decision: summary.byteIdenticalDirectReturns === 12 ? "READY_ON_THIS_OFFLINE_SAMPLE" : "NOT_READY_FOR_DIRECT_EDITOR_CONTROL",
    inputs, implementationSha256: Object.fromEntries([
      "src/lib/reconstruction/candidate-d/control.ts", "src/lib/reconstruction/candidate-d/adapter.ts",
      "src/lib/reconstruction/candidate-d/safe-edit-adapter.ts", "src/lib/reconstruction/candidate-d/mechanical-adapter.ts",
      "src/lib/reconstruction/verified-reconstruction.ts", "scripts/astra-control-execution-bindings.ts",
      "tools/eval/candidate-d-direct-editor-replay.ts",
    ].map(path => [path, hashFile(path)])), summary, rows,
    limits: [
      "Quality defaults to UNKNOWN; no fixture oracle or new quality classifier is supplied.",
      "No exact V15 semantic receipts exist for these direct outputs; reviews are empty. Frozen SAFE/YES judgments are assessment-only.",
      "Each direct final is loaded and replayed; CANNOT states may short-circuit before the frozen editor callback reads it.",
      "Exact preservation compares UTF-8 final-text bytes, not the JSON response envelope; the original response bytes remain unchanged and fingerprinted.",
      "Raw diagnostics reexecute existing offline verification for explanations only; timings are omitted and no model calls occur.",
      "False abstention means coverage loss relative to frozen judgments, not permission to publish without the required verification evidence.",
      "All supplied direct outputs were judged SAFE/YES; this sample has no unsafe negative controls and cannot establish safety on unsafe candidates.",
      "No new editorial judging; no quality rating transfers to changed or fallback text; twelve authored cases with exploratory AI review and unverified runtime identities.",
    ],
  };
}

async function main() {
  const replay = await replayDirectEditorThroughCandidateD();
  if (process.argv.includes("--validate")) {
    // JSON artifacts omit optional undefined properties in verification findings.
    if (!isDeepStrictEqual(readJson(artifactPath), JSON.parse(JSON.stringify(replay))))
      throw new Error("Saved direct replay mismatch");
    console.log(JSON.stringify({ validation: "PASS", ...replay.summary }));
  } else {
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(artifactPath, JSON.stringify(replay, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ decision: replay.decision, summary: replay.summary, artifactPath }, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
