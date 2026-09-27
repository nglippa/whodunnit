import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rewriteStrategySchema, strategyKey } from "@/domain/strategy";
import { PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { COMPILE_PROMPT, COMPILE_SYSTEM } from "../sources/model-compile";
import { PROMPTS, PROMPT_VERSIONS, getPrompt, reconstructUserPrompt, renderContract } from "../prompts";
import { buildRewritePlan } from "./rewrite-plan";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V1, RECONSTRUCTION_V2, STRATEGIES, getStrategy } from "./strategies";

describe("RewriteStrategy", () => {
  it("validates every published strategy and gives each a unique, versioned key", () => {
    for (const s of STRATEGIES) expect(rewriteStrategySchema.safeParse(s).success, strategyKey(s)).toBe(true);
    expect(STRATEGIES.map(strategyKey)).toEqual(["reconstruction-v1", "reconstruction-v2", "reconstruction-v3"]);
    expect(new Set(STRATEGIES.map(strategyKey)).size).toBe(STRATEGIES.length);
  });

  it("keeps production on v1, which encodes the behaviour that shipped before strategies existed", () => {
    expect(DEFAULT_STRATEGY).toBe(RECONSTRUCTION_V1);
    expect(RECONSTRUCTION_V1).toMatchObject({
      status: "production",
      prompt: { id: "reconstruct", version: 2 },
      planning: { mode: "full-contract", intensity: "record-only" },
      retryPolicy: { maxAttemptsLive: 3, maxAttemptsDemo: 1, retryOn: ["blocking-meaning", "introduced-deterministic-pattern"] },
      postCheckPolicy: { modelMeaning: "when-deterministic-passes", claimsExtractionMinWords: 60 },
    });
    expect(RECONSTRUCTION_V2.status).toBe("experimental");
  });

  it("is immutable: a published strategy cannot be edited in place", () => {
    expect(Object.isFrozen(RECONSTRUCTION_V1)).toBe(true);
    expect(Object.isFrozen(RECONSTRUCTION_V1.retryPolicy)).toBe(true);
    expect(() => {
      (RECONSTRUCTION_V1.retryPolicy as { maxAttemptsLive: number }).maxAttemptsLive = 9;
    }).toThrow();
  });

  it("rejects malformed strategies and unknown keys", () => {
    expect(rewriteStrategySchema.safeParse({ ...RECONSTRUCTION_V1, prompt: { id: "verify", version: 1 } }).success).toBe(false);
    expect(rewriteStrategySchema.safeParse({ ...RECONSTRUCTION_V1, version: 0 }).success).toBe(false);
    expect(rewriteStrategySchema.safeParse({ ...RECONSTRUCTION_V1, hidden: true }).success).toBe(false);
    expect(() => getStrategy("reconstruction-v9")).toThrow(/Known: reconstruction-v1/);
  });
});

/**
 * Prompt identity. Each entry pins a fingerprint of the system text: if you
 * edit a prompt, add a NEW version instead of changing this table.
 * reconstruct.v2 matches the prompt that shipped before strategies existed.
 */
const PINNED: Record<string, string> = {
  "reconstruct.v2": "24326144663e6a8f",
  "reconstruct.v3": "349fc9a84d9c3c71",
  "reconstruct.v4": "9e59611eb3fb6f63",
  "analyze.v1": "e8c46358ef4e2630",
  "verify.v1": "f028bf96cd4bd029",
  "voiceprint.v1": "f42802ee70bf6603",
  "compile.v1": "d97560f1ff82a5d9",
  "judge.v1": "befe7f6c6521c4da",
  "judge.v2": "8c030e10cd17ae61",
};
const fp = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

describe("prompt versions", () => {
  const all = [...PROMPTS.map((p) => ({ key: p.key, system: p.system })), { key: `${COMPILE_PROMPT.id}.v${COMPILE_PROMPT.version}`, system: COMPILE_SYSTEM }];

  it("have explicit, unique identities that strategies resolve to", () => {
    expect(new Set(all.map((p) => p.key)).size).toBe(all.length);
    for (const s of STRATEGIES) expect(getPrompt(s.prompt).key).toBe(`reconstruct.v${s.prompt.version}`);
    expect(PROMPT_VERSIONS.reconstruct).toBe(getPrompt(DEFAULT_STRATEGY.prompt).key);
  });

  it("cannot change text without a version bump", () => {
    for (const p of all) expect(fp(p.system), `${p.key} changed: add a new version instead`).toBe(PINNED[p.key]);
  });
});

describe("reconstruction contract", () => {
  const source =
    'It is worth noting that Priya Raman shipped the March 3 release. Furthermore, costs fell 12%. Moreover, she said "the boring parts got boring." We did not miss a date. See https://example.org/r.';
  const vp: Voiceprint = {
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
      sentences: { meanLength: { value: 14, confidence: 0.9 }, lengthStdDev: { value: 8, confidence: 0.9 }, questionRate: { value: 0.1, confidence: 0.2 }, fragmentRate: { value: 0.05, confidence: 0.9 } },
      vocabulary: { meanWordLength: { value: 4.4, confidence: 0.9 }, longWordRate: { value: 0.15, confidence: 0.9 }, lexicalVariety: { value: 0.8, confidence: 0.9 }, contractionRate: { value: 3, confidence: 0.9 }, firstPersonRate: { value: 3, confidence: 0.9 }, hedgeRate: { value: 1, confidence: 0.9 } },
      punctuation: { commasPer100: { value: 5, confidence: 0.9 }, dashesPer100: { value: 1.5, confidence: 0.9 }, semicolonsPer100: { value: 0, confidence: 0.9 }, parenthesesPer100: { value: 0.2, confidence: 0.9 }, exclamationsPer100: { value: 0, confidence: 0.9 } },
      structure: { meanParagraphSentences: { value: 3, confidence: 0.9 }, transitionOpenerRate: { value: 0.02, confidence: 0.9 } },
      recurringOpeners: [],
      recurringPhrases: [],
    },
  };

  it("serialises semantic anchors, Voiceprint ranges and advisory guidance in separate sections", () => {
    const plan = buildRewritePlan({ source, profile: PRESETS.natural, voiceprint: vp });
    const c = renderContract(plan);
    const preserve = c.slice(c.indexOf("PRESERVE"), c.indexOf("TARGET RANGES"));
    for (const anchor of ["12%", "Priya Raman", "the boring parts got boring.", "https://example.org/r", "negations in the source: 1"]) expect(preserve).toContain(anchor);
    expect(c).toMatch(/contractions: [\d.]+ → [\d.]+–[\d.]+ per 100 words \[\w+; Voiceprint “Me”, strength 0\.9\]/);
    const advisory = c.slice(c.indexOf("ADVISORY:"));
    const prohibited = c.slice(c.indexOf("DO NOT INTRODUCE"), c.indexOf("ADVISORY:"));
    expect(advisory).toMatch(/Preserve the writer's voice/);
    expect(prohibited).not.toMatch(/Preserve the writer's voice/);
  });

  it("puts the author's refinement above the style and the Voiceprint", () => {
    const plan = buildRewritePlan({ source, profile: PRESETS.academic, voiceprint: vp, refinement: { directives: ["more_casual"] } });
    expect(renderContract(plan)).toMatch(/contractions: .*\[\w+; Your request, strength 1\]/);
    expect(plan.overridden.filter((o) => o.dimension === "voice.contractions").map((o) => o.by)).toEqual(["Your request", "Your request"]);
  });

  it("never dumps the source into the contract; the prompt carries it once, after the contract", () => {
    const plan = buildRewritePlan({ source, profile: PRESETS.natural });
    expect(renderContract(plan)).not.toContain("shipped the March 3 release");
    const prompt = reconstructUserPrompt({ source, plan });
    expect(prompt.split("shipped the March 3 release").length - 1).toBe(1);
    expect(prompt.indexOf("<source>")).toBeGreaterThan(prompt.indexOf("RECONSTRUCTION CONTRACT"));
  });

  it("v2 renders exactly the pre-strategy contract; v3 adds the intensity", () => {
    const plan = buildRewritePlan({ source, profile: PRESETS.natural });
    expect(renderContract(plan)).toBe(renderContract(plan, { id: "reconstruct", version: 2 }));
    expect(renderContract(plan)).not.toContain("INTENSITY");
    expect(renderContract(plan, { id: "reconstruct", version: 3 })).toMatch(/INTENSITY: (minimal|normal|substantial) \(/);
    expect(reconstructUserPrompt({ source, plan, prompt: RECONSTRUCTION_V2.prompt })).toContain("INTENSITY:");
  });
});
