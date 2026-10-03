import { reconstructionRequestSchema, type ReconstructionRequest } from "@/domain/document";
import { candidateSchema } from "@/lib/ai/schemas";
import { applyRefinement } from "@/domain/refinement";
import { compareVoiceDevices } from "@/lib/semantics/voice-devices";
import { contentStems, extractClaims } from "@/lib/semantics/claims";
import { MODALITY_LEVELS } from "@/domain/semantics";
import { verifyDirectiveScopedTemporalDelta } from "../directive-scoped-temporal-verification";
import { buildRewritePlan } from "../rewrite-plan";
import { RECONSTRUCTION_V15 } from "../strategies";
import { buildObjectiveContract, objectiveCurrentSource, preservesExactDeltas } from "./objective-contract";
import { POST_V3_PROMPTS_V1, postV3ReviewSchema, postV3RepairSchema, type PostV3Arm, type PostV3Config, type PostV3Result, type PostV3Review } from "./contracts";
export * from "./contracts";
export * from "./objective-contract";

async function timed<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}

/** Comparable assertion boundaries for both sides; extract each fragment directly
 * so lowercase clauses after semicolons do not depend on sentence capitalization. */
function assertionClauses(text: string) {
  return extractClaims(text).flatMap((claim) => claim.text.split(/;|\s+and\s+(?=[\p{L}]+\s+(?:is|are|can|will|must|may|has|have)\b)/giu)
    .flatMap((part) => extractClaims(part.trim()))).map((claim, index) => ({ ...claim, id: `scope-${index}` }));
}

/** Experimental downstream-only runner. RAW is supplied, never generated here. */
export async function runPostV3Candidate(arm: PostV3Arm, requestRaw: ReconstructionRequest, objectiveRaw: string, raw: string, config: PostV3Config = {}): Promise<PostV3Result> {
  if (!["A", "B", "C", "D"].includes(arm)) throw new Error("Unknown post-V3 arm");
  const request = reconstructionRequestSchema.parse(requestRaw);
  const objective = objectiveRaw.trim();
  if (!objective || objective.length > 500) throw new Error("An objective of at most 500 characters is required");
  for (const caller of [config.verifier, config.repairer])
    if (caller?.info.mode === "live" && !(config.confirmedNoIncrementalCost === true && caller.info.provider === "account-backed"))
      throw new Error("Post-V3 requires confirmed account-backed access with zero incremental cost");
  const source = request.source;
  const profile = request.refinement ? applyRefinement(request.profile, request.refinement.change) : request.profile;
  const plan = buildRewritePlan({ source, profile, current: request.refinement?.current, refinement: request.refinement?.change,
    voiceprint: request.voiceprint, protectedPhrases: request.protectedPhrases }, RECONSTRUCTION_V15);
  const ctx = { removableSpans: plan.removableSpans, licenses: plan.refinementDelta?.licenses, protectedPhrases: plan.protectedPhrases };
  const contract = buildObjectiveContract(source, objective);
  let truth = arm === "A" || arm === "C" ? objectiveCurrentSource(source, contract) : source;
  const check = (text: string) => {
    const checked = verifyDirectiveScopedTemporalDelta(truth, text, objective, profile, ctx);
    if (!contract.unresolved) return checked;
    // Unknown facts cannot license additional independent assertions. Alignment
    // only selects a comparison scope; independent semantic review still decides
    // whether vocabulary substitutions preserve the claim's meaning.
    const sourceClaims = assertionClauses(objectiveCurrentSource(source, contract));
    const candidateClaims = assertionClauses(text);
    const used = new Set<string>();
    const unsupported = candidateClaims.some((claim) => {
      const terms = new Set(contentStems(claim.text));
      const ranked = sourceClaims.map((original) => ({ original, overlap: contentStems(original.text).filter((term) => terms.has(term)).length })).sort((a, b) => b.overlap - a.overlap);
      if (!ranked[0]?.overlap || ranked[1]?.overlap === ranked[0].overlap || used.has(ranked[0].original.id)) return true;
      const original = ranked[0].original;
      used.add(original.id);
      return original.temporal.some((marker) => !claim.temporal.includes(marker)) || original.negators.some((marker) => !claim.negators.includes(marker)) ||
        MODALITY_LEVELS.indexOf(claim.modality) > MODALITY_LEVELS.indexOf(original.modality);
    });
    if (!unsupported) return checked;
    return { ...checked, verification: { ...checked.verification, status: "rejected" as const,
      findings: [...checked.verification.findings, { kind: "meaning_drift" as const, severity: "blocking" as const, origin: "deterministic" as const,
        message: "Unavailable factual updates cannot authorize independent assertions or removal of protected conditions." }] } };
  };
  const trace: PostV3Result["trace"] = { arm, reviewAttempts: 0, repairAttempts: 0, recheckAttempts: 0, repairAccepted: false,
    outcome: "source", technicalFailure: null, reasons: [] };
  const finish = (text: string, status: PostV3Result["status"], disclosure: string | null, outcome: PostV3Result["trace"]["outcome"]): PostV3Result => {
    trace.outcome = outcome;
    return { text, status, disclosure, verification: check(text).verification, trace };
  };
  const abstain = (reason: string) => { trace.reasons.push(reason); return finish(source, "abstained", "The requested rewrite could not be verified safely. The source is shown for reference; the task remains unresolved.", "source"); };
  if (contract.ambiguous) return abstain("ambiguous-objective-authority");
  if (arm !== "C" && arm !== "D" && contract.unresolved && contract.deltas.length === 0 && /\b(?:update|replace|change|revise|switch|move)\b/i.test(objective))
    return abstain("missing-update-authority");
  const parsedRaw = candidateSchema.safeParse({ text: raw, changes: [] });
  if (!parsedRaw.success || !raw.trim()) { trace.technicalFailure = "invalid-raw"; return abstain("invalid-raw"); }
  const initial = check(raw);
  // B protects only deltas independently admitted by V15, never guessed replacements.
  const validatedDeltas = arm === "B" ? contract.deltas.filter((delta) =>
    initial.verification.status !== "rejected" && preservesExactDeltas(raw, [delta]) && initial.authorized.some((authorization) =>
      authorization.basis === "OBJECTIVE" && authorization.objectiveEvidence !== null &&
      (authorization.source === delta.sourceText || authorization.candidate === delta.currentText))) : [];
  const timeout = config.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid timeout");
  const inspect = async (text: string, recheck: boolean): Promise<{ review: PostV3Review | null; safe: boolean; verification: ReturnType<typeof check>["verification"] }> => {
    const verification = check(text).verification;
    const voice = compareVoiceDevices(source, text, plan.sourceVoice.slopDensity);
    if (verification.status === "rejected") return { review: null, safe: false, verification };
    if (!config.verifier) { trace.technicalFailure = "verifier-unavailable"; return { review: null, safe: false, verification }; }
    if (recheck ? trace.recheckAttempts !== 0 : trace.reviewAttempts !== 0) throw new Error("Review budget exhausted");
    if (recheck) trace.recheckAttempts++; else trace.reviewAttempts++;
    try {
      const response = await timed(config.verifier.callStructured(postV3ReviewSchema, recheck ? "post-v3-recheck" : "post-v3-review",
        POST_V3_PROMPTS_V1.review, JSON.stringify({ source, candidate: text, objective, deterministicFindings: verification.findings,
          authorizedChanges: check(text).authorized, objectiveContract: arm === "A" ? contract : undefined,
          voiceDeviations: voice.deviations, protectedPhrases: plan.protectedPhrases.map((phrase) => phrase.text) })), timeout);
      const parsed = postV3ReviewSchema.safeParse(response.data);
      if (!parsed.success) throw new Error("malformed-review");
      const review = parsed.data;
      if (review.safety === "SAFE" && (review.issue !== null || review.unsupportedInformation)) throw new Error("inconsistent-review");
      if (review.issue && (review.issue.span.end <= review.issue.span.start || text.slice(review.issue.span.start, review.issue.span.end) !== review.issue.span.text)) throw new Error("invalid-review-span");
      const voiceAllowed = /\b(?:voice|tone|style|register|casual|formal|punctuation|fragments?)\b/i.test(objective);
      const safe = review.safety === "SAFE" && !review.unsupportedInformation && review.voicePreserved && (voice.verdict !== "DAMAGED" || voiceAllowed);
      return { review, safe, verification };
    } catch (error) { trace.technicalFailure = error instanceof Error ? error.message : "review-unavailable"; return { review: null, safe: false, verification }; }
  };
  const deliver = (text: string, reviewed: Awaited<ReturnType<typeof inspect>>, repaired: boolean): PostV3Result | null => {
    if (!reviewed.safe || !reviewed.review || !preservesExactDeltas(text, validatedDeltas)) return null;
    // Incomplete status never excuses losing the scope/conditions of a supplied
    // update that is present in the delivered draft.
    const applied = contract.deltas.filter((delta) => {
      const escaped = delta.currentText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
    });
    if (!preservesExactDeltas(text, applied)) return null;
    const vagueUpdate = /\b(?:update|replace|change|revise)\b/i.test(objective) && /\b(?:latest|new details|new information|new confirmed|updated details|confirmed dates?)\b/i.test(objective) && contract.deltas.length === 0;
    const complete = reviewed.review.objectiveSatisfied === "YES" && !contract.unresolved && !vagueUpdate &&
      preservesExactDeltas(text, contract.deltas);
    if (!complete && !(arm === "D" || arm === "C") || !complete && !reviewed.review.usefulPartial) return null;
    if (repaired) trace.repairAccepted = true;
    return finish(text, complete ? "completed" : "incomplete", complete ? null : `The draft is safe but the task remains incomplete: ${reviewed.review.reason}`, repaired ? "repaired" : "raw");
  };
  // B's alternative final selection uses only scoped supplied facts, never unsafe RAW.
  // The rejected RAW consumed no semantic call, so this spends the same one-review budget.
  if (arm === "B" && initial.verification.status === "rejected" && contract.deltas.length > 0 && !contract.unresolved) {
    const minimal = objectiveCurrentSource(source, contract);
    truth = minimal;
    const selected = await inspect(minimal, false);
    if (preservesExactDeltas(minimal, contract.deltas)) {
      const result = deliver(minimal, selected, false);
      if (result) { trace.reasons.push("objective-only-final-selection"); trace.outcome = "objective-update"; return result; }
    }
    return abstain(trace.technicalFailure ?? "objective-only-selection-rejected");
  }
  const first = await inspect(raw, false);
  const accepted = deliver(raw, first, false);
  if (accepted) return accepted;
  if (trace.technicalFailure) return abstain(trace.technicalFailure);
  const blocking = first.verification.findings.find((finding) => finding.severity === "blocking" && finding.candidate);
  const explicit = first.review?.issue?.span;
  const local = explicit ?? (blocking?.candidate && blocking.candidate.length <= 300 && raw.indexOf(blocking.candidate) >= 0 &&
    raw.indexOf(blocking.candidate, raw.indexOf(blocking.candidate) + blocking.candidate.length) < 0 ?
    { start: raw.indexOf(blocking.candidate), end: raw.indexOf(blocking.candidate) + blocking.candidate.length, text: blocking.candidate } : null);
  if (!local) return abstain("no-safe-local-repair");
  if (!config.repairer) { trace.technicalFailure = "repair-unavailable"; return abstain("repair-unavailable"); }
  trace.repairAttempts++;
  try {
    const response = await timed(config.repairer.callStructured(postV3RepairSchema, "post-v3-local-repair", POST_V3_PROMPTS_V1.repair,
      JSON.stringify({ source, candidate: raw, objective, affectedSpan: local, constraint: first.review?.issue?.constraint ?? blocking?.message,
        preserveAuthorizedDeltas: arm === "B" ? validatedDeltas : undefined, objectiveContract: arm === "A" ? contract : undefined,
        retainSafeEditorialWork: arm === "C" })), timeout);
    const parsed = postV3RepairSchema.safeParse(response.data);
    if (!parsed.success) throw new Error("malformed-repair");
    const repaired = raw.slice(0, local.start) + parsed.data.replacement + raw.slice(local.end);
    if (repaired === raw) return abstain("unchanged-repair");
    const second = await inspect(repaired, true);
    return deliver(repaired, second, true) ?? abstain(trace.technicalFailure ?? "repair-rejected");
  } catch (error) { trace.technicalFailure = error instanceof Error ? error.message : "repair-unavailable"; return abstain(trace.technicalFailure); }
}

export const runCandidateA = (request: ReconstructionRequest, objective: string, raw: string, config?: PostV3Config) => runPostV3Candidate("A", request, objective, raw, config);
export const runCandidateB = (request: ReconstructionRequest, objective: string, raw: string, config?: PostV3Config) => runPostV3Candidate("B", request, objective, raw, config);
export const runCandidateC = (request: ReconstructionRequest, objective: string, raw: string, config?: PostV3Config) => runPostV3Candidate("C", request, objective, raw, config);
export const runCandidateD = (request: ReconstructionRequest, objective: string, raw: string, config?: PostV3Config) => runPostV3Candidate("D", request, objective, raw, config);
