import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { Finding } from "@/domain/verification";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { DemoProvider } from "../ai/demo";
import { runReconstruction, runReconstructionDetailed, type AttemptRecord } from "./pipeline";
import { buildRewritePlan, chooseIntensity, planSize } from "./rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V2 } from "./strategies";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const A = read("data/fixtures/prose/a-formulaic.md");
const GOOD = read("data/evaluation/cases/l-already-good.md");
const FIGURES = read("data/evaluation/cases/i-anchors.md");

describe("rewrite intensity (minimal-change principle)", () => {
  it("is minimal for good prose, substantial for templated prose", () => {
    expect(buildRewritePlan({ source: GOOD, profile: PRESETS.natural }).intensity).toBe("minimal");
    expect(buildRewritePlan({ source: A, profile: PRESETS.natural }).intensity).toBe("substantial");
  });

  it("an explicit request for change is never minimal; keep-my-wording alone is", () => {
    expect(buildRewritePlan({ source: GOOD, profile: PRESETS.natural, refinement: { directives: ["shorter"] } }).intensity).toBe("normal");
    expect(chooseIntensity([], [], { directives: ["keep_wording"] }).intensity).toBe("minimal");
    expect(chooseIntensity([], [], { directives: [], note: "less formal" }).intensity).toBe("normal");
  });

  it("an off-target confident Voiceprint range asks for change", () => {
    const r = chooseIntensity([], [{ dimension: "voice.contractions", label: "contractions", unit: "", current: 0, min: 2, max: 5, origin: "Voiceprint", layer: "voiceprint", strength: 0.8, action: "raise" }]);
    expect(r.intensity).toBe("normal");
    expect(r.reasons.join(" ")).toMatch(/Voiceprint/);
  });
});

describe("contract prioritisation", () => {
  it("v1 sends the full contract and omits nothing (unchanged behaviour)", () => {
    const plan = buildRewritePlan({ source: GOOD, profile: PRESETS.natural }, RECONSTRUCTION_V1);
    expect(plan.budget.omitted).toEqual([]);
    expect(plan.prohibitedPatterns.length).toBeGreaterThan(30);
    expect(plan.advisoryGuidance.length).toBeGreaterThan(0);
  });

  it("v2 budgets by priority, records every omission with a reason, and never drops an anchor", () => {
    const v1 = buildRewritePlan({ source: FIGURES, profile: PRESETS.professional }, RECONSTRUCTION_V1);
    const v2 = buildRewritePlan({ source: FIGURES, profile: PRESETS.professional }, RECONSTRUCTION_V2);
    expect(v2.preserve).toEqual(v1.preserve);
    expect(v2.prohibitedPatterns.length).toBeLessThanOrEqual(12);
    expect(planSize(v2).total).toBeLessThan(planSize(v1).total);
    expect(v2.budget.omitted.length).toBeGreaterThan(0);
    expect(v2.budget.omitted.every((o) => o.reason.length > 10)).toBe(true);
  });

  it("keeps the constructions a rewrite tends to introduce; drops text-shape measures covered by ranges", () => {
    const v2 = buildRewritePlan({ source: GOOD, profile: PRESETS.natural }, RECONSTRUCTION_V2);
    const kept = v2.prohibitedPatterns.map((p) => p.ruleId);
    for (const id of ["slop.throat-clearing", "slop.announcements", "slop.importance-puffery"]) expect(kept).toContain(id);
    expect(v2.prohibitedPatterns.some((p) => p.measure)).toBe(false);
    expect(v2.budget.omitted.find((o) => o.name === "Uniform sentence rhythm")?.reason).toMatch(/text shape/);
  });

  it("under minimal intensity, style-only ranges and advisory guidance are not pursued", () => {
    const v2 = buildRewritePlan({ source: GOOD, profile: PRESETS.natural }, RECONSTRUCTION_V2);
    expect(v2.targetRanges.filter((t) => t.layer === "style")).toEqual([]);
    expect(v2.advisoryGuidance).toEqual([]);
    expect(v2.budget.omitted.some((o) => o.section === "targets" && /minimal intervention/.test(o.reason))).toBe(true);
  });

  it("detected patterns are ranked by severity and determinism before being capped", () => {
    const v2 = buildRewritePlan({ source: A, profile: PRESETS.natural }, RECONSTRUCTION_V2);
    expect(v2.avoid.length).toBe(8);
    const dropped = v2.budget.omitted.filter((o) => o.section === "patterns");
    expect(dropped.length).toBe(buildRewritePlan({ source: A, profile: PRESETS.natural }).avoid.length - 8);
    const rank = { deterministic: 0, heuristic: 1, "model-assisted": 2, advisory: 3 } as const;
    const ranks = v2.avoid.map((a) => rank[a.determinism]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

function scripted(texts: string[], opts: { meaning?: Finding[] | null; failAt?: number } = {}) {
  const calls: ReconstructInput[] = [];
  const provider: AIProvider = {
    info: { mode: "live", provider: "test", model: "test-model" },
    analyzeText: async () => null,
    reconstructText: async (input) => {
      calls.push(input);
      if (opts.failAt === calls.length) throw new ProviderError("busy", "rate_limited", { latencyMs: 5, httpStatus: 429 });
      return { text: texts[Math.min(calls.length - 1, texts.length - 1)], changes: [], meta: { latencyMs: 7, inputTokens: 100, outputTokens: 40, stopReason: "end_turn", requestId: "req_1" } };
    },
    verifyMeaning: async () => opts.meaning ?? null,
    analyzeVoiceprint: async () => [],
  };
  return { provider, calls };
}

describe("retry observability", () => {
  const source = "Revenue grew 12% in March, according to Priya's report.";

  it("records every attempt: trigger, reasons, failures, hashes and provider metadata, and no text", async () => {
    const { provider, calls } = scripted(["Revenue grew 15% in March, according to Priya's report.", "Per Priya's report, revenue grew 12% in March."]);
    const d = await runReconstructionDetailed({ source, profile: PRESETS.natural }, provider);
    expect(d.attempts.map((a) => a.trigger)).toEqual(["initial", "retry"]);
    expect(d.attempts[0].semanticFailures).toContainEqual({ kind: "altered_number", severity: "blocking", origin: "deterministic" });
    expect(d.attempts[1].retryBecause).toEqual(["blocking:altered_number", "blocking:altered_number"]);
    expect(d.attempts[0].outputHash).not.toBe(d.attempts[1].outputHash);
    expect(d.attempts[1].provider).toMatchObject({ inputTokens: 100, outputTokens: 40, stopReason: "end_turn", requestId: "req_1" });
    expect(d.attempts[1].modelMeaning).toBe("unavailable");
    expect(d.attempts[0].modelMeaning).toBe("skipped-after-rejection");
    const json = JSON.stringify(d.attempts);
    expect(json).not.toContain("Revenue");
    expect(json).not.toContain("Priya");
    expect(calls[0].strategy).toBe(RECONSTRUCTION_V1);
  });

  it("keeps the log when a later attempt throws", async () => {
    const seen: AttemptRecord[] = [];
    const { provider } = scripted(["Revenue grew 15% in March."], { failAt: 2 });
    await expect(runReconstruction({ source, profile: PRESETS.natural }, provider, { onAttempt: (a) => seen.push(a) })).rejects.toThrow("busy");
    expect(seen.map((a) => a.outcome)).toEqual(["candidate", "provider-error"]);
    expect(seen[1]).toMatchObject({ errorCode: "rate_limited", provider: { httpStatus: 429 } });
  });

  it("follows the strategy's retry and post-check policies", async () => {
    const noRetry = { ...RECONSTRUCTION_V2, retryPolicy: { ...RECONSTRUCTION_V2.retryPolicy, retryOn: [] }, postCheckPolicy: { ...RECONSTRUCTION_V2.postCheckPolicy, modelMeaning: "never" as const } };
    const { provider, calls } = scripted(["Revenue grew 15% in March, according to Priya's report."], { meaning: [] });
    const d = await runReconstructionDetailed({ source, profile: PRESETS.natural }, provider, { strategy: noRetry });
    expect(calls).toHaveLength(1);
    expect(d.attempts[0].modelMeaning).toBe("skipped-by-policy");
    expect(d.result.verification.status).toBe("rejected");
    expect(d.result.promptVersion).toBe("reconstruct.v3");
  });
});

describe("minimal change in the demo engine", () => {
  const clean = "We do not ship on Fridays. Releases need two reviews, and the second reviewer signs the change log.";

  it("v1 applies register edits to clean text; v2 leaves minimal-intensity text alone", async () => {
    const v1 = await runReconstruction({ source: clean, profile: PRESETS.casual }, new DemoProvider(), { strategy: RECONSTRUCTION_V1 });
    const v2 = await runReconstruction({ source: clean, profile: PRESETS.casual }, new DemoProvider(), { strategy: RECONSTRUCTION_V2 });
    expect(v1.text).toContain("don't");
    expect(v2.text).toBe(clean);
  });
});
