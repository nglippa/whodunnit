/** Authorized one-attempt-per-case RAW transport runner. Never invokes V15 or an evaluator. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, chmodSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { RAW_PROMPT_SHA256, RawAdapterError, runRawEditor, type Execute } from "./post-v3-raw-adapter";
import { verifyRawGenerationContract } from "./post-v3-raw-contract-verify";

const ROOT = resolve(process.cwd());
const BASE = "data/evaluation/post-v3-comparison";
const CASES_PATH = `${BASE}/frozen/cases.json`;
const CORPUS_MANIFEST_PATH = `${BASE}/frozen/corpus-manifest.json`;
const PROMPT_PATH = `${BASE}/raw-editor-prompt-v1.txt`;
const SCHEMA_PATH = `${BASE}/raw-response.schema.json`;
const RUN_PATH = `${BASE}/raw-attempts`;
const FINAL_RAW_PATH = `${BASE}/frozen/raw.json`;
const MODEL_ID = "claude-sonnet-5-5";
const EFFORT = "medium";
const CLI_VERSION = "2.1.288";
const RAW_CONTRACT_COMMIT = "7acb2bb5246400e8d792d13979e204f4cb9b765e";
const CORPUS_COMMIT = "0bace0834bf5f85b4bc9ae3d29311badcd2adacc";
const IMPLEMENTATION_MANIFEST_COMMIT = "19ccd7569403058d6afd7086ad3bf8a0ce836b25";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

const caseSchema = z.object({ caseId: z.string().regex(/^PVC-\d{3}$/), source: z.string(), objective: z.string() }).passthrough();
const corpusManifestSchema = z.object({
  experimentId: z.string(), caseIds: z.array(z.string()).length(40),
  caseHashes: z.array(z.object({ caseId: z.string(), sourceUtf8Sha256: z.string().regex(/^[a-f0-9]{64}$/), objectiveUtf8Sha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough()).length(40),
  artifactHashes: z.object({ "cases.json": z.object({ fileBytesSha256: z.string().regex(/^[a-f0-9]{64}$/), jcsSha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough() }).passthrough(),
}).passthrough();

export type FrozenRawCase = { caseId: string; source: string; objective: string };
export type AttemptSuccess = { status: "success"; text: string; provenance: Record<string, unknown> };
export type AttemptFailure = {
  status: "technical-failure";
  category: string;
  requestSha256: string;
  responseEnvelopeSha256: string | null;
  reportedModel: string | null;
  startedAt: string;
  durationMs: number;
  resolvedModel: string | null;
};
export type AttemptResult = AttemptSuccess | AttemptFailure;

function safeRegularFile(relativePath: string) {
  const absolute = resolve(ROOT, relativePath);
  const rel = relative(ROOT, absolute);
  if (!relativePath || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("unsafe frozen file path");
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error("missing or unsafe frozen input");
  return readFileSync(absolute);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateFrozenRawCases(casesRaw: unknown, manifestRaw: unknown): FrozenRawCase[] {
  const manifest = corpusManifestSchema.parse(manifestRaw);
  const rows = z.array(caseSchema).length(40).parse(casesRaw);
  const ids = manifest.caseIds;
  if (new Set(ids).size !== 40 || rows.some((row, index) => row.caseId !== ids[index])) throw new Error("frozen RAW case order mismatch");
  if (manifest.caseHashes.some((row, index) => row.caseId !== ids[index])) throw new Error("frozen RAW hash order mismatch");
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const pinned = manifest.caseHashes[index];
    if (sha256(row.source) !== pinned.sourceUtf8Sha256 || sha256(row.objective) !== pinned.objectiveUtf8Sha256) throw new Error(`frozen RAW source/objective hash mismatch at index ${index}`);
  }
  return rows.map(({ caseId, source, objective }) => ({ caseId, source, objective }));
}

export function verifyFrozenRawCases() {
  const corpusBytes = safeRegularFile(CORPUS_MANIFEST_PATH);
  const manifest = corpusManifestSchema.parse(JSON.parse(corpusBytes.toString("utf8")));
  const casesBytes = safeRegularFile(CASES_PATH);
  const casesRaw: unknown = JSON.parse(casesBytes.toString("utf8"));
  const hashes = manifest.artifactHashes["cases.json"];
  if (sha256(casesBytes) !== hashes.fileBytesSha256 || sha256(canonicalJson(casesRaw)) !== hashes.jcsSha256) throw new Error("frozen cases artifact hash mismatch");
  const cases = validateFrozenRawCases(casesRaw, manifest);
  return { cases, corpusManifestSha256: sha256(corpusBytes), casesFileSha256: sha256(casesBytes), experimentId: manifest.experimentId };
}

function scrubbedEnvironment(source: NodeJS.ProcessEnv) {
  const env = { ...source };
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) delete env[key];
  for (const key of Object.keys(env)) if (/^(?:ANTHROPIC|CLAUDE)_.*FALLBACK/.test(key)) delete env[key];
  env.MAX_STRUCTURED_OUTPUT_RETRIES = "0";
  env.CLAUDE_CODE_MAX_RETRIES = "0";
  return env;
}

export function checkCallerPreflight(env: NodeJS.ProcessEnv, readOnlyCli = (args: string[], safeEnv: NodeJS.ProcessEnv) => execFileSync("claude", args, { encoding: "utf8", env: safeEnv, timeout: 10_000 })) {
  try {
    const safeEnv = scrubbedEnvironment(env);
    const versionOutput = readOnlyCli(["--version"], safeEnv).trim();
    const version = /^(\d+\.\d+\.\d+)(?:\s+\(Claude Code\))?$/.exec(versionOutput)?.[1];
    if (version !== CLI_VERSION) throw new Error("version-mismatch");
    const status = z.object({ loggedIn: z.literal(true), authMethod: z.literal("claude.ai") }).passthrough()
      .parse(JSON.parse(readOnlyCli(["auth", "status"], safeEnv)));
    return { cliVersion: version, cliVersionOutput: versionOutput, authClass: status.authMethod };
  } catch {
    throw new Error("RAW caller preflight failed; no attempt was started");
  }
}

function openAttemptLog(path: string) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  if (!fstatSync(fd).isFile()) { closeSync(fd); throw new Error("unsafe attempt log"); }
  return fd;
}

function syncDirectory(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function appendDurably(fd: number, runDirectory: string, value: unknown) {
  writeFileSync(fd, JSON.stringify(value) + "\n");
  fsyncSync(fd);
  syncDirectory(runDirectory);
}

function writeExclusiveDurably(path: string, value: unknown) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}

function writeHashSidecar(path: string, hash: string) {
  const sidecar = `${path}.sha256`;
  const fd = openSync(sidecar, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, `${hash}  ${path.split("/").at(-1)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}

function writeIntegritySidecar(path: string, manifestSha256: string) {
  const sidecarPath = path.replace(/\.json$/, ".integrity.json");
  writeExclusiveDurably(sidecarPath, { schemaVersion: 1, manifestPath: relative(ROOT, path), hashAlgorithm: "sha256", exactFileBytesSha256: manifestSha256 });
}

function failureFrom(error: unknown, requestSha256: string): AttemptFailure {
  if (error instanceof RawAdapterError) {
    const identity = error.reportedModel;
    return { status: "technical-failure", category: error.category, requestSha256: error.requestSha256,
      responseEnvelopeSha256: error.responseEnvelopeSha256, reportedModel: identity, startedAt: error.startedAt,
      durationMs: error.durationMs, resolvedModel: identity === MODEL_ID ? MODEL_ID : null };
  }
  return { status: "technical-failure", category: "unclassified-runner-error", requestSha256,
    responseEnvelopeSha256: null, reportedModel: null, startedAt: new Date().toISOString(), durationMs: 0, resolvedModel: null };
}

function readCandidateArtifactHashes() {
  const frozen = z.object({ implementationCommit: z.string(), arms: z.array(z.object({ id: z.enum(["A", "B", "C", "D"]), artifactSha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough()).length(4) })
    .passthrough().parse(JSON.parse(safeRegularFile(`${BASE}/frozen/implementations.json`).toString("utf8")));
  return { implementationCommit: frozen.implementationCommit, arms: Object.fromEntries(frozen.arms.map(arm => [arm.id, arm.artifactSha256])) };
}

export async function executeRawCase(caseRow: FrozenRawCase, execute?: Execute): Promise<AttemptResult> {
  const directory = mkdtempSync(resolve(tmpdir(), "whodunnit-post-v3-raw-"));
  chmodSync(directory, 0o700);
  const requestPath = resolve(directory, "request.json");
  const request = { source: caseRow.source, objective: caseRow.objective };
  const requestBytes = JSON.stringify(request);
  const requestSha256 = sha256(requestBytes);
  try {
    writeFileSync(requestPath, requestBytes, { flag: "wx", mode: 0o600 });
    const output = await runRawEditor({ promptPath: resolve(ROOT, PROMPT_PATH), requestPath, cwd: directory, execute });
    return { status: "success", text: output.text, provenance: output.provenance };
  } catch (error) {
    return failureFrom(error, requestSha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeRunAuthorization(directory: string, info: { cliVersion: string; cliVersionOutput: string; authClass: string; manifestSha256: string }) {
  const adapterSha256 = sha256(safeRegularFile("tools/eval/post-v3-raw-adapter.ts"));
  const runnerSha256 = sha256(safeRegularFile("tools/eval/post-v3-raw-runner.ts"));
  const verifierSha256 = sha256(safeRegularFile("tools/eval/post-v3-raw-freeze-verify.ts"));
  const record = {
    schemaVersion: 1,
    status: "AUTHORIZED_PRECALL",
    authorizedBy: "explicit --run-authorized switch after user authorization",
    createdUtc: new Date().toISOString(),
    manifestSha256: info.manifestSha256,
    cliVersion: info.cliVersion,
    cliVersionOutput: info.cliVersionOutput,
    authClass: info.authClass,
    requestedModel: MODEL_ID,
    effort: EFFORT,
    timeoutMs: 120_000,
    adapterSha256,
    runnerSha256,
    verifierSha256,
    promptSha256: RAW_PROMPT_SHA256,
    schemaSha256: sha256(safeRegularFile(SCHEMA_PATH)),
  };
  const path = resolve(directory, "pre-call-authorization.json");
  writeExclusiveDurably(path, record);
  writeHashSidecar(path, sha256(safeRegularFile(relative(ROOT, path))));
  return { path: relative(ROOT, path), sha256: sha256(safeRegularFile(relative(ROOT, path))) };
}

export async function runRawGeneration(options: { authorized: boolean; execute?: Execute; env?: NodeJS.ProcessEnv }) {
  if (!options.authorized) throw new Error("explicit --run-authorized switch is required");
  const contract = verifyRawGenerationContract();
  const caller = checkCallerPreflight(options.env ?? process.env);
  const frozen = verifyFrozenRawCases();
  if (existsSync(resolve(ROOT, RUN_PATH)) || existsSync(resolve(ROOT, FINAL_RAW_PATH))) throw new Error("RAW output paths must be absent before generation");

  mkdirSync(resolve(ROOT, RUN_PATH), { mode: 0o700 });
  syncDirectory(resolve(ROOT, BASE));
  const authorization = writeRunAuthorization(resolve(ROOT, RUN_PATH), { ...caller, manifestSha256: contract.manifestSha256 });
  const attemptsPath = resolve(ROOT, RUN_PATH, "attempts.jsonl");
  const successesPath = resolve(ROOT, RUN_PATH, "raw-successes.jsonl");
  const attemptFd = openAttemptLog(attemptsPath);
  const successFd = openAttemptLog(successesPath);
  const startedIds = new Set<string>();
  const terminalIds = new Set<string>();
  const outputRows: Record<string, unknown>[] = [];
  const modelGatePassed = { value: false };
  try {
    appendDurably(attemptFd, resolve(ROOT, RUN_PATH), { recordType: "run-started", experimentId: frozen.experimentId, manifestSha256: contract.manifestSha256, caller: { cliVersion: caller.cliVersion, authClass: caller.authClass }, authorization });
    for (const caseRow of frozen.cases) {
      if (startedIds.has(caseRow.caseId) || startedIds.size >= 40) throw new Error("duplicate or excess RAW attempt");
      startedIds.add(caseRow.caseId);
      const requestSha256 = sha256(JSON.stringify({ source: caseRow.source, objective: caseRow.objective }));
      const startedAt = new Date().toISOString();
      appendDurably(attemptFd, resolve(ROOT, RUN_PATH), {
        recordType: "attempt-started", caseId: caseRow.caseId, startedUtc: startedAt,
        sourceSha256: sha256(caseRow.source), objectiveSha256: sha256(caseRow.objective), attemptNumber: 1,
        requestSha256, promptSha256: RAW_PROMPT_SHA256, schemaSha256: sha256(safeRegularFile(SCHEMA_PATH)),
        callerVersion: caller.cliVersion, authClass: caller.authClass, requestedModel: MODEL_ID,
        settings: { effort: EFFORT, timeoutMs: 120_000, structuredOutputRetries: 0, cliRetries: 0, tools: "empty", sessionPersistence: false },
      });

      const result = await executeRawCase(caseRow, options.execute);
      const resolvedModel = result.status === "success" ? String(result.provenance.resolvedModel) : result.resolvedModel;
      const terminal = {
        recordType: "attempt-finished", caseId: caseRow.caseId,
        status: result.status, startedUtc: result.status === "success" ? String(result.provenance.startedAt) : result.startedAt,
        endedUtc: new Date().toISOString(), requestSha256,
        responseSha256OrNull: result.status === "success" ? result.provenance.responseEnvelopeSha256 : result.responseEnvelopeSha256,
        textSha256OrNull: result.status === "success" ? sha256(result.text) : null,
        requestedModel: MODEL_ID, resolvedModelOrNull: resolvedModel,
        provenance: result.status === "success" ? result.provenance : null,
        failure: result.status === "technical-failure" ? result : null,
      };
      if (result.status === "success") appendDurably(successFd, resolve(ROOT, RUN_PATH), {
        caseId: caseRow.caseId, requestSha256, responseEnvelopeSha256: result.provenance.responseEnvelopeSha256,
        textSha256: sha256(result.text), text: result.text, provenance: result.provenance,
      });
      appendDurably(attemptFd, resolve(ROOT, RUN_PATH), terminal);
      terminalIds.add(caseRow.caseId);

      process.stdout.write(JSON.stringify({ caseId: caseRow.caseId, status: result.status, requestSha256, responseSha256OrNull: terminal.responseSha256OrNull, textSha256OrNull: terminal.textSha256OrNull, resolvedModelOrNull: resolvedModel }) + "\n");

      const explicitIdentityFailure = result.status === "technical-failure" &&
        (result.category === "model-unresolved" || result.category === "model-mismatch" || (result.reportedModel !== null && result.reportedModel !== MODEL_ID));
      const firstCallIdentityFailure = startedIds.size === 1 && resolvedModel !== MODEL_ID;
      if (explicitIdentityFailure || firstCallIdentityFailure) {
        outputRows.push({ caseId: caseRow.caseId, sourceSha256: sha256(caseRow.source), objectiveSha256: sha256(caseRow.objective), requestSha256, attemptCount: 1,
          status: "technical-failure", text: null, textSha256: null, provenance: null, failure: result });
        throw new Error("RAW model identity absent or mismatched; hard stop after recording attempt");
      }
      if (startedIds.size === 1) modelGatePassed.value = true;
      if (result.status === "success") outputRows.push({ caseId: caseRow.caseId, sourceSha256: sha256(caseRow.source), objectiveSha256: sha256(caseRow.objective), requestSha256, attemptCount: 1,
        status: "success", text: result.text, textSha256: sha256(result.text), provenance: result.provenance, failure: null });
      else outputRows.push({ caseId: caseRow.caseId, sourceSha256: sha256(caseRow.source), objectiveSha256: sha256(caseRow.objective), requestSha256, attemptCount: 1,
        status: "technical-failure", text: null, textSha256: null, provenance: null, failure: result });
    }
  } finally { closeSync(attemptFd); closeSync(successFd); }

  if (!modelGatePassed.value || startedIds.size !== 40 || terminalIds.size !== 40 || outputRows.length !== 40) throw new Error("RAW run incomplete; final artifact not written");
  const rawArtifact = {
    protocol: "post-v3-raw-generation-v1",
    status: outputRows.some(row => row.status === "technical-failure") ? "complete-with-technical-failures" : "complete",
    experimentId: frozen.experimentId,
    manifestSha256: contract.manifestSha256,
    corpusManifestSha256: frozen.corpusManifestSha256,
    casesArtifactSha256: frozen.casesFileSha256,
    anchors: JSON.parse(safeRegularFile(`${BASE}/frozen/raw-generation-manifest.json`).toString("utf8")).anchors,
    expectedCaseIds: frozen.cases.map(item => item.caseId),
    commits: { rawGenerationContract: RAW_CONTRACT_COMMIT, frozenCorpus: CORPUS_COMMIT,
      candidateImplementation: "26bc2c865d177a8ff0c80c4836932aaccc0d3bdf", candidateManifest: IMPLEMENTATION_MANIFEST_COMMIT },
    candidateArtifacts: readCandidateArtifactHashes(),
    runnerSha256: sha256(safeRegularFile("tools/eval/post-v3-raw-runner.ts")),
    verifierSha256: sha256(safeRegularFile("tools/eval/post-v3-raw-freeze-verify.ts")),
    adapterSha256: sha256(safeRegularFile("tools/eval/post-v3-raw-adapter.ts")),
    preCallAuthorization: authorization,
    generatedUtc: new Date().toISOString(),
    cliVersion: caller.cliVersion,
    authClass: caller.authClass,
    requestedModel: MODEL_ID,
    effort: EFFORT,
    caseCount: outputRows.length,
    callCount: startedIds.size,
    attemptsPerCase: 1,
    retries: 0,
    successful: outputRows.filter(row => row.status === "success").length,
    technicalFailures: outputRows.filter(row => row.status === "technical-failure").length,
    failedCaseIdsAndCategories: outputRows.filter(row => row.status === "technical-failure").map(row => ({ caseId: row.caseId, category: (row.failure as AttemptFailure | undefined)?.category ?? "unknown" })),
    rawTextSha256ByCase: Object.fromEntries(outputRows.map(row => [String(row.caseId), row.textSha256 ?? null])),
    sourceSha256ByCase: Object.fromEntries(outputRows.map(row => [String(row.caseId), row.sourceSha256])),
    objectiveSha256ByCase: Object.fromEntries(outputRows.map(row => [String(row.caseId), row.objectiveSha256])),
    rows: outputRows,
  };
  const rawPath = resolve(ROOT, FINAL_RAW_PATH);
  writeExclusiveDurably(rawPath, rawArtifact);
  const rawHash = sha256(safeRegularFile(FINAL_RAW_PATH));
  writeHashSidecar(rawPath, rawHash);
  const attemptsHash = sha256(readFileSync(attemptsPath));
  writeHashSidecar(attemptsPath, attemptsHash);
  const rawSuccessesHash = sha256(readFileSync(successesPath));
  writeHashSidecar(successesPath, rawSuccessesHash);
  const freezeManifest = {
    schemaVersion: 1,
    status: "FROZEN_RAW_COMPLETE",
    rawProtocol: rawArtifact.protocol,
    experimentId: frozen.experimentId,
    generationManifestSha256: contract.manifestSha256,
    corpusManifestSha256: frozen.corpusManifestSha256,
    casesArtifactSha256: frozen.casesFileSha256,
    rawArtifactPath: FINAL_RAW_PATH,
    rawArtifactSha256: rawHash,
    attemptsPath: `${RUN_PATH}/attempts.jsonl`, attemptsSha256: attemptsHash,
    rawSuccessesPath: `${RUN_PATH}/raw-successes.jsonl`, rawSuccessesSha256: rawSuccessesHash,
    preCallAuthorizationPath: authorization.path, preCallAuthorizationSha256: authorization.sha256,
    runnerSha256: rawArtifact.runnerSha256, verifierSha256: rawArtifact.verifierSha256,
    adapterSha256: sha256(safeRegularFile("tools/eval/post-v3-raw-adapter.ts")),
    model: MODEL_ID, effort: EFFORT, cliVersion: caller.cliVersion,
    authClass: caller.authClass, caseCount: rawArtifact.caseCount, successful: rawArtifact.successful,
    technicalFailures: rawArtifact.technicalFailures, completedUtc: new Date().toISOString(),
    failedCaseIdsAndCategories: rawArtifact.failedCaseIdsAndCategories,
    incrementalSpend: { reportedByCaller: "not available in CLI response", costClaim: "USD 0 based on the user-attested plan-included Usage configuration; not independently verified by CLI auth status" },
  };
  const freezeManifestPath = resolve(ROOT, `${BASE}/frozen/raw-freeze-manifest.json`);
  writeExclusiveDurably(freezeManifestPath, freezeManifest);
  const freezeManifestHash = sha256(safeRegularFile(relative(ROOT, freezeManifestPath)));
  writeIntegritySidecar(freezeManifestPath, freezeManifestHash);
  return { status: rawArtifact.status, caseCount: rawArtifact.caseCount, successful: rawArtifact.successful, technicalFailures: rawArtifact.technicalFailures, rawSha256: rawHash, attemptsSha256: attemptsHash, rawSuccessesSha256: rawSuccessesHash, freezeManifestSha256: freezeManifestHash };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--run-authorized") throw new Error("usage: post-v3-raw-runner.ts --run-authorized");
  return runRawGeneration({ authorized: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().then(result => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "RAW generation failed"}\n`); process.exitCode = 1; });
