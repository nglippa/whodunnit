import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EvaluationRecord, RunManifest } from "@/domain/evaluation";
import type { JudgeResult } from "@/domain/judge";
import type { RefinementId } from "@/domain/refinement";
import { PRESETS } from "@/domain/style";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { DemoProvider } from "../ai/demo";
import { runReconstruction, runReconstructionDetailed } from "../reconstruction/pipeline";
import { restorableRemainder, restorationsFor } from "../reconstruction/refinement-delta";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V3 } from "../reconstruction/strategies";
import { analyzeWriting } from "../rules/engine";
import { rulesForProfile } from "../rules/packs";
import { EvaluationConfigError, resolveConfig } from "./config";
import { loadCorpus } from "./corpus";
import type { JudgeInput, SemanticJudge } from "./judge";
import { wordingRetention } from "./measures";
import { refinementEffect } from "./refinement-effect";
import { comparabilityNotes, renderComparison, renderRunReport } from "./report";
import { evaluateCase } from "./runner";
import { renderSeries } from "./series";
import type { StoredRun } from "./store";
import { evaluateVoiceFixture, loadVoiceFixtures } from "./voice-fixtures";

const corpus = loadCorpus(process.cwd());
const byId = (id: string) => corpus.cases.find((c) => c.id === id)!;
const metrics = (t: string) => analyzeWriting(t, rulesForProfile(PRESETS.natural)).metrics;

function scripted(respond: (input: ReconstructInput) => string) {
  const calls: ReconstructInput[] = [];
  const provider: AIProvider = {
    info: { mode: "live", provider: "test", model: "m" },
    analyzeText: async () => null,
    reconstructText: async (input) => {
      calls.push(input);
      return { text: respond(input), changes: [] };
    },
    verifyMeaning: async () => null,
    analyzeVoiceprint: async () => [],
  };
  return { provider, calls };
}

describe("voice-device fixtures", () => {
  for (const f of loadVoiceFixtures(process.cwd())) {
    it(`${f.id} (${f.class}) → ${f.expect.verdict}`, () => {
      const r = evaluateVoiceFixture(f);
      expect(r.passed, `${f.id}: got ${r.got}`).toBe(true);
    });
  }
});

describe("forced-model diagnostic", () => {
  const good = "We moved the tomatoes to the south bed this year, and the difference was obvious by July. Next year we will plant eight, 60 centimetres apart.";

  it("normal v3 still returns finished text without a model call; forcing calls the model and says the planner would have bypassed it", async () => {
    const normal = scripted((i) => i.source);
    const n = await runReconstructionDetailed({ source: good, profile: PRESETS.natural }, normal.provider, { strategy: RECONSTRUCTION_V3 });
    expect(normal.calls).toHaveLength(0);
    expect(n.plannerWouldBypass).toBe(true);
    const forced = scripted((i) => i.source);
    const f = await runReconstructionDetailed({ source: good, profile: PRESETS.natural }, forced.provider, { strategy: RECONSTRUCTION_V3, forceModel: true });
    expect(forced.calls).toHaveLength(1);
    expect(f.plannerWouldBypass).toBe(true);
    expect(f.attempts).toHaveLength(1);
  });

  it("production has no way to force: the default call and the web route never set it", async () => {
    const { provider, calls } = scripted((i) => i.source);
    await runReconstruction({ source: good, profile: PRESETS.natural }, provider, { strategy: RECONSTRUCTION_V3 });
    expect(calls).toHaveLength(0);
    const route = readFileSync(join(process.cwd(), "src/app/api/reconstruct/route.ts"), "utf8");
    expect(route).not.toMatch(/forceModel/);
  });

  it("is recorded in the configuration and in every record, and refuses a strategy it cannot affect", async () => {
    expect(resolveConfig({ demo: true, strategy: "reconstruction-v3", forceModel: true }, {}).forceModel).toBe(true);
    expect(resolveConfig({ demo: true, strategy: "reconstruction-v3" }, {}).forceModel).toBeUndefined();
    expect(() => resolveConfig({ demo: true, strategy: "reconstruction-v1", forceModel: true }, {})).toThrow(EvaluationConfigError);
    const c = byId("already-good");
    const base = { provider: "demo" as const, model: null, strategy: "reconstruction-v3" };
    const normal = await evaluateCase(c, { corpus, config: base, provider: new DemoProvider(), runId: "n" });
    const forced = await evaluateCase(c, { corpus, config: { ...base, forceModel: true }, provider: new DemoProvider(), runId: "f" });
    expect(normal.config.forcedModel).toBeUndefined();
    expect(normal.stages[0]).toMatchObject({ unchangedByPolicy: true, plannerWouldBypass: true });
    expect(forced.config.forcedModel).toBe(true);
    expect(forced.stages[0]).toMatchObject({ unchangedByPolicy: false, plannerWouldBypass: true });
  });

  it("comparisons and reports never treat forced and normal runs as equivalent", async () => {
    const c = byId("already-good");
    const base = { provider: "demo" as const, model: null, strategy: "reconstruction-v3" };
    const run = async (forceModel: boolean): Promise<StoredRun> => {
      const config = forceModel ? { ...base, forceModel } : base;
      const record = await evaluateCase(c, { corpus, config, provider: new DemoProvider(), runId: forceModel ? "f" : "n" });
      return { manifest: manifest(forceModel ? "f" : "n", config), records: [record], failures: [] };
    };
    const [n, f] = [await run(false), await run(true)];
    expect(comparabilityNotes(n, f).join(" ")).toMatch(/NOT EQUIVALENT: B is a forced-model diagnostic/);
    const md = renderComparison(n, f);
    expect(md).toMatch(/forced model \(planner bypass disabled\) \| no \| YES/);
    expect(md).toMatch(/Not computed: one run is a forced-model diagnostic/);
    expect(renderRunReport(f)).toMatch(/FORCED-MODEL DIAGNOSTIC.*BACKEND SAFETY.*not PRODUCT QUALITY/);
    expect(renderRunReport(n)).not.toMatch(/FORCED-MODEL DIAGNOSTIC/);
    expect(() => renderSeries([n, f])).toThrow(/not the same configuration.*forcedModel/);
  });
});

function manifest(runId: string, config: RunManifest["config"], caseIds = ["already-good"]): RunManifest {
  return { schemaVersion: 2, runId, label: null, createdAt: "t", finishedAt: "t", config, mode: "demo", realModel: false, corpusVersion: corpus.manifest.version, caseIds, completed: caseIds, failed: [], concurrency: 1, git: { commit: null, dirty: null } };
}

describe("refinement effect (instruction following, separate from meaning)", () => {
  const current = "We moved the tomatoes to the south bed this year, and by July the difference was obvious to everyone who walked past the garden. The old spot never got more than five hours of sun; the new bed gets closer to nine.";
  const effect = (directives: RefinementId[], output: string, original = current, cur = current) =>
    refinementEffect({ refinement: { directives }, original, current: cur, output, currentMetrics: metrics(cur), outputMetrics: metrics(output) });

  it("Shorter with unchanged output is NOT_APPLIED; a real cut is APPLIED", () => {
    const same = effect(["shorter"], current);
    expect(same).toMatchObject({ status: "NOT_APPLIED", identicalToCurrent: true });
    const cut = effect(["shorter"], "We moved the tomatoes to the south bed, and by July the difference was obvious. The old spot got five hours of sun; the new bed gets nine.");
    expect(cut.status).toBe("APPLIED");
  });

  it("Less polished with byte-identical output is NOT_APPLIED", () => {
    expect(effect(["less_polished"], current).status).toBe("NOT_APPLIED");
  });

  it("Keep wording is ALREADY_SATISFIED when the current revision already keeps the original, APPLIED when retention rises", () => {
    expect(effect(["keep_wording"], current).status).toBe("ALREADY_SATISFIED");
    const original = current;
    const drifted = "This year the tomatoes went into the south bed, and by July everyone passing the garden could see the change. The previous location received at most five hours of sunlight; the new one gets about nine.";
    const back = "We moved the tomatoes to the south bed this year, and by July the difference was obvious to everyone who walked past the garden. The previous location received at most five hours of sunlight; the new one gets about nine.";
    const r = effect(["keep_wording"], back, original, drifted);
    expect(r.status).toBe("APPLIED");
    expect(r.directives[0].after!).toBeGreaterThan(r.directives[0].before!);
    expect(effect(["keep_wording"], drifted, original, drifted).status).toBe("NOT_APPLIED");
  });

  it("is recorded per refinement stage and reported alongside, never inside, the semantic verdict", async () => {
    const r = await evaluateCase(byId("chain-dashes"), { corpus, config: { provider: "demo", model: null, strategy: "reconstruction-v3" }, provider: new DemoProvider(), runId: "t" });
    expect(r.stages[0].refinementEffect).toBeNull();
    for (const s of r.stages.slice(1)) {
      expect(s.refinementEffect?.directives.length).toBeGreaterThan(0);
      expect(s.voiceDevices?.verdict).toMatch(/PRESERVED|DEVIATION|DAMAGED/);
    }
    const md = renderRunReport({ manifest: manifest("t", { provider: "demo", model: null, strategy: "reconstruction-v3" }, ["chain-dashes"]), records: [r], failures: [] });
    expect(md).toMatch(/## Semantics, voice and instruction following/);
  });
});

describe("keep-wording restoration without the removed patterns", () => {
  const rules = rulesForProfile(PRESETS.natural);
  const src = "It is worth noting that we moved the tomatoes to the south bed in May. At the end of the day, the new bed gets closer to nine hours of sun than the old one.";
  const cur = "The tomatoes went into a sunnier bed in May. It gets more light than before.";

  it("falls back to the wording around a pattern when every sentence contains one", () => {
    const findings = analyzeWriting(src, rules).findings;
    const r = restorationsFor(src, cur, findings);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.partial)).toBe(true);
    expect(r.map((x) => x.source).join(" ")).toMatch(/we moved the tomatoes to the south bed in May/);
  });

  it("never offers a removed pattern back, and the offered text does not re-trigger it", () => {
    const findings = analyzeWriting(src, rules).findings;
    const patterns = findings.filter((f) => !f.suppressedBy && f.rule.severity !== "info");
    const texts = restorationsFor(src, cur, findings).map((x) => x.source);
    for (const f of patterns) for (const m of f.matches) for (const t of texts) expect(t).not.toContain(src.slice(m.start, m.end).trim());
    const reAnalysed = new Set(analyzeWriting(texts.join(" ").replace(/…/g, ""), rules).findings.filter((f) => f.rule.severity !== "info").map((f) => f.rule.id));
    for (const f of patterns) expect(reAnalysed.has(f.rule.id), f.rule.id).toBe(false);
  });

  it("offers nothing when the whole sentence is the pattern", () => {
    expect(restorableRemainder("And that makes all the difference.", 0, [[0, 34]])).toBeNull();
  });

  it("moves wording back toward the original under v3 without restoring the pattern (demo engine)", async () => {
    const d = await runReconstructionDetailed({ source: src, profile: PRESETS.natural, refinement: { current: cur, change: { directives: ["keep_wording"] } } }, new DemoProvider(), { strategy: RECONSTRUCTION_V3 });
    expect(d.plan.refinementDelta?.restorations.length).toBeGreaterThan(0);
    expect(wordingRetention(src, d.result.text).tokenRetention).toBeGreaterThan(wordingRetention(src, cur).tokenRetention);
    expect(d.result.text).not.toMatch(/worth noting|at the end of the day/i);
  });
});

describe("judge receives the engine's intended removals", () => {
  it("passes named removable spans and the run id; the record names the judge prompt", async () => {
    const seen: JudgeInput[] = [];
    const judge: SemanticJudge = {
      info: { provider: "fake", model: "j" },
      prompt: "judge.v2",
      judge: async (input): Promise<JudgeResult> => {
        seen.push(input);
        return { provider: "fake", model: "j", prompt: "judge.v2", selfJudged: false, status: "ran", error: null, verdict: "PASS", findings: [], latencyMs: 1, tokens: null, provenance: { source: "live", key: "k", originalRunId: input.runId ?? null, cachedAt: null } };
      },
    };
    const r: EvaluationRecord = await evaluateCase(byId("formulaic"), { corpus, config: { provider: "demo", model: null, strategy: "reconstruction-v3" }, provider: new DemoProvider(), runId: "run-x", judge });
    expect(seen[0].runId).toBe("run-x");
    expect(seen[0].intendedRemovals?.length).toBeGreaterThan(0);
    for (const x of seen[0].intendedRemovals!) expect(byId("formulaic").text).toContain(x.text);
    expect(r.config.judge?.prompt).toBe("judge.v2");
    expect(r.stages[0].semantic.judge?.provenance?.source).toBe("live");
  });
});

describe("series", () => {
  it("reports failures on every seed separately from intermittent ones, per seed, without averaging", async () => {
    const cfg = (seed: number) => ({ provider: "demo" as const, model: null, strategy: "reconstruction-v3", generation: { seed } });
    const runs: StoredRun[] = [];
    for (const seed of [7, 42, 137]) {
      const rec = await evaluateCase(byId("formulaic"), { corpus, config: cfg(seed), provider: new DemoProvider(), runId: `s${seed}` });
      runs.push({ manifest: manifest(`s${seed}`, cfg(seed), ["formulaic"]), records: [rec], failures: [] });
    }
    const md = renderSeries(runs);
    expect(md).toMatch(/Seeds|seed → run id/);
    expect(md).toMatch(/On every seed \(systematic\)/);
    expect(md).toMatch(/Intermittent \(seed-dependent\)/);
    expect(md).toMatch(/No composite score/);
    expect(() => renderSeries([runs[0], runs[0]])).toThrow(/Seeds must differ/);
    const otherStrategy = { ...runs[1], manifest: { ...runs[1].manifest, config: { ...runs[1].manifest.config, strategy: "reconstruction-v2" } } };
    expect(() => renderSeries([runs[0], otherStrategy])).toThrow(/strategy/);
  });
});

describe("restoration alignment", () => {
  it("offers nothing back when the current revision still holds the original wording verbatim", () => {
    const src = "My grandmother kept everything — string, jam jars, the bus tickets — in a biscuit tin under the stairs. We kept the tin. We kept the letter.";
    expect(restorationsFor(src, src, analyzeWriting(src, rulesForProfile(PRESETS.natural)).findings)).toEqual([]);
  });

  it("aligns a short sentence to its own counterpart, not to a long sentence that shares its words", () => {
    const src = "My grandmother kept everything in a biscuit tin under the stairs. We kept the tin.";
    const cur = "My grandmother kept everything in a biscuit tin under the stairs. The tin stayed with us.";
    const r = restorationsFor(src, cur, analyzeWriting(src, rulesForProfile(PRESETS.natural)).findings);
    expect(r).toEqual([expect.objectContaining({ source: "We kept the tin.", current: "The tin stayed with us." })]);
  });
});

describe("production strategy is unchanged by the source-voice layer", () => {
  const dashes = loadVoiceFixtures(process.cwd()).find((f) => f.id === "deliberate-dashes-kept")!.source;

  it("only strategies that opt in let source habits shape the plan; the profile is measured for all", () => {
    const v1 = buildRewritePlan({ source: dashes, profile: PRESETS.natural }, RECONSTRUCTION_V1);
    const v3 = buildRewritePlan({ source: dashes, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(RECONSTRUCTION_V1.planning.sourceVoice).toBeUndefined();
    expect(v1.constraints.some((c) => c.layer === "source-voice")).toBe(false);
    expect(v1.permitted.some((p) => p.ruleId === "slop.dash-density")).toBe(false);
    expect(v3.constraints.some((c) => c.layer === "source-voice")).toBe(true);
    expect(v3.permitted.some((p) => p.ruleId === "slop.dash-density")).toBe(true);
    expect(v1.sourceVoice.deliberate.dashes).toBe(true);
  });
});
