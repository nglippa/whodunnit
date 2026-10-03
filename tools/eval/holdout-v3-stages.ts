/** Account-backed, at-most-once runner for captured V3 verifier/repair stages. */
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, ftruncateSync, fsyncSync, lstatSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { candidateReviewSchemaV10 } from "@/lib/reconstruction/verified-reconstruction";
import { candidateSchema } from "@/lib/ai/schemas";
import { V3_MANIFEST_SHA256, prepareRunDirectory, runV3, verifyV3Integrity } from "./holdout-v3-runner";
import { V3_REQUEST_BUNDLE_SHA256, V3_SMOKE_05_SHA256, accountEnvironment, acquireRunLock, editorArguments, executeClaude, isAccountLimit, safeOpen, safeRead, smokeDiagnostics, type CommandResult, type Execute, type EditorRequest } from "./holdout-v3-generate";

export const STAGE_REPAIR_RESPONSE_SCHEMA = z.object({ replacement: z.string().min(1).max(600) }).strict();
export const STAGE_RESPONSE_SCHEMAS = {
  verifier: candidateReviewSchemaV10,
  repair: STAGE_REPAIR_RESPONSE_SCHEMA,
  reverify: candidateReviewSchemaV10,
} as const;
export type StageName = keyof typeof STAGE_RESPONSE_SCHEMAS;
export const STAGE_RUN_DIRECTORY = resolve("data/evaluation/holdout-v3/run");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stageNames = ["verifier", "repair", "reverify"] as const;
const expectedSchemaNames: Record<StageName, string> = { verifier: "candidate-verifier", repair: "local-repair", reverify: "candidate-verifier" };
const requestSchema = z.object({
  id: z.string().min(1), stage: z.enum(stageNames), schemaName: z.string().min(1), responseJsonSchema: z.unknown(),
  system: z.string(), user: z.string(), requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const bundleSchema = z.object({
  strategy: z.literal("reconstruction-v15"), mode: z.enum(["verifier-requests", "repair-requests", "reverify-requests"]),
  manifestSha256: z.literal(V3_MANIFEST_SHA256), caseCount: z.literal(119), technicalFailures: z.array(z.unknown()),
  contractErrors: z.array(z.string()), requests: z.array(requestSchema),
}).strict();
const startEventSchema = z.object({
  id: z.string(), stage: z.enum(stageNames), requestSha256: z.string(), requestBundleSha256: z.string(),
  predecessorResultSha256: z.record(z.string(), z.string()),
  start: z.string(), status: z.literal("started"), cliVersion: z.string(), model: z.literal("sonnet"),
}).strict();
const completionEventSchema = z.object({
  id: z.string(), stage: z.enum(stageNames), requestSha256: z.string(), requestBundleSha256: z.string(),
  predecessorResultSha256: z.record(z.string(), z.string()),
  start: z.string(), end: z.string(), status: z.enum(["success", "technical-failure", "account-limit-stop", "technical-failure-interrupted"]),
  cliVersion: z.string(), model: z.literal("sonnet"), resultSha256: z.string().nullable(), resolvedModels: z.array(z.string()),
  data: z.unknown().optional(), diagnosticCode: z.string().optional(), diagnosticDetail: z.string().max(240).optional(),
}).strict();
type StartEvent = z.infer<typeof startEventSchema>;
type CompletionEvent = z.infer<typeof completionEventSchema>;

function syncDirectory(path: string) {
  const fd = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeDurably(path: string, value: unknown) {
  const fd = safeOpen(path, constants.O_WRONLY | constants.O_CREAT);
  try { ftruncateSync(fd, 0); writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); syncDirectory(path); }
  finally { closeSync(fd); }
}
function appendDurably(path: string, value: unknown) {
  const fd = safeOpen(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND);
  try { writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); syncDirectory(path); }
  finally { closeSync(fd); }
}
function parseBundle(stage: StageName, bytes: string) {
  const parsed = bundleSchema.parse(JSON.parse(bytes));
  if (parsed.mode !== `${stage}-requests`) throw new Error("stage request mode mismatch");
  if (parsed.contractErrors.length || parsed.technicalFailures.length) throw new Error("captured stage request bundle is incomplete");
  const schema = STAGE_RESPONSE_SCHEMAS[stage];
  const expectedJsonSchema = z.toJSONSchema(schema);
  const ids = new Set<string>();
  for (const request of parsed.requests) {
    if (ids.has(request.id)) throw new Error("duplicate stage request ID");
    ids.add(request.id);
    if (request.stage !== stage || request.schemaName !== expectedSchemaNames[stage]) throw new Error("stage request identity mismatch");
    if (JSON.stringify(request.responseJsonSchema) !== JSON.stringify(expectedJsonSchema)) throw new Error("stage response schema mismatch");
    if (sha256(JSON.stringify({ schemaName: request.schemaName, system: request.system, user: request.user })) !== request.requestSha256)
      throw new Error("stage request fingerprint mismatch");
  }
  return parsed;
}
function parseLedger(path: string, stage: StageName, bundleHash: string) {
  if (!existsSync(path)) return { starts: new Map<string, StartEvent>(), completions: new Map<string, CompletionEvent>() };
  const rows = safeRead(path).trim().split("\n").filter(Boolean);
  const starts = new Map<string, StartEvent>(), completions = new Map<string, CompletionEvent>();
  for (const raw of rows) {
    const value: unknown = JSON.parse(raw);
    const status = z.object({ status: z.string() }).passthrough().parse(value).status;
    if (status === "started") {
      const event = startEventSchema.parse(value);
      if (event.stage !== stage || event.requestBundleSha256 !== bundleHash || starts.has(event.id)) throw new Error("stage ledger conflict");
      starts.set(event.id, event);
    } else {
      const event = completionEventSchema.parse(value);
      if (event.stage !== stage || event.requestBundleSha256 !== bundleHash || !starts.has(event.id) || completions.has(event.id) || starts.get(event.id)?.requestSha256 !== event.requestSha256 || starts.get(event.id)?.cliVersion !== event.cliVersion || JSON.stringify(starts.get(event.id)?.predecessorResultSha256) !== JSON.stringify(event.predecessorResultSha256))
        throw new Error("stage ledger conflict");
      if (event.status === "success") {
        schemaFor(stage).parse(event.data);
        if (sha256(JSON.stringify(event.data)) !== event.resultSha256) throw new Error("stage ledger result hash mismatch");
      }
      completions.set(event.id, event);
    }
  }
  return { starts, completions };
}
function schemaFor(stage: StageName) { return STAGE_RESPONSE_SCHEMAS[stage]; }
function sameHashMap(left: Record<string, string>, right: Record<string, string>) {
  const a = Object.entries(left).sort(([x], [y]) => x.localeCompare(y));
  const b = Object.entries(right).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(a) === JSON.stringify(b);
}
function parseCliResponse(stage: StageName, result: CommandResult) {
  if (result.code !== 0) throw new Error("stage-cli-failed");
  const envelope = z.object({ is_error: z.boolean().optional(), structured_output: z.unknown().optional(), result: z.string().optional(), model: z.string().optional(), modelUsage: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(JSON.parse(result.stdout));
  if (envelope.is_error) throw new Error("stage-cli-error");
  const raw = envelope.structured_output ?? JSON.parse(envelope.result ?? "null");
  return { data: schemaFor(stage).parse(raw), resolvedModels: envelope.model ? [envelope.model] : Object.keys(envelope.modelUsage ?? {}) };
}
function materialize(stage: StageName, run: string, completions: Map<string, CompletionEvent>) {
  const results = [...completions.values()].filter(row => row.status === "success").map(row => ({ id: row.id, data: row.data }));
  const failures = [...completions.values()].filter(row => row.status !== "success").map(row => ({ id: row.id, status: row.status, ...(row.diagnosticCode ? { diagnosticCode: row.diagnosticCode } : {}) }));
  writeDurably(resolve(run, `${stage}-results.json`), results);
  writeDurably(resolve(run, `${stage}-failures.json`), failures);
  return { results, failures };
}

function assertNoRunWideAccountLimit(run: string) {
  for (const stage of ["editor", ...stageNames]) {
    const path = resolve(run, `${stage}-attempts.jsonl`);
    if (!existsSync(path)) continue;
    for (const line of safeRead(path).trim().split("\n").filter(Boolean)) {
      const row = z.object({ status: z.string() }).passthrough().parse(JSON.parse(line));
      if (row.status === "account-limit-stop") throw new Error("previous account limit requires stopping all V3 generation");
    }
  }
}

function exactRows(path: string) {
  const rows = z.array(z.object({ id: z.string(), data: z.unknown() }).strict()).parse(JSON.parse(safeRead(path)));
  const map = new Map<string, unknown>();
  for (const row of rows) {
    if (map.has(row.id)) throw new Error("duplicate predecessor result ID");
    map.set(row.id, row.data);
  }
  return { rows, map, bytes: safeRead(path) };
}

function validateEditorResults(run: string, frozenIds: ReadonlySet<string>) {
  const requestBytes = safeRead(resolve(run, "editor-requests.json"));
  if (sha256(requestBytes) !== V3_REQUEST_BUNDLE_SHA256) throw new Error("editor request bundle anchor changed");
  const requests = z.object({ mode: z.literal("editor-requests"), manifestSha256: z.literal(V3_MANIFEST_SHA256), caseCount: z.literal(119), requests: z.array(requestSchemaForEditor).length(119) }).passthrough().parse(JSON.parse(requestBytes)).requests;
  const requestMap = new Map(requests.map(request => [request.id, request]));
  if (requestMap.size !== 119 || [...requestMap.keys()].some(id => !frozenIds.has(id))) throw new Error("editor request IDs do not match the frozen manifest");
  const results = exactRows(resolve(run, "editor-results.json"));
  if (results.map.size !== frozenIds.size || [...frozenIds].some(id => !results.map.has(id))) throw new Error("editor predecessor results must cover every frozen ID");
  const ledgerPath = resolve(run, "editor-attempts.jsonl");
  const ledger = safeRead(ledgerPath).trim().split("\n").filter(Boolean).map(line => z.object({ id: z.string(), requestSha256: z.string(), status: z.string(), resultSha256: z.string().nullable().optional() }).passthrough().parse(JSON.parse(line)));
  const successes = new Map<string, string>();
  for (const row of ledger.filter(item => item.status === "success")) {
    if (successes.has(row.id)) throw new Error("duplicate editor completion in ledger");
    successes.set(row.id, row.resultSha256 ?? "");
    if (requestMap.get(row.id)?.requestSha256 !== row.requestSha256) throw new Error("editor ledger request mismatch");
  }
  if (successes.size !== frozenIds.size) throw new Error("editor predecessor ledger is incomplete");
  for (const [id, data] of results.map) {
    candidateSchema.parse(data);
    if (sha256(JSON.stringify(data)) !== successes.get(id)) throw new Error("editor predecessor result hash mismatch");
  }
  return { bytes: results.bytes, hash: sha256(results.bytes) };
}

const requestSchemaForEditor = z.object({ id: z.string(), stage: z.literal("editor"), schemaName: z.literal("frontier-editor"), responseJsonSchema: z.unknown(), system: z.string(), user: z.string(), requestSha256: z.string() }).strict();

async function validateStageResults(stage: StageName, run: string, frozenIds: ReadonlySet<string>, predecessorHashes: Record<string, string>): Promise<{ bytes: string; hash: string }> {
  const requestBytes = safeRead(resolve(run, `${stage}-requests.json`));
  const bundleHash = sha256(requestBytes), bundle = parseBundle(stage, requestBytes);
  const reqs = new Map(bundle.requests.map(request => [request.id, request]));
  if ([...reqs.keys()].some(id => !frozenIds.has(id))) throw new Error(`${stage} request contains a non-frozen ID`);
  const result = exactRows(resolve(run, `${stage}-results.json`));
  if (result.map.size !== reqs.size || [...reqs.keys()].some(id => !result.map.has(id))) throw new Error(`${stage} predecessor results do not match captured requests`);
  const { starts, completions } = parseLedger(resolve(run, `${stage}-attempts.jsonl`), stage, bundleHash);
  if (starts.size !== reqs.size || completions.size !== reqs.size) throw new Error(`${stage} predecessor ledger is incomplete`);
  for (const start of starts.values()) if (JSON.stringify(start.predecessorResultSha256) !== JSON.stringify(predecessorHashes)) throw new Error(`${stage} predecessor result commitment mismatch`);
  for (const [id, data] of result.map) {
    const request = reqs.get(id), completion = completions.get(id);
    if (!request || !completion || completion.status !== "success" || completion.requestSha256 !== request.requestSha256) throw new Error(`${stage} predecessor call did not succeed`);
    schemaFor(stage).parse(data);
    if (sha256(JSON.stringify(data)) !== completion.resultSha256) throw new Error(`${stage} predecessor result hash mismatch`);
  }
  return { bytes: result.bytes, hash: sha256(result.bytes) };
}

async function reproduceCapturedBundle(stage: StageName, run: string, requestBytes: string, predecessorHashes: Record<string, string>) {
  const tempRun = mkdtempSync(resolve(STAGE_RUN_DIRECTORY, `.stage-provenance-${stage}-`));
  try {
    for (const [filename] of Object.entries(predecessorHashes)) writeFileSync(resolve(tempRun, filename), safeRead(resolve(run, filename)), { flag: "wx" });
    await runV3(`${stage}-requests`, tempRun);
    const reproduced = safeRead(resolve(tempRun, `${stage}-requests.json`));
    if (reproduced !== requestBytes) throw new Error(`${stage} request bundle provenance mismatch`);
  } finally { rmSync(tempRun, { recursive: true, force: true }); }
}

async function collectStagePredecessors(stage: StageName, run: string, frozenIds: ReadonlySet<string>, cache = new Map<StageName, Promise<Record<string, string>>>()) {
  const stageIndex = stageNames.indexOf(stage);
  if (stageIndex === 0) return { "editor-results.json": validateEditorResults(run, frozenIds).hash };
  const hashes: Record<string, string> = {};
  for (const previous of stageNames.slice(0, stageIndex)) Object.assign(hashes, await verifyCapturedStage(previous, run, frozenIds, cache));
  return hashes;
}

async function verifyCapturedStage(stage: StageName, run: string, frozenIds: ReadonlySet<string>, cache: Map<StageName, Promise<Record<string, string>>>) {
  const existing = cache.get(stage);
  if (existing) return existing;
  const verification = (async () => {
    const predecessorHashes = await collectStagePredecessors(stage, run, frozenIds, cache);
    const requestBytes = safeRead(resolve(run, `${stage}-requests.json`));
    const saved = await validateStageResults(stage, run, frozenIds, predecessorHashes);
    if (sha256(saved.bytes) !== saved.hash) throw new Error(`${stage} result hash changed during validation`);
    await reproduceCapturedBundle(stage, run, requestBytes, predecessorHashes);
    return { ...predecessorHashes, [`${stage}-results.json`]: saved.hash };
  })();
  cache.set(stage, verification);
  return verification;
}

async function reproduceRequestBundle(stage: StageName, run: string, requestBytes: string, frozenIds: ReadonlySet<string>) {
  const predecessorHashes = await collectStagePredecessors(stage, run, frozenIds);
  await reproduceCapturedBundle(stage, run, requestBytes, predecessorHashes);
  return predecessorHashes;
}

function verifySmoke05(run: string, cliVersion: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("successful smoke-05 artifact must be independently pinned before V3 generation");
  const bytes = safeRead(resolve(run, "editor-smoke-05.json"));
  if (sha256(bytes) !== expectedHash) throw new Error("smoke-05 artifact pin mismatch");
  const artifact = z.object({ mode: z.literal("smoke-05"), diagnosticsVersion: z.literal(4), status: z.literal("success"), cliVersion: z.string(), model: z.literal("sonnet"), diagnostics: z.object({ errorClass: z.literal("none"), modelInvocation: z.literal("response-received") }).passthrough() }).passthrough().parse(JSON.parse(bytes));
  if (artifact.cliVersion !== cliVersion) throw new Error("smoke-05 CLI version mismatch");
  return artifact;
}

/** Executes saved requests verbatim; each request ID is durably consumed before its single CLI attempt. */
export async function generateStage(stage: StageName, runDirectory = STAGE_RUN_DIRECTORY, execute: Execute = executeClaude, testPins: { smoke05Sha256?: string } = {}) {
  if (!stageNames.includes(stage)) throw new Error("unsupported V3 stage");
  const cases = verifyV3Integrity();
  const run = resolve(runDirectory);
  if (run !== STAGE_RUN_DIRECTORY && execute === executeClaude) throw new Error("stage artifacts must use the canonical V3 run directory");
  if (run === STAGE_RUN_DIRECTORY) prepareRunDirectory(run);
  else {
    const stat = lstatSync(run);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe test stage directory");
  }
  const requestPath = resolve(run, `${stage}-requests.json`);
  const requestBytes = safeRead(requestPath), bundleHash = sha256(requestBytes), bundle = parseBundle(stage, requestBytes);
  if (bundle.caseCount !== cases.length) throw new Error("stage case count mismatch");
  const frozenIds = new Set(cases.map(item => item.id));
  if (bundle.requests.some(request => !frozenIds.has(request.id))) throw new Error("stage request contains a non-frozen ID");
  if (execute === executeClaude && testPins.smoke05Sha256) throw new Error("test smoke pins cannot be used by the production executor");
  assertNoRunWideAccountLimit(run);
  const predecessorResultSha256 = await reproduceRequestBundle(stage, run, requestBytes, frozenIds);
  const ledgerPath = resolve(run, `${stage}-attempts.jsonl`), lockPath = resolve(run, `${stage}-generation.lock`);
  for (const path of [ledgerPath, lockPath, resolve(run, `${stage}-results.json`), resolve(run, `${stage}-failures.json`)])
    if (lstatSync(path, { throwIfNoEntry: false })) safeRead(path);
  let lock: number | undefined;
  try {
    lock = acquireRunLock(lockPath);
    const { starts, completions } = parseLedger(ledgerPath, stage, bundleHash);
    // On resume, a started request is committed to the exact predecessor
    // result bytes. Check this before recovering interrupted attempts or
    // materializing output, even when changed bytes parse to equal JSON.
    for (const start of starts.values()) {
      if (!sameHashMap(start.predecessorResultSha256, predecessorResultSha256))
        throw new Error("stage ledger predecessor result commitment mismatch");
    }
    for (const [id, start] of starts) if (!completions.has(id)) {
      const interrupted: CompletionEvent = { ...start, end: new Date().toISOString(), status: "technical-failure-interrupted", resultSha256: null, resolvedModels: [] };
      appendDurably(ledgerPath, interrupted); completions.set(id, interrupted);
    }
    materialize(stage, run, completions);
    if ([...completions.values()].some(row => row.status !== "success"))
      throw new Error(`previous ${stage} failure requires stopping this stage`);
    if (bundle.requests.length === 0) return { stage, requests: 0, successes: 0, failures: 0, modelCalls: 0, requestBundleSha256: bundleHash };

    assertNoRunWideAccountLimit(run);

    const cwd = mkdtempSync(resolve(tmpdir(), "whodunnit-v3-stage-"));
    const env = accountEnvironment();
    try {
      const auth = await execute(["auth", "status"], "", cwd, env);
      if (auth.code !== 0 || z.object({ authMethod: z.literal("claude.ai"), loggedIn: z.literal(true) }).passthrough().safeParse(JSON.parse(auth.stdout)).success !== true)
        throw new Error("Claude account authentication required");
      const versionResult = await execute(["--version"], "", cwd, env);
      if (versionResult.code !== 0) throw new Error("CLI version unavailable");
      const cliVersion = versionResult.stdout.trim();
      const smokePin = testPins.smoke05Sha256 ?? V3_SMOKE_05_SHA256;
      verifySmoke05(run, cliVersion, smokePin);
      if ([...completions.values()].some(row => row.status === "account-limit-stop")) throw new Error("previous account limit requires stopping this stage");
      for (const [id, start] of starts) {
        const request = bundle.requests.find(item => item.id === id);
        if (!request || request.requestSha256 !== start.requestSha256) throw new Error("stage ledger request mismatch");
      }
      let modelCalls = 0;
      for (const request of bundle.requests) {
        if (starts.has(request.id)) continue;
        verifyV3Integrity();
        assertNoRunWideAccountLimit(run);
        verifySmoke05(run, cliVersion, smokePin);
        if (sha256(safeRead(requestPath)) !== bundleHash) throw new Error("stage request bundle changed during generation");
        for (const [filename, expectedHash] of Object.entries(predecessorResultSha256))
          if (sha256(safeRead(resolve(run, filename))) !== expectedHash) throw new Error("predecessor results changed during stage generation");
        const start: StartEvent = { id: request.id, stage, requestSha256: request.requestSha256, requestBundleSha256: bundleHash,
          predecessorResultSha256, start: new Date().toISOString(), status: "started", cliVersion, model: "sonnet" };
        appendDurably(ledgerPath, start); starts.set(request.id, start);
        let completion: CompletionEvent;
        let result: CommandResult | undefined;
        try {
          const callCwd = mkdtempSync(resolve(tmpdir(), "whodunnit-v3-stage-call-"));
          try {
            modelCalls++;
            result = await execute(editorArguments({ ...request, stage: "editor" } as unknown as EditorRequest), request.user, callCwd, env);
          } finally { rmSync(callCwd, { recursive: true, force: true }); }
          if (isAccountLimit(result)) {
            const diagnostic = smokeDiagnostics(result);
            completion = { ...start, end: new Date().toISOString(), status: "account-limit-stop", resultSha256: null, resolvedModels: [], diagnosticCode: "ACCOUNT_LIMIT", diagnosticDetail: diagnostic.stderrDetail };
          }
          else {
            const parsed = parseCliResponse(stage, result);
            completion = { ...start, end: new Date().toISOString(), status: "success", resultSha256: sha256(JSON.stringify(parsed.data)), resolvedModels: parsed.resolvedModels, data: parsed.data };
          }
        } catch {
          const diagnostics = smokeDiagnostics(result ?? { code: null, stdout: "", stderr: "" });
          completion = { ...start, end: new Date().toISOString(), status: "technical-failure", resultSha256: null, resolvedModels: [], diagnosticCode: diagnostics.diagnosticCode, diagnosticDetail: diagnostics.stderrDetail };
        }
        appendDurably(ledgerPath, completion); completions.set(request.id, completion);
        materialize(stage, run, completions);
        if (completion.status !== "success") break;
      }
      const output = materialize(stage, run, completions);
      return { stage, requests: bundle.requests.length, successes: output.results.length, failures: output.failures.length, modelCalls, requestBundleSha256: bundleHash };
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  } finally {
    if (lock !== undefined) { closeSync(lock); rmSync(lockPath); }
  }
}

async function main() {
  const stage = process.argv[2];
  if (!stageNames.includes(stage as StageName)) throw new Error("usage: holdout-v3-stages.ts verifier|repair|reverify");
  const result = await generateStage(stage as StageName);
  process.stdout.write(JSON.stringify(result) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(() => { process.stderr.write("V3 stage generation failed; inspect stage attempt statuses.\n"); process.exitCode = 1; });
