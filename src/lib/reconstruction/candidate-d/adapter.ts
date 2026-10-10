import {
  classifyObjectiveState, selectCandidateDTerminal,
  type ObjectiveState, type SourceQualityAssessment, type Terminal,
} from "./control";

/** Isolated control version; unrelated to the older post-V3 arm named D. */
export const CANDIDATE_D_CONTROL_VERSION = "candidate-d-control-v1";
export type CandidateDResult = {
  version: typeof CANDIDATE_D_CONTROL_VERSION;
  state: ObjectiveState;
  terminal: Exclude<Terminal, { status: "NEEDS_EDITOR" | "ABSTAINED" }> |
    { status: "ABSTAINED"; text: null; reason: string };
  editorCalls: number;
};
export type CandidateDEditor = (input: Readonly<{ source: string; objective: string }>) => Promise<string>;

/** Classify before invoking the editor. No fallback can publish stale SOURCE.
 * EDIT is deliberately unsupported by this version's completion verifier.
 * A frozen RAW callback can exercise the exact same adapter without a model. */
export async function runCandidateDControlV1(input: {
  source: string; objective: string; quality?: SourceQualityAssessment;
}, editor: CandidateDEditor): Promise<CandidateDResult> {
  const state = classifyObjectiveState(input.source, input.objective, input.quality);
  const finish = (terminal: CandidateDResult["terminal"], editorCalls: number): CandidateDResult =>
    ({ version: CANDIDATE_D_CONTROL_VERSION, state, terminal, editorCalls });
  if (state.kind === "KEEP") return finish({ status: "KEEP", text: state.source }, 0);
  if (state.kind === "CANNOT_SAFELY_COMPLETE")
    return finish({ status: "ABSTAINED", text: null, reason: state.reason }, 0);
  let raw: string;
  try {
    raw = await editor({ source: state.source, objective: state.objective });
    if (typeof raw !== "string" || !raw.trim())
      return finish({ status: "ABSTAINED", text: null, reason: "INVALID_EDITOR_RAW" }, 1);
  } catch {
    // Never expose provider errors or document text in an error/telemetry payload.
    return finish({ status: "ABSTAINED", text: null, reason: "EDITOR_UNAVAILABLE" }, 1);
  }
  const terminal = selectCandidateDTerminal(state, raw);
  if (terminal.status === "NEEDS_EDITOR")
    return finish({ status: "ABSTAINED", text: null, reason: "EDIT_VERIFICATION_UNSUPPORTED" }, 1);
  if (terminal.status === "ABSTAINED")
    return finish({ status: "ABSTAINED", text: null, reason: terminal.reason }, 1);
  return finish({ status: "COMPLETED", text: raw }, 1);
}
