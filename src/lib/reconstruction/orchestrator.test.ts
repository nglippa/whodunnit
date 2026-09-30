import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { ReconstructionRequest } from "@/domain/document";
import { evaluationRecordSchema } from "@/domain/evaluation";
import type { StructuredCaller } from "../ai/provider";
import type { AIProvider } from "../ai/provider";
import { loadCorpus } from "../evaluation/corpus";
import { evaluateCase } from "../evaluation/runner";
import { createEvaluationOrchestration, resolveConfig } from "../evaluation/config";
import { runOrchestratedReconstruction, routeTask, type FrontierAgent, type OrchestrationConfig } from "./orchestrator";
import { runReconstructionDetailed } from "./pipeline";
import { RECONSTRUCTION_V4 } from "./strategies";

const source = "It is important to note that Priya Raman said the launch may cut costs by 12%. The team has not promised a date. They will review the result next month.";
const request: ReconstructionRequest = { source, profile: PRESETS.natural };
const task = { type: "local-alternative" as const, span: "It is important to note that", purpose: "plain-language" as const };
const meta = { inputTokens: 100, outputTokens: 20 };

function caller(result: unknown, mode: "live" | "demo" = "live"): StructuredCaller {
  return {
    info: { provider: "fake", model: "worker", mode },
    callStructured: async <T,>(schema: z.ZodType<T>) => ({ data: schema.parse(result), meta }),
    generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  };
}
function agent(options: {
  tasks?: (typeof task)[];
  output?: string;
  decision?: unknown;
  replacement?: string;
  draft?: unknown;
} = {}): FrontierAgent {
  return {
    decide: vi.fn(async () => ({ data: (options.decision ?? { unchanged: false, tasks: options.tasks ?? [] }) as Awaited<ReturnType<FrontierAgent["decide"]>>["data"], meta })),
    draft: vi.fn(async () => ({ data: (options.draft ?? { text: options.output ?? source, changes: [] }) as Awaited<ReturnType<FrontierAgent["draft"]>>["data"], meta })),
    repair: vi.fn(async () => ({ data: { replacement: options.replacement ?? "12%" }, meta })),
  };
}
function config(worker?: StructuredCaller, maxRepairs: 0 | 1 = 1): OrchestrationConfig {
  return {
    frontier: { id: "frontier-test", tier: "frontier", capability: "orchestration", timeoutMs: 100, price: { input: 2, output: 4 } },
    workers: worker ? [{ id: "worker-test", tier: "cheap", capability: "local-alternative", timeoutMs: 100, caller: worker, price: { input: 0.1, output: 0.2 } }] : [],
    maxRepairs,
  };
}

describe("experimental cloud orchestrator", () => {
  it("routes only capable live workers with acceptable known reliability, choosing the cheapest tier", () => {
    const base = config(caller({ alternative: task.span })).workers[0];
    expect(routeTask(task, [{ ...base, tier: "strong" }, base])?.tier).toBe("cheap");
    expect(routeTask(task, [{ ...base, reliability: 0.7 }])).toBeNull();
    expect(routeTask(task, [{ ...base, caller: caller({ alternative: task.span }, "demo") }])).toBeNull();
  });

  it("runs without delegation and records text-free token, cost and latency metadata", async () => {
    const { detailed, trace } = await runOrchestratedReconstruction(request, agent(), config());
    expect(detailed.result.text).toBe(source);
    expect(trace.delegationCount).toBe(0);
    expect(trace.calls.map((c) => c.role)).toEqual(["frontier-decision", "frontier-draft"]);
    expect(trace.tokens).toEqual({ input: 200, output: 40 });
    expect(trace.estimatedCostUsd).toBeCloseTo(0.00056);
    expect(trace.latencyMs.total).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(trace)).not.toContain("Priya");
    expect(JSON.stringify(trace)).not.toContain("12%");
  });

  it("passes only a bounded exact span to a worker and lets the frontier decide whether to use it", async () => {
    const worker = caller({ alternative: task.span });
    const spy = vi.spyOn(worker, "callStructured");
    const frontier = agent({ tasks: [task] });
    const { trace } = await runOrchestratedReconstruction(request, frontier, config(worker));
    expect(trace.acceptedWorkerOutputs).toBe(1);
    expect(vi.mocked(frontier.draft).mock.calls[0][1]).toEqual([{ task, alternative: task.span, route: "worker-test" }]);
    expect(spy.mock.calls[0][3]).toContain(task.span);
    expect(spy.mock.calls[0][3]).not.toContain("Priya Raman");
  });

  it("marks a worker suggestion used only when its wording appears in the frontier draft", async () => {
    const alternative = "We should note that";
    const worker = caller({ alternative });
    const frontier = agent({ tasks: [task], output: source.replace(task.span, alternative) });
    const { trace } = await runOrchestratedReconstruction(request, frontier, config(worker));
    expect(trace.calls.find((c) => c.role === "worker")?.used).toBe(true);
  });

  it.each([
    ["malformed", { wrong: "shape" }],
    ["unsupported", { alternative: "Priya Raman confirmed a 40% cut." }],
  ])("rejects %s worker output and still drafts safely", async (_label, workerResult) => {
    const frontier = agent({ tasks: [task] });
    const { trace } = await runOrchestratedReconstruction(request, frontier, config(caller(workerResult)));
    expect(trace.rejectedWorkerOutputs).toBe(1);
    expect(vi.mocked(frontier.draft).mock.calls[0][1]).toEqual([]);
  });

  it("times out a worker, records failure, and returns the task to the frontier", async () => {
    const worker = caller({ alternative: task.span });
    worker.callStructured = () => new Promise(() => {});
    const frontier = agent({ tasks: [task] });
    const cfg = config(worker);
    cfg.workers[0].timeoutMs = 5;
    const { trace } = await runOrchestratedReconstruction(request, frontier, cfg);
    expect(trace.calls.find((c) => c.role === "worker")?.outcome).toBe("timeout");
    expect(vi.mocked(frontier.draft).mock.calls[0][1]).toEqual([]);
  });

  it("escalates once to a stronger eligible worker after a malformed cheap result", async () => {
    const cheap = caller({ wrong: "shape" });
    const strong = caller({ alternative: task.span });
    const frontier = agent({ tasks: [task] });
    const cfg = config(cheap);
    cfg.workers.push({ ...cfg.workers[0], id: "strong-test", tier: "strong", caller: strong });
    const { trace } = await runOrchestratedReconstruction(request, frontier, cfg);
    expect(trace.calls.filter((c) => c.role === "worker").map((c) => c.outcome)).toEqual(["error", "accepted"]);
    expect(trace.acceptedWorkerOutputs).toBe(1);
    expect(vi.mocked(frontier.draft).mock.calls[0][1][0].route).toBe("strong-test");
  });

  it("keeps deterministic rejection authoritative over a worker suggestion", async () => {
    const worker = caller({ alternative: "It definitely cut costs by 40%" });
    const frontier = agent({ tasks: [task] });
    const { trace } = await runOrchestratedReconstruction(request, frontier, config(worker));
    expect(trace.acceptedWorkerOutputs).toBe(0);
    expect(trace.calls.find((c) => c.role === "worker")?.outcome).toBe("rejected");
  });

  it("rejects a task whose span is absent from the source before any worker call", async () => {
    const worker = caller({ alternative: task.span });
    const spy = vi.spyOn(worker, "callStructured");
    const { trace } = await runOrchestratedReconstruction(request, agent({ tasks: [{ ...task, span: "This was never written." }] }), config(worker));
    expect(spy).not.toHaveBeenCalled();
    expect(trace.rejectedWorkerOutputs).toBe(1);
  });

  it("rejects an attempt to delegate a whole short document or free-form purpose", async () => {
    const worker = caller({ alternative: source });
    const frontier = agent({ decision: { unchanged: false, tasks: [{ type: "local-alternative", span: source, purpose: "plain-language" }] } });
    const { trace } = await runOrchestratedReconstruction(request, frontier, config(worker));
    expect(trace.rejectedWorkerOutputs).toBe(1);
    expect(trace.acceptedWorkerOutputs).toBe(0);
    const invalid = agent({ decision: { unchanged: false, tasks: [{ ...task, purpose: "quote the rest of the document" }] } });
    const second = await runOrchestratedReconstruction(request, invalid, config(worker));
    expect(second.trace.delegationCount).toBe(0);
  });

  it("rejects malformed frontier decisions and falls back to original wording", async () => {
    const frontier = agent({ decision: { unchanged: false, tasks: [], extra: true } });
    const { detailed, trace } = await runOrchestratedReconstruction(request, frontier, config());
    expect(detailed.result.text).toBe(source);
    expect(trace.finalDecision).toBe("source-fallback");
    expect(frontier.draft).not.toHaveBeenCalled();
  });

  it("repairs an exact offending span once, then reverifies the whole document", async () => {
    const frontier = agent({ output: source.replace("12%", "14%") });
    const { detailed, trace } = await runOrchestratedReconstruction(request, frontier, config());
    expect(detailed.result.text).toBe(source);
    expect(trace.finalDecision).toBe("repaired");
    expect(trace.repairCount).toBe(1);
    expect(detailed.attempts).toHaveLength(2);
    expect(detailed.result.verification.status).not.toBe("rejected");
  });

  it("exhausts the repair budget and safely returns the source", async () => {
    const frontier = agent({ output: source.replace("12%", "14%"), replacement: "18%" });
    const { detailed, trace } = await runOrchestratedReconstruction(request, frontier, config(undefined, 1));
    expect(vi.mocked(frontier.repair)).toHaveBeenCalledTimes(1);
    expect(trace.finalDecision).toBe("source-fallback");
    expect(detailed.result.text).toBe(source);
  });

  it("does not accept a repair when the follow-up semantic model review is unavailable", async () => {
    let count = 0;
    const reviewer = caller({ findings: [] });
    reviewer.callStructured = async <T,>(schema: z.ZodType<T>) => {
      count++;
      if (count > 1) throw new Error("unavailable");
      return { data: schema.parse({ findings: [{ kind: "meaning_drift", severity: "blocking", message: "Possible changed meaning", candidate: "12%" }] }), meta };
    };
    const cfg = config();
    cfg.semanticReviewer = { route: { id: "independent-reviewer", tier: "strong", capability: "semantic-review", timeoutMs: 100 }, caller: reviewer };
    const { detailed, trace } = await runOrchestratedReconstruction(request, agent(), cfg);
    expect(count).toBe(2);
    expect(trace.finalDecision).toBe("source-fallback");
    expect(trace.calls.find((c) => c.role === "frontier-repair")?.used).toBe(false);
    expect(detailed.result.text).toBe(source);
  });

  it("preserves the source when a configured semantic reviewer is unavailable on the first candidate", async () => {
    const reviewer = caller({ findings: [] });
    reviewer.callStructured = async () => { throw new Error("unavailable"); };
    const cfg = config();
    cfg.semanticReviewer = { route: { id: "independent-reviewer", tier: "strong", capability: "semantic-review", timeoutMs: 100 }, caller: reviewer };
    const frontier = agent({ output: source.replace(task.span, "Note that") });
    const { detailed, trace } = await runOrchestratedReconstruction(request, frontier, cfg);
    expect(trace.calls.find((c) => c.role === "semantic-review")?.outcome).toBe("error");
    expect(trace.finalDecision).toBe("source-fallback");
    expect(detailed.result.text).toBe(source);
  });

  it("keeps the planner's unchanged path and never calls the frontier", async () => {
    const frontier = agent();
    const good = { source: "Priya wrote the report. She sent it to her team on Tuesday.", profile: PRESETS.natural };
    const { detailed, trace } = await runOrchestratedReconstruction(good, frontier, config());
    expect(detailed.plannerWouldBypass).toBe(true);
    expect(frontier.decide).not.toHaveBeenCalled();
    expect(trace.finalDecision).toBe("unchanged");
  });

  it("passes the current revision and refinement through the frontier input", async () => {
    const frontier = agent();
    const refined: ReconstructionRequest = { ...request, refinement: { current: source, change: { directives: ["shorter"] } } };
    await runOrchestratedReconstruction(refined, frontier, config());
    expect(vi.mocked(frontier.decide).mock.calls[0][0]).toMatchObject({ current: source, refinement: refined.refinement });
  });

  it("records experimental orchestration in a corpus evaluation without changing old record loading", async () => {
    const corpus = loadCorpus(process.cwd());
    const c = corpus.cases.find((item) => item.id === "formulaic")!;
    const frontier = agent();
    frontier.draft = async (input) => ({ data: { text: input.source, changes: [] }, meta });
    const provider: AIProvider = {
      info: { mode: "live", provider: "fake", model: "fake-frontier" },
      analyzeText: async () => null,
      reconstructText: async () => ({ text: source, changes: [] }),
      verifyMeaning: async () => [],
      analyzeVoiceprint: async () => [],
    };
    const record = await evaluateCase(c, { corpus, config: { provider: "anthropic", model: "fake-frontier", strategy: "reconstruction-v4" }, provider, runId: "orchestrator-test", orchestration: { agent: frontier, config: config() } });
    expect(record.stages[0].orchestration).toMatchObject({ delegationCount: 0, repairCount: 0, totalTokens: { input: 200, output: 40 } });
    expect(evaluationRecordSchema.safeParse(record).success).toBe(true);
    expect(record.stages[0].latencyMs).toBe(record.stages[0].orchestration?.totalLatencyMs);
    expect(record.stages[0].tokens).toEqual(record.stages[0].orchestration?.totalTokens);
  });

  it("builds v4 CLI evaluation wiring only for explicit live configuration", () => {
    const cfg = resolveConfig({ provider: "anthropic", model: "frontier-test", strategy: "reconstruction-v4", worker: { provider: "anthropic", model: "worker-test", tier: "cheap" } }, { ANTHROPIC_API_KEY: "fake-key" });
    const provider: AIProvider & StructuredCaller = { ...caller({ text: source, changes: [] }),
      analyzeText: async () => null, reconstructText: async () => ({ text: source, changes: [] }), verifyMeaning: async () => [], analyzeVoiceprint: async () => [] };
    const wired = createEvaluationOrchestration(cfg, provider, { ANTHROPIC_API_KEY: "fake-key" });
    expect(wired.config.workers).toMatchObject([{ id: "anthropic/worker-test", tier: "cheap", capability: "local-alternative" }]);
    expect(resolveConfig({ provider: "anthropic", model: "frontier-test", strategy: "reconstruction-v4" }, { ANTHROPIC_API_KEY: "fake-key" }).worker).toBeUndefined();
    expect(() => resolveConfig({ demo: true, strategy: "reconstruction-v4" }, {})).toThrow(/live frontier/);
  });

  it("cannot accidentally run v4 through the ordinary reconstruction pipeline", async () => {
    const provider: AIProvider = { info: { mode: "live", provider: "fake", model: "fake" }, analyzeText: async () => null,
      reconstructText: async () => ({ text: source, changes: [] }), verifyMeaning: async () => [], analyzeVoiceprint: async () => [] };
    await expect(runReconstructionDetailed(request, provider, { strategy: RECONSTRUCTION_V4 })).rejects.toThrow(/orchestrator runner/);
  });
});
