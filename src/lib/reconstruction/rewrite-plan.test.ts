import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { DemoProvider } from "../ai/demo";
import { renderContract, reconstructUserPrompt } from "../prompts";
import { rulesForProfile } from "../rules/packs";
import { applyRuleTransforms, collapseAdditiveOpeners } from "../rules/transforms";
import { analyzeWriting } from "../rules/engine";
import { runReconstruction } from "./pipeline";
import { comparePatterns } from "./postcheck";
import { buildRewritePlan, summarizePlan } from "./rewrite-plan";

const A = readFileSync(join(process.cwd(), "data/fixtures/prose/a-formulaic.md"), "utf8");
const source =
  'It is worth noting that Priya Raman shipped the March 3 release. Furthermore, costs fell 12%. Moreover, she said "the boring parts got boring." We did not miss a date.';

describe("RewritePlan", () => {
  const plan = buildRewritePlan({ source, profile: PRESETS.casual });

  it("lists semantic anchors extracted from the source", () => {
    expect(plan.preserve.numbers).toEqual(expect.arrayContaining(["3", "12%"]));
    expect(plan.preserve.dates).toContain("march");
    expect(plan.preserve.names).toContain("Priya Raman");
    expect(plan.preserve.quotations).toEqual(["the boring parts got boring."]);
    expect(plan.preserve.negations).toBe(1);
    expect(plan.mustNotAlter.join(" ")).toMatch(/Figures preserved/);
  });

  it("lists detected patterns with short examples and guidance, and prohibits the rest", () => {
    const ids = plan.avoid.map((a) => a.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["slop.announcements", "core.repeated-transitions"]));
    expect(plan.avoid.every((a) => a.guidance.length > 0 && a.examples.every((e) => e.length <= 90))).toBe(true);
    const prohibited = plan.prohibitedPatterns.map((p) => p.ruleId);
    expect(prohibited).toContain("slop.not-x-its-y");
    expect(prohibited).not.toContain("slop.announcements");
  });

  it("carries target ranges with the direction to move", () => {
    const contractions = plan.targetRanges.find((t) => t.dimension === "voice.contractions")!;
    expect(contractions).toMatchObject({ min: 1, max: 8, action: "raise", origin: "Casual style" });
  });

  it("renders a structured contract, not the source documents or rule packs", () => {
    const contract = renderContract(plan);
    for (const section of ["PRESERVE", "TARGET RANGES", "PATTERNS FOUND", "DO NOT INTRODUCE"]) expect(contract).toContain(section);
    expect(contract).not.toContain("<source>");
    expect(contract.length).toBeLessThan(6000);
    const prompt = reconstructUserPrompt({ source, plan });
    expect(prompt.indexOf("<source>")).toBeGreaterThan(prompt.indexOf("RECONSTRUCTION CONTRACT"));
  });

  it("summarises for the UI in a few short lines", () => {
    const lines = summarizePlan(plan);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines.join(" ")).toMatch(/Rework: Announcing a point/);
  });
});

describe("post-rewrite comparison", () => {
  it("reports resolved, remaining and introduced patterns, and target movement", () => {
    const plan = buildRewritePlan({ source: A, profile: PRESETS.natural });
    const rules = rulesForProfile(PRESETS.natural);
    const candidate = "Priya said the plan works. Let's delve into the details. It is worth noting that costs fell.";
    const p = comparePatterns(plan, candidate, rules);
    expect(p.before).toBeGreaterThan(p.after);
    expect(p.resolved.map((r) => r.ruleId)).toContain("slop.throat-clearing");
    expect(p.remaining.map((r) => r.ruleId)).toContain("slop.announcements");
    expect(p.introduced).toEqual([]);
    const fresh = comparePatterns(buildRewritePlan({ source: "Costs fell 12% last year.", profile: PRESETS.natural }), "Here's the thing: costs fell 12% last year.", rules);
    expect(fresh.introduced).toEqual([expect.objectContaining({ ruleId: "slop.throat-clearing", deterministic: true })]);
  });
});

describe("pipeline with rule post-checks", () => {
  function scripted(texts: string[]) {
    const calls: ReconstructInput[] = [];
    const provider: AIProvider = {
      info: { mode: "live", provider: "test", model: "m" },
      analyzeText: async () => null,
      reconstructText: async (input) => {
        calls.push(input);
        return { text: texts[Math.min(calls.length - 1, texts.length - 1)], changes: [] };
      },
      verifyMeaning: async () => [],
      analyzeVoiceprint: async () => [],
    };
    return { provider, calls };
  }

  it("retries when a candidate introduces a deterministic pattern, and says which", async () => {
    const { provider, calls } = scripted(["Here's the thing: costs fell 12% last year.", "Costs fell 12% last year."]);
    const r = await runReconstruction({ source: "Costs fell 12% last year.", profile: PRESETS.natural }, provider);
    expect(r.attempts).toBe(2);
    expect(r.text).toBe("Costs fell 12% last year.");
    expect(calls[1].retryFeedback?.join(" ")).toMatch(/Throat-clearing opener/);
    expect(calls[0].plan.avoid).toEqual([]);
  });

  it("does not retry merely because patterns remain", async () => {
    const { provider } = scripted([A]);
    const r = await runReconstruction({ source: A, profile: PRESETS.natural }, provider);
    expect(r.attempts).toBe(1);
    expect(r.patterns.remaining.length).toBeGreaterThan(0);
  });

  it("demo mode reduces patterns on formulaic prose without touching facts", async () => {
    const r = await runReconstruction({ source: A, profile: PRESETS.natural }, new DemoProvider());
    expect(r.engine.mode).toBe("demo");
    expect(r.patterns.after).toBeLessThan(r.patterns.before);
    expect(r.patterns.introduced.filter((x) => x.deterministic)).toEqual([]);
    expect(r.verification.findings.filter((f) => f.severity === "blocking")).toEqual([]);
    expect(r.patterns.resolved.map((x) => x.ruleId)).toEqual(expect.arrayContaining(["slop.announcements", "slop.scene-setter", "core.repeated-transitions", "core.wordy-phrases"]));
  });
});

describe("deterministic transforms", () => {
  const rules = rulesForProfile(PRESETS.natural);
  const byId = new Map(rules.map((r) => [r.id, r]));
  const run = (text: string, keepWording = false) => applyRuleTransforms(text, analyzeWriting(text, rules).findings, byId, { keepWording });

  it("deletes announcements and capitalises only the word that now opens the sentence", () => {
    expect(run("It is worth noting that the release shipped. lowercase stays.").text).toBe("The release shipped. lowercase stays.");
  });

  it("maps wordy phrases preserving case, and keeps the author's lowercase style", () => {
    expect(run("In order to ship we met. in order to test we waited.").text).toBe("To ship we met. to test we waited.");
  });

  it("collapses chains of additive openers to one Also", () => {
    expect(collapseAdditiveOpeners("It works. Furthermore, it scales. Moreover, it is cheap.")).toEqual({ text: "It works. Also, it scales. It is cheap.", count: 1 });
  });

  it("keep-wording mode only removes announcements and stock openers", () => {
    const r = run("It is worth noting that we met in order to plan.", true);
    expect(r.text).toBe("We met in order to plan.");
  });
});
