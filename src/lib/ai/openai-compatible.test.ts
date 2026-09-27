import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { createEvaluationProvider, resolveConfig } from "../evaluation/config";
import { OpenAICompatibleProvider, jsonSchemaFor } from "./openai-compatible-provider";
import { candidateSchema } from "./schemas";
import { selectProvider } from "./select";

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const reply = (content: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { id: "chatcmpl-1", choices: [{ message: { content, reasoning_content: "thinking about it" }, finish_reason: "stop" }], usage: { prompt_tokens: 1300, completion_tokens: 2800 }, ...extra },
});
const source = "Revenue grew 12% in March, according to Priya's report.";

describe("OpenAICompatibleProvider", () => {
  it("posts a json_schema response format to /chat/completions and ignores reasoning content", async () => {
    const { impl, calls } = fakeFetch([reply(JSON.stringify({ text: "Per Priya's report, revenue grew 12% in March.", changes: [] }))]);
    const p = new OpenAICompatibleProvider("bonsai-2-27b", { baseUrl: "http://127.0.0.1:8080/v1/", fetch: impl });
    const out = await p.reconstructText({ source, profile: PRESETS.natural, plan: buildRewritePlan({ source, profile: PRESETS.natural }) });
    expect(out.text).toBe("Per Priya's report, revenue grew 12% in March.");
    expect(out.meta).toMatchObject({ inputTokens: 1300, outputTokens: 2800, stopReason: "stop", requestId: "chatcmpl-1" });
    expect(calls[0].url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "candidate", strict: true, schema: { type: "object", required: ["text", "changes"], additionalProperties: false } } });
    expect(body.messages[0].role).toBe("system");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(p.info).toEqual({ mode: "live", provider: "openai-compatible@127.0.0.1:8080", model: "bonsai-2-27b" });
  });

  it("sends a bearer token only when configured, and never puts it in the recorded provider name", async () => {
    const { impl, calls } = fakeFetch([reply(JSON.stringify({ findings: [] }))]);
    const p = new OpenAICompatibleProvider("m", { baseUrl: "https://api.example.com/openai/v1", apiKey: "sk-secret", fetch: impl });
    await p.verifyMeaning(source, source);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-secret");
    expect(JSON.stringify(p.info)).not.toContain("sk-secret");
  });

  it("reports a truncated answer and invalid JSON as invalid output", async () => {
    const cut = new OpenAICompatibleProvider("m", { fetch: fakeFetch([{ status: 200, body: { choices: [{ message: { content: "" }, finish_reason: "length" }] } }]).impl });
    await expect(cut.verifyMeaning(source, source)).rejects.toThrow(/ran out of output tokens/);
    const junk = new OpenAICompatibleProvider("m", { fetch: fakeFetch([reply("Sure! Here you go")]).impl });
    await expect(junk.verifyMeaning(source, source)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("says the server is down rather than failing obscurely", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider("m", { fetch: down, maxRetries: 0 });
    await expect(p.verifyMeaning(source, source)).rejects.toThrow(/could not be reached\. Is it running\?/);
  });

  it("derives JSON Schema from the Zod schemas the output is validated with", () => {
    const s = jsonSchemaFor(candidateSchema);
    expect(s).not.toHaveProperty("$schema");
    expect(s).toMatchObject({ type: "object", properties: { text: { type: "string" }, changes: { type: "array", maxItems: 8 } } });
  });
});

describe("streaming", () => {
  it("assembles SSE deltas, skipping reasoning, and keeps the final usage chunk", async () => {
    const chunks = [
      { id: "c1", choices: [{ delta: { reasoning_content: "let me think" } }] },
      { id: "c1", choices: [{ delta: { content: '{"findings":' } }] },
      { id: "c1", choices: [{ delta: { content: "[]}" }, finish_reason: "stop" }] },
      { id: "c1", choices: [], usage: { prompt_tokens: 50, completion_tokens: 9 } },
    ];
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    // Split mid-line to prove the reader buffers partial lines.
    const bytes = new TextEncoder().encode(sse);
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(bytes.slice(0, 37));
        ctrl.enqueue(bytes.slice(37));
        ctrl.close();
      },
    });
    const impl = (async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;
    const calls: RequestInit[] = [];
    const spy = (async (u: string, init: RequestInit) => (calls.push(init), impl(u, init))) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider("m", { fetch: spy });
    expect(await p.verifyMeaning(source, source)).toEqual([]);
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it("reports a timeout as a timeout, and does not re-send the request", async () => {
    let n = 0;
    const slow = (async (_u: string, init: RequestInit) => {
      n++;
      await new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError"))));
    }) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider("m", { fetch: slow, timeoutMs: 20, maxRetries: 2 });
    await expect(p.verifyMeaning(source, source)).rejects.toThrow(/did not finish within/);
    expect(n).toBe(1);
  });
});

describe("local provider configuration", () => {
  it("is used only when asked for, with a default local base URL", () => {
    expect(selectProvider({ WHODUNNIT_AI_PROVIDER: "local" })).toEqual({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:8080/v1", key: undefined });
    expect(selectProvider({})).toMatchObject({ provider: "demo" });
    const c = resolveConfig({ provider: "local", model: "bonsai-2-27b" }, {});
    expect(c).toEqual({ provider: "openai-compatible", model: "bonsai-2-27b", strategy: "reconstruction-v1", baseUrl: "http://127.0.0.1:8080/v1" });
    expect(createEvaluationProvider(c, {}).info).toMatchObject({ mode: "live", provider: "openai-compatible@127.0.0.1:8080" });
    expect(resolveConfig({ baseUrl: "http://localhost:11434/v1", model: "qwen3" }, {})).toMatchObject({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1" });
    expect(() => resolveConfig({ provider: "gemini", baseUrl: "http://x/v1" }, {})).toThrow(/--base-url applies only/);
  });
});
