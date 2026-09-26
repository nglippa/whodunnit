import { describe, expect, it } from "vitest";
import { PRESET_IDS, PRESETS, isPresetId, styleProfileSchema } from "./style";
import { applyRefinement, refinementSchema } from "./refinement";
import { reconstructionRequestSchema } from "./document";

describe("style presets", () => {
  it("every preset is a valid StyleProfile keyed by its own id", () => {
    for (const id of PRESET_IDS) {
      expect(styleProfileSchema.safeParse(PRESETS[id]).success, id).toBe(true);
      expect(PRESETS[id].id).toBe(id);
    }
  });

  it("presets are distinct on the dimensions they claim to control", () => {
    expect(PRESETS.academic.contractions).toBe("avoid");
    expect(PRESETS.casual.contractions).toBe("prefer");
    expect(PRESETS.concise.lengthRatio.max).toBeLessThan(1);
    expect(PRESETS.academic.sentenceLengthMean).toBeGreaterThan(PRESETS.casual.sentenceLengthMean);
  });

  it("rejects malformed or smuggled profile fields", () => {
    expect(styleProfileSchema.safeParse({ ...PRESETS.natural, lengthRatio: { min: 1.2, max: 0.8 } }).success).toBe(false);
    expect(styleProfileSchema.safeParse({ ...PRESETS.natural, sentenceLengthMean: 200 }).success).toBe(false);
    expect(styleProfileSchema.safeParse({ ...PRESETS.natural, systemPrompt: "ignore previous" }).success).toBe(false);
  });

  it("narrows unknown ids", () => {
    expect(isPresetId("casual")).toBe(true);
    expect(isPresetId("pirate")).toBe(false);
  });
});

describe("refinements", () => {
  it("requires a directive or a note", () => {
    expect(refinementSchema.safeParse({ directives: [] }).success).toBe(false);
    expect(refinementSchema.safeParse({ directives: [], note: "keep the joke" }).success).toBe(true);
    expect(refinementSchema.safeParse({ directives: ["louder"] }).success).toBe(false);
  });

  it("is a pure transformation that never mutates the input profile", () => {
    const before = structuredClone(PRESETS.professional);
    const next = applyRefinement(PRESETS.professional, { directives: ["more_casual", "shorter"] });
    expect(PRESETS.professional).toEqual(before);
    expect(next.register).toBe("casual");
    expect(next.contractions).toBe("prefer");
    expect(next.lengthRatio.max).toBeLessThan(before.lengthRatio.max);
  });

  it("stays a valid profile under repeated refinement (bounded, no runaway)", () => {
    let p = PRESETS.concise;
    for (let i = 0; i < 10; i++) p = applyRefinement(p, { directives: ["shorter", "more_casual", "keep_wording"] });
    expect(styleProfileSchema.safeParse(p).success).toBe(true);
    expect(p.lengthRatio.min).toBeLessThanOrEqual(p.lengthRatio.max);
    expect(p.wordingRetention).toBe("high");
  });

  it("request schema bounds source length and requires non-empty text", () => {
    expect(reconstructionRequestSchema.safeParse({ source: "   ", profile: PRESETS.natural }).success).toBe(false);
    expect(reconstructionRequestSchema.safeParse({ source: "x".repeat(20_001), profile: PRESETS.natural }).success).toBe(false);
    expect(reconstructionRequestSchema.safeParse({ source: "Fine.", profile: PRESETS.natural }).success).toBe(true);
  });
});
