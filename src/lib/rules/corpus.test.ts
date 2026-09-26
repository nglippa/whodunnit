import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { applyDemoRules } from "../ai/demo-rules";
import { lexicalCoverage } from "../verification/verify";
import { constraintsFromVoiceprint } from "./constraints";
import { analyzeWriting } from "./engine";
import { rulesForProfile } from "./packs";

/**
 * Real-world validation on the prose corpus in data/fixtures/prose:
 * A formulaic, B ordinary, C casual, D academic, E professional, F stylised.
 */

const read = (f: string) => readFileSync(join(process.cwd(), "data/fixtures/prose", f), "utf8");
const A = read("a-formulaic.md");
const clean = { B: read("b-ordinary.md"), C: read("c-casual.md"), D: read("d-academic.md"), E: read("e-professional.md") };
const F = read("f-stylized.md");
const natural = rulesForProfile(PRESETS.natural);

describe("prose corpus", () => {
  it("finds many patterns across several categories in formulaic prose", () => {
    const a = analyzeWriting(A, natural);
    expect(a.summary.patternCount).toBeGreaterThanOrEqual(12);
    expect(Object.keys(a.summary.byCategory).length).toBeGreaterThanOrEqual(4);
    const ids = a.findings.map((f) => f.rule.id);
    for (const id of ["slop.announcements", "slop.not-x-its-y", "slop.throat-clearing", "slop.faux-insight", "core.repeated-transitions", "slop.fake-profound-ending", "slop.summary-openers", "slop.self-answered-questions", "slop.negative-listing"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("stays quiet on ordinary, casual, academic and professional prose", () => {
    for (const [name, text] of Object.entries(clean)) {
      const a = analyzeWriting(text, natural);
      expect(a.summary.patternCount, `${name}: ${a.findings.map((f) => f.rule.id).join(", ")}`).toBe(0);
    }
  });

  it("flags only the deliberate devices in stylised prose", () => {
    const ids = analyzeWriting(F, natural).findings.map((f) => f.rule.id).sort();
    expect(ids).toEqual(["slop.dash-density", "slop.dramatic-fragments"]);
  });
});

describe("precedence: a strong Voiceprint keeps the author's habits", () => {
  const vp = (confidence: number): Voiceprint => {
    const m = (value: number) => ({ value, confidence });
    return {
      id: "v",
      name: "Novelist",
      description: "",
      sampleCount: 5,
      totalWords: 4000,
      confidence,
      observations: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      stats: {
        sentences: { meanLength: m(9), lengthStdDev: m(8), questionRate: m(0), fragmentRate: m(0.3) },
        vocabulary: { meanWordLength: m(4.2), longWordRate: m(0.1), lexicalVariety: m(0.8), contractionRate: m(1), firstPersonRate: m(0.5), hedgeRate: m(0.5) },
        punctuation: { commasPer100: m(6), dashesPer100: m(2.5), semicolonsPer100: m(0), parenthesesPer100: m(0), exclamationsPer100: m(0) },
        structure: { meanParagraphSentences: m(4), transitionOpenerRate: m(0) },
        recurringOpeners: [],
        recurringPhrases: [],
      },
    };
  };

  it("suppresses dash and fragment rules when the author's measured habits cover them", () => {
    const a = analyzeWriting(F, natural, { constraints: constraintsFromVoiceprint(vp(0.8)) });
    const suppressed = a.findings.filter((f) => f.suppressedBy).map((f) => f.rule.id).sort();
    expect(suppressed).toEqual(["slop.dash-density", "slop.dramatic-fragments"]);
    expect(a.summary.patternCount).toBe(0);
    expect(a.findings.find((f) => f.rule.id === "slop.dash-density")?.suppressedBy?.reason).toMatch(/Voiceprint “Novelist”/);
  });

  it("weak Voiceprint evidence does not override the general rules", () => {
    const a = analyzeWriting(F, natural, { constraints: constraintsFromVoiceprint(vp(0.45)) });
    expect(a.findings.filter((f) => f.suppressedBy)).toEqual([]);
    expect(a.summary.patternCount).toBe(2);
  });

  it("does not suppress when the text exceeds even the author's own range", () => {
    const heavy = F + "\n\n" + "Then — suddenly — the door — the hallway — the stairs — all at once — gone.";
    const a = analyzeWriting(heavy, natural, { constraints: constraintsFromVoiceprint(vp(0.8)) });
    expect(a.findings.find((f) => f.rule.id === "slop.dash-density")?.suppressedBy).toBeUndefined();
  });
});

describe("naturalness is not flattening", () => {
  it("demo reconstruction leaves clean prose nearly untouched and keeps the texts distinct", () => {
    const before: [string, number][] = [];
    const after: [string, number][] = [];
    for (const [name, text] of Object.entries({ ...clean, F })) {
      const out = applyDemoRules(text, PRESETS.natural).text;
      expect(lexicalCoverage(text, out), name).toBeGreaterThan(0.95);
      const b = analyzeWriting(text, natural).metrics.sentenceLength.mean;
      const a = analyzeWriting(out, natural).metrics.sentenceLength.mean;
      // Each voice keeps its own rhythm...
      expect(Math.abs(a - b), name).toBeLessThanOrEqual(1.5);
      before.push([name, b]);
      after.push([name, a]);
    }
    // ...and the texts keep their order relative to each other: nothing converges on one house style.
    const order = (xs: [string, number][]) => [...xs].sort((x, y) => x[1] - y[1]).map((x) => x[0]);
    expect(order(after)).toEqual(order(before));
  });

  it("never introduces typos, slang or new facts: demo output words all come from the source or the transform maps", () => {
    const out = applyDemoRules(A, PRESETS.casual).text;
    const srcWords = new Set(A.toLowerCase().match(/[a-z']+/g));
    const allowed = new Set(["also", "use", "look", "at", "to", "because", "now", "many", "if", "before", "don't", "it's", "we're", "they're", "isn't", "aren't", "so", "but", "that's", "there's", "can't", "won't"]);
    const novel = (out.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => !srcWords.has(w) && !allowed.has(w));
    expect(novel).toEqual([]);
  });
});
