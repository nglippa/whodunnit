import type { ReconstructionRequest } from "@/domain/document";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runDirectiveScopedTemporalReconstruction } from "../verified-reconstruction";
import { classifyObjectiveState, type SourceQualityAssessment } from "./control";
import { runCandidateDControlV1, type CandidateDEditor, type CandidateDResult } from "./adapter";

export const CANDIDATE_D_SAFE_EDIT_VERSION = "candidate-d-safe-edit-v2";
/** Offline evidence, bound to the exact text that V15 reviewed. A review of
 * RAW must never be reused as a review of a fallback or a repaired document. */
export type FrozenEditReview = {
  source: string; objective: string; candidate: string; review: unknown;
};
export type CandidateDSafeEditResult = Omit<CandidateDResult, "version"> & {
  version: typeof CANDIDATE_D_SAFE_EDIT_VERSION;
  verificationRoute: "CONTROL_V1" | "V15_RAW" | "V15_SOURCE" | "ABSTAINED";
  rawFallbackReason: string | null;
};

/** Reexecute unchanged V15 verification using only exact-bound frozen evidence. */
export async function verifyFrozenV15Candidate(request: ReconstructionRequest, objective: string,
  candidate: string, reviews: readonly FrozenEditReview[]) {
  const info = { mode: "demo" as const, provider: "frozen-candidate-d", model: null };
  const generationReport = () => ({ applied: [], unsupported: [], declared: [] });
  const verifier: StructuredCaller = {
    info, generationReport,
    async callStructured(schema, name, _system, user) {
      const payload = JSON.parse(user) as { source: string; objective: string; candidate: string };
      const bound = reviews.filter(item => item.source === payload.source && item.objective === payload.objective && item.candidate === payload.candidate);
      if (name !== "candidate-verifier" || bound.length !== 1) throw new Error("No unique exact-text frozen review");
      return { data: schema.parse(bound[0].review), meta: {} };
    },
  };

  const savedEditor: StructuredCaller = {
    info, generationReport,
    async callStructured(schema, name) {
      if (name !== "frontier-editor") throw new Error("Unexpected frozen stage");
      return { data: schema.parse({ text: candidate, changes: [] }), meta: {} };
    },
  };
  return runDirectiveScopedTemporalReconstruction(request, objective, { editor: savedEditor, verifier });
}

/** Offline thin route. The editor and required-update gate are unchanged.
 * V15 rechecks ordinary RAW deterministically, schema-validates its saved
 * semantic review, and checks voice/objective completion. No saved FINAL or
 * benchmark safety label is an input to selection. SOURCE needs its own check. */
export async function runCandidateDSafeEditV2(input: {
  request: ReconstructionRequest; objective: string; quality?: SourceQualityAssessment;
}, editor: CandidateDEditor, reviews: readonly FrozenEditReview[]): Promise<CandidateDSafeEditResult> {
  const { request, objective, quality } = input;
  const state = classifyObjectiveState(request.source, objective, quality);
  if (state.kind !== "EDIT") {
    const result = await runCandidateDControlV1({ source: request.source, objective, quality }, editor);
    return { ...result, version: CANDIDATE_D_SAFE_EDIT_VERSION, verificationRoute: "CONTROL_V1", rawFallbackReason: null };
  }
  const finish = (terminal: CandidateDResult["terminal"], route: CandidateDSafeEditResult["verificationRoute"], reason: string | null): CandidateDSafeEditResult =>
    ({ version: CANDIDATE_D_SAFE_EDIT_VERSION, state, terminal, editorCalls: 1, verificationRoute: route, rawFallbackReason: reason });
  let raw: string;
  try {
    raw = await editor({ source: request.source, objective });
    if (typeof raw !== "string" || !raw.trim())
      return finish({ status: "ABSTAINED", text: null, reason: "INVALID_EDITOR_RAW" }, "ABSTAINED", null);
  } catch {
    return finish({ status: "ABSTAINED", text: null, reason: "EDITOR_UNAVAILABLE" }, "ABSTAINED", null);
  }
  const verify = (candidate: string) => verifyFrozenV15Candidate(request, objective, candidate, reviews);
  const checked = await verify(raw);
  // V15 SOURCE fallback is intentionally not counted as a verified result.
  if ((checked.trace.outcome === "accepted" || checked.trace.outcome === "unchanged") && checked.text === raw)
    return finish({ status: "COMPLETED", text: raw }, raw === request.source ? "V15_SOURCE" : "V15_RAW", null);
  const sourceChecked = raw === request.source ? checked : await verify(request.source);
  if (sourceChecked.trace.outcome === "unchanged" && sourceChecked.text === request.source)
    return finish({ status: "COMPLETED", text: request.source }, "V15_SOURCE", checked.trace.fallbackReason);
  return finish({ status: "ABSTAINED", text: null, reason: "EDIT_AND_SOURCE_NOT_VERIFIED" }, "ABSTAINED", checked.trace.fallbackReason);
}
