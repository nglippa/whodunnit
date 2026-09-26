import type { Finding } from "@/domain/verification";
import type { Observation } from "@/domain/voiceprint";
import type { AIProvider, ReconstructInput } from "./provider";
import { applyDemoRules } from "./demo-rules";

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
    const base = input.current ?? input.source;
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
