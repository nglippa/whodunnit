import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { computeVoiceprintStats } from "../voiceprints/aggregate";
import { compareVoiceDevices, sourceVoiceProfile } from "../semantics/voice-devices";
import { rulesForProfile } from "../rules/packs";
import { comparePatterns } from "./postcheck";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V3 } from "./strategies";

const anaphora = [
  "I remember the red bike leaning against the garden wall after the storm.",
  "I remember how the chain caught on the loose stone when we tried to move it.",
  "I remember my father finding the old wrench in the shed and handing it to me without a word.",
  "We worked until the light had gone from the yard.",
  "The bike stayed there until morning because neither of us wanted to scratch the fresh paint.",
  "After breakfast we carried it inside together.",
  "I kept the wrench in the drawer by the back door.",
  "Nobody mentioned that evening again, though we both knew where the bike had been.",
].join(" ");

describe("repeated openings as voice evidence", () => {
  it("keeps a substantive repeated opening in a clean source", () => {
    const plan = buildRewritePlan({ source: anaphora, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(plan.sourceVoice.repeatedOpening).toBe("i remember");
    expect(plan.permitted).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "core.repeated-sentence-openers" })]));
    expect(plan.avoid.map((p) => p.ruleId)).not.toContain("core.repeated-sentence-openers");
    expect(plan.minimalChange.unchangedPreferred).toBe(true);
    expect(compareVoiceDevices(anaphora, anaphora.replaceAll("I remember", "I recall"), 0).deviations)
      .toEqual(expect.arrayContaining([expect.objectContaining({ device: "repeated-opening", change: "erased" })]));
  });

  it("lets a confident Voiceprint protect a repeated opening under the production planner", () => {
    const measured = computeVoiceprintStats([{ text: anaphora }, { text: anaphora.replace("garden wall", "back fence") }])!;
    expect(measured.stats.recurringOpeners).toContain("i remember");
    const vp: Voiceprint = {
      id: "v", name: "Personal notes", description: "", sampleCount: 2, totalWords: measured.totalWords,
      confidence: 0.9, observations: [], stats: measured.stats,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const plan = buildRewritePlan({ source: anaphora, profile: PRESETS.natural, voiceprint: vp }, RECONSTRUCTION_V1);
    expect(plan.permitted.find((p) => p.ruleId === "core.repeated-sentence-openers")?.reason).toMatch(/Voiceprint/);
  });

  it("does not excuse a different repeated opening introduced by the candidate", () => {
    const plan = buildRewritePlan({ source: anaphora, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    const candidate = anaphora.replaceAll("I remember", "We stayed");
    expect(comparePatterns(plan, candidate, rulesForProfile(PRESETS.natural)).introduced.map((p) => p.ruleId))
      .toContain("core.repeated-sentence-openers");
  });

  it("treats short or stock repetition as uncertain", () => {
    expect(sourceVoiceProfile("It is clear. It is plain. It is settled.", 0).repeatedOpening).toBeNull();
    expect(sourceVoiceProfile("I remember the hall. I remember the door. I remember the rain.", 0).repeatedOpening).toBeNull();
  });

  it("carries a seven-sentence habit even before the general repetition detector fires", () => {
    const source = anaphora.split(". ").slice(0, 7).join(". ");
    const plan = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(plan.sourceVoice.repeatedOpening).toBe("i remember");
    expect(plan.avoid.map((p) => p.ruleId)).not.toContain("core.repeated-sentence-openers");
    expect(plan.preferredPatterns).toContain("sentences opening with “i remember”");
  });
});
