import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import type { RuleFinding } from "@/domain/writing-rules";
import {
  applyPrecedence,
  constraintsFromProfile,
  constraintsFromRefinement,
  constraintsFromVoiceprint,
  resolveConstraints,
  type TargetConstraint,
} from "./constraints";
import { computeMetrics } from "./metrics";
import { indexText } from "./text-index";

const vp = (contractions: { value: number; confidence: number }): Voiceprint => {
  const m = (value: number, confidence = 0.9) => ({ value, confidence });
  return {
    id: "v",
    name: "Me",
    description: "",
    sampleCount: 4,
    totalWords: 3000,
    confidence: 0.8,
    observations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stats: {
      sentences: { meanLength: m(14), lengthStdDev: m(8.4), questionRate: m(0.1, 0.2), fragmentRate: m(0.05) },
      vocabulary: { meanWordLength: m(4.4), longWordRate: m(0.15), lexicalVariety: m(0.8), contractionRate: contractions, firstPersonRate: m(3), hedgeRate: m(1) },
      punctuation: { commasPer100: m(5), dashesPer100: m(1.5), semicolonsPer100: m(0), parenthesesPer100: m(0.2), exclamationsPer100: m(0) },
      structure: { meanParagraphSentences: m(3), transitionOpenerRate: m(0.02) },
      recurringOpeners: [],
      recurringPhrases: [],
    },
  };
};

describe("Voiceprint constraints", () => {
  it("become ranges around measured values, not exact targets", () => {
    const c = constraintsFromVoiceprint(vp({ value: 3, confidence: 0.9 })).find((x) => x.dimension === "voice.contractions")!;
    expect(c.min).toBeLessThan(3);
    expect(c.max).toBeGreaterThan(3);
    expect(c.strength).toBe(0.9);
  });

  it("widen as confidence falls, and weak evidence exerts no pressure at all", () => {
    const strong = constraintsFromVoiceprint(vp({ value: 3, confidence: 0.9 })).find((x) => x.dimension === "voice.contractions")!;
    const weak = constraintsFromVoiceprint(vp({ value: 3, confidence: 0.4 })).find((x) => x.dimension === "voice.contractions")!;
    expect(weak.max - weak.min).toBeGreaterThan(strong.max - strong.min);
    expect(constraintsFromVoiceprint(vp({ value: 3, confidence: 0.2 })).find((x) => x.dimension === "voice.contractions")).toBeUndefined();
    // questionRate was measured at 0.2 confidence in the fixture: omitted.
    expect(constraintsFromVoiceprint(vp({ value: 3, confidence: 0.9 })).some((x) => x.dimension === "voice.questions")).toBe(false);
  });

  it("derive sentence-length variation (CV) from the measured spread", () => {
    const cv = constraintsFromVoiceprint(vp({ value: 3, confidence: 0.9 })).find((x) => x.dimension === "rhythm.sentence-variation")!;
    expect(cv.min).toBeLessThan(0.6);
    expect(cv.max).toBeGreaterThan(0.6); // 8.4 / 14
  });
});

describe("precedence", () => {
  it("user instruction beats a strong Voiceprint, which beats the style", () => {
    const all: TargetConstraint[] = [
      ...constraintsFromProfile(PRESETS.academic), // contractions 0–0.2
      ...constraintsFromVoiceprint(vp({ value: 3, confidence: 0.9 })), // contractions ~2–4
      ...constraintsFromRefinement({ directives: ["more_casual"] }), // contractions 1–8, user
    ];
    const { active, overridden } = resolveConstraints(all);
    const c = active.find((x) => x.dimension === "voice.contractions")!;
    expect(c.layer).toBe("user-instruction");
    expect(overridden.filter((o) => o.constraint.dimension === "voice.contractions").map((o) => o.constraint.layer)).toEqual(["voiceprint", "style"]);
  });

  it("a weak Voiceprint loses to the style", () => {
    const all = [...constraintsFromProfile(PRESETS.academic), ...constraintsFromVoiceprint(vp({ value: 3, confidence: 0.45 }))];
    expect(resolveConstraints(all).active.find((x) => x.dimension === "voice.contractions")!.layer).toBe("style");
  });

  it("never suppresses semantic-safety rules", () => {
    const metrics = computeMetrics(indexText("We shipped — finally — on Friday — and — then."));
    const finding = {
      rule: { id: "safety.x", name: "x", description: "", category: "semantic-safety", severity: "warning", determinism: "deterministic", dimension: "punctuation.dashes", source: { type: "builtin", relation: "original" }, layer: "semantic-safety", guidance: "", packId: "semantic-safety" },
      matches: [{ ruleId: "safety.x", start: 0, end: 1, excerpt: "x", confidence: 1, evidence: "" }],
    } as RuleFinding;
    const [f] = applyPrecedence([finding], [{ dimension: "punctuation.dashes", min: 0, max: 99, layer: "user-instruction", strength: 1, origin: "Your request", unit: "" }], metrics);
    expect(f.suppressedBy).toBeUndefined();
  });

  it("maps style presets to typed ranges", () => {
    const casual = constraintsFromProfile(PRESETS.casual);
    expect(casual.find((x) => x.dimension === "voice.contractions")).toMatchObject({ min: 1, max: 8, layer: "style" });
    expect(constraintsFromProfile(PRESETS.professional).find((x) => x.dimension === "voice.hedging")).toMatchObject({ min: 0, max: 1.5 });
  });
});
