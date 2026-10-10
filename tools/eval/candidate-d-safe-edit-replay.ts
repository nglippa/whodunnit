import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { diffWordsWithSpace } from "diff";
import type { VerifiedResultV15 } from "../../src/lib/reconstruction/verified-reconstruction";
import { runCandidateDSafeEditV2, type FrozenEditReview } from "../../src/lib/reconstruction/candidate-d/safe-edit-adapter";
import { assertCaseInputExact } from "../../scripts/astra-control-execution-bindings";
import { replayCandidateD, artifactPath as previousArtifactPath } from "./candidate-d-frozen-replay";

export const artifactPath = ".evaluations/candidate-d-frozen-48-v2/replay.json";
type Case = { caseId: string; source: string; objective: string; primaryStratum: string };
type Output = { caseId: string; arm: string; raw: string; text: string; result: VerifiedResultV15 };
type Label = { safety: string; objective: string; safetyClasses: Record<string, string> };
type Judgment = { caseId: string; arms: Record<string, Label> };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

/** The persisted review is of RAW unless a successful repair replaced it.
 * Never attach a rejected RAW review to V15's unconditional SOURCE fallback. */
export function reviewsFromFrozenV15(row: Case, v15: Output): FrozenEditReview[] {
  if (!v15.result.review || v15.result.source !== row.source || v15.result.candidate !== v15.raw) return [];
  const candidate = v15.result.trace.outcome === "repaired" ? v15.text : v15.raw;
  return [{ source: row.source, objective: row.objective, candidate, review: v15.result.review }];
}

// Human audit taxonomy only. Case IDs never participate in runtime routing.
const rootCause = (id: string, state: string) => {
  if (state === "EDIT") return "EDIT_ROUTE_NOT_CONNECTED";
  if (["AC48V2-023", "AC48V2-036", "AC48V2-037"].includes(id)) return "PROSE_OBJECTIVE_MISCLASSIFIED";
  if (["AC48V2-022", "AC48V2-044"].includes(id)) return "UNSUPPORTED_FACTUAL_BINDING";
  return "MISSING_UNCERTAIN_OR_CONFLICTING_REQUIREMENT";
};

export async function replayCandidateDSafeEdit() {
  // V1 validates all frozen input fingerprints/inventories and retains the
  // original selection code. Recompute its comparison instead of trusting labels.
  const previous = await replayCandidateD();
  const savedPrevious = JSON.parse(readFileSync(resolve(previousArtifactPath), "utf8"));
  if (!isDeepStrictEqual(savedPrevious, previous)) throw new Error("Previous replay changed or is invalid");
  const corpus = JSON.parse(readFileSync("data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", "utf8")) as { cases: Case[] };
  const outputs = readFileSync("data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line) as Output);
  const judgments = (JSON.parse(readFileSync("data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json", "utf8")) as { cases: Judgment[] }).cases;
  const rows = [];
  const abstentionAudit = [];
  for (const row of corpus.cases) {
    const prior = previous.rows.find(item => item.caseId === row.caseId)!;
    const v15 = outputs.find(item => item.caseId === row.caseId && item.arm === "V15")!;
    const judgment = judgments.find(item => item.caseId === row.caseId)!;
    const reviews = reviewsFromFrozenV15(row, v15);
    const request = assertCaseInputExact(row.source, row.objective);
    let rawReads = 0;
    const result = await runCandidateDSafeEditV2({ request, objective: row.objective, quality: prior.qualityAssessment }, async () => {
      rawReads++;
      return v15.raw;
    }, reviews);
    if (result.editorCalls !== rawReads) throw new Error("Editor accounting mismatch");
    const text = result.terminal.text;
    // Read judging only after selection, for comparisons, never to grant a return.
    const matchingArms = text === null ? [] : outputs.filter(item => item.caseId === row.caseId && item.text === text).map(item => item.arm);
    const inheritedSafety = matchingArms.map(arm => judgment.arms[arm].safety);
    const staleProbe = await runCandidateDSafeEditV2({ request, objective: row.objective, quality: prior.qualityAssessment }, async () => row.source, reviews);
    const unsafeFinalProbe = judgment.arms.V15.safety === "UNSAFE"
      ? await runCandidateDSafeEditV2({ request, objective: row.objective, quality: prior.qualityAssessment }, async () => v15.text, reviews) : null;
    const diff = text === null ? null : diffWordsWithSpace(v15.text, text).filter(part => part.added || part.removed)
      .map(part => ({ operation: part.added ? "ADD" : "REMOVE", text: part.value }));
    const entry = {
      caseId: row.caseId, stratum: row.primaryStratum, classification: result.state.kind,
      disposition: result.terminal.status, reason: "reason" in result.terminal ? result.terminal.reason : null,
      verificationRoute: result.verificationRoute, rawFallbackReason: result.rawFallbackReason,
      final: text, finalSha256: text === null ? null : sha(text), editorRawReads: rawReads, liveModelCalls: 0,
      retainedRaw: text === v15.raw, equalsSource: text === row.source, equalsV15Final: text === v15.text,
      previousDisposition: prior.disposition, previousFinalSha256: prior.finalSha256,
      changedFromPrevious: text !== prior.final || result.terminal.status !== prior.disposition,
      recoveredSafeV15Final: prior.withheldPreviouslySafeFinal && text === v15.text,
      sourceFrozenJudgment: judgment.arms.SOURCE, v15FrozenJudgment: judgment.arms.V15,
      matchingFrozenArms: matchingArms, inheritedSafety,
      apparentUnauthorizedFactualChange: matchingArms.some(arm =>
        ["safetyClass2", "safetyClass3", "safetyClass4"].some(key =>
          ["PRESENT", "UNCERTAIN"].includes(judgment.arms[arm].safetyClasses[key]))),
      apparentSafetyConcern: text !== null && (inheritedSafety.length === 0 || inheritedSafety.some(label => label !== "SAFE")),
      staleSourceSuccess: staleProbe.state.kind !== "KEEP" && staleProbe.terminal.status === "COMPLETED" &&
        (judgment.arms.SOURCE.safety !== "SAFE" || judgment.arms.SOURCE.objective !== "YES"),
      unsafeV15FinalRejected: unsafeFinalProbe === null ? null : unsafeFinalProbe.terminal.status === "ABSTAINED",
      mechanicalDifference: text === null ? "WITHHELD" : text === v15.text ? "IDENTICAL" : "CHANGED",
      changesAgainstV15Final: diff,
    };
    rows.push(entry);
    if (prior.disposition === "ABSTAINED") {
      const sourceObjective = judgment.arms.SOURCE.objective;
      const outcome = v15.result.trace.outcome;
      abstentionAudit.push({
        caseId: row.caseId, objective: row.objective, objectiveState: prior.classification, reason: prior.reason,
        rootCause: rootCause(row.caseId, prior.classification),
        rawDisposition: { verification: v15.result.candidateVerification?.status ?? null,
          review: v15.result.review?.verdict ?? null, reviewObjectiveSatisfied: v15.result.review?.objectiveSatisfied ?? null,
          equalsSource: v15.raw === row.source, equalsFinal: v15.raw === v15.text },
        finalDisposition: { outcome, fallbackReason: v15.result.trace.fallbackReason,
          verification: v15.result.finalVerification.status, equalsSource: v15.text === row.source },
        v15FrozenSafety: judgment.arms.V15.safety, sourceFrozenSafety: judgment.arms.SOURCE.safety,
        sourceObjectiveValidity: sourceObjective === "YES" ? "SATISFIED" : sourceObjective === "PARTIAL" ? "PARTIAL_NOT_COMPLETED" : "NOT_SATISFIED",
        // Applicability uses pre-edit state + saved verification; labels are only reported.
        existingV15VerificationUsable: v15.result.trace.outcome === "accepted" && v15.result.review?.verdict === "PASS" &&
          v15.result.candidateVerification?.status !== "rejected" && v15.raw === v15.text,
        routeUsableNow: result.state.kind === "EDIT" && result.verificationRoute === "V15_RAW",
        newDisposition: entry.disposition, newReason: entry.reason,
      });
    }
  }
  const updates = rows.filter(row => row.stratum === "explicit_supplied_update");
  const good = rows.filter(row => row.stratum === "already_good");
  const summary = {
    rootCauses: tally(abstentionAudit.map(row => row.rootCause)),
    priorSourceObjectiveValidity: tally(abstentionAudit.map(row => row.sourceObjectiveValidity)),
    suppliedUpdates: { total: updates.length, completed: updates.filter(row => row.disposition === "COMPLETED").length },
    alreadyGood: { total: good.length, keep: good.filter(row => row.disposition === "KEEP").length },
    editorCallsOnKeep: rows.filter(row => row.disposition === "KEEP").reduce((n, row) => n + row.editorRawReads, 0),
    correctUpdateRawRetained: updates.filter(row => row.retainedRaw).length,
    staleSourceSuccesses: rows.filter(row => row.staleSourceSuccess).length,
    verifiedRawReturns: rows.filter(row => row.retainedRaw && row.disposition === "COMPLETED").length,
    ordinaryRawReturns: rows.filter(row => row.verificationRoute === "V15_RAW").length,
    sourceReturns: rows.filter(row => row.equalsSource).length,
    verifiedSourceFallbacks: rows.filter(row => row.verificationRoute === "V15_SOURCE").length,
    explicitAbstentions: rows.filter(row => row.disposition === "ABSTAINED").length,
    dispositions: tally(rows.map(row => row.disposition)),
    safeV15FinalsRecovered: { recovered: rows.filter(row => row.recoveredSafeV15Final).length, total: 23 },
    unsafeV15FinalsRejected: { rejected: rows.filter(row => row.unsafeV15FinalRejected === true).length,
      total: rows.filter(row => row.unsafeV15FinalRejected !== null).length },
    unauthorizedFactualChangesAccepted: rows.filter(row => row.apparentUnauthorizedFactualChange).length,
    apparentSafetyConcerns: rows.filter(row => row.apparentSafetyConcern).map(row => row.caseId),
    recoveredObjectiveLabels: tally(rows.filter(row => row.recoveredSafeV15Final).map(row => row.v15FrozenJudgment.objective)),
    mechanicalDifferences: tally(rows.map(row => row.mechanicalDifference)),
    changedCases: rows.filter(row => row.changedFromPrevious).map(row => row.caseId),
    liveModelCalls: 0,
  };
  const hardPassed = summary.suppliedUpdates.completed === 8 && summary.alreadyGood.keep === 8 &&
    summary.editorCallsOnKeep === 0 && summary.staleSourceSuccesses === 0 && summary.correctUpdateRawRetained === 8 &&
    summary.apparentSafetyConcerns.length === 0 && summary.unauthorizedFactualChangesAccepted === 0 && summary.unsafeV15FinalsRejected.rejected === summary.unsafeV15FinalsRejected.total;
  const decision = !hardPassed || summary.safeV15FinalsRecovered.recovered === 0 ? "C — ROUTING ASSUMPTION INVALIDATED"
    : summary.safeV15FinalsRecovered.recovered === 23 ? "A — SAFE COVERAGE RECOVERED" : "B — PARTIAL COVERAGE RECOVERED";
  return {
    replayVersion: "candidate-d-frozen-48-v2", adapterVersion: "candidate-d-safe-edit-v2", decision,
    previousReplay: { artifactPath: previousArtifactPath, sha256: sha(readFileSync(previousArtifactPath, "utf8")), checkpoint: "9e0052c" },
    inputs: previous.inputs,
    implementationSha256: Object.fromEntries([
      "src/lib/reconstruction/candidate-d/control.ts",
      "src/lib/reconstruction/candidate-d/adapter.ts",
      "src/lib/reconstruction/candidate-d/safe-edit-adapter.ts",
      "src/lib/reconstruction/verified-reconstruction.ts",
      "tools/eval/candidate-d-safe-edit-replay.ts",
    ].map(path => [path, sha(readFileSync(path, "utf8"))])),
    summary, abstentionAudit, rows,
    limits: [
      "V1 classification and REQUIRED_UPDATE/KEEP/CANNOT selection are unchanged; no new regex heuristic.",
      "V15 runs unchanged with frozen RAW and exact source/objective/candidate-bound persisted semantic reviews, no live callers or repairs.",
      "A fallback is returned only after its own V15 objective-satisfying review and full deterministic/voice verification.",
      "SOURCE judging and final-arm safety labels are audit evidence, never selector inputs.",
      "Already-good quality is still an explicit fixture stub, not a production classifier.",
      "Case 016 retains SAFE/PARTIAL frozen judgment despite its internal V15 objectiveSatisfied=true; recovery does not relabel it YES.",
    ],
  };
}

async function main() {
  const replay = await replayCandidateDSafeEdit();
  if (process.argv.includes("--validate")) {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(artifactPath, "utf8")), replay)) throw new Error("Saved V2 replay mismatch");
    console.log("Candidate D V2 replay validated; previous replay preserved; 48 cases; no live calls.");
  } else {
    mkdirSync(resolve(artifactPath, ".."), { recursive: true });
    writeFileSync(artifactPath, JSON.stringify(replay, null, 2) + "\n");
    console.log(JSON.stringify({ decision: replay.decision, summary: replay.summary, artifactPath }, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
