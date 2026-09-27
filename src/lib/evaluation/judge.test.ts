import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { evaluationRecordSchema, runManifestSchema } from "@/domain/evaluation";
import { judgeOutputSchema, type JudgeResult } from "@/domain/judge";
import { PRESETS } from "@/domain/style";
import type { VerificationResult } from "@/domain/verification";
import { OpenAICompatibleProvider } from "../ai/openai-compatible-provider";
import type { CallMeta, StructuredCaller } from "../ai/provider";
import { extractClaims } from "../semantics/claims";
import { integrityReport, verifyDeterministic } from "../verification/verify";
import { EvaluationConfigError, createEvaluationProvider, createJudge, resolveConfig } from "./config";
import { ModelSemanticJudge, evidenceFound, judgeVerdict, verifyJudgeFindings } from "./judge";
import { semanticGate } from "./measures";
import { comparabilityNotes } from "./report";
import type { StoredRun } from "./store";

const fixture = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "src/lib/evaluation/__fixtures__", f), "utf8"));

function fakeCaller(reply: unknown | Error, info = { mode: "live" as const, provider: "fake-judge", model: "judge-1" }) {
  const prompts: { system: string; user: string }[] = [];
  const caller: StructuredCaller = {
    info,
    async callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
      prompts.push({ system, user });
      if (reply instanceof Error) throw reply;
      return { data: schema.parse(reply), meta: { latencyMs: 12, inputTokens: 900, outputTokens: 80 } as CallMeta };
    },
    generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  };
  return { caller, prompts };
}

const source = "The team probably shipped on Friday. Costs fell 12%.";
const output = "The team shipped on Friday. Costs fell 12%.";
const input = { source, output, sourceClaims: extractClaims(source), outputClaims: extractClaims(output), deterministic: [] };

describe("judge contract", () => {
  it("validates judge output strictly: known kinds, severities and fields only", () => {
    expect(judgeOutputSchema.safeParse({ findings: [{ kind: "strengthened", severity: "major", sourceEvidence: "probably shipped", outputEvidence: "shipped", explanation: "Hedge removed." }] }).success).toBe(true);
    expect(judgeOutputSchema.safeParse({ findings: [{ kind: "vibes", severity: "major", sourceEvidence: "", outputEvidence: "", explanation: "x" }] }).success).toBe(false);
    expect(judgeOutputSchema.safeParse({ findings: [], verdict: "same" }).success).toBe(false);
  });

  it("verifies evidence against the texts and caps unverifiable findings at minor", () => {
    expect(evidenceFound("probably shipped", source)).toBe(true);
    expect(evidenceFound("The team … Friday", source)).toBe(true);
    expect(evidenceFound("definitely shipped", source)).toBe(false);
    const f = verifyJudgeFindings(
      [
        { kind: "strengthened", severity: "blocking", sourceEvidence: "probably shipped", outputEvidence: "team shipped", explanation: "Hedge dropped." },
        { kind: "added_claim", severity: "blocking", sourceEvidence: "", outputEvidence: "made up words", explanation: "Invented." },
      ],
      source,
      output,
    );
    expect(f.map((x) => [x.evidenceVerified, x.effectiveSeverity])).toEqual([
      [true, "blocking"],
      [false, "minor"],
    ]);
    expect(judgeVerdict(f)).toBe("FAIL");
    expect(judgeVerdict([f[1]])).toBe("PASS");
  });

  it("sends source, output, both claim lists and the deterministic findings", async () => {
    const { caller, prompts } = fakeCaller({ findings: [] });
    const judge = new ModelSemanticJudge(caller);
    const r = await judge.judge({ ...input, deterministic: integrityReport(source, output, PRESETS.natural).comparison.changes });
    expect(r).toMatchObject({ status: "ran", verdict: "PASS", selfJudged: false, prompt: "judge.v1", tokens: { input: 900, output: 80 } });
    const u = prompts[0].user;
    expect(u).toContain("SOURCE CLAIMS");
    expect(u).toContain("OUTPUT CLAIMS");
    expect(u).toMatch(/DETERMINISTIC FINDINGS:\n- major strengthened\/modality/);
    expect(u).toContain("<source>");
    expect(u).toContain("<candidate>");
    expect(prompts[0].system).toMatch(/Evidence is required/);
  });

  it("reports a judge that could not run as NOT_RUN, never as a pass, and marks self-judging", async () => {
    const failing = await new ModelSemanticJudge(fakeCaller(new Error("quota")).caller).judge(input);
    expect(failing).toMatchObject({ status: "failed", verdict: "NOT_RUN", error: "quota" });
    const self = await new ModelSemanticJudge(fakeCaller({ findings: [] }).caller, { provider: "fake-judge", model: "judge-1" }).judge(input);
    expect(self.selfJudged).toBe(true);
  });
});

describe("gate with an independent judge", () => {
  const detFail: VerificationResult = { status: "rejected", findings: [{ kind: "altered_number", severity: "blocking", origin: "deterministic", message: "12% changed." }], checks: ["protected_spans"], lexicalCoverage: 1 };
  const clean: VerificationResult = { status: "preserved", findings: [], checks: ["protected_spans", "claims"], lexicalCoverage: 1 };
  const judged = (verdict: JudgeResult["verdict"], severity: "blocking" | "major" = "blocking"): JudgeResult => ({
    provider: "fake",
    model: "j",
    prompt: "judge.v1",
    selfJudged: false,
    status: "ran",
    error: null,
    verdict,
    findings: verdict === "PASS" ? [] : [{ kind: "strengthened", severity, sourceEvidence: "a", outputEvidence: "b", explanation: "x", evidenceVerified: true, effectiveSeverity: severity }],
    latencyMs: 1,
    tokens: null,
  });

  it("a deterministic FAIL stands even when the judge passes, and the disagreement is recorded", () => {
    const g = semanticGate(detFail, "x", [], { judge: judged("PASS") });
    expect(g.verdict).toBe("FAIL");
    expect(g.disagreements).toContainEqual(expect.objectContaining({ between: ["deterministic", "judge"], verdicts: ["FAIL", "PASS"], note: expect.stringMatching(/deterministic failure stands/) }));
  });

  it("a verified judge failure fails a deterministic pass; a major finding asks for review", () => {
    expect(semanticGate(clean, "x", [], { judge: judged("FAIL") }).verdict).toBe("FAIL");
    expect(semanticGate(clean, "x", [], { judge: judged("NEEDS_REVIEW", "major") }).verdict).toBe("NEEDS_REVIEW");
    expect(semanticGate(clean, "x", [], { judge: { ...judged("PASS"), status: "failed", verdict: "NOT_RUN" } }).verdict).toBe("PASS");
  });
});

describe("configuration: judge and generation", () => {
  it("resolves a judge and refuses to run one without its key", () => {
    const c = resolveConfig({ provider: "local", model: "qwen3:14b-q8_0", judge: { provider: "gemini" } }, {});
    expect(c.judge).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
    expect(() => createJudge(c, {})).toThrow(/GEMINI_API_KEY is not set/);
    expect(() => resolveConfig({ judge: { model: "x" } }, {})).toThrow(EvaluationConfigError);
  });

  it("records the reasoning budget and reports what is sent, declared or unsupported", () => {
    const c = resolveConfig({ provider: "local", model: "bonsai", generation: { reasoningBudget: 1024, temperature: 0.7, seed: 7 } }, {});
    expect(c.generation).toEqual({ reasoningBudget: 1024, temperature: 0.7, seed: 7 });
    const p = createEvaluationProvider(c, {});
    expect(p.generationReport?.()?.applied.sort()).toEqual(["reasoningBudget=1024", "seed=7", "temperature=0.7"]);
    expect(p.generationReport?.()?.unsupported).toEqual([]);
    const declared = createEvaluationProvider(resolveConfig({ provider: "local", model: "bonsai", generation: { reasoningBudget: 4096, reasoningControl: "server-declared" } }, {}), {});
    expect(declared.generationReport?.()).toEqual({ applied: [], unsupported: [], declared: ["reasoningBudget=4096"] });
    const anthropic = createEvaluationProvider(resolveConfig({ provider: "anthropic", generation: { seed: 1, reasoningBudget: 512 } }, {}), { ANTHROPIC_API_KEY: "k" });
    expect(anthropic.generationReport?.().unsupported).toEqual(["seed=1", "reasoningBudget=512"]);
    expect(() => resolveConfig({ provider: "local", generation: { reasoningControl: "request" } }, {})).toThrow(/needs --reasoning-budget/);
  });

  it("sends the reasoning budget per request under the configured parameter name, and never a declared one", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"findings":[]}' }, finish_reason: "stop" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new OpenAICompatibleProvider("m", { fetch: fetchImpl, generation: { reasoningBudget: 512, topK: 20 } }).verifyMeaning("a b", "a b");
    await new OpenAICompatibleProvider("m", { fetch: fetchImpl, generation: { reasoningBudget: 512, reasoningParam: "thinking_budget" } }).verifyMeaning("a b", "a b");
    await new OpenAICompatibleProvider("m", { fetch: fetchImpl, generation: { reasoningBudget: 4096, reasoningControl: "server-declared" } }).verifyMeaning("a b", "a b");
    expect(bodies[0]).toMatchObject({ thinking_budget_tokens: 512, top_k: 20 });
    expect(bodies[1]).toMatchObject({ thinking_budget: 512 });
    expect(bodies[2]).not.toHaveProperty("thinking_budget_tokens");
  });

  it("flags runs with different reasoning budgets or analysis versions as not like for like", () => {
    const run = (budget: number | undefined, analysisVersion?: string) =>
      ({
        manifest: { runId: "r", mode: "live", realModel: true, corpusVersion: 1, config: { strategy: "reconstruction-v2" } },
        failures: [],
        records: [{ case: { id: "a", textHash: "h" }, config: { strategy: { key: "reconstruction-v2" }, model: "m", prompt: { key: "p", fingerprint: "f" }, rulePacks: [], analysisVersion, generation: { requested: budget === undefined ? {} : { reasoningBudget: budget }, applied: [], unsupported: [], declared: [] }, judge: null } }],
      }) as unknown as StoredRun;
    expect(comparabilityNotes(run(4096, "semantics.v1"), run(1024, "semantics.v1")).join(" ")).toMatch(/Reasoning budget differs \(4096 vs 1024\)/);
    expect(comparabilityNotes(run(undefined), run(undefined, "semantics.v1")).join(" ")).toMatch(/Meaning analysis differs/);
  });
});

describe("evaluation file compatibility", () => {
  it("still loads version-1 records and manifests written before claim-level integrity", () => {
    const r = evaluationRecordSchema.safeParse(fixture("record-v1.json"));
    expect(r.success).toBe(true);
    expect(r.data?.schemaVersion).toBe(1);
    expect(r.data?.stages[0].semantic.integrity).toBeUndefined();
    expect(runManifestSchema.safeParse(fixture("run-v1.json")).success).toBe(true);
  });

  it("gates a verified deterministic check result through the new analysis", () => {
    const v = verifyDeterministic("It took an hour. Maybe more.", "Took most of an hour.", PRESETS.natural);
    expect(v.checks).toEqual(expect.arrayContaining(["claims", "quotations", "phrases", "mechanics"]));
    expect(v.findings).toContainEqual(expect.objectContaining({ kind: "quantity_changed", severity: "blocking" }));
  });
});
