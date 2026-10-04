/** One isolated, single-attempt source/objective-only RAW editor call. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const rawResponseSchema = z.object({ text: z.string().min(1).max(60_000) }).strict();
const rawRequestSchema = z.object({ source: z.string(), objective: z.string() }).strict();
const rawResponseSchemaBytes = readFileSync(new URL("../../data/evaluation/post-v3-comparison/raw-response.schema.json", import.meta.url));
const rawResponseJsonSchema: unknown = z.object({
  $schema: z.literal("https://json-schema.org/draft/2020-12/schema"),
  type: z.literal("object"),
  properties: z.object({ text: z.object({ type: z.literal("string"), minLength: z.literal(1), maxLength: z.literal(60_000) }).strict() }).strict(),
  required: z.tuple([z.literal("text")]),
  additionalProperties: z.literal(false),
}).strict().parse(JSON.parse(rawResponseSchemaBytes.toString("utf8")));
type RawRequest = z.infer<typeof rawRequestSchema>;
export type CliResult = { code: number | null; stdout: string; stderr: string; timedOut?: boolean };
export type Execute = (args: string[], stdin: string, cwd: string, env: NodeJS.ProcessEnv) => Promise<CliResult>;
export type RawFailureCategory = "timeout" | "cli-failure" | "cli-error" | "envelope-invalid" | "model-unresolved" | "model-mismatch" | "response-schema-invalid";
export class RawAdapterError extends Error {
  constructor(
    readonly category: RawFailureCategory,
    readonly requestSha256: string,
    readonly responseEnvelopeSha256: string | null,
    readonly reportedModel: string | null,
    readonly startedAt: string,
    readonly durationMs: number,
  ) {
    super(`raw-editor-${category}`);
  }
}
const CALL_TIMEOUT_MS = 120_000;
const MODEL_ID = "claude-sonnet-5-5";
const EFFORT = "medium" as const;
export const RAW_PROMPT_SHA256 = "0e05f84297407b68d8e642f3944a00fa8fb9369a5c2c0696bbde196db688994c";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export const executeClaude: Execute = (args, stdin, cwd, env) => new Promise((done) => {
  const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: false });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 2_000).unref(); }, CALL_TIMEOUT_MS);
  const finish = (result: CliResult) => { if (settled) return; settled = true; clearTimeout(timer); done(result); };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", () => finish({ code: null, stdout: "", stderr: "process-start-failed" }));
  child.stdin.on("error", () => {});
  child.on("close", code => finish({ code, stdout: timedOut ? "" : stdout, stderr: timedOut ? "" : stderr, timedOut }));
  child.stdin.end(stdin);
});

function accountEnvironment(source: NodeJS.ProcessEnv) {
  const env = { ...source };
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) delete env[key];
  for (const key of Object.keys(env)) if (/^(?:ANTHROPIC|CLAUDE)_.*FALLBACK/.test(key)) delete env[key];
  env.MAX_STRUCTURED_OUTPUT_RETRIES = "0";
  env.CLAUDE_CODE_MAX_RETRIES = "0";
  return env;
}

function cliSchema(schema: unknown) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema) ||
      (schema as Record<string, unknown>).$schema !== "https://json-schema.org/draft/2020-12/schema")
    throw new Error("unsupported response schema");
  const copy = { ...(schema as Record<string, unknown>) };
  delete copy.$schema;
  return JSON.stringify(copy);
}

export function rawEditorArguments(system: string) {
  if (!system.trim()) throw new Error("prompt must not be empty");
  return ["--print", "--system-prompt", system, "--json-schema", cliSchema(rawResponseJsonSchema), "--output-format", "json", "--no-session-persistence", "--tools", "", "--model", MODEL_ID, "--effort", EFFORT,
  "--safe-mode", "--setting-sources", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands"];
}

function parseResponse(result: CliResult, requestSha256: string, startedAt: string, startedMilliseconds: number) {
  const responseEnvelopeSha256 = result.stdout ? sha256(result.stdout) : null;
  const durationMs = Date.now() - startedMilliseconds;
  const fail = (category: RawFailureCategory, reportedModel: string | null = null): never => {
    throw new RawAdapterError(category, requestSha256, responseEnvelopeSha256, reportedModel, startedAt, durationMs);
  };
  if (result.timedOut) fail("timeout");
  if (result.code !== 0) fail("cli-failure");
  const envelope = (() => {
    try { return cliEnvelopeSchema.parse(JSON.parse(result.stdout)); } catch { return fail("envelope-invalid"); }
  })();
  if (envelope.is_error) fail("cli-error", envelope.model ?? null);
  const resolvedModels = [...new Set([...(envelope.model ? [envelope.model] : []), ...Object.keys(envelope.modelUsage ?? {})])];
  if (resolvedModels.length === 0) fail("model-unresolved", envelope.model ?? null);
  if (resolvedModels.length !== 1 || resolvedModels[0] !== MODEL_ID) fail("model-mismatch", envelope.model ?? resolvedModels.join(","));
  const value = (() => {
    try { return envelope.structured_output ?? JSON.parse(envelope.result ?? "null"); } catch { return fail("envelope-invalid", envelope.model ?? MODEL_ID); }
  })();
  const parsed = (() => {
    try { return rawResponseSchema.parse(value); } catch { return fail("response-schema-invalid", envelope.model ?? MODEL_ID); }
  })();
  return { ...parsed, provenance: {
    requestSha256,
    responseEnvelopeSha256: sha256(result.stdout),
    promptSha256: RAW_PROMPT_SHA256,
    schemaSha256: createHash("sha256").update(rawResponseSchemaBytes).digest("hex"),
    reportedModel: envelope.model ?? null,
    modelUsageModels: Object.keys(envelope.modelUsage ?? {}),
    modelUsage: envelope.modelUsage ?? null,
    resolvedModel: MODEL_ID,
    requestedModel: MODEL_ID,
    effort: EFFORT,
    timeoutMs: CALL_TIMEOUT_MS,
    startedAt,
    durationMs: Date.now() - startedMilliseconds,
  } };
}

const cliEnvelopeSchema = z.object({ structured_output: z.unknown().optional(), result: z.string().optional(), model: z.string().optional(), modelUsage: z.record(z.string(), z.unknown()).optional(), is_error: z.boolean().optional() }).passthrough();

export async function runRawEditor(options: {
  promptPath: string;
  requestPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  execute?: Execute;
}) {
  const prompt = readFileSync(resolve(options.promptPath), "utf8");
  if (sha256(prompt) !== RAW_PROMPT_SHA256) throw new Error("raw-editor-prompt-hash-mismatch");
  const request: RawRequest = rawRequestSchema.parse(JSON.parse(readFileSync(resolve(options.requestPath), "utf8")));
  const stdin = JSON.stringify(request);
  const startedAt = new Date().toISOString();
  const startedMilliseconds = Date.now();
  const execute = options.execute ?? executeClaude;
  // Exactly one invocation; errors are surfaced without retry or fallback.
  const result = await execute(rawEditorArguments(prompt), stdin,
    resolve(options.cwd ?? process.cwd()), accountEnvironment(options.env ?? process.env));
  return parseResponse(result, sha256(stdin), startedAt, startedMilliseconds);
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const promptPath = value("--prompt");
  const requestPath = value("--request");
  if (!promptPath || !requestPath || args.some((arg, i) => arg.startsWith("--") && !["--prompt", "--request"].includes(arg) || ["--prompt", "--request"].includes(arg) && !args[i + 1]))
    throw new Error("usage: post-v3-raw-adapter.ts --prompt <path> --request <path>");
  const output = await runRawEditor({ promptPath, requestPath });
  process.stdout.write(JSON.stringify(output) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "RAW editor failed"}\n`); process.exitCode = 1; });
