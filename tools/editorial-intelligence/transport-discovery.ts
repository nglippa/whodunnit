/** Read-only authenticated catalog checks. Never starts an editor or CLI model
 * session. Credentials remain in memory/headers; errors and headers are not
 * logged or persisted. Catalog membership is not invocation entitlement. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { protocol } from "./experiment";

const providers = {
  gemini: { endpoint: "https://generativelanguage.googleapis.com/v1beta/models", keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] },
  groq: { endpoint: "https://api.groq.com/openai/v1/models", keys: ["GROQ_API_KEY"] },
} as const;
type Provider = keyof typeof providers;
type Environment = Record<string, string | undefined>;
export type Catalog = {
  provider: Provider; endpoint: string; credentialConfigured: boolean; startedAt: string; latencyMs: number;
  requests: number; httpStatuses: number[]; authenticated: boolean; complete: boolean;
  modelIds: string[]; requestedEditorListed: boolean; requestedJudgeListed: boolean;
  safeProjectionSha256: string | null;
  failure: "NO_CREDENTIAL" | "NETWORK" | "HTTP" | "INVALID_CATALOG" | "PAGINATION_LIMIT" | null;
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export async function discoverCatalog(provider: Provider, env: Environment, fetchImpl: typeof fetch = fetch): Promise<Catalog> {
  const settings = providers[provider], key = settings.keys.map(name => env[name]?.trim()).find(Boolean);
  const started = performance.now();
  const report: Catalog = { provider, endpoint: settings.endpoint, credentialConfigured: Boolean(key), startedAt: new Date().toISOString(),
    latencyMs: 0, requests: 0, httpStatuses: [], authenticated: false, complete: false, modelIds: [],
    requestedEditorListed: false, requestedJudgeListed: false, safeProjectionSha256: null, failure: null };
  const finish = () => {
    report.modelIds = [...new Set(report.modelIds)].sort();
    report.requestedEditorListed = report.modelIds.includes(protocol.editorModel);
    report.requestedJudgeListed = report.modelIds.includes(protocol.judgeModel);
    report.latencyMs = performance.now() - started;
    if (report.httpStatuses.length) report.safeProjectionSha256 = sha(JSON.stringify({ statuses: report.httpStatuses,
      modelIds: report.modelIds, complete: report.complete }));
    return report;
  };
  if (!key) { report.failure = "NO_CREDENTIAL"; return finish(); }
  const secretValues = Object.entries(env).filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(name) && value).map(([, value]) => value!);
  const headers: Record<string, string> = provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL(settings.endpoint);
    if (provider === "gemini") { url.searchParams.set("pageSize", "1000"); if (pageToken) url.searchParams.set("pageToken", pageToken); }
    let response: Response;
    try {
      report.requests++;
      response = await fetchImpl(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch { report.failure = "NETWORK"; return finish(); }
    report.httpStatuses.push(response.status);
    if (!response.ok) { report.failure = "HTTP"; return finish(); }
    report.authenticated = true;
    try {
      const body = await response.json();
      const rows = provider === "gemini" ? body.models : body.data;
      if (!Array.isArray(rows)) throw new Error("Invalid catalog");
      for (const row of rows) {
        const raw = provider === "gemini" ? row.name : row.id;
        if (typeof raw !== "string" || secretValues.some(secret => raw.includes(secret))) throw new Error("Invalid catalog");
        const id = provider === "gemini" ? raw.replace(/^models\//, "") : raw;
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,160}$/.test(id)) throw new Error("Invalid catalog");
        report.modelIds.push(id);
      }
      if (provider === "groq" || !body.nextPageToken) { report.complete = true; return finish(); }
      if (typeof body.nextPageToken !== "string" || body.nextPageToken === pageToken) throw new Error("Invalid pagination");
      pageToken = body.nextPageToken;
    } catch { report.failure = "INVALID_CATALOG"; return finish(); }
  }
  report.failure = "PAGINATION_LIMIT";
  return finish();
}

export async function discoverConfiguredCatalogs(env: Environment, fetchImpl: typeof fetch = fetch) {
  const catalogs = [];
  // Sequential and metadata-only: no generation, fallback, retry or CLI.
  for (const provider of ["gemini", "groq"] as const) catalogs.push(await discoverCatalog(provider, env, fetchImpl));
  return { version: "editorial-transport-discovery-v1", checkpoint: "3f622ea", catalogs,
    metadataHttpRequests: catalogs.reduce((sum, item) => sum + item.requests, 0),
    editorCalls: 0, diagnosisCalls: 0, judgeCalls: 0, actualModelIdentities: [], smokeTest: "NOT_EXECUTED",
    caveat: "Authenticated catalog results verify metadata access only. No model availability, inference identity or free quota is inferred from login/subscription." };
}

async function main() {
  const report = await discoverConfiguredCatalogs(process.env);
  if (process.argv.includes("--record")) writeFileSync("data/experiments/editorial-intelligence-v1/transport-discovery.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.catalogs.some(row => row.failure === "NETWORK")) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
