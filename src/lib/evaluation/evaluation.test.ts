import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CORPUS_CATEGORIES, corpusManifestSchema, evaluationRecordSchema, type EvaluationRecord, type RunManifest } from "@/domain/evaluation";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { runBatch } from "./batch";
import { EvaluationConfigError, createEvaluationProvider, resolveConfig } from "./config";
import { loadCorpus, selectCases } from "./corpus";
import { findRegressions, renderComparison, renderRunReport } from "./report";
import { EvaluationCaseError, evaluateCase } from "./runner";
import { EvaluationStore } from "./store";

const corpus = loadCorpus(process.cwd());
const byId = (id: string) => corpus.cases.find((c) => c.id === id)!;

/** A fake model: `respond` decides each output from the input it was given. */
function fakeModel(respond: (input: ReconstructInput, call: number) => string) {
  const calls: ReconstructInput[] = [];
  const provider: AIProvider = {
    info: { mode: "live", provider: "fake", model: "fake-model-1" },
    analyzeText: async () => null,
    reconstructText: async (input) => {
      calls.push(input);
      return { text: respond(input, calls.length), changes: ["edited"], meta: { latencyMs: 10, inputTokens: 200, outputTokens: 80 } };
    },
    verifyMeaning: async () => [],
    analyzeVoiceprint: async () => [],
  };
  return { provider, calls };
}

const config = { provider: "anthropic" as const, model: "fake-model-1", strategy: "reconstruction-v1" };

describe("evaluation corpus", () => {
  it("covers every required category with real texts, and validates", () => {
    const cats = new Set(corpus.cases.map((c) => c.category));
    for (const k of Object.keys(CORPUS_CATEGORIES)) expect(cats, k).toContain(k);
    expect(corpus.cases.every((c) => c.text.length > 50 && /^[a-f0-9]{64}$/.test(c.textHash))).toBe(true);
    expect(corpus.cases.filter((c) => c.smoke).map((c) => c.category).sort()).toEqual(["already-good", "anchors", "formulaic", "refinement-chain", "voiceprint"]);
  });

  it("rejects duplicate case ids", () => {
    const [c] = corpus.manifest.cases;
    expect(corpusManifestSchema.safeParse({ ...corpus.manifest, cases: [c, c] }).success).toBe(false);
  });

  it("measures the Voiceprint fixture from its samples, strongly enough to count", () => {
    const vp = corpus.voiceprints.get("mara")!;
    expect(vp.totalWords).toBeGreaterThan(1200);
    expect(vp.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("labels gold rewrites with their provenance and never presents them as expert-labelled", () => {
    expect(corpus.gold.size).toBeGreaterThan(0);
    for (const g of corpus.gold.values()) expect(g.provenance).toMatch(/not expert-labelled/);
  });

  it("selects by id, category and smoke flag, and requires an explicit selection", () => {
    expect(selectCases(corpus, {})).toEqual([]);
    expect(selectCases(corpus, { ids: ["negations"] }).map((c) => c.id)).toEqual(["negations"]);
    expect(selectCases(corpus, { categories: ["refinement-chain"] })).toHaveLength(2);
    expect(() => selectCases(corpus, { ids: ["nope"] })).toThrow(/Unknown case/);
  });
});

describe("evaluation records", () => {
  it("record the provider, model, strategy, prompt, packs and Voiceprint that produced them, and validate", async () => {
    const { provider } = fakeModel((i) => i.source.replace("It is worth noting that I", "I").replace("Furthermore, I", "I").replace("In conclusion, the", "The"));
    const r = await evaluateCase(byId("voiceprint"), { corpus, config, provider, runId: "t1" });
    expect(evaluationRecordSchema.safeParse(r).success).toBe(true);
    expect(r.config).toMatchObject({ provider: "fake", mode: "live", realModel: true, model: "fake-model-1", sampling: "provider-default", strategy: { key: "reconstruction-v1" }, prompt: { key: "reconstruct.v2" }, style: "voiceprint:mara" });
    expect(r.config.voiceprint).toMatchObject({ id: "mara", hash: expect.stringMatching(/^[a-f0-9]{16}$/) });
    expect(r.config.rulePacks.map((p) => p.id)).toContain("anti-slop");
    const s = r.stages[0];
    expect(s.rules.resolved).toEqual(expect.arrayContaining(["slop.announcements", "slop.summary-openers"]));
    expect(s.voice.reference).toBe("voiceprint");
    expect(s.tokens).toEqual({ input: 200, output: 80 });
    expect(s.attempts).toHaveLength(1);
  });

  it("verifies every refinement stage against the ORIGINAL, carrying the previous output as current", async () => {
    const c = byId("chain-status");
    const { provider, calls } = fakeModel((input) => {
      // The "shorter" stage drops the 18% figure; every other stage keeps the text.
      if (input.refinement?.directives.includes("shorter")) return (input.current ?? input.source).replace(" by 18%", "");
      return input.current ?? input.source;
    });
    const r = await evaluateCase(c, { corpus, config, provider, runId: "t2" });
    expect(r.stages.map((s) => s.label)).toEqual(["Natural", "Less polished", "Shorter", "Keep more of my wording"]);
    expect(calls.every((x) => x.source === c.text)).toBe(true);
    expect(calls[1].current).toBe(r.stages[0].output.text);
    expect(r.stages.map((s) => s.semantic.verdict)).toEqual(["PASS", "PASS", "FAIL", "FAIL"]);
    expect(r.stages[2].retries).toBe(2); // retried on the blocking finding, as the strategy says
    expect(r.stages[2].semantic.deterministic.failures[0].kind).toBe("altered_number");
    expect(r.stages[3].retentionVsPrevious?.tokenRetention).toBe(1);
  });

  it("checks minimal-change expectations on already-good prose", async () => {
    const same = await evaluateCase(byId("already-good"), { corpus, config, provider: fakeModel((i) => i.source).provider, runId: "t3" });
    expect(same.stages[0].expectations.find((e) => e.id === "minimal-change")?.passed).toBe(true);
    expect(same.stages[0].gold?.removedByGold).toEqual([]);
    const rewrite = await evaluateCase(byId("already-good"), {
      corpus,
      config,
      provider: fakeModel(() => "This year the tomatoes went into the south bed, where sunshine lasted nearly nine hours instead of five, and the first fruit ripened on 2 July. Spacing them 40 centimetres apart to fit twelve plants was a mistake: blight took hold by August. Next year: eight plants, 60 centimetres apart, pruned to two stems, about three weeks earlier.").provider,
      runId: "t4",
    });
    expect(rewrite.stages[0].expectations.find((e) => e.id === "minimal-change")?.passed).toBe(false);
  });
});

describe("batch evaluation", () => {
  it("isolates a failing case and keeps the rest, with its attempts recorded", async () => {
    const cases = [byId("terse"), byId("negations"), byId("load-light")];
    const { records, failures } = await runBatch(
      cases,
      async (c) => {
        if (c.id === "negations") throw new EvaluationCaseError("upstream 529", c.id, 0, "upstream", []);
        return evaluateCase(c, { corpus, config, provider: fakeModel((i) => i.source).provider, runId: "b" });
      },
      { concurrency: 2 },
    );
    expect(records.map((r) => r.case.id)).toEqual(["terse", "load-light"]);
    expect(failures).toEqual([expect.objectContaining({ caseId: "negations", code: "upstream", stage: 0 })]);
  });
});

describe("configuration", () => {
  it("never falls back to the demo engine when a real model was asked for", () => {
    const c = resolveConfig({}, {});
    expect(c).toEqual({ provider: "anthropic", model: "claude-sonnet-5", strategy: "reconstruction-v1" });
    expect(() => createEvaluationProvider(c, {})).toThrow(EvaluationConfigError);
    expect(() => createEvaluationProvider(c, { ANTHROPIC_API_KEY: "   " })).toThrow(/not set/);
  });

  it("runs the demo engine only when asked, and records the model identity otherwise", () => {
    const demo = resolveConfig({ demo: true }, { ANTHROPIC_API_KEY: "k" });
    expect(createEvaluationProvider(demo, {}).info).toEqual({ mode: "demo", provider: "demo", model: null });
    const live = createEvaluationProvider(resolveConfig({ model: "claude-x" }, {}), { ANTHROPIC_API_KEY: "sk-test" });
    expect(live.info).toEqual({ mode: "live", provider: "anthropic", model: "claude-x" });
    expect(resolveConfig({}, { WHODUNNIT_MODEL: "claude-env" }).model).toBe("claude-env");
    expect(() => resolveConfig({ demo: true, model: "m" }, {})).toThrow(/no model/);
    expect(() => resolveConfig({ strategy: "nope" }, {})).toThrow(/Unknown rewrite strategy/);
  });
});

describe("storage, reports, baselines and comparison", () => {
  const dir = mkdtempSync(join(tmpdir(), "whodunnit-eval-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const store = new EvaluationStore(dir);

  const manifest = (runId: string, caseIds: string[], createdAt: string): RunManifest => ({
    schemaVersion: 1,
    runId,
    label: null,
    createdAt,
    finishedAt: createdAt,
    config,
    mode: "live",
    realModel: true,
    corpusVersion: 1,
    caseIds,
    completed: caseIds,
    failed: [],
    concurrency: 1,
    git: { commit: null, dirty: null },
  });

  async function saveRun(runId: string, createdAt: string, respond: (i: ReconstructInput) => string) {
    const ids = ["anchors", "already-good"];
    const m = manifest(runId, ids, createdAt);
    store.saveManifest(m);
    const records: EvaluationRecord[] = [];
    for (const id of ids) {
      const r = await evaluateCase(byId(id), { corpus, config, provider: fakeModel(respond).provider, runId, now: () => createdAt });
      store.saveRecord(r);
      records.push(r);
    }
    store.saveFailures(runId, []);
    return records;
  }

  it("persists runs and records, and saves human reviews without scores", async () => {
    await saveRun("run-a", "2026-01-01T00:00:00.000Z", (i) => i.source);
    const run = store.loadRun("run-a");
    expect(run.records.map((r) => r.case.id)).toEqual(["anchors", "already-good"]);
    const reviewed = store.saveReview("run-a", "anchors", { reviewedAt: "2026-01-02T00:00:00.000Z", meaningPreserved: "yes", voicePreserved: "yes", naturalness: "same", unnecessaryRewrite: "no", notes: "left alone, correctly" });
    expect(reviewed.review).not.toHaveProperty("score");
    expect(store.loadRun("run-a").records[0].review?.meaningPreserved).toBe("yes");
    expect(() => store.saveReview("run-a", "anchors", { reviewedAt: "x", meaningPreserved: "mostly" } as never)).toThrow();
  });

  it("resolves latest, prefixes and baseline names", async () => {
    await saveRun("run-b", "2026-01-03T00:00:00.000Z", (i) => i.source.replace("$1.4 million", "$1.5 million").replace("We moved the tomatoes to the south bed this year, and", "This year, after moving the tomatoes south,"));
    expect(store.resolve("latest")).toBe("run-b");
    expect(store.setBaseline("default", "run-a")).toBe("run-a");
    expect(store.resolve("default")).toBe("run-a");
    expect(() => store.resolve("run")).toThrow(/several runs/);
  });

  it("reports and compares by dimension, flags regressions, and never picks a winner", () => {
    const a = store.loadRun("default");
    const b = store.loadRun("latest");
    const report = renderRunReport(b);
    for (const h of ["## Configuration", "## Corpus results", "## Semantic failures", "## Rule changes", "## Voiceprint behaviour", "## Minimal-change cases", "## Repeated refinement", "## Provider errors", "## Human review status"]) expect(report).toContain(h);
    expect(report).toMatch(/anchors\*\* stage 0/);
    const regs = findRegressions(a, b);
    expect(regs).toContainEqual(expect.objectContaining({ scope: "anchors", dimension: "semantic PASS → FAIL" }));
    expect(regs).toContainEqual(expect.objectContaining({ scope: "run", dimension: "cases with a semantic failure increased" }));
    const cmp = renderComparison(a, b, { baseline: true });
    expect(cmp).toContain("Regressions against the baseline");
    expect(cmp).not.toMatch(/winner:|overall score/i);
  });
});
