/** Account-backed, at-most-once frozen editor bridge. dry-run never generates. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, ftruncateSync as truncateSync, lstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { candidateSchema } from "@/lib/ai/schemas";
import { prepareRunDirectory, verifyV3Integrity, V3_MANIFEST_SHA256 } from "./holdout-v3-runner";
export const V3_REQUEST_BUNDLE_SHA256 = "ecb1ced35f99fc8880a76d5990c3a287e10fabbe8efec3be5f13efcc64671fc2";
/** Independently reviewed successful synthetic smoke-05 artifact. */
export const V3_SMOKE_05_SHA256 = "374eb8472c1d2f4e90ad0534f8d9d3b79ee65e7efe01030f6741815bc1b76e2f";
export const CANONICAL_RUN = resolve("data/evaluation/holdout-v3/run");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const requestSchema = z.object({ id: z.string(), stage: z.literal("editor"), schemaName: z.literal("frontier-editor"), responseJsonSchema: z.unknown(), system: z.string(), user: z.string(), requestSha256: z.string() }).strict();
export type EditorRequest = z.infer<typeof requestSchema>;
const CLI_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
export function cliJsonSchema(schema: unknown) {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema) ||
      Object.getPrototypeOf(schema) !== Object.prototype ||
      (schema as Record<string, unknown>).$schema !== CLI_SCHEMA_DIALECT ||
      (schema as Record<string, unknown>).type !== "object" ||
      !isRecord((schema as Record<string, unknown>).properties) ||
      !Array.isArray((schema as Record<string, unknown>).required) ||
      typeof (schema as Record<string, unknown>).additionalProperties !== "boolean")
    throw new Error("unsupported CLI JSON schema dialect or shape");
  const copy = { ...(schema as Record<string, unknown>) };
  delete copy.$schema;
  return JSON.stringify(copy);
}
export function accountEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const env = { ...source };
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_AUTH_TOKEN"]) delete env[key];
  for (const key of Object.keys(env)) {
    if (key === "FALLBACK_FOR_ALL_PRIMARY_MODELS" || key === "CLAUDE_CODE_RETRY_WATCHDOG" || /^(?:ANTHROPIC|CLAUDE)_.*FALLBACK/.test(key)) delete env[key];
  }
  // Claude defines this as total attempts: one candidate, zero editorial retries.
  env.MAX_STRUCTURED_OUTPUT_RETRIES = "1";
  env.CLAUDE_CODE_MAX_RETRIES = "0";
  return env;
}
export function editorArguments(request: EditorRequest) {
  return ["--print", "--system-prompt", request.system, "--json-schema", cliJsonSchema(request.responseJsonSchema), "--output-format", "json", "--no-session-persistence", "--tools", "", "--model", "sonnet", "--safe-mode", "--setting-sources", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands"];
}
export type CommandResult = { code: number | null; stdout: string; stderr: string; spawnErrorCode?: string };
export type Execute = (args: string[], stdin: string, cwd: string, env: NodeJS.ProcessEnv) => Promise<CommandResult>;
export const executeClaude: Execute = (args, stdin, cwd, env) => new Promise((done) => {
  const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: false });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", error => done({ code: null, stdout: "", stderr: "process-start-failed", spawnErrorCode: ["ENOENT", "EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "") ? (error as NodeJS.ErrnoException).code : "OTHER" }));
  child.stdin.on("error", () => {});
  child.on("close", code => done({ code, stdout, stderr }));
  child.stdin.end(stdin);
});
export function isAccountLimit(result: CommandResult) {
  return /usage.?limit|rate.?limit|limit.{0,30}(reached|exceeded)|out of.{0,15}(usage|credits)|insufficient.{0,15}credits|credit balance|buy.{0,15}credits|purchase.{0,15}credits|paywall|upgrade.{0,30}(plan|subscription)|extra usage/i.test(result.stdout + "\n" + result.stderr);
}
const safeStderrWords = new Set(("a about account again all an and api argument arguments at auth authentication be been billing cannot code communicating communicate config configuration connection connect could credit credits denied dns error failed failure fatal file filesystem flag for from had has have http in inside invalid is it json launched later limit load logged login no not object of on only operation option or out parse path permitted please plan prompt read reached request required response retry server session settings signed schema stderr status stdout support the this timeout timed to token transport try unauthorized unexpected unknown unsupported upgrade usage was warning while with within you your").split(" "));
function safeStderrDetail(stderr: string) {
  const allowedHttpCodes = "400|401|403|404|408|409|413|422|429|500|501|502|503|504";
  const lines = stderr.slice(0, 4096).split(/\r?\n/).slice(0, 4);
  const cleanLine = (source: string) => {
    let line = source;
    for (const text of [
      "Return only a JSON object with text set to SMOKE_OK and changes set to an empty array.",
      "Synthetic transport check. Return the specified object.",
      "SMOKE_OK",
    ]) line = line.split(text).join(" [prompt] ");
    line = line
      .replace(new RegExp(`\\bHTTP(?:\\/\\d(?:\\.\\d)?)?\\s+(${allowedHttpCodes})\\b`, "gi"), (_match, code: string) => ` HTTPSTATUS${code} `)
      .replace(new RegExp(`\\bstatus(?:\\s+code)?\\s*[:=]?\\s*(${allowedHttpCodes})\\b`, "gi"), (_match, code: string) => ` HTTPSTATUS${code} `)
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " [redacted] ")
      .replace(/\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi, " [redacted] ")
      .replace(/\b[A-Z]:\\[^\s,;)]*/gi, " [redacted] ")
      .replace(/\/(?:[^\s/]+\/)*[^\s,;)]{2,}/g, " [redacted] ")
      .replace(/\b(?:bearer\s+\S+|(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|authorization)\s*[:=]\s*\S+)/gi, " [redacted] ")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{24,})\b/g, " [redacted] ")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
    const tokens = line.match(/HTTPSTATUS(?:400|401|403|404|408|409|413|422|429|500|501|502|503|504)|[A-Za-z]+|\d+|[:.,()[\]-]/g) ?? [];
    return tokens.flatMap(token => {
      const statusCode = /^HTTPSTATUS(.*)$/.exec(token)?.[1];
      if (statusCode) return ["http", "status", statusCode];
      if (safeStderrWords.has(token.toLowerCase()) || /^[.,:()[\]-]$/.test(token)) return [/^[A-Za-z]+$/.test(token) ? token.toLowerCase() : token];
      return [];
    }).join(" ").replace(/\s+([.,:)\]])/g, "$1").replace(/([([{])\s+/g, "$1");
  };
  return lines.map(cleanLine).filter(Boolean).join(" | ").slice(0, 240);
}
export function parseCandidate(result: CommandResult) {
  if (result.code !== 0) throw new Error("cli-failed");
  const envelope = z.object({ is_error: z.boolean().optional(), structured_output: z.unknown().optional(), result: z.string().optional(), model: z.string().optional(), modelUsage: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(result.stdout));
  if (envelope.is_error) throw new Error("cli-error");
  const data = candidateSchema.parse(envelope.structured_output ?? JSON.parse(envelope.result ?? "null"));
  return { data, resolvedModels: envelope.model ? [envelope.model] : Object.keys(envelope.modelUsage ?? {}) };
}
/** All artifact opens refuse symlinks, devices, sockets, and directories. */
export function safeOpen(path: string, flags: number) {
  const before = lstatSync(path, { throwIfNoEntry: false });
  if (before && !before.isFile()) throw new Error("unsafe artifact file");
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  if (!fstatSync(fd).isFile()) { closeSync(fd); throw new Error("unsafe artifact file"); }
  return fd;
}
export function safeRead(path: string) {
  const fd = safeOpen(path, constants.O_RDONLY);
  try { return readFileSync(fd, "utf8"); } finally { closeSync(fd); }
}
function syncParent(path: string) {
  const fd = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function safeWrite(path: string, value: unknown, exclusive = false) {
  const fd = safeOpen(path, constants.O_WRONLY | constants.O_CREAT | (exclusive ? constants.O_EXCL : 0));
  try {
    // Validate the descriptor before truncation, including race replacements.
    if (!exclusive) { truncateSync(fd, 0); }
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); syncParent(path);
  } finally { closeSync(fd); }
}
function appendDurably(path: string, value: unknown) {
  const fd = safeOpen(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND);
  try { writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); syncParent(path); } finally { closeSync(fd); }
}
export function acquireRunLock(path: string) {
  const reclaim = path + ".reclaim";
  if (lstatSync(reclaim, { throwIfNoEntry: false })) throw new Error("lock reclamation in progress; manual inspection required");
  const create = () => {
    const fd = safeOpen(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname() })); fsyncSync(fd); syncParent(path);
    return fd;
  };
  try { return create(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const guard = safeOpen(reclaim, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
  try {
    const owner = z.object({ pid: z.number().int().positive(), host: z.literal(hostname()) }).strict().parse(JSON.parse(safeRead(path)));
    try { process.kill(owner.pid, 0); throw new Error("generation already running"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    // Every contender must hold the exclusive reclamation guard before unlinking.
    rmSync(path);
    return create();
  } finally { closeSync(guard); rmSync(reclaim); }
}
export function verifyRequestBundle(bytes: string) {
  if (hash(bytes) !== V3_REQUEST_BUNDLE_SHA256) throw new Error("independent editor request bundle anchor changed");
}
export function verifySmoke05(bytes: string, cliVersion: string, pin = V3_SMOKE_05_SHA256) {
  if (!pin || hash(bytes) !== pin) throw new Error("smoke-05 artifact pin mismatch");
  const smoke = z.object({ mode: z.literal("smoke-05"), diagnosticsVersion: z.literal(4), status: z.literal("success"), cliVersion: z.literal(cliVersion), model: z.literal("sonnet"), diagnostics: z.object({ errorClass: z.literal("none"), modelInvocation: z.literal("response-received") }).passthrough() }).passthrough().parse(JSON.parse(bytes));
  return smoke;
}
export function smokeDiagnostics(result: CommandResult) {
  let cliJsonReturned = false;
  try { const json: unknown = JSON.parse(result.stdout); cliJsonReturned = typeof json === "object" && json !== null; } catch {}
  const raw = result.stderr + "\n" + result.stdout;
  const filesystemCodes = ["EPERM", "EACCES", "EROFS", "ENOENT"];
  const networkCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
  const reportedCodes = new Set(raw.match(/\b[A-Z_]+\b/g) ?? []);
  const errorCodes = [...filesystemCodes, ...networkCodes].filter(code => reportedCodes.has(code) || result.spawnErrorCode === code);
  const markers = [
    ...errorCodes,
    ...(/permission denied|operation not permitted|read.only file system/i.test(raw) ? ["FILESYSTEM_PERMISSION"] : []),
    ...(/cannot (be launched|launch|run).{0,60}(inside|within|nested)|nested.{0,30}(claude|session)|CLAUDECODE/i.test(raw) ? ["NESTED_SESSION"] : []),
    ...(/invalid.{0,30}(json schema|json-schema)|schema.{0,30}(invalid|unsupported)|json.schema.{0,30}(invalid|unsupported)/i.test(raw) ? ["STARTUP_SCHEMA"] : []),
    ...(/(invalid|failed|error).{0,40}(configuration|config|settings)|failed to (load|parse).{0,40}(config|settings)|mcp.{0,30}(invalid|failed)/i.test(raw) ? ["STARTUP_CONFIG"] : []),
  ];
  let errorClass = "schema-failure";
  if (result.code === null) errorClass = "spawn-failure";
  else if (isAccountLimit(result)) errorClass = "limit-failure";
  else if (result.code !== 0) {
    if (/unknown (option|argument)|unrecognized (option|argument)|invalid (option|argument)|error: option/i.test(raw)) errorClass = "flag-failure";
    else if (markers.some(marker => filesystemCodes.includes(marker) || marker === "FILESYSTEM_PERMISSION")) errorClass = "filesystem-failure";
    else if (markers.some(marker => networkCodes.includes(marker))) errorClass = "network-failure";
    else if (markers.includes("NESTED_SESSION")) errorClass = "nested-session-failure";
    else if (markers.includes("STARTUP_SCHEMA")) errorClass = "startup-schema-failure";
    else if (markers.includes("STARTUP_CONFIG")) errorClass = "startup-config-failure";
    else if (/not (logged|signed) in|authentication|unauthorized|login required|oauth|auth token|api key/i.test(raw)) errorClass = "auth-failure";
    else errorClass = "cli-failure";
  }
  // Persist only controlled summaries and marker names, never arbitrary CLI text.
  const summary: Record<string, string> = { "spawn-failure": "CLI process could not start or terminated without an exit code.", "limit-failure": "CLI reported a usage, rate, credit, or billing limit.", "flag-failure": "CLI reported an unsupported or invalid option or argument.", "auth-failure": "CLI reported an authentication failure.", "filesystem-failure": "CLI reported a filesystem access or missing-file failure.", "network-failure": "CLI reported a DNS, connection, or timeout failure.", "nested-session-failure": "CLI reported a nested-session startup restriction.", "startup-schema-failure": "CLI rejected the startup JSON schema.", "startup-config-failure": "CLI reported an invalid or unreadable startup configuration.", "cli-failure": "CLI exited unsuccessfully; unclassified stderr was omitted.", "schema-failure": "CLI output failed JSON, candidate schema, or synthetic response validation." };
  const allowedFlags = ["--print", "--system-prompt", "--json-schema", "--output-format", "--no-session-persistence", "--tools", "--model", "--safe-mode", "--setting-sources", "--strict-mcp-config", "--mcp-config", "--disable-slash-commands"];
  const reportedFlags = errorClass === "flag-failure" ? allowedFlags.filter(flag => raw.includes(flag)) : [];
  // Keep diagnostic capture strictly categorical. Raw CLI text can contain
  // paths, credentials, prompt echoes, or account data, so it is never stored.
  const diagnosticCode = errorClass === "none" ? "OK" : errorClass === "flag-failure" && reportedFlags.length
    ? "UNSUPPORTED_KNOWN_FLAG"
    : errorClass === "filesystem-failure" && errorCodes.some(code => filesystemCodes.includes(code))
      ? `FILESYSTEM_${errorCodes.find(code => filesystemCodes.includes(code))}`
      : errorClass === "network-failure" && errorCodes.some(code => networkCodes.includes(code))
        ? `NETWORK_${errorCodes.find(code => networkCodes.includes(code))}`
        : ({ "spawn-failure": "CLI_SPAWN_FAILED", "limit-failure": "ACCOUNT_LIMIT", "flag-failure": "UNSUPPORTED_UNKNOWN_FLAG", "auth-failure": "AUTH_FAILED", "filesystem-failure": "FILESYSTEM_FAILURE", "network-failure": "NETWORK_FAILURE", "nested-session-failure": "NESTED_SESSION", "startup-schema-failure": "STARTUP_SCHEMA_REJECTED", "startup-config-failure": "STARTUP_CONFIG_FAILED", "cli-failure": "UNCLASSIFIED_CLI_FAILURE", "schema-failure": "RESPONSE_SCHEMA_FAILURE" } as Record<string, string>)[errorClass];
  return { exitCode: result.code, cliJsonReturned, stdoutBytes: Buffer.byteLength(result.stdout, "utf8"), stderrBytes: Buffer.byteLength(result.stderr, "utf8"), safeMarkers: markers, stderrPresent: result.stderr.length > 0, stderrSummary: summary[errorClass].slice(0, 160), stderrDetail: safeStderrDetail(result.stderr), diagnosticCode, errorClass, reportedFlags, spawnErrorCode: [...filesystemCodes, ...networkCodes, "OTHER"].includes(result.spawnErrorCode ?? "") ? result.spawnErrorCode : null, modelInvocation: "indeterminate" };
}
export async function syntheticSmoke(path: string, execute: Execute, env: NodeJS.ProcessEnv, cliVersion: string, smokeVersion: "smoke" | "smoke-02" | "smoke-03" | "smoke-04" | "smoke-05" = "smoke") {
  const request: EditorRequest = { id: `synthetic-${smokeVersion}`, stage: "editor", schemaName: "frontier-editor", system: "Return only a JSON object with text set to SMOKE_OK and changes set to an empty array.", user: "Synthetic transport check. Return the specified object.", responseJsonSchema: z.toJSONSchema(candidateSchema), requestSha256: "" };
  request.requestSha256 = hash(JSON.stringify({ schemaName: request.schemaName, system: request.system, user: request.user }));
  const start = new Date().toISOString();
  safeWrite(path, { mode: smokeVersion, diagnosticsVersion: 4, start, status: "started", requestSha256: request.requestSha256, model: "sonnet", cliVersion }, true);
  const cwd = mkdtempSync(resolve(tmpdir(), "whodunnit-v3-smoke-"));
  let status = "technical-failure", resultSha256: string | null = null, resolvedModels: string[] = [];
  let diagnostics = smokeDiagnostics({ code: null, stdout: "", stderr: "" });
  try {
    const result = await execute(editorArguments(request), request.user, cwd, env);
    diagnostics = smokeDiagnostics(result);
    if (isAccountLimit(result)) status = "account-limit-stop";
    else {
      const parsed = parseCandidate(result);
      if (parsed.data.text !== "SMOKE_OK" || parsed.data.changes.length !== 0) throw new Error("smoke contract failed");
      status = "success"; resultSha256 = hash(JSON.stringify(parsed.data)); resolvedModels = parsed.resolvedModels;
      diagnostics = { ...diagnostics, diagnosticCode: "OK", errorClass: "none", stderrSummary: "", modelInvocation: "response-received" };
    }
  } catch { status = "technical-failure"; }
  finally { rmSync(cwd, { recursive: true, force: true }); }
  safeWrite(path, { mode: smokeVersion, diagnosticsVersion: 4, diagnostics, start, end: new Date().toISOString(), status, requestSha256: request.requestSha256, model: "sonnet", cliVersion, resultSha256, resolvedModels });
  if (status !== "success") throw new Error("synthetic smoke failed; generation remains blocked");
  return { mode: smokeVersion, status, modelCalls: 1 };
}
export function recoverInterruptedAttempts(log: string) {
  const previous = existsSync(log) ? safeRead(log).trim().split("\n").filter(Boolean).map(line => z.object({ id: z.string(), status: z.string(), start: z.string(), requestSha256: z.string(), model: z.string(), cliVersion: z.string() }).passthrough().parse(JSON.parse(line))) : [];
  for (const row of previous.filter(row => row.status === "started")) {
    if (!previous.some(other => other.id === row.id && other.status !== "started"))
      appendDurably(log, { ...row, end: new Date().toISOString(), status: "technical-failure-interrupted", resultSha256: null, resolvedModels: [] });
  }
  return previous;
}
export async function generateV3(mode: "dry-run" | "smoke" | "smoke-02" | "smoke-03" | "smoke-04" | "smoke-05" | "generate", runDirectory = CANONICAL_RUN, execute: Execute = executeClaude) {
  const cases = verifyV3Integrity();
  if (resolve(runDirectory) !== CANONICAL_RUN) throw new Error("only the canonical V3 run directory is allowed");
  const run = prepareRunDirectory(CANONICAL_RUN);
  const requestPath = resolve(run, "editor-requests.json");
  const bytes = safeRead(requestPath);
  verifyRequestBundle(bytes);
  for (const name of ["editor-attempts.jsonl", "editor-results.json", "editor-failures.json", "editor-generation.lock", "editor-smoke.json", "editor-smoke-02.json", "editor-smoke-03.json", "editor-smoke-04.json", "editor-smoke-05.json"]) {
    const path = resolve(run, name);
    if (lstatSync(path, { throwIfNoEntry: false })) safeRead(path);
  }
  const artifact = z.object({ mode: z.literal("editor-requests"), manifestSha256: z.literal(V3_MANIFEST_SHA256), caseCount: z.literal(119), requests: z.array(requestSchema).length(119) }).passthrough().parse(JSON.parse(bytes));
  const ids = new Set(cases.map(item => item.id));
  if (new Set(artifact.requests.map(item => item.id)).size !== 119 || artifact.requests.some(item => !ids.has(item.id))) throw new Error("request IDs changed");
  for (const request of artifact.requests) {
    if (hash(JSON.stringify({ schemaName: request.schemaName, system: request.system, user: request.user })) !== request.requestSha256) throw new Error("request hash changed");
    if (JSON.stringify(request.responseJsonSchema) !== JSON.stringify(z.toJSONSchema(candidateSchema))) throw new Error("candidate schema changed");
  }
  const cwd = mkdtempSync(resolve(tmpdir(), "whodunnit-v3-")), env = accountEnvironment();
  let lock: number | undefined;
  const lockPath = resolve(run, "editor-generation.lock");
  try {
    const auth = await execute(["auth", "status"], "", cwd, env);
    if (auth.code !== 0 || z.object({ authMethod: z.literal("claude.ai"), loggedIn: z.literal(true) }).passthrough().safeParse(JSON.parse(auth.stdout)).success !== true) throw new Error("Claude account authentication required");
    const versionResult = await execute(["--version"], "", cwd, env);
    if (versionResult.code !== 0) throw new Error("CLI version unavailable");
    const cliVersion = versionResult.stdout.trim();
    let smoke05Ready = false;
    try { verifySmoke05(safeRead(resolve(run, "editor-smoke-05.json")), cliVersion); smoke05Ready = true; } catch {}
    if (mode === "dry-run") return { mode, caseCount: 119, cliVersion, model: "sonnet", smoke05Ready, modelCalls: 0 };
    lock = acquireRunLock(lockPath);
    if (mode === "smoke" || mode === "smoke-02" || mode === "smoke-03" || mode === "smoke-04" || mode === "smoke-05") return await syntheticSmoke(resolve(run, mode === "smoke" ? "editor-smoke.json" : `editor-${mode}.json`), execute, env, cliVersion, mode);
    const log = resolve(run, "editor-attempts.jsonl");
    const previous = recoverInterruptedAttempts(log);
    if (previous.some(row => row.status === "account-limit-stop")) throw new Error("previous account limit requires stopping this run");
    const attempted = new Set(previous.map(row => row.id));
    const smokeBytes = safeRead(resolve(run, "editor-smoke-05.json"));
    verifySmoke05(smokeBytes, cliVersion);
    const resultsPath = resolve(run, "editor-results.json");
    const results = existsSync(resultsPath) ? z.array(z.object({ id: z.string(), data: candidateSchema }).strict()).parse(JSON.parse(safeRead(resultsPath))) : [];
    const failuresPath = resolve(run, "editor-failures.json");
    const failures: { id: string; status: string }[] = [...attempted].filter(id => !results.some(row => row.id === id)).map(id => ({ id, status: "technical-failure-interrupted" }));
    safeWrite(resultsPath, results);
    safeWrite(failuresPath, failures);
    for (const request of artifact.requests) {
      if (attempted.has(request.id)) continue;
      verifyV3Integrity();
      verifyRequestBundle(safeRead(requestPath));
      const common = { id: request.id, requestSha256: request.requestSha256, model: "sonnet", cliVersion };
      const start = new Date().toISOString();
      appendDurably(log, { ...common, start, end: null, status: "started", resultSha256: null });
      let status = "technical-failure", resultSha256: string | null = null, resolvedModels: string[] = [], stop = false;
      try {
        const callCwd = mkdtempSync(resolve(tmpdir(), "whodunnit-v3-case-"));
        let result: CommandResult;
        try { result = await execute(editorArguments(request), request.user, callCwd, env); }
        finally { rmSync(callCwd, { recursive: true, force: true }); }
        stop = isAccountLimit(result);
        if (stop) status = "account-limit-stop";
        else {
          const parsed = parseCandidate(result);
          resolvedModels = parsed.resolvedModels;
          resultSha256 = hash(JSON.stringify(parsed.data));
          results.push({ id: request.id, data: parsed.data }); status = "success";
        }
      } catch { status = "technical-failure"; }
      appendDurably(log, { ...common, start, end: new Date().toISOString(), status, resultSha256, resolvedModels });
      if (status !== "success") failures.push({ id: request.id, status });
      safeWrite(resultsPath, results);
      safeWrite(failuresPath, failures);
      if (stop) break;
    }
    return { mode, successes: results.length, failures: failures.length };
  } finally {
    if (lock !== undefined) { closeSync(lock); rmSync(lockPath); }
    rmSync(cwd, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (mode !== "dry-run" && mode !== "smoke" && mode !== "smoke-02" && mode !== "smoke-03" && mode !== "smoke-04" && mode !== "smoke-05" && mode !== "generate") throw new Error("usage: holdout-v3-generate.ts dry-run|smoke|smoke-02|smoke-03|smoke-04|smoke-05|generate [canonical-run-directory]");
  generateV3(mode, process.argv[3]).then(value => process.stdout.write(JSON.stringify(value) + "\n")).catch(() => { process.stderr.write("V3 generation bridge failed; inspect attempt statuses.\n"); process.exitCode = 1; });
}
