import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { discoverCatalog, discoverConfiguredCatalogs } from "./transport-discovery";

describe("read-only model transport discovery", () => {
  it("validates the saved authenticated evidence and separate sandbox failures", () => {
    const root = "data/experiments/editorial-intelligence-v1";
    const reports = ["transport-discovery.json", "transport-discovery-sandbox.json"]
      .map(name => JSON.parse(readFileSync(`${root}/${name}`, "utf8")));
    for (const report of reports) {
      expect(report).toMatchObject({ checkpoint: "3f622ea", metadataHttpRequests: 2,
        editorCalls: 0, diagnosisCalls: 0, judgeCalls: 0, actualModelIdentities: [], smokeTest: "NOT_EXECUTED" });
      expect(report.catalogs.map(row => row.provider)).toEqual(["gemini", "groq"]);
      expect(report.catalogs.every(row => row.requests === 1 && row.credentialConfigured &&
        !row.requestedEditorListed && !row.requestedJudgeListed)).toBe(true);
    }
    expect(reports[0].catalogs.map(row => row.modelIds.length)).toEqual([62, 11]);
    for (const row of reports[0].catalogs) {
      expect(row).toMatchObject({ httpStatuses: [200], authenticated: true, complete: true, failure: null });
      expect(row.modelIds).not.toContain("gpt-6-astra");
      expect(row.modelIds).not.toContain("gpt-6.1-sol");
      expect(row.latencyMs).toBeGreaterThan(0);
      expect(row.safeProjectionSha256).toBe(createHash("sha256").update(JSON.stringify({
        statuses: row.httpStatuses, modelIds: row.modelIds, complete: row.complete })).digest("hex"));
    }
    for (const row of reports[1].catalogs) expect(row).toMatchObject({ httpStatuses: [],
      authenticated: false, complete: false, failure: "NETWORK", modelIds: [], safeProjectionSha256: null });
  });
  it("makes no request without credentials and never includes credentials in results", async () => {
    const fetcher = vi.fn();
    const empty = await discoverCatalog("gemini", {}, fetcher);
    expect(empty).toMatchObject({ requests: 0, authenticated: false, failure: "NO_CREDENTIAL" });
    expect(fetcher).not.toHaveBeenCalled();
    const env = { GEMINI_API_KEY: "private-credential-value" };
    const fetchOk = vi.fn(async (_url, options) => {
      expect(options?.method).toBe("GET");
      expect(options?.redirect).toBe("error");
      expect(new Headers(options?.headers).get("x-goog-api-key")).toBe(env.GEMINI_API_KEY);
      return Response.json({ models: [{ name: "models/gemini-flash-3.8" }] });
    }) as typeof fetch;
    const result = await discoverCatalog("gemini", env, fetchOk);
    expect(result).toMatchObject({ authenticated: true, complete: true, requestedEditorListed: false, requestedJudgeListed: false });
    expect(JSON.stringify(result)).not.toContain(env.GEMINI_API_KEY);
  });

  it("handles complete pagination and exact model IDs without treating aliases as matches", async () => {
    const fetcher = vi.fn(async () => Response.json({ models: [{ name: "models/gpt-6-astra-alias" }], nextPageToken: "next" }))
      .mockImplementationOnce(async () => Response.json({ models: [{ name: "models/gemini-flash-3.8" }], nextPageToken: "next" }))
      .mockImplementationOnce(async () => Response.json({ models: [{ name: "models/gpt-6-astra-alias" }] }));
    const result = await discoverCatalog("gemini", { GEMINI_API_KEY: "credential" }, fetcher);
    expect(result).toMatchObject({ requests: 2, complete: true, requestedEditorListed: false });
  });

  it("does not expose upstream error text or credential echoes", async () => {
    const key = "private-credential-value";
    for (const fetcher of [vi.fn(async () => { throw new Error(key); }),
      vi.fn(async () => new Response(key, { status: 401 })),
      vi.fn(async () => Response.json({ data: [{ id: key }] }))]) {
      const report = await discoverCatalog("groq", { GROQ_API_KEY: key }, fetcher);
      expect(report.failure).not.toBeNull();
      expect(report.modelIds).not.toContain(key);
      expect(JSON.stringify(report)).not.toContain(key);
    }
  });

  it("records metadata requests and zero inference without executing an experiment", async () => {
    const fetcher = vi.fn(async url => String(url).includes("googleapis")
      ? Response.json({ models: [] }) : Response.json({ data: [{ id: "gpt-oss-120b" }] }));
    const report = await discoverConfiguredCatalogs({ GEMINI_API_KEY: "gemini-secret", GROQ_API_KEY: "groq-secret" }, fetcher);
    expect(report).toMatchObject({ metadataHttpRequests: 2, editorCalls: 0, diagnosisCalls: 0, judgeCalls: 0,
      actualModelIdentities: [], smokeTest: "NOT_EXECUTED" });
    expect(report.catalogs.every(row => row.authenticated && row.complete)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
