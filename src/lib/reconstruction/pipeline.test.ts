import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { Finding } from "@/domain/verification";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { DemoProvider } from "../ai/demo";
import { runReconstruction } from "./pipeline";

/** A scripted provider: returns candidates in order and records what it was asked. */
function scripted(candidates: string[], meaning: Finding[] | null | "throw" = null) {
  const calls: ReconstructInput[] = [];
  const provider: AIProvider = {
    info: { mode: "live", provider: "test", model: "test-model" },
    analyzeText: async () => null,
    reconstructText: async (input) => {
      calls.push(input);
      return { text: candidates[Math.min(calls.length - 1, candidates.length - 1)], changes: ["changed"] };
    },
    verifyMeaning: async () => {
      if (meaning === "throw") throw new Error("upstream down");
      return meaning;
    },
    analyzeVoiceprint: async () => [],
  };
  return { provider, calls };
}

const source = "Revenue grew 12% in March, according to Priya's report.";

describe("reconstruction pipeline", () => {
  it("retries a candidate that changes a figure, passing the findings back as feedback", async () => {
    const { provider, calls } = scripted([
      "Revenue grew 15% in March, according to Priya's report.",
      "According to Priya's report, revenue was up 12% in March.",
    ]);
    const result = await runReconstruction({ source, profile: PRESETS.natural }, provider);
    expect(result.attempts).toBe(2);
    expect(result.text).toBe("According to Priya's report, revenue was up 12% in March.");
    expect(calls[1].retryFeedback?.join(" ")).toMatch(/12%/);
    expect(result.verification.status).not.toBe("rejected");
  });

  it("returns the best failing candidate with its findings visible rather than hiding them", async () => {
    const { provider } = scripted(["Revenue grew 15% in May."]);
    const result = await runReconstruction({ source, profile: PRESETS.natural }, provider, { maxAttempts: 2 });
    expect(result.verification.status).toBe("rejected");
    expect(result.verification.findings.some((f) => f.kind === "altered_number")).toBe(true);
  });

  it("verifies refinements against the original source, not the previous result", async () => {
    // The "current" version already lost the name; a refinement that keeps it lost must be caught.
    const { provider, calls } = scripted(["Revenue grew 12% in March, per the report."]);
    const result = await runReconstruction(
      { source, profile: PRESETS.natural, refinement: { current: "Revenue grew 12% in March, per the report.", change: { directives: ["shorter"] } } },
      provider,
      { maxAttempts: 1 },
    );
    expect(result.verification.findings.some((f) => f.kind === "altered_name")).toBe(true);
    expect(calls[0].source).toBe(source);
    expect(calls[0].current).toMatch(/per the report/);
    expect(result.profile.lengthRatio.max).toBeLessThan(PRESETS.natural.lengthRatio.max);
  });

  it("merges model meaning findings and only claims the model check when it ran", async () => {
    const withModel = await runReconstruction(
      { source, profile: PRESETS.natural },
      scripted([source], [{ kind: "changed_assertion", severity: "warning", message: "Softer.", origin: "model" }]).provider,
    );
    expect(withModel.verification.checks).toContain("model_meaning");
    expect(withModel.verification.status).toBe("review");

    const failing = await runReconstruction({ source, profile: PRESETS.natural }, scripted([source], "throw").provider);
    expect(failing.verification.checks).not.toContain("model_meaning");
  });

  it("works end to end with the demo provider and no credentials", async () => {
    const text = "It is worth noting that we do not ship on Fridays. Furthermore, releases need two reviews.";
    const result = await runReconstruction({ source: text, profile: PRESETS.casual }, new DemoProvider());
    expect(result.engine.mode).toBe("demo");
    expect(result.text).toBe("We don't ship on Fridays. Also, releases need two reviews.");
    expect(result.verification.findings.filter((f) => f.severity === "blocking")).toEqual([]);
  });
});
