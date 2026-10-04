/** Independent post-run RAW freeze audit. Never prints source, objective, or RAW text. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(process.cwd());
const BASE = "data/evaluation/post-v3-comparison";
const CORPUS = `${BASE}/frozen/corpus-manifest.json`;
const CASES = `${BASE}/frozen/cases.json`;
const IMPLEMENTATIONS = `${BASE}/frozen/implementations.json`;
const GENERATION_MANIFEST = `${BASE}/frozen/raw-generation-manifest.json`;
const PROMPT = `${BASE}/raw-editor-prompt-v1.txt`;
const SCHEMA = `${BASE}/raw-response.schema.json`;
const RAW = `${BASE}/frozen/raw.json`;
const JOURNAL = `${BASE}/raw-attempts`;
const RUN_MANIFEST = `${BASE}/frozen/raw-freeze-manifest.json`;
const ATTEMPTS = `${JOURNAL}/attempts.jsonl`;
const SUCCESSES = `${JOURNAL}/raw-successes.jsonl`;
const AUTHORIZATION = `${JOURNAL}/pre-call-authorization.json`;
const MODEL = "claude-sonnet-5-5";
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  assert(typeof value === "string", `${label} must be a string`);
  return value;
}
function number(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isInteger(value), `${label} must be an integer`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}
function equal(actual: unknown, expected: unknown, label: string) {
  assert(actual === expected, `${label} mismatch`);
}
function safeBytes(path: string): Buffer {
  const absolute = resolve(ROOT, path);
  const rel = relative(ROOT, absolute);
  assert(path && rel !== ".." && !rel.startsWith(`..${sep}`), `unsafe path: ${path}`);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  assert(stat?.isFile() && !stat.isSymbolicLink(), `missing or unsafe file: ${path}`);
  return readFileSync(absolute);
}
function json(path: string): Record<string, unknown> {
  return object(JSON.parse(safeBytes(path).toString("utf8")), path);
}
function checkHash(path: string, expected: unknown): string {
  assert(typeof expected === "string" && HASH.test(expected), `invalid expected hash: ${path}`);
  const actual = sha256(safeBytes(path));
  equal(actual, expected, `file hash ${path}`);
  return actual;
}
function checkSidecar(path: string): string {
  const bytes = safeBytes(`${path}.sha256`).toString("utf8");
  const match = /^([a-f0-9]{64})  ([^/\r\n]+)\n$/.exec(bytes);
  assert(match, `invalid SHA-256 sidecar: ${path}`);
  equal(match[2], path.split("/").at(-1), `sidecar filename ${path}`);
  return checkHash(path, match[1]);
}
function checkManifestIntegrity(path: string): string {
  const sidecar = json(path.replace(/\.json$/, ".integrity.json"));
  equal(sidecar.schemaVersion, 1, "freeze integrity schema");
  equal(sidecar.manifestPath, path, "freeze integrity path");
  equal(sidecar.hashAlgorithm, "sha256", "freeze integrity algorithm");
  return checkHash(path, sidecar.exactFileBytesSha256);
}
function jsonLines(path: string): Record<string, unknown>[] {
  const content = safeBytes(path).toString("utf8");
  assert(content.endsWith("\n"), `incomplete journal line: ${path}`);
  return content.slice(0, -1).split("\n").map((line, index) => object(JSON.parse(line), `${path}:${index + 1}`));
}
function sameIds(actual: unknown, expected: string[], label: string) {
  const ids = array(actual, label).map((id, index) => string(id, `${label}[${index}]`));
  assert(ids.length === expected.length && ids.every((id, index) => id === expected[index]), `${label} order mismatch`);
}
function verifySourceAndFreezeAnchors(run: Record<string, unknown>, raw: Record<string, unknown>) {
  const corpusBytes = safeBytes(CORPUS);
  const corpus = object(JSON.parse(corpusBytes.toString("utf8")), CORPUS);
  const casesBytes = safeBytes(CASES);
  const cases = array(JSON.parse(casesBytes.toString("utf8")), CASES).map((row, index) => object(row, `case ${index}`));
  const ids = array(corpus.caseIds, "corpus caseIds").map((id, index) => string(id, `caseId ${index}`));
  const hashes = array(corpus.caseHashes, "caseHashes").map((row, index) => object(row, `case hash ${index}`));
  assert(ids.length === 40 && cases.length === 40 && hashes.length === 40 && new Set(ids).size === 40, "corpus count or uniqueness mismatch");
  for (let index = 0; index < 40; index++) {
    const row = cases[index], pinned = hashes[index];
    equal(row.caseId, ids[index], `case ID ${index}`);
    equal(pinned.caseId, ids[index], `case hash ID ${index}`);
    equal(sha256(string(row.source, `source ${index}`)), pinned.sourceUtf8Sha256, `source hash ${index}`);
    equal(sha256(string(row.objective, `objective ${index}`)), pinned.objectiveUtf8Sha256, `objective hash ${index}`);
  }
  const corpusSha = sha256(corpusBytes), casesSha = sha256(casesBytes);
  const casesArtifact = object(object(corpus.artifactHashes, "artifactHashes")["cases.json"], "cases artifact");
  equal(casesSha, casesArtifact.fileBytesSha256, "cases artifact bytes");
  equal(corpusSha, run.corpusManifestSha256, "run corpus hash");
  equal(corpusSha, raw.corpusManifestSha256, "RAW corpus hash");
  equal(casesSha, run.casesArtifactSha256, "run cases hash");
  equal(casesSha, raw.casesArtifactSha256, "RAW cases hash");
  sameIds(raw.expectedCaseIds, ids, "RAW expectedCaseIds");

  const generationBytes = safeBytes(GENERATION_MANIFEST);
  const generationSha = sha256(generationBytes);
  const generation = object(JSON.parse(generationBytes.toString("utf8")), GENERATION_MANIFEST);
  equal(generation.status, "FROZEN_PRE_GENERATION", "generation freeze status");
  equal(generationSha, run.generationManifestSha256, "run generation manifest hash");
  equal(generationSha, raw.manifestSha256, "RAW generation manifest hash");
  equal(JSON.stringify(raw.anchors), JSON.stringify(generation.anchors), "RAW predecessor anchors");
  const generationIntegrity = json(`${BASE}/frozen/raw-generation-manifest.integrity.json`);
  equal(generationSha, generationIntegrity.exactFileBytesSha256, "generation integrity sidecar");
  for (const [path, expected] of Object.entries(object(generation.files, "generation files"))) checkHash(path, expected);

  const implementations = json(IMPLEMENTATIONS);
  const implementationHashes = object(implementations.implementationFiles, "candidate hashes");
  const v15Hashes = object(implementations.sharedV15DependencyHashes, "V15 hashes");
  for (const [path, expected] of [...Object.entries(implementationHashes), ...Object.entries(v15Hashes)]) checkHash(path, expected);
  const implementationCommit = string(implementations.implementationCommit, "implementation commit");
  const commits = object(raw.commits, "RAW commits");
  equal(commits.rawGenerationContract, "7acb2bb5246400e8d792d13979e204f4cb9b765e", "RAW contract commit");
  equal(commits.frozenCorpus, "0bace0834bf5f85b4bc9ae3d29311badcd2adacc", "corpus freeze commit");
  equal(commits.candidateImplementation, implementationCommit, "candidate implementation commit");
  equal(commits.candidateManifest, "19ccd7569403058d6afd7086ad3bf8a0ce836b25", "candidate manifest commit");
  const candidateArtifacts = object(raw.candidateArtifacts, "candidate artifacts");
  equal(candidateArtifacts.implementationCommit, implementationCommit, "candidate artifact implementation commit");
  const armArtifacts = object(candidateArtifacts.arms, "arm artifacts");
  const arms = array(implementations.arms, "frozen arms").map((arm, index) => object(arm, `arm ${index}`));
  assert(arms.length === 4 && Object.keys(armArtifacts).length === 4, "candidate arm count mismatch");
  for (const arm of arms) equal(armArtifacts[string(arm.id, "arm ID")], arm.artifactSha256, "candidate artifact hash");
  const committedSourceChanges = execFileSync("git", ["diff", "--name-only", implementationCommit, "HEAD", "--", "src"], { cwd: ROOT, encoding: "utf8" }).trim();
  const worktreeSourceChanges = execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert(!committedSourceChanges && !worktreeSourceChanges, "V15/A-D/production source changed since implementation freeze");
  assert(!existsSync(resolve(ROOT, `${BASE}/run`)), "comparison run directory exists");
  for (const path of [`${BASE}/frozen/blind-assignments.json`, `${BASE}/frozen/reviews`, `${BASE}/frozen/post-lock-audit.json`])
    assert(!existsSync(resolve(ROOT, path)), `comparison output exists: ${path}`);
  return { ids, cases, corpusSha, casesSha, generationSha };
}

export function verifyPostV3RawFreeze() {
  const runSha = checkManifestIntegrity(RUN_MANIFEST);
  const run = json(RUN_MANIFEST);
  equal(run.schemaVersion, 1, "run manifest schema");
  equal(run.status, "FROZEN_RAW_COMPLETE", "run manifest status");
  equal(run.rawArtifactPath, RAW, "RAW artifact path");
  equal(run.attemptsPath, ATTEMPTS, "attempt journal path");
  equal(run.rawSuccessesPath, SUCCESSES, "success journal path");
  equal(run.preCallAuthorizationPath, AUTHORIZATION, "authorization path");
  const rawSha = checkSidecar(RAW);
  equal(rawSha, run.rawArtifactSha256, "run RAW hash");
  const attemptsSha = checkSidecar(ATTEMPTS);
  equal(attemptsSha, run.attemptsSha256, "run attempts hash");
  const successesSha = checkSidecar(SUCCESSES);
  equal(successesSha, run.rawSuccessesSha256, "run successes hash");
  const authorizationSha = checkSidecar(AUTHORIZATION);
  equal(authorizationSha, run.preCallAuthorizationSha256, "run authorization hash");
  const raw = json(RAW), authorization = json(AUTHORIZATION);
  const frozen = verifySourceAndFreezeAnchors(run, raw);

  equal(raw.protocol, "post-v3-raw-generation-v1", "RAW protocol");
  equal(raw.experimentId, run.experimentId, "experiment identity");
  equal(raw.experimentId, json(CORPUS).experimentId, "corpus experiment identity");
  equal(raw.cliVersion, "2.1.288", "RAW CLI version");
  equal(run.cliVersion, "2.1.288", "run CLI version");
  equal(raw.authClass, "claude.ai", "RAW account class");
  equal(run.authClass, "claude.ai", "run account class");
  for (const record of [raw, run, authorization]) {
    equal(record.requestedModel ?? record.model, MODEL, "requested model");
    equal(record.effort, "medium", "effort");
  }
  equal(authorization.status, "AUTHORIZED_PRECALL", "authorization status");
  equal(authorization.manifestSha256, frozen.generationSha, "authorization manifest hash");
  equal(authorization.authClass, "claude.ai", "authorization account class");
  equal(authorization.cliVersion, "2.1.288", "authorization CLI version");
  equal(authorization.timeoutMs, 120_000, "authorization timeout");
  equal(authorization.promptSha256, sha256(safeBytes(PROMPT)), "authorization prompt hash");
  equal(authorization.schemaSha256, sha256(safeBytes(SCHEMA)), "authorization schema hash");
  const rawAuthorization = object(raw.preCallAuthorization, "RAW authorization link");
  equal(rawAuthorization.path, AUTHORIZATION, "RAW authorization path");
  equal(rawAuthorization.sha256, authorizationSha, "RAW authorization hash");
  for (const [path, expected] of [
    ["tools/eval/post-v3-raw-runner.ts", run.runnerSha256],
    ["tools/eval/post-v3-raw-freeze-verify.ts", run.verifierSha256],
    ["tools/eval/post-v3-raw-adapter.ts", run.adapterSha256],
  ] as const) checkHash(path, expected);
  equal(raw.runnerSha256, run.runnerSha256, "RAW runner hash");
  equal(raw.verifierSha256, run.verifierSha256, "RAW verifier hash");
  equal(authorization.runnerSha256, run.runnerSha256, "authorization runner hash");
  equal(authorization.verifierSha256, run.verifierSha256, "authorization verifier hash");
  equal(authorization.adapterSha256, run.adapterSha256, "authorization adapter hash");

  const attempts = jsonLines(ATTEMPTS);
  const successes = jsonLines(SUCCESSES);
  const rows = array(raw.rows, "RAW rows").map((row, index) => object(row, `RAW row ${index}`));
  assert(rows.length === 40 && attempts.length === 81, "RAW/attempt count mismatch or retry present");
  equal(raw.callCount, 40, "RAW call count");
  equal(raw.attemptsPerCase, 1, "RAW attempts per case");
  equal(raw.retries, 0, "RAW retries");
  const sourceHashMap = object(raw.sourceSha256ByCase, "source hash map");
  const objectiveHashMap = object(raw.objectiveSha256ByCase, "objective hash map");
  const textHashMap = object(raw.rawTextSha256ByCase, "RAW text hash map");
  assert(Object.keys(sourceHashMap).length === 40 && Object.keys(objectiveHashMap).length === 40 && Object.keys(textHashMap).length === 40, "per-case hash map count mismatch");
  equal(attempts[0].recordType, "run-started", "first journal record");
  equal(attempts[0].manifestSha256, frozen.generationSha, "run-started manifest hash");
  equal(attempts[0].experimentId, raw.experimentId, "run-started experiment");
  const startedAuthorization = object(attempts[0].authorization, "run-started authorization");
  equal(startedAuthorization.path, AUTHORIZATION, "run-started authorization path");
  equal(startedAuthorization.sha256, authorizationSha, "run-started authorization hash");
  let successCount = 0, failureCount = 0, successJournalIndex = 0;
  for (let index = 0; index < 40; index++) {
    const id = frozen.ids[index], caseRow = frozen.cases[index];
    const started = attempts[index * 2 + 1], finished = attempts[index * 2 + 2], row = rows[index];
    equal(started.recordType, "attempt-started", `attempt start ${index}`);
    equal(finished.recordType, "attempt-finished", `attempt finish ${index}`);
    for (const item of [started, finished, row]) equal(item.caseId, id, `case order ${index}`);
    equal(started.attemptNumber, 1, `attempt number ${index}`);
    const requestSha = sha256(JSON.stringify({ source: caseRow.source, objective: caseRow.objective }));
    equal(started.requestSha256, requestSha, `request hash ${index}`);
    equal(finished.requestSha256, requestSha, `finished request hash ${index}`);
    equal(row.requestSha256, requestSha, `RAW request hash ${index}`);
    equal(row.attemptCount, 1, `RAW attempt count ${index}`);
    equal(started.sourceSha256, sha256(string(caseRow.source, `source ${index}`)), `started source hash ${index}`);
    equal(started.objectiveSha256, sha256(string(caseRow.objective, `objective ${index}`)), `started objective hash ${index}`);
    equal(row.sourceSha256, started.sourceSha256, `RAW source hash ${index}`);
    equal(row.objectiveSha256, started.objectiveSha256, `RAW objective hash ${index}`);
    equal(sourceHashMap[id], started.sourceSha256, `source hash map ${index}`);
    equal(objectiveHashMap[id], started.objectiveSha256, `objective hash map ${index}`);
    equal(started.promptSha256, authorization.promptSha256, `prompt hash ${index}`);
    equal(started.schemaSha256, authorization.schemaSha256, `schema hash ${index}`);
    equal(started.requestedModel, MODEL, `started model ${index}`);
    equal(finished.requestedModel, MODEL, `finished model ${index}`);
    if (index === 0) equal(finished.resolvedModelOrNull, MODEL, "first-call model gate");
    equal(started.callerVersion, "2.1.288", `caller version ${index}`);
    equal(started.authClass, "claude.ai", `caller auth ${index}`);
    const settings = object(started.settings, `settings ${index}`);
    equal(settings.effort, "medium", `effort ${index}`);
    equal(settings.timeoutMs, 120_000, `timeout ${index}`);
    equal(settings.structuredOutputRetries, 0, `structured retries ${index}`);
    equal(settings.cliRetries, 0, `CLI retries ${index}`);
    equal(settings.tools, "empty", `tool access ${index}`);
    equal(settings.sessionPersistence, false, `session persistence ${index}`);
    assert(Date.parse(string(started.startedUtc, `start time ${index}`)) <= Date.parse(string(finished.endedUtc, `end time ${index}`)), `attempt time order ${index}`);
    equal(finished.status, row.status, `status ${index}`);
    if (row.status === "success") {
      successCount++;
      equal(finished.resolvedModelOrNull, MODEL, `resolved model ${index}`);
      const success = successes[successJournalIndex++];
      assert(success !== undefined, `missing success journal row ${index}`);
      equal(success.caseId, id, `success journal ID ${index}`);
      equal(success.requestSha256, requestSha, `success journal request hash ${index}`);
      const text = string(row.text, `RAW text ${index}`);
      equal(success.text, text, `RAW/success text ${index}`);
      const textSha = sha256(text);
      equal(success.textSha256, textSha, `success text hash ${index}`);
      equal(finished.textSha256OrNull, textSha, `finished text hash ${index}`);
      equal(row.textSha256, textSha, `RAW text hash ${index}`);
      equal(textHashMap[id], textSha, `RAW text hash map ${index}`);
      equal(finished.responseSha256OrNull, success.responseEnvelopeSha256, `response hash ${index}`);
      const provenance = object(row.provenance, `RAW provenance ${index}`);
      equal(provenance.resolvedModel, MODEL, `RAW resolved model ${index}`);
      equal(provenance.requestSha256, requestSha, `RAW provenance request hash ${index}`);
      equal(provenance.responseEnvelopeSha256, success.responseEnvelopeSha256, `RAW provenance response hash ${index}`);
      equal(provenance.promptSha256, authorization.promptSha256, `RAW provenance prompt hash ${index}`);
      equal(provenance.schemaSha256, authorization.schemaSha256, `RAW provenance schema hash ${index}`);
      if (provenance.reportedModel !== null) equal(provenance.reportedModel, MODEL, `reported model ${index}`);
      const usageModels = array(provenance.modelUsageModels, `model usage IDs ${index}`);
      assert(provenance.reportedModel === MODEL || usageModels.length > 0, `missing independent model identity ${index}`);
      assert(usageModels.every(model => model === MODEL), `model usage identity ${index}`);
      equal(JSON.stringify(success.provenance), JSON.stringify(provenance), `success provenance ${index}`);
      equal(JSON.stringify(finished.provenance), JSON.stringify(provenance), `finished provenance ${index}`);
    } else {
      equal(row.status, "technical-failure", `failure status ${index}`);
      failureCount++;
      assert(row.text === null || row.text === undefined, `failure text ${index}`);
      equal(row.textSha256, null, `failure text hash ${index}`);
      equal(textHashMap[id], null, `failure text hash map ${index}`);
      equal(row.provenance, null, `failure provenance ${index}`);
      equal(finished.textSha256OrNull, null, `failure text hash ${index}`);
      assert(row.failure !== null && row.failure !== undefined, `missing failure ${index}`);
      const failure = object(row.failure, `failure ${index}`);
      const category = string(failure.category, `failure category ${index}`);
      assert(category !== "model-unresolved" && category !== "model-mismatch", `model identity failure was frozen at ${index}`);
      assert(finished.resolvedModelOrNull === null || finished.resolvedModelOrNull === MODEL, `failure model ${index}`);
      equal(JSON.stringify(finished.failure), JSON.stringify(row.failure), `failure journal ${index}`);
    }
  }
  equal(successJournalIndex, successes.length, "success journal extra rows");
  for (const artifact of [raw, run]) {
    equal(number(artifact.caseCount, "case count"), 40, "case count");
    equal(number(artifact.successful, "success count"), successCount, "success count");
    equal(number(artifact.technicalFailures, "failure count"), failureCount, "failure count");
  }
  equal(raw.status, failureCount ? "complete-with-technical-failures" : "complete", "RAW aggregate status");
  const failed = array(raw.failedCaseIdsAndCategories, "RAW failed cases").map((item, index) => object(item, `failed case ${index}`));
  const frozenFailures = rows.filter(row => row.status === "technical-failure");
  assert(failed.length === failureCount, "failed case list count mismatch");
  for (let index = 0; index < failed.length; index++) {
    equal(failed[index].caseId, frozenFailures[index].caseId, `failed case ID ${index}`);
    equal(failed[index].category, object(frozenFailures[index].failure, `failure ${index}`).category, `failed category ${index}`);
  }
  equal(JSON.stringify(run.failedCaseIdsAndCategories), JSON.stringify(raw.failedCaseIdsAndCategories), "freeze manifest failure list");
  assert(successCount + failureCount === 40, "RAW outcome count mismatch");
  assert(!existsSync(resolve(ROOT, `${BASE}/run`)), "comparison output exists");
  return { valid: true, caseCount: 40, attempted: 40, successful: successCount, technicalFailures: failureCount,
    resolvedModel: MODEL, rawSha256: rawSha, attemptsSha256: attemptsSha, rawSuccessesSha256: successesSha,
    runManifestSha256: runSha, comparisonOutputsAbsent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(verifyPostV3RawFreeze()) + "\n"); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "RAW freeze verification failed"}\n`); process.exitCode = 1; }
}
