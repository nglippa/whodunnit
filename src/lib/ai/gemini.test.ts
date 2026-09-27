import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V2 } from "../reconstruction/strategies";
import { createEvaluationProvider, resolveConfig } from "../evaluation/config";
import { GeminiProvider } from "./gemini-provider";
import { ProviderError } from "./provider";
import { selectProvider } from "./select";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (payload: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 300 },
    responseId: "resp-1",
    ...extra,
  },
});

const source = "Revenue grew 12% in March, according to Priya's report.";

describe("GeminiProvider", () => {
  it("sends the versioned system prompt and a response schema, with the key in a header only", async () => {
    const { impl, calls } = fakeFetch([ok({ text: "Per Priya's report, revenue grew 12% in March.", changes: ["Led with the source"] })]);
    const p = new GeminiProvider("secret-key", "gemini-test", { fetch: impl });
    const plan = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V2);
    const out = await p.reconstructText({ source, profile: PRESETS.natural, plan, strategy: RECONSTRUCTION_V2 });

    expect(out.text).toBe("Per Priya's report, revenue grew 12% in March.");
    expect(out.meta).toMatchObject({ inputTokens: 900, outputTokens: 420, stopReason: "STOP", requestId: "resp-1", httpStatus: 200 });
    const [{ url, init }] = calls;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toMatch(/INTENSITY says/); // reconstruct.v3 for strategy v2
    expect(body.contents[0].parts[0].text).toContain("INTENSITY:");
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: { type: "OBJECT", required: ["text", "changes"] } });
    expect(p.info).toEqual({ mode: "live", provider: "gemini", model: "gemini-test" });
  });

  it("re-validates output: extra keys or a malformed finding are rejected, not trusted", async () => {
    const bad = new GeminiProvider("k", "m", { fetch: fakeFetch([ok({ text: "x", changes: [], note: "I added a fact" })]).impl });
    await expect(bad.reconstructText({ source, profile: PRESETS.natural, plan: buildRewritePlan({ source, profile: PRESETS.natural }) })).rejects.toMatchObject({ code: "invalid_output" });
    const findings = new GeminiProvider("k", "m", { fetch: fakeFetch([ok({ findings: [{ kind: "vibes", severity: "blocking", message: "m" }] })]).impl });
    await expect(findings.verifyMeaning(source, source)).rejects.toBeInstanceOf(ProviderError);
  });

  it("marks meaning findings as model findings", async () => {
    const p = new GeminiProvider("k", "m", { fetch: fakeFetch([ok({ findings: [{ kind: "changed_assertion", severity: "warning", message: "Softer." }] })]).impl });
    expect(await p.verifyMeaning(source, source)).toEqual([{ kind: "changed_assertion", severity: "warning", message: "Softer.", origin: "model" }]);
  });

  it("maps HTTP failures to provider errors and retries only transient ones", async () => {
    const auth = fakeFetch([{ status: 403, body: { error: { message: "denied" } } }]);
    await expect(new GeminiProvider("k", "m", { fetch: auth.impl }).verifyMeaning(source, source)).rejects.toMatchObject({ code: "unavailable", meta: { httpStatus: 403 } });
    expect(auth.calls).toHaveLength(1);

    const flaky = fakeFetch([{ status: 503, body: {} }, ok({ findings: [] })]);
    const p = new GeminiProvider("k", "m", { fetch: flaky.impl, maxRetries: 1, retryDelayMs: 1 });
    expect(await p.verifyMeaning(source, source)).toEqual([]);
    expect(flaky.calls).toHaveLength(2);

    const blocked = fakeFetch([{ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }]);
    await expect(new GeminiProvider("k", "m", { fetch: blocked.impl }).verifyMeaning(source, source)).rejects.toMatchObject({ code: "invalid_output", meta: { stopReason: "SAFETY" } });
  });
});

describe("provider selection", () => {
  it("auto prefers Anthropic, then Gemini, and reports demo with a reason otherwise", () => {
    expect(selectProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).toEqual({ provider: "anthropic", key: "a" });
    expect(selectProvider({ GEMINI_API_KEY: "g" })).toEqual({ provider: "gemini", key: "g" });
    expect(selectProvider({ GOOGLE_API_KEY: "g2" })).toEqual({ provider: "gemini", key: "g2" });
    expect(selectProvider({ WHODUNNIT_AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).toEqual({ provider: "gemini", key: "g" });
    expect(selectProvider({ WHODUNNIT_AI_PROVIDER: "gemini" })).toMatchObject({ provider: "demo", reason: "no-key" });
    expect(selectProvider({})).toMatchObject({ provider: "demo", reason: "no-key" });
  });

  it("evaluation picks Gemini when that is the key available, and still refuses to fall back", () => {
    const c = resolveConfig({}, { GEMINI_API_KEY: "g" });
    expect(c).toEqual({ provider: "gemini", model: "gemini-3.8-flash", strategy: "reconstruction-v1" });
    expect(createEvaluationProvider(c, { GEMINI_API_KEY: "g" }).info).toEqual({ mode: "live", provider: "gemini", model: "gemini-3.8-flash" });
    expect(() => createEvaluationProvider(resolveConfig({ provider: "gemini" }, {}), {})).toThrow(/GEMINI_API_KEY is not set/);
  });
});

describe("Gemini rate limits", () => {
  it("reads the server's retry hint from the header or the RetryInfo body", async () => {
    const { retryHint } = await import("./gemini-provider");
    expect(await retryHint(new Response("{}", { status: 429, headers: { "retry-after": "7" } }))).toEqual({ delayMs: 7000, daily: false });
    expect(await retryHint(new Response(JSON.stringify({ error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "13s" }] } }), { status: 429 }))).toEqual({ delayMs: 13000, daily: false });
    expect(await retryHint(new Response("{}", { status: 503 }))).toEqual({ delayMs: null, daily: false });
  });

  it("fails fast on an exhausted daily quota instead of retrying", async () => {
    const body = { error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { retryDelay: "22s" }] } };
    const f = fakeFetch([{ status: 429, body }]);
    const p = new GeminiProvider("k", "m", { fetch: f.impl, maxRetries: 5, retryDelayMs: 1 });
    await expect(p.verifyMeaning(source, source)).rejects.toThrow(/daily request quota/);
    expect(f.calls).toHaveLength(1);
  });
});
