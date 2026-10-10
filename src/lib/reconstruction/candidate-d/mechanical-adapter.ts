import { sentenceSpans } from "@/lib/analysis/tokenize";
import { classifyObjectiveState } from "./control";
import type { CandidateDEditor } from "./adapter";
import { runCandidateDSafeEditV2, verifyFrozenV15Candidate, type CandidateDSafeEditResult, type FrozenEditReview } from "./safe-edit-adapter";

/** Explicit caller intent, not inferred from command words or case IDs.
 * It identifies prose scope, never licenses a factual replacement. */
export type SentenceEditIntent = {
  kind: "SENTENCE_EDIT";
  source: string;
  objective: string;
  sourceSentence: string;
};
export type CandidateDMechanicalResult = Omit<CandidateDSafeEditResult, "version" | "verificationRoute"> & {
  version: "candidate-d-mechanical-v3";
  verificationRoute: CandidateDSafeEditResult["verificationRoute"] | "V15_SENTENCE_EDIT";
};

export async function runCandidateDMechanicalV3(
  input: Parameters<typeof runCandidateDSafeEditV2>[0] & { sentenceEdit?: SentenceEditIntent },
  editor: CandidateDEditor, reviews: readonly FrozenEditReview[],
): Promise<CandidateDMechanicalResult> {
  const { request, objective, quality, sentenceEdit: intent } = input;
  const state = classifyObjectiveState(request.source, objective, quality);
  const spans = intent && intent.kind === "SENTENCE_EDIT" && intent.source === request.source && intent.objective === objective
    ? sentenceSpans(request.source).filter(span => span.text === intent.sourceSentence) : [];
  // KEEP and REQUIRED_UPDATE always retain their original controller/gate.
  if (state.kind !== "CANNOT_SAFELY_COMPLETE" || state.reason !== "AMBIGUOUS_REPLACEMENT" || spans.length !== 1) {
    const result = await runCandidateDSafeEditV2(input, editor, reviews);
    return { ...result, version: "candidate-d-mechanical-v3" };
  }
  const finish = (text: string | null, reason: string | null, fallback: string | null = null): CandidateDMechanicalResult => ({
    version: "candidate-d-mechanical-v3", state, editorCalls: 1,
    terminal: text === null ? { status: "ABSTAINED", text: null, reason: reason! } : { status: "COMPLETED", text },
    verificationRoute: text === null ? "ABSTAINED" : "V15_SENTENCE_EDIT", rawFallbackReason: fallback,
  });
  let raw: string;
  try { raw = await editor({ source: request.source, objective }); }
  catch { return finish(null, "EDITOR_UNAVAILABLE"); }
  if (typeof raw !== "string" || !raw.trim()) return finish(null, "INVALID_EDITOR_RAW");
  const span = spans[0];
  const prefix = request.source.slice(0, span.start), suffix = request.source.slice(span.end);
  const replacement = raw.slice(prefix.length, raw.length - suffix.length);
  if (!raw.startsWith(prefix) || !raw.endsWith(suffix) || !replacement.trim() ||
    sentenceSpans(replacement).length !== 1)
    return finish(null, "SENTENCE_EDIT_SCOPE_NOT_VERIFIED");
  const checked = await verifyFrozenV15Candidate(request, objective, raw, reviews);
  // No factual-change exceptions, repairs or preservation-only SOURCE fallback.
  if ((checked.trace.outcome === "accepted" || checked.trace.outcome === "unchanged") && checked.text === raw &&
    checked.candidateVerification?.status === "preserved" && checked.trace.authorizedChangeCount === 0)
    return finish(raw, null);
  return finish(null, "SENTENCE_EDIT_NOT_VERIFIED", checked.trace.fallbackReason);
}
