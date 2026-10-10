import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { diffWordsWithSpace } from "diff";
import { runCandidateDControlV1 } from "../../src/lib/reconstruction/candidate-d/adapter";

const corpusPath = "data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json";
const outputsPath = "data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl";
const judgmentsPath = "data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json";
export const artifactPath = ".evaluations/candidate-d-frozen-48-v1/replay.json";
type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
type Output = { caseId: string; arm: string; status: string; raw?: string; rawSha256?: string; text: string };
type Judgment = { caseId: string; arms: Record<string, { safety: string; objective: string }> };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

export async function replayCandidateD() {
  const corpusBytes = readFileSync(resolve(corpusPath), "utf8");
  const outputBytes = readFileSync(resolve(outputsPath), "utf8");
  const judgmentBytes = readFileSync(resolve(judgmentsPath), "utf8");
  const frozenHashes = [
    "464eafef5b49cc5c6e9a80ff96ba2bed9661cdc3e7f5c1fa73ba00b2d0dc8f22",
    "08deccc8263f956fa0b69c7a6a768f50464565fbfce51af705fd698d2605e152",
    "092863cc9946722af3951e814e7094ae3603f2c70aea8ca12865ac61a0979d13",
  ];
  if (![corpusBytes, outputBytes, judgmentBytes].every((bytes, index) => sha(bytes) === frozenHashes[index]))
    throw new Error("Frozen replay input fingerprint mismatch");
  const corpus = JSON.parse(corpusBytes) as { cases: Case[] };
  const outputs = outputBytes.trim().split("\n").map(line => JSON.parse(line) as Output);
  const judgments = (JSON.parse(judgmentBytes) as { cases: Judgment[] }).cases;
  if (corpus.cases.length !== 48 || new Set(corpus.cases.map(row => row.caseId)).size !== 48)
    throw new Error("Expected the frozen 48-case corpus");
  if (outputs.length !== 192 || new Set(outputs.map(row => `${row.caseId}/${row.arm}`)).size !== 192 ||
      judgments.length !== 48 || new Set(judgments.map(row => row.caseId)).size !== 48)
    throw new Error("Frozen matrix or judgment inventory mismatch");
  for (const row of corpus.cases) {
    for (const arm of ["SOURCE", "V15", "C", "ASTRA"])
      if (outputs.filter(item => item.caseId === row.caseId && item.arm === arm).length !== 1)
        throw new Error("Missing frozen arm slot");
    if (outputs.find(item => item.caseId === row.caseId && item.arm === "SOURCE")?.text !== row.source)
      throw new Error("Frozen SOURCE mismatch");
  }
  const rows = [];
  for (const row of corpus.cases) {
    const v15Rows = outputs.filter(item => item.caseId === row.caseId && item.arm === "V15");
    const judgment = judgments.find(item => item.caseId === row.caseId);
    const v15 = v15Rows[0];
    if (v15Rows.length !== 1 || v15.status !== "success" || typeof v15.raw !== "string" ||
        sha(v15.raw) !== v15.rawSha256 || !judgment) throw new Error(`Invalid frozen input: ${row.caseId}`);
    const raw = v15.raw;
    const quality = row.primaryStratum === "already_good"
      ? { kind: "NO_MATERIAL_DEFECT" as const, evidence: `Frozen already-good fixture stub: ${row.caseId}` }
      : { kind: "UNKNOWN" as const };
    let rawReads = 0;
    const result = await runCandidateDControlV1({ source: row.source, objective: row.objective, quality }, async () => {
      rawReads++;
      return raw;
    });
    if (result.editorCalls !== rawReads) throw new Error("Adapter editor accounting mismatch");
    const staleProbe = await runCandidateDControlV1({ source: row.source, objective: row.objective, quality }, async () => row.source);
    const text = result.terminal.text;
    // Frozen final-arm labels transfer only across byte-identical text. RAW has no independent rating.
    const matchingArms = text === null ? [] : outputs.filter(item => item.caseId === row.caseId && item.text === text).map(item => item.arm);
    const inheritedSafety = matchingArms.map(arm => judgment.arms[arm].safety);
    const regression = inheritedSafety.includes("UNSAFE") || inheritedSafety.includes("UNRESOLVED");
    const changes = text === null ? null : diffWordsWithSpace(v15.text, text).filter(part => part.added || part.removed)
      .map(part => ({ operation: part.added ? "ADD" : "REMOVE", text: part.value }));
    rows.push({
      caseId: row.caseId, stratum: row.primaryStratum, classification: result.state.kind,
      disposition: result.terminal.status, reason: "reason" in result.terminal ? result.terminal.reason : null,
      qualityAssessment: quality, editorRawReads: rawReads, liveModelCalls: 0,
      rawSha256: v15.rawSha256, final: text, finalSha256: text === null ? null : sha(text),
      retainedRaw: text === raw, equalsSource: text === row.source,
      v15FinalSha256: sha(v15.text), equalsV15Final: text === v15.text,
      mechanicalDifference: text === null ? "WITHHELD" : text === v15.text ? "IDENTICAL" : "CHANGED",
      changesAgainstV15Final: changes, v15FrozenJudgment: judgment.arms.V15,
      matchingFrozenArms: matchingArms, inheritedSafety, apparentSafetyRegression: regression,
      // A safe V15 final withheld is a coverage loss, not evidence of an unsafe D final.
      withheldPreviouslySafeFinal: text === null && judgment.arms.V15.safety === "SAFE",
      staleSourceAccepted: staleProbe.state.kind !== "KEEP" && staleProbe.terminal.status === "COMPLETED",
    });
  }
  const updates = rows.filter(row => row.stratum === "explicit_supplied_update");
  const good = rows.filter(row => row.stratum === "already_good");
  const summary = {
    suppliedUpdates: { total: updates.length, completed: updates.filter(row => row.disposition === "COMPLETED").length },
    alreadyGood: { total: good.length, keep: good.filter(row => row.disposition === "KEEP").length },
    editorCallsOnKeep: rows.filter(row => row.disposition === "KEEP").reduce((n, row) => n + row.editorRawReads, 0),
    staleSourceAccepted: rows.filter(row => row.staleSourceAccepted).length,
    correctUpdateRawRetained: updates.filter(row => row.retainedRaw).length,
    classifications: tally(rows.map(row => row.classification)), dispositions: tally(rows.map(row => row.disposition)),
    mechanicalDifferences: tally(rows.map(row => row.mechanicalDifference)),
    abstentions: rows.filter(row => row.disposition === "ABSTAINED").map(row => ({ caseId: row.caseId, reason: row.reason })),
    apparentSafetyRegressions: rows.filter(row => row.apparentSafetyRegression).map(row => row.caseId),
    withheldPreviouslySafeFinals: rows.filter(row => row.withheldPreviouslySafeFinal).map(row => row.caseId),
    rawReads: rows.reduce((n, row) => n + row.editorRawReads, 0), liveModelCalls: 0,
  };
  const requiredPassed = summary.suppliedUpdates.completed === 8 && summary.alreadyGood.keep === 8 &&
    summary.editorCallsOnKeep === 0 && summary.staleSourceAccepted === 0 && summary.correctUpdateRawRetained === 8;
  const decision = !requiredPassed || summary.withheldPreviouslySafeFinals.length > 0 || summary.apparentSafetyRegressions.length > 0
    ? "B — ADAPTER WORKS, REPLAY EXPOSES FAILURES" : "A — END-TO-END CONTROL HYPOTHESIS PASSES";
  return {
    replayVersion: "candidate-d-frozen-48-v1", adapterVersion: "candidate-d-control-v1", decision,
    inputs: { [corpusPath]: sha(corpusBytes), [outputsPath]: sha(outputBytes), [judgmentsPath]: sha(judgmentBytes) },
    limits: [
      "Already-good quality evidence is a fixture oracle/stub, not an implemented quality classifier.",
      "General EDIT objectives are unsupported and explicitly abstain after reading frozen RAW.",
      "No new safety judgments: labels are inherited only for exact matches to frozen final arms.",
      "Abstentions have no publishable final; mechanical differences are against V15 FINAL, never against a null string.",
      "No live editor, verifier, repairer or judge calls. Editor counts are frozen RAW callback invocations.",
    ], summary, rows,
  };
}

async function main() {
  const replay = await replayCandidateD();
  if (process.argv.includes("--validate")) {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(resolve(artifactPath), "utf8")), replay))
      throw new Error("Saved replay does not match frozen inputs and current adapter");
    console.log("Candidate D replay validation passed (48 cases; no live calls).");
  } else {
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(resolve(artifactPath), JSON.stringify(replay, null, 2) + "\n");
    console.log(JSON.stringify({ decision: replay.decision, summary: replay.summary, artifactPath }, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
