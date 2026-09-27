import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import type { AIProvider, ReconstructInput } from "./provider";
import type { Restoration } from "../reconstruction/refinement-delta";
import { applyDemoRules } from "./demo-rules";

/**
 * Keep-wording for the rule engine: swap each listed current sentence for the
 * original wording the plan offers back. Only the RESTORE list is used, so a
 * pattern the plan left out (and the current revision dropped) never returns.
 * Entries that were clipped, or that are several pieces around a cut pattern,
 * cannot be placed mechanically and are skipped.
 */
function restoreListed(current: string, restorations: Restoration[]): string {
  let text = current;
  for (const r of restorations) {
    if (!r.current || r.current.endsWith("…") || r.source.endsWith("…") || r.source.includes(" … ") || !text.includes(r.current)) continue;
    const replacement = r.partial ? r.source.charAt(0).toUpperCase() + r.source.slice(1) : r.source;
    text = text.replace(r.current, replacement);
  }
  return text;
}

/**
 * Used when no API key is configured. Everything it returns is produced by
 * deterministic rules, and it says so: no invented analysis, no fake meaning
 * check. The app stays fully usable for development and demos.
 */
export class DemoProvider implements AIProvider {
  readonly info = { mode: "demo" as const, provider: "demo", model: null };

  async analyzeText() {
    return null;
  }

  async reconstructText(input: ReconstructInput) {
    // Delta refinements anchor to the original: "Keep more of my wording" brings back the listed original wording.
    const restoreOriginal = input.strategy?.refinement === "delta" && Boolean(input.refinement?.directives.includes("keep_wording"));
    const base = restoreOriginal && input.current ? restoreListed(input.current, input.plan.refinementDelta?.restorations ?? []) : (input.current ?? input.source);
    const minimal = input.strategy?.planning.intensity === "enforce" && input.plan.intensity === "minimal";
    const { text, applied } = applyDemoRules(base, input.profile, input.refinement, input.plan.constraints, { minimal });
    return {
      text,
      changes: applied.length ? applied : ["No rule-based edits applied. A connected writing model is needed for a full reconstruction."],
    };
  }

  async verifyMeaning(): Promise<Finding[] | null> {
    return null;
  }

  async analyzeVoiceprint(): Promise<Observation[]> {
    return [];
  }
}
