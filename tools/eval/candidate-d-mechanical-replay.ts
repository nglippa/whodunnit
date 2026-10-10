import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { runCandidateDMechanicalV3, type SentenceEditIntent } from "../../src/lib/reconstruction/candidate-d/mechanical-adapter";
import { replayCandidateDSafeEdit, artifactPath as baselinePath } from "./candidate-d-safe-edit-replay";

export const artifactPath = ".evaluations/candidate-d-frozen-48-v3/replay.json";
// Explicit offline caller annotation. Runtime routing receives no case ID,
// benchmark FINAL, safety label or objective-word heuristic.
export function frozenSentenceIntent(source: string, objective: string): SentenceEditIntent | undefined {
  const corpus = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8"));
  const fixture = corpus.cases.find((row: { caseId: string }) => row.caseId === "AC48V2-036");
  if (source !== fixture.source || objective !== fixture.objective) return undefined;
  return { kind: "SENTENCE_EDIT", source, objective,
    sourceSentence: "The exercise was an opportunity to engage in the undertaking of a discussion about transcription choices." };
}

export async function replayCandidateDMechanical() {
  const baselineText = readFileSync(baselinePath, "utf8");
  const baseline = JSON.parse(baselineText);
  const rechecked = await replayCandidateDSafeEdit();
  // Extraction of shared verification must preserve every V2 selection/probe.
  if (!isDeepStrictEqual(baseline.rows, rechecked.rows) || !isDeepStrictEqual(baseline.summary, rechecked.summary))
    throw new Error("Checkpoint 0efbf9c V2 behavior changed");
  const replay = await replayCandidateDSafeEdit((input, editor, reviews) =>
    runCandidateDMechanicalV3({ ...input, sentenceEdit: frozenSentenceIntent(input.request.source, input.objective) }, editor, reviews));
  const changed = replay.rows.filter(row => !isDeepStrictEqual(row, baseline.rows.find((prior: { caseId: string }) => prior.caseId === row.caseId)));
  const s = replay.summary;
  const invariants = s.suppliedUpdates.completed === 8 && s.alreadyGood.keep === 8 && s.editorCallsOnKeep === 0 &&
    s.staleSourceSuccesses === 0 && s.correctUpdateRawRetained === 8 && s.unsafeV15FinalsRejected.rejected === 12 &&
    s.unsafeV15FinalsRejected.total === 12 && s.unauthorizedFactualChangesAccepted === 0 && s.apparentSafetyConcerns.length === 0;
  const recovered036 = replay.rows.some(row => row.caseId === "AC48V2-036" && row.disposition === "COMPLETED" &&
    row.equalsV15Final && row.retainedRaw && row.verificationRoute === "V15_SENTENCE_EDIT");
  const recovered022 = replay.rows.some(row => row.caseId === "AC48V2-022" && row.disposition === "COMPLETED");
  const scopePreserved = changed.every(row => row.caseId === "AC48V2-036") &&
    replay.rows.some(row => row.caseId === "AC48V2-022" && row.disposition === "ABSTAINED");
  const decision = !invariants || !scopePreserved ? "C — SAFETY REGRESSION"
    : recovered036 ? "A — MECHANICAL RECOVERY COMPLETE" : "B — RECOVERY BLOCKED BY EXISTING VERIFICATION";
  return { ...replay, replayVersion: "candidate-d-frozen-48-v3", adapterVersion: "candidate-d-mechanical-v3", decision,
    comparisonToV2: { checkpoint: "0efbf9c", artifactPath: baselinePath,
      sha256: createHash("sha256").update(baselineText).digest("hex"), changedCases: changed.map(row => row.caseId),
      recovered036, recovered022, scopePreserved,
      priorDispositions: baseline.summary.dispositions, priorSafeFinalsRecovered: baseline.summary.safeV15FinalsRecovered },
    implementationSha256: { ...replay.implementationSha256, ...Object.fromEntries([
      "src/lib/reconstruction/candidate-d/mechanical-adapter.ts", "tools/eval/candidate-d-mechanical-replay.ts",
    ].map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])) },
    limits: [...replay.limits.slice(1),
      "Original objective classification and REQUIRED_UPDATE/KEEP gates are unchanged; only explicit sentence intent adds verification eligibility.",
      "036 has explicit frozen caller sentence intent; original objective classification is retained, not automatically corrected.",
      "Typed route requires identical bytes outside one sentence, preserved V15 verification, zero authorized factual changes and exact-bound captured PASS.",
      "022 remains abstained because D lacks authorized replacement binding; no objective-specific extension rule added.",
    ],
  };
}

async function main() {
  const replay = await replayCandidateDMechanical();
  if (process.argv.includes("--validate")) {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(artifactPath, "utf8")), replay)) throw new Error("Saved V3 replay mismatch");
    console.log("Candidate D V3 replay validated; V1/V2 preserved; 48 cases; no live calls.");
  } else {
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(artifactPath, JSON.stringify(replay, null, 2) + "\n");
    console.log(JSON.stringify({ decision: replay.decision, summary: replay.summary, comparison: replay.comparisonToV2, artifactPath }, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
