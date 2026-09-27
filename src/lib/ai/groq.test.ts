import { describe, expect, it } from "vitest";
import { judgeOutputSchema } from "@/domain/judge";
import { PRESETS } from "@/domain/style";
import { extractClaims } from "../semantics/claims";
import { EvaluationConfigError, createJudge, resolveConfig } from "../evaluation/config";
import { loadCorpus } from "../evaluation/corpus";
import { ModelSemanticJudge } from "../evaluation/judge";
import { evaluateCase } from "../evaluation/runner";
import type { SemanticJudge } from "../evaluation/judge";
import { DemoProvider } from "./demo";
import { GROQ_BASE_URL, createGroqProvider } from "./groq";
import { jsonSchemaFor, strictSubset } from "./openai-compatible-provider";

type Call = { url: string; init: RequestInit };
function fakeFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const reply = (content: string) => ({ id: "req-1", choices: [{ message: { content, reasoning: "hidden" }, finish_reason: "stop" }], usage: { prompt_tokens: 1800, completion_tokens: 420 } });

const source = "The team probably shipped on Friday.";
const output = "The team shipped on Friday.";
const input = { source, output, sourceClaims: extractClaims(source), outputClaims: extractClaims(output), deterministic: [] };

describe("Groq transport", () => {
  it("sends a strict schema subset that drops keywords strict mode rejects, keeping structure", () => {
    const s = strictSubset(jsonSchemaFor(judgeOutputSchema)) as Record<string, unknown>;
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/maxLength|maxItems|minLength/);
    expect(s).toMatchObject({ type: "object", required: ["findings"], additionalProperties: false });
    const item = ((s.properties as Record<string, { items: Record<string, unknown> }>).findings).items;
    expect(item).toMatchObject({ additionalProperties: false, required: ["kind", "severity", "sourceEvidence", "outputEvidence", "explanation"] });
    expect(JSON.stringify(item)).toContain('"enum"');
  });

  it("posts a non-streaming strict json_schema request with the fixed reasoning effort", async () => {
    const { impl, calls } = fakeFetch(reply(JSON.stringify({ findings: [] })));
    const groq = createGroqProvider("gsk-test", "openai/gpt-oss-120b", { reasoningEffort: "medium" }, impl);
    const r = await groq.callStructured(judgeOutputSchema, "semantic_judgement", "system", "user");
    expect(r.data).toEqual({ findings: [] });
    expect(r.meta).toMatchObject({ inputTokens: 1800, outputTokens: 420, requestId: "req-1" });
    expect(calls[0].url).toBe(`${GROQ_BASE_URL}/chat/completions`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer gsk-test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: "openai/gpt-oss-120b", stream: false, include_reasoning: false, reasoning_effort: "medium", max_tokens: 4096 });
    expect(body).not.toHaveProperty("stream_options");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(JSON.stringify(body.response_format)).not.toContain("maxLength");
    expect(groq.info).toEqual({ mode: "live", provider: "groq", model: "openai/gpt-oss-120b" });
    expect(JSON.stringify(groq.info)).not.toContain("gsk-test");
  });

  it("never treats malformed judge output as a pass", async () => {
    for (const bad of [reply("not json"), reply(JSON.stringify({ findings: [{ kind: "vibes", severity: "blocking" }] })), reply(""), { error: { message: "x" } }]) {
      const judge = new ModelSemanticJudge(createGroqProvider("k", "m", {}, fakeFetch(bad).impl));
      const r = await judge.judge(input);
      expect(r.status).toBe("failed");
      expect(r.verdict).toBe("NOT_RUN");
    }
  });
});

describe("Groq judge configuration", () => {
  it("requires an explicit model and a valid reasoning effort, and never falls back without a key", () => {
    expect(() => resolveConfig({ provider: "local", model: "bonsai", judge: { provider: "groq" } }, {})).toThrow(/needs --judge-model/);
    expect(() => resolveConfig({ provider: "local", model: "bonsai", judge: { provider: "groq", model: "m", reasoningEffort: "max" } }, {})).toThrow(EvaluationConfigError);
    const c = resolveConfig({ provider: "local", model: "bonsai", judge: { provider: "groq", model: "openai/gpt-oss-120b", reasoningEffort: "medium" } }, {});
    expect(c.judge).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", reasoningEffort: "medium" });
    expect(() => createJudge(c, {})).toThrow(/GROQ_API_KEY is not set/);
    const judge = createJudge(c, { GROQ_API_KEY: "gsk" })!;
    expect(judge.info).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect(judge.settings?.applied).toEqual(["maxTokens=4096", "reasoningEffort=medium"]);
  });

  it("does not call the judge on output identical to the source, and records it as skipped", async () => {
    const corpus = loadCorpus(process.cwd());
    let calls = 0;
    const counting: SemanticJudge = {
      info: { provider: "groq", model: "m" },
      judge: async () => {
        calls++;
        throw new Error("should not be called");
      },
    };
    const config = { provider: "demo" as const, model: null, strategy: "reconstruction-v3" };
    const r = await evaluateCase(corpus.cases.find((c) => c.id === "already-good")!, { corpus, config, provider: new DemoProvider(), runId: "t", judge: counting });
    expect(r.stages[0].unchangedByPolicy).toBe(true);
    expect(calls).toBe(0);
    expect(r.stages[0].semantic.judge).toMatchObject({ status: "skipped", verdict: "NOT_RUN" });
    expect(r.stages[0].semantic.verdict).toBe("PASS");
  });

  it("records the judge's provenance and settings in every evaluation record", async () => {
    const corpus = loadCorpus(process.cwd());
    const fake: SemanticJudge = {
      info: { provider: "groq", model: "openai/gpt-oss-120b" },
      settings: { applied: ["reasoningEffort=medium"], unsupported: [], declared: [] },
      judge: async () => ({ provider: "groq", model: "openai/gpt-oss-120b", prompt: "judge.v1", selfJudged: false, status: "ran", error: null, verdict: "PASS", findings: [], latencyMs: 5, tokens: { input: 10, output: 5 } }),
    };
    const config = { provider: "demo" as const, model: null, strategy: "reconstruction-v3" };
    const r = await evaluateCase(corpus.cases.find((c) => c.id === "formulaic")!, { corpus, config, provider: new DemoProvider(), runId: "t", judge: fake });
    expect(r.config.judge).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", selfJudged: false, prompt: "judge.v1", settings: { applied: ["reasoningEffort=medium"], unsupported: [] } });
    expect(r.stages[0].semantic.judge?.status).toBe("ran");
    expect(PRESETS.natural).toBeDefined();
  });
});
