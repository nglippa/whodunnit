import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  DIAGNOSE_SYSTEM, EDIT_SYSTEM, JUDGE_SYSTEM, diagnosisSchema, finalSchema, judgmentSchema,
  protocol, signTest, validateDiagnosis, validateHoldout, validateJudgment, type BlindPair, type Case, type Final,
} from "./experiment";

export const DEFAULT_MANUAL_ROOT = resolve(".evaluations/editorial-intelligence-manual-v1");
const HOLDOUT = resolve("data/experiments/editorial-intelligence-v1/holdout.json");
const VERSION = "editorial-intelligence-manual-v1";
type EditorStage = "direct" | "diagnosis" | "reconstruction";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const safeId = (value: string, label: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};
const writeNew = (path: string, value: string | Buffer) => writeFileSync(path, value, { flag: "wx", mode: 0o600 });
const readJsonStrict = (bytes: Buffer, label: string): unknown => {
  if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error(`${label} is not valid UTF-8`);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} is not strict JSON`); }
};
const stable = (value: unknown) => JSON.stringify(value);
const promptText = (request: { system: string; payload: unknown }) => request.system + "\n\n" + json(request.payload);
type StoredOutput = { data: unknown; evidence: unknown };
type StoredResult = { status: string; rawSha256: string; metadataSha256: string; requestSha256: string; output: StoredOutput };

const nullableCount = z.number().int().nonnegative().nullable();
const metadataSchema = z.object({
  requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selectedModel: z.string().min(1),
  returnedModel: z.string().min(1).nullable(),
  requestId: z.string().min(1).nullable(),
  tokens: z.object({ input: nullableCount, output: nullableCount, reasoning: nullableCount }).strict(),
  costUsd: z.number().nonnegative().nullable(),
  providerLatencyMs: z.number().nonnegative().nullable(),
  startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(),
  actualConfig: z.object({ reasoningEffort: z.string().nullable(), maxOutputTokens: nullableCount,
    attempts: nullableCount, tools: z.boolean().nullable(), sessionMemory: z.boolean().nullable() }).strict(),
  configEvidence: z.string().min(1).nullable(),
}).strict();
export type ManualMetadata = z.infer<typeof metadataSchema>;

function schemaHashes() {
  return { diagnosis: hash(stable(z.toJSONSchema(diagnosisSchema))), final: hash(stable(z.toJSONSchema(finalSchema))),
    judgment: hash(stable(z.toJSONSchema(judgmentSchema))) };
}
function promptHashes() {
  return { edit: hash(EDIT_SYSTEM), diagnosis: hash(DIAGNOSE_SYSTEM), judge: hash(JUDGE_SYSTEM) };
}
function runPath(runId: string, root = DEFAULT_MANUAL_ROOT) { return resolve(root, safeId(runId, "run id")); }

function readPinnedRun(runId: string, root = DEFAULT_MANUAL_ROOT) {
  const run = runPath(runId, root), manifestBytes = readFileSync(resolve(run, "manifest.json"));
  const holdoutBytes = readFileSync(resolve(run, "holdout.json")), manifest = readJsonStrict(manifestBytes, "manifest") as ReturnType<typeof manifestFor>;
  if (manifest.version !== VERSION || manifest.holdoutSha256 !== hash(holdoutBytes) ||
    manifest.protocolSha256 !== hash(stable(protocol)) || manifest.promptHashesSha256 !== hash(stable(promptHashes())) ||
    manifest.schemaHashesSha256 !== hash(stable(schemaHashes())) || manifest.holdoutSha256 !== hash(readFileSync(HOLDOUT)) ||
    stable(manifest.protocol) !== stable(protocol) || stable(manifest.promptHashes) !== stable(promptHashes()) ||
    stable(manifest.schemaHashes) !== stable(schemaHashes()) || manifest.runId !== runId)
    throw new Error("Run manifest or pinned protocol material was tampered");
  const holdout = validateHoldout(readJsonStrict(holdoutBytes, "pinned holdout"), []);
  if (holdout.version !== manifest.holdoutVersion || holdout.cases.length !== manifest.caseCount) throw new Error("Pinned holdout does not match manifest");
  return { run, manifest, holdout };
}

function order(index: number): EditorStage[] {
  return index % 2 ? ["diagnosis", "reconstruction", "direct"] : ["direct", "diagnosis", "reconstruction"];
}
function resultPath(run: string, caseId: string, stage: EditorStage | "judge") {
  return resolve(run, "attempts", safeId(caseId, "case id"), stage, "result.json");
}
function loadAccepted(run: string, caseId: string, stage: EditorStage | "judge"): StoredOutput | null {
  const path = resultPath(run, caseId, stage);
  if (!existsSync(path)) return null;
  const result = readJsonStrict(readFileSync(path), "stored result") as StoredResult;
  if (result.status !== "accepted") throw new Error(`${caseId} ${stage} first attempt was rejected; retries are prohibited`);
  const dir = resolve(run, "attempts", caseId, stage), raw = readFileSync(resolve(dir, "response.raw")), metadata = readFileSync(resolve(dir, "metadata.raw.json"));
  const request = readFileSync(stage === "judge" ? resolve(run, "blind", "requests", `${caseId}.json`) : resolve(run, "requests", `${caseId}-${stage}.json`));
  const promptPath = stage === "judge" ? resolve(run, "blind", "requests", `${caseId}.prompt.txt`) : resolve(run, "requests", `${caseId}-${stage}.prompt.txt`);
  if (result.rawSha256 !== hash(raw) || result.metadataSha256 !== hash(metadata) || result.requestSha256 !== hash(request) ||
    stable(readJsonStrict(raw, "stored raw response")) !== stable(result.output.data) ||
    readFileSync(promptPath, "utf8") !== promptText(readJsonStrict(request, "request") as ReturnType<typeof requestFor>))
    throw new Error("Stored response or result was tampered");
  return result.output;
}

function requestFor(row: Case, stage: EditorStage, diagnosis?: unknown) {
  const system = stage === "diagnosis" ? DIAGNOSE_SYSTEM : stage === "reconstruction"
    ? EDIT_SYSTEM + "\nUse the diagnosis as evidence-based editorial guidance, not authority to change facts or ignore OBJECTIVE." : EDIT_SYSTEM;
  const payload = stage === "diagnosis" ? { source: row.source, objective: row.objective, schema: z.toJSONSchema(diagnosisSchema) }
    : stage === "reconstruction" ? { source: row.source, objective: row.objective, diagnosis, schema: z.toJSONSchema(finalSchema) }
    : { source: row.source, objective: row.objective, schema: z.toJSONSchema(finalSchema) };
  const promptSha256 = hash(stable({ system, payload }));
  return { version: VERSION, caseId: row.id, stage, model: protocol.editorModel, system, payload, promptSha256,
    intendedConfig: { reasoningEffort: protocol.reasoningEffort, maxOutputTokens: protocol.outputTokenCaps[stage],
      attempts: protocol.attemptsPerStage, tools: protocol.tools, sessionMemory: protocol.sessionMemory } };
}
function metadataTemplate(request: ReturnType<typeof requestFor> | ReturnType<typeof judgeRequest>) {
  return { requestSha256: hash(json(request)), promptSha256: request.promptSha256, selectedModel: request.model,
    returnedModel: null, requestId: null, tokens: { input: null, output: null, reasoning: null }, costUsd: null,
    providerLatencyMs: null, startedAt: null, completedAt: null,
    actualConfig: { reasoningEffort: null, maxOutputTokens: null, attempts: null, tools: null, sessionMemory: null }, configEvidence: null };
}
function writeEditorRequest(run: string, row: Case, stage: EditorStage, diagnosis?: unknown) {
  const request = requestFor(row, stage, diagnosis), base = resolve(run, "requests");
  const path = resolve(base, `${row.id}-${stage}.json`);
  if (existsSync(path)) return;
  writeNew(path, json(request)); writeNew(resolve(base, `${row.id}-${stage}.metadata.json`), json(metadataTemplate(request)));
  writeNew(resolve(base, `${row.id}-${stage}.prompt.txt`), promptText(request));
}

function manifestFor(runId: string, holdoutBytes: Buffer, holdout: ReturnType<typeof validateHoldout>) {
  return { version: VERSION, runId, createdAt: new Date().toISOString(), status: "MANUAL_UNAUDITED",
    qualification: "Manual evidence records available provenance without fabricating provider receipts.",
    holdoutVersion: holdout.version, caseCount: holdout.cases.length, holdoutSha256: hash(holdoutBytes),
    protocolSha256: hash(stable(protocol)), promptHashes: promptHashes(), promptHashesSha256: hash(stable(promptHashes())),
    schemaHashes: schemaHashes(), schemaHashesSha256: hash(stable(schemaHashes())), protocol };
}
export function exportManualRun(runId: string, root = DEFAULT_MANUAL_ROOT) {
  safeId(runId, "run id"); mkdirSync(root, { recursive: true, mode: 0o700 });
  const run = runPath(runId, root); mkdirSync(run, { mode: 0o700 });
  for (const part of ["requests", "attempts", "private"]) mkdirSync(resolve(run, part), { mode: 0o700 });
  const holdoutBytes = readFileSync(HOLDOUT), holdout = validateHoldout(readJsonStrict(holdoutBytes, "holdout"), []);
  writeNew(resolve(run, "holdout.json"), holdoutBytes);
  const manifest = manifestFor(runId, holdoutBytes, holdout);
  writeNew(resolve(run, "manifest.json"), json(manifest));
  holdout.cases.forEach((row, index) => writeEditorRequest(run, row, order(index)[0]));
  return { run, cases: holdout.cases.length, nextRequests: holdout.cases.map((row, i) => `${row.id}:${order(i)[0]}`) };
}

function validateFinalManual(value: unknown, source: string): Final {
  const final = finalSchema.parse(value);
  if (final.disposition === "UNCHANGED" && final.text !== source || final.disposition === "EDITED" && final.text === source)
    throw new Error("Final disposition/text mismatch");
  return final;
}
function verifyMetadata(value: unknown, requestBytes: Buffer, promptSha256: string, expectedModel: string) {
  const metadata = metadataSchema.parse(value);
  if (metadata.requestSha256 !== hash(requestBytes) || metadata.promptSha256 !== promptSha256) throw new Error("Metadata is not bound to exported request/prompt");
  if (metadata.selectedModel !== expectedModel || metadata.returnedModel !== null && metadata.returnedModel !== expectedModel)
    throw new Error("Missing or substituted model identity");
  const request = readJsonStrict(requestBytes, "request") as { intendedConfig: ReturnType<typeof requestFor>["intendedConfig"] };
  for (const key of ["reasoningEffort", "maxOutputTokens", "attempts", "tools", "sessionMemory"] as const)
    if (metadata.actualConfig[key] !== null && metadata.actualConfig[key] !== request.intendedConfig[key])
      throw new Error(`Reported inference configuration differs: ${key}`);
  if (metadata.tokens.output !== null && metadata.tokens.output > request.intendedConfig.maxOutputTokens)
    throw new Error("Reported output exceeds stage budget");
  if (metadata.startedAt && metadata.completedAt && Date.parse(metadata.completedAt) < Date.parse(metadata.startedAt))
    throw new Error("Completion timestamp precedes start");
  return metadata;
}

function archiveAttempt<T>(run: string, caseId: string, stage: string, rawPath: string, metadataPath: string,
  validate: (raw: unknown, requestBytes: Buffer, metadata: unknown) => T) {
  const raw = readFileSync(rawPath), metadataBytes = readFileSync(metadataPath);
  const dir = resolve(run, "attempts", safeId(caseId, "case id"), safeId(stage, "stage"));
  if (existsSync(dir)) throw new Error(`${caseId} ${stage} already attempted; overwrite/retry rejected`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeNew(resolve(dir, "response.raw"), raw); writeNew(resolve(dir, "metadata.raw.json"), metadataBytes);
  const requestPath = stage === "judge" ? resolve(run, "blind", "requests", `${caseId}.json`) : resolve(run, "requests", `${caseId}-${stage}.json`);
  const requestBytes = readFileSync(requestPath);
  try {
    const output = validate(readJsonStrict(raw, "raw response"), requestBytes, readJsonStrict(metadataBytes, "metadata"));
    writeNew(resolve(dir, "result.json"), json({ status: "accepted", rawSha256: hash(raw), metadataSha256: hash(metadataBytes),
      requestSha256: hash(requestBytes), recordedAt: new Date().toISOString(), output }));
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import failure";
    writeNew(resolve(dir, "result.json"), json({ status: "rejected", rawSha256: hash(raw), metadataSha256: hash(metadataBytes),
      requestSha256: hash(requestBytes), recordedAt: new Date().toISOString(), error: message }));
    throw new Error(`${caseId} ${stage} rejected permanently: ${message}`);
  }
}

export function importEditorResponse(runId: string, caseId: string, stage: EditorStage, rawPath: string, metadataPath: string, root = DEFAULT_MANUAL_ROOT) {
  if (!["direct", "diagnosis", "reconstruction"].includes(stage)) throw new Error("Invalid editor stage");
  const { run, holdout } = readPinnedRun(runId, root), index = holdout.cases.findIndex(row => row.id === caseId);
  if (index < 0) throw new Error("Unknown holdout case");
  const row = holdout.cases[index], stages = order(index), position = stages.indexOf(stage);
  if (position < 0 || stages.slice(0, position).some(prior => !loadAccepted(run, caseId, prior))) throw new Error("Stage execution order violation or missing validated diagnosis");
  if (stages.slice(position + 1).some(later => existsSync(resultPath(run, caseId, later)))) throw new Error("Stage execution order violation");
  const diagnosis = stage === "reconstruction" ? loadAccepted(run, caseId, "diagnosis")?.data : undefined;
  const expected = requestFor(row, stage, diagnosis), requestPath = resolve(run, "requests", `${caseId}-${stage}.json`), requestBytes = readFileSync(requestPath);
  if (stable(readJsonStrict(requestBytes, "request")) !== stable(expected) ||
    readFileSync(resolve(run, "requests", `${caseId}-${stage}.prompt.txt`), "utf8") !== promptText(expected)) throw new Error("Exported request was tampered");
  const output = archiveAttempt(run, caseId, stage, rawPath, metadataPath, (value, boundRequest, metadataValue) => {
    const metadata = verifyMetadata(metadataValue, boundRequest, expected.promptSha256, protocol.editorModel);
    const parsed = stage === "diagnosis" ? validateDiagnosis(value, row.source) : validateFinalManual(value, row.source);
    return { data: parsed, evidence: { selectedModel: { value: metadata.selectedModel, basis: "operator-attested" },
      returnedModel: { value: metadata.returnedModel, basis: metadata.returnedModel === null ? "unknown" : "provider-reported" },
      requestId: metadata.requestId, tokens: metadata.tokens, costUsd: metadata.costUsd, providerLatencyMs: metadata.providerLatencyMs,
      timestamps: { startedAt: metadata.startedAt, completedAt: metadata.completedAt },
      config: { intended: expected.intendedConfig, actual: metadata.actualConfig, evidence: metadata.configEvidence } } };
  });
  const next = stages[position + 1];
  if (next) writeEditorRequest(run, row, next, next === "reconstruction" ? output.data : undefined);
  return { caseId, stage, status: "accepted", nextStage: next ?? null };
}

function acceptedData(run: string, caseId: string, stage: EditorStage) {
  const result = loadAccepted(run, caseId, stage);
  if (!result) throw new Error(`Incomplete case ${caseId}: missing ${stage}`);
  return result.data;
}
function judgeRequest(packet: BlindPair) {
  const payload = { ...packet, schema: z.toJSONSchema(judgmentSchema) }, promptSha256 = hash(stable({ system: JUDGE_SYSTEM, payload }));
  return { system: JUDGE_SYSTEM, payload, model: protocol.judgeModel, promptSha256,
    intendedConfig: { reasoningEffort: protocol.reasoningEffort, maxOutputTokens: protocol.outputTokenCaps.judge,
      attempts: protocol.attemptsPerStage, tools: protocol.tools, sessionMemory: protocol.sessionMemory } };
}

function boundBlind(run: string, holdout: ReturnType<typeof validateHoldout>) {
  const pairs = holdout.cases.map(row => ({ row, A: acceptedData(run, row.id, "direct") as Final,
    B: acceptedData(run, row.id, "reconstruction") as Final }));
  const shuffled = [...pairs].sort((a, b) => hash(protocol.blindSeed + a.row.id).localeCompare(hash(protocol.blindSeed + b.row.id)));
  return shuffled.map((pair, index) => {
    const X = index % 2 === 0 ? "A" as const : "B" as const, Y = X === "A" ? "B" as const : "A" as const;
    return { mapping: { caseId: pair.row.id, X, Y }, packet: { caseId: pair.row.id,
      source: pair.row.source, objective: pair.row.objective, X: pair[X].text, Y: pair[Y].text } satisfies BlindPair };
  });
}
export function blindManualRun(runId: string, root = DEFAULT_MANUAL_ROOT) {
  const { run, holdout } = readPinnedRun(runId, root), blinded = boundBlind(run, holdout);
  const blindDir = resolve(run, "blind"), requests = resolve(blindDir, "requests"), metadata = resolve(blindDir, "metadata-templates");
  mkdirSync(blindDir, { mode: 0o700 }); mkdirSync(requests, { mode: 0o700 }); mkdirSync(metadata, { mode: 0o700 });
  const mappings = blinded.map(({ packet, mapping }) => {
    const request = judgeRequest(packet);
    writeNew(resolve(requests, `${packet.caseId}.json`), json(request));
    writeNew(resolve(requests, `${packet.caseId}.prompt.txt`), promptText(request));
    writeNew(resolve(metadata, `${packet.caseId}.json`), json(metadataTemplate(request)));
    return mapping;
  });
  writeNew(resolve(run, "private", "blind-mapping.json"), json(mappings));
  return { run, packets: mappings.length, blindRequests: requests };
}

function manualReport(run: string, holdout: ReturnType<typeof validateHoldout>) {
  const judgments = boundBlind(run, holdout).map(({ mapping: map, packet }) => ({ map,
    judgment: validateJudgment(loadAccepted(run, map.caseId, "judge")?.data, packet) }));
  let A = 0, B = 0, ties = 0, neither = 0;
  const totals = { A: { safe: 0, complete: 0, naturalness: 0, voiceFidelity: 0, restraint: 0 },
    B: { safe: 0, complete: 0, naturalness: 0, voiceFidelity: 0, restraint: 0 } };
  let pairedNoRegression = true;
  for (const { map, judgment } of judgments) {
    if (judgment.safePreference === "TIE") ties++; else if (judgment.safePreference === "NEITHER_SAFE") neither++;
    else if (map[judgment.safePreference] === "A") A++; else B++;
    const a = judgment[map.X === "A" ? "X" : "Y"], b = judgment[map.X === "B" ? "X" : "Y"];
    const safety = { UNSAFE: 0, UNCERTAIN: 1, SAFE: 2 }, completion = { NO: 0, PARTIAL: 1, YES: 2 };
    pairedNoRegression &&= safety[b.factualIntegrity] >= safety[a.factualIntegrity] && completion[b.objectiveCompletion] >= completion[a.objectiveCompletion];
    for (const label of ["X", "Y"] as const) {
      const total = totals[map[label]], rating = judgment[label];
      total.safe += Number(rating.factualIntegrity === "SAFE"); total.complete += Number(rating.objectiveCompletion === "YES");
      total.naturalness += rating.naturalness; total.voiceFidelity += rating.voiceFidelity; total.restraint += rating.restraint;
    }
  }
  const p = signTest(B, A);
  const accounting = (stages: (EditorStage | "judge")[]) => {
    const records = holdout.cases.flatMap(row => stages.map(stage => metadataSchema.parse(readJsonStrict(
      readFileSync(resolve(run, "attempts", row.id, stage, "metadata.raw.json")), "stored metadata"))));
    const sum = (values: (number | null)[]) => values.some(value => value === null) ? null : values.reduce<number>((n, value) => n + value!, 0);
    return { importedCalls: records.length, selectedModels: [...new Set(records.map(row => row.selectedModel))],
      returnedModels: [...new Set(records.map(row => row.returnedModel))],
      inputTokens: sum(records.map(row => row.tokens.input)), outputTokens: sum(records.map(row => row.tokens.output)),
      reasoningTokens: sum(records.map(row => row.tokens.reasoning)), costUsd: sum(records.map(row => row.costUsd)),
      providerLatencyMs: sum(records.map(row => row.providerLatencyMs)),
      operatorRecordedWallMs: sum(records.map(row => row.startedAt && row.completedAt ? Date.parse(row.completedAt) - Date.parse(row.startedAt) : null)) };
  };
  const report = { status: "MANUAL_UNAUDITED", qualification: "Descriptive manual result only; cannot be passed to experiment.summarize and is not an audited original run.",
    cases: holdout.cases.length, preference: { A, B, ties, neither, twoSidedSignTestP: p }, totals, pairedNoRegression,
    observedSuccessCriterion: B > A && (B - A) / 12 >= protocol.meaningfulAdvantage.minimumNetWinsFraction && p <= protocol.meaningfulAdvantage.twoSidedSignTestAlpha && pairedNoRegression,
    inference: { A: accounting(["direct"]), B: accounting(["diagnosis", "reconstruction"]), judge: accounting(["judge"]) },
    provenanceLimits: [
      "Selected model identity is operator-attested; returned model identity may be provider-reported or unknown.",
      "Nullable usage, cost, timing, and actual inference configuration are never inferred or converted into a live Receipt." ] };
  writeNew(resolve(run, "manual-report.json"), json(report)); return report;
}

export function importJudgeResponse(runId: string, caseId: string, rawPath: string, metadataPath: string, root = DEFAULT_MANUAL_ROOT) {
  const { run, holdout } = readPinnedRun(runId, root), row = holdout.cases.find(item => item.id === caseId);
  if (!row || !existsSync(resolve(run, "private", "blind-mapping.json"))) throw new Error("Blind run or case unavailable");
  const requestPath = resolve(run, "blind", "requests", `${caseId}.json`), requestBytes = readFileSync(requestPath);
  const request = readJsonStrict(requestBytes, "blind request") as ReturnType<typeof judgeRequest>;
  const blinded = boundBlind(run, holdout), packet = blinded.find(item => item.packet.caseId === caseId)!.packet;
  if (stable(readJsonStrict(readFileSync(resolve(run, "private", "blind-mapping.json")), "private mapping")) !== stable(blinded.map(item => item.mapping)))
    throw new Error("Private mapping was tampered");
  const expected = judgeRequest(packet);
  if (stable(request) !== stable(expected) || readFileSync(resolve(run, "blind", "requests", `${caseId}.prompt.txt`), "utf8") !== promptText(expected))
    throw new Error("Blinded judge request was tampered");
  archiveAttempt(run, caseId, "judge", rawPath, metadataPath, (value, boundRequest, metadataValue) => {
    const metadata = verifyMetadata(metadataValue, boundRequest, expected.promptSha256, protocol.judgeModel);
    return { data: validateJudgment(value, expected.payload), evidence: { selectedModel: { value: metadata.selectedModel, basis: "operator-attested" },
      returnedModel: { value: metadata.returnedModel, basis: metadata.returnedModel === null ? "unknown" : "provider-reported" },
      requestId: metadata.requestId, tokens: metadata.tokens, costUsd: metadata.costUsd, providerLatencyMs: metadata.providerLatencyMs,
      timestamps: { startedAt: metadata.startedAt, completedAt: metadata.completedAt },
      config: { intended: expected.intendedConfig, actual: metadata.actualConfig, evidence: metadata.configEvidence } } };
  });
  const complete = holdout.cases.every(item => existsSync(resultPath(run, item.id, "judge")));
  return { caseId, status: "accepted", report: complete ? manualReport(run, holdout) : null };
}

export function usage() {
  return `Usage:\n  node --import tsx tools/editorial-intelligence/manual.ts export RUN\n  node --import tsx tools/editorial-intelligence/manual.ts import RUN CASE direct|diagnosis|reconstruction RAW.json METADATA.json\n  node --import tsx tools/editorial-intelligence/manual.ts blind RUN\n  node --import tsx tools/editorial-intelligence/manual.ts judge import RUN CASE RAW.json METADATA.json`;
}
function main(args: string[]) {
  if (args[0] === "export" && args.length === 2) return exportManualRun(args[1]);
  if (args[0] === "import" && args.length === 6) return importEditorResponse(args[1], args[2], args[3] as EditorStage, args[4], args[5]);
  if (args[0] === "blind" && args.length === 2) return blindManualRun(args[1]);
  if (args[0] === "judge" && args[1] === "import" && args.length === 6) return importJudgeResponse(args[2], args[3], args[4], args[5]);
  throw new Error(usage());
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(json(main(process.argv.slice(2)))); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Manual workflow failed"}\n`); process.exitCode = 1; }
}
