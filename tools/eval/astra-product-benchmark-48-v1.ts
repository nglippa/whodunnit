/** Minimal internal product benchmark over the frozen Astra 48-case corpus. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { candidateSchema } from "@/lib/ai/schemas";
import { runCandidateC } from "@/lib/reconstruction/post-v3";
import { runDirectiveScopedTemporalReconstruction } from "@/lib/reconstruction/verified-reconstruction";
import { assertCaseInputExact, sourceFinal } from "../../scripts/astra-control-execution-bindings";
import { accountEnvironment, cliJsonSchema, smokeDiagnostics } from "./holdout-v3-generate";
import { executeClaude } from "./post-v3-raw-adapter";

const ROOT = resolve(process.cwd());
const V2 = resolve(ROOT, "data/evaluation/astra-control-fresh-48-v2");
const BASE = resolve(ROOT, "data/evaluation/astra-product-benchmark-48-v1");
const PACKETS = resolve(BASE, "astra-packets");
const RAW = resolve(BASE, "v15-raw");
const OUTPUTS = resolve(BASE, "outputs.jsonl");
const CORPUS = resolve(V2, "data-phase/corpus.json");
const INSTRUCTION = resolve(V2, "astra-editor-instruction.txt");
const PROTOCOL = resolve(V2, "protocol.json");
const EXPECTED_CORPUS_SHA256 = "464eafef5b49cc5c6e9a80ff96ba2bed9661cdc3e7f5c1fa73ba00b2d0dc8f22";
const MODEL = "sonnet";
const TIMEOUT_MS = 120_000;
const ARMS = ["SOURCE", "V15", "C", "ASTRA"] as const;
type Arm = typeof ARMS[number];
const ASTRA_RESPONSE_SCHEMA = {
  type: "object", properties: { edited_text: { type: "string" } }, required: ["edited_text"], additionalProperties: false,
} as const;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = (path: string) => readFileSync(path, "utf8");
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

const caseSchema = z.object({ caseId: z.string().regex(/^AC48V2-\d{3}$/), source: z.string(), objective: z.string() }).passthrough();
const corpusSchema = z.object({ cases: z.array(caseSchema).length(48) }).passthrough();
const envelopeSchema = z.object({
  is_error: z.boolean().optional(), structured_output: z.unknown().optional(), result: z.string().optional(),
  model: z.string().optional(), modelUsage: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

function frozenInputs() {
  const corpusBytes = readFileSync(CORPUS);
  if (sha256(corpusBytes) !== EXPECTED_CORPUS_SHA256) throw new Error("frozen corpus hash mismatch");
  const cases = corpusSchema.parse(JSON.parse(corpusBytes.toString("utf8"))).cases;
  if (new Set(cases.map(row => row.caseId)).size !== 48) throw new Error("frozen case IDs are not unique");
  for (const row of cases) assertCaseInputExact(row.source, row.objective);
  const instructionBytes = readFileSync(INSTRUCTION);
  if (instructionBytes.at(-1) !== 10 || instructionBytes.subarray(0, -1).includes(0)) throw new Error("unexpected Astra instruction encoding");
  const instructions = instructionBytes.subarray(0, -1).toString("utf8");
  const protocol = JSON.parse(read(PROTOCOL)) as { astra?: { responseFormat?: { text?: { format?: { schema?: unknown } } } } };
  const responseSchema = protocol.astra?.responseFormat?.text?.format?.schema;
  if (!responseSchema) throw new Error("frozen Astra response schema missing");
  if (JSON.stringify(responseSchema) !== JSON.stringify(ASTRA_RESPONSE_SCHEMA)) throw new Error("frozen Astra response schema changed");
  return { cases, instructions, responseSchema, instructionSha256: sha256(instructionBytes), protocolSha256: sha256(readFileSync(PROTOCOL)) };
}

function packetFor(row: z.infer<typeof caseSchema>, instructions: string, responseSchema: unknown) {
  return { instructions, responseSchema, source: row.source, objective: row.objective };
}

function loadOutputs() {
  if (!existsSync(OUTPUTS)) return [] as Record<string, unknown>[];
  return read(OUTPUTS).split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
}

function writeOutputs(rows: readonly Record<string, unknown>[]) {
  writeFileSync(OUTPUTS, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
}

function replaceArm(caseId: string, arm: Arm, value: Record<string, unknown>) {
  const rows = loadOutputs();
  const index = rows.findIndex(row => row.caseId === caseId && row.arm === arm);
  if (index < 0) throw new Error(`missing arm slot: ${caseId}/${arm}`);
  rows[index] = { benchmarkId: "astra-product-benchmark-48-v1", caseId, arm, ...value };
  writeOutputs(rows);
  refreshSummaryAndIntegrity();
  return rows[index];
}

function technicalAttemptHistory(slot: Record<string, unknown>) {
  const inherited = Array.isArray(slot.attemptHistory) ? slot.attemptHistory : [];
  if (slot.status !== "technical-failure") return inherited;
  const { benchmarkId: _benchmarkId, caseId: _caseId, arm: _arm, attemptHistory: _attemptHistory, ...attempt } = slot;
  return [...inherited, attempt];
}

function failureCategory(error: unknown) {
  if (error instanceof z.ZodError) return "schema-validation-failed";
  const message = error instanceof Error ? error.message : "";
  const allowed = new Set(["timeout", "account-backed-cli-failed", "account-backed-cli-error",
    "saved V15 RAW differs from V15 candidate", "C input SHA differs from saved V15 RAW SHA"]);
  return allowed.has(message) ? message : "unexpected-exception";
}

function refreshSummaryAndIntegrity() {
  const { cases, instructionSha256, protocolSha256 } = frozenInputs();
  const outputs = loadOutputs();
  const succeeded = outputs.filter(row => row.status === "success").length;
  const technicalFailures = outputs.filter(row => row.status === "technical-failure").length;
  const pending = outputs.filter(row => row.status === "pending").length;
  const byArm = Object.fromEntries(ARMS.map(arm => [arm, {
    success: outputs.filter(row => row.arm === arm && row.status === "success").length,
    technicalFailure: outputs.filter(row => row.arm === arm && row.status === "technical-failure").length,
    pending: outputs.filter(row => row.arm === arm && row.status === "pending").length,
  }]));
  writeJson(resolve(BASE, "execution-summary.json"), {
    benchmarkId: "astra-product-benchmark-48-v1", caseCount: 48, armCount: outputs.length,
    expectedArmCount: 192, completedArms: succeeded + technicalFailures, succeeded, technicalFailures, pending, byArm,
    completedCases: cases.filter(item => ARMS.every(arm => outputs.some(row => row.caseId === item.caseId && row.arm === arm && row.status !== "pending"))).length,
    status: pending === 0 ? "COMPLETE" : pending === 192 ? "PREPARED" : "IN_PROGRESS",
  });
  const files: Record<string, string> = {
    "provenance.json": sha256(readFileSync(resolve(BASE, "provenance.json"))),
    "outputs.jsonl": sha256(readFileSync(OUTPUTS)),
    "execution-summary.json": sha256(readFileSync(resolve(BASE, "execution-summary.json"))),
  };
  for (const row of cases) {
    const packet = resolve(PACKETS, `${row.caseId}.json`);
    files[`astra-packets/${row.caseId}.json`] = sha256(readFileSync(packet));
    const raw = resolve(RAW, `${row.caseId}.txt`);
    if (existsSync(raw)) files[`v15-raw/${row.caseId}.txt`] = sha256(readFileSync(raw));
  }
  writeJson(resolve(BASE, "integrity.json"), {
    benchmarkId: "astra-product-benchmark-48-v1", hashAlgorithm: "sha256", selfHashExcluded: true,
    frozenInputs: { corpusSha256: EXPECTED_CORPUS_SHA256, instructionSha256, protocolSha256 }, files,
  });
}

export function prepareBenchmark() {
  const frozen = frozenInputs();
  if (existsSync(BASE)) {
    if (loadOutputs().length !== 0 || readdirSync(RAW).length !== 0) throw new Error("benchmark has execution data; use verify");
  } else {
    mkdirSync(PACKETS, { recursive: true });
    mkdirSync(RAW);
  }
  for (const row of frozen.cases) writeJson(resolve(PACKETS, `${row.caseId}.json`), packetFor(row, frozen.instructions, frozen.responseSchema));
  writeJson(resolve(BASE, "provenance.json"), {
    benchmarkId: "astra-product-benchmark-48-v1", createdAt: new Date().toISOString(), sourceExperiment: "astra-control-fresh-48-v2",
    corpusPath: "data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json", corpusSha256: EXPECTED_CORPUS_SHA256,
    arms: ["SOURCE", "V15", "C", "ASTRA"],
    implementation: {
      v15: "src/lib/reconstruction/verified-reconstruction.ts:runDirectiveScopedTemporalReconstruction",
      c: "src/lib/reconstruction/post-v3/index.ts:runCandidateC",
    },
    accountBackedCaller: {
      executable: "claude", model: MODEL, timeoutMs: TIMEOUT_MS, retries: 0, tools: [], sessionPersistence: false,
      confirmedNoIncrementalCostFlag: {
        valuePassedToFrozenImplementations: true,
        basis: "Internal product-benchmark assumption that the authenticated account subscription does not create a per-call API charge.",
        certification: "NOT_CERTIFIED_OR_INDEPENDENTLY_VERIFIED",
      },
    },
    astraPackets: { count: 48, instructionSha256: frozen.instructionSha256, responseSchemaSource: "protocol.json#astra.responseFormat.text.format.schema" },
  });
  writeOutputs(frozen.cases.flatMap(row => ARMS.map(arm => ({
    benchmarkId: "astra-product-benchmark-48-v1", caseId: row.caseId, arm, status: "pending",
  }))));
  refreshSummaryAndIntegrity();
}

function caller(label: string, attempts?: Record<string, number>, transport?: Record<string, unknown>): StructuredCaller {
  return {
    info: { mode: "live", provider: "account-backed", model: `${MODEL}:${label}` },
    generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
    async callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
      if (attempts) attempts[label] = (attempts[label] ?? 0) + 1;
      const jsonSchema = z.toJSONSchema(schema);
      const args = ["--print", "--system-prompt", system, "--json-schema", cliJsonSchema(jsonSchema), "--output-format", "json",
        "--no-session-persistence", "--tools", "", "--model", MODEL, "--safe-mode", "--setting-sources", "",
        "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands"];
      const started = Date.now();
      const result = await executeClaude(args, user, ROOT, accountEnvironment());
      const diagnostic = smokeDiagnostics(result);
      if (transport) transport[label] = { exitCode: result.code, timedOut: Boolean(result.timedOut), stdoutBytes: diagnostic.stdoutBytes,
        stderrBytes: diagnostic.stderrBytes, stderrPresent: diagnostic.stderrPresent, diagnosticCode: diagnostic.diagnosticCode,
        errorClass: diagnostic.errorClass, safeMarkers: diagnostic.safeMarkers };
      if (result.timedOut || result.code !== 0) throw new Error(result.timedOut ? "timeout" : "account-backed-cli-failed");
      try {
        const envelope = envelopeSchema.parse(JSON.parse(result.stdout));
        if (envelope.is_error) throw new Error("account-backed-cli-error");
        const value = envelope.structured_output ?? JSON.parse(envelope.result ?? "null");
        return { data: schema.parse(value), meta: { latencyMs: Date.now() - started } };
      } catch (error) {
        if (transport) transport[label] = { ...(transport[label] as Record<string, unknown>), responseParseFailure: true };
        throw error;
      }
    },
  };
}

export async function runCase(caseId: string) {
  const { cases } = frozenInputs();
  if (!existsSync(BASE)) throw new Error("run prepare first");
  const row = cases.find(item => item.caseId === caseId);
  if (!row) throw new Error(`unknown case: ${caseId}`);
  const caseArms = loadOutputs().filter(item => item.caseId === caseId);
  const sourceSlot = caseArms.find(item => item.arm === "SOURCE");
  const v15Slot = caseArms.find(item => item.arm === "V15");
  const cSlot = caseArms.find(item => item.arm === "C");
  const rawPath = resolve(RAW, `${caseId}.txt`);
  const retryingTechnicalFailure = v15Slot?.status === "technical-failure" && cSlot?.status === "technical-failure" && !existsSync(rawPath);
  if (caseArms.length !== 4 || !sourceSlot || !v15Slot || !cSlot ||
      (sourceSlot.status !== "pending" && sourceSlot.status !== "success") ||
      (!(v15Slot.status === "pending" && cSlot.status === "pending") && !retryingTechnicalFailure))
    throw new Error(`SOURCE/V15/C already recorded or matrix invalid: ${caseId}`);
  if (sourceSlot.status === "success" &&
      (sourceSlot.text !== sourceFinal(row.source) || sourceSlot.textSha256 !== sha256(row.source) ||
       sourceSlot.objectiveSha256 !== sha256(row.objective) || sourceSlot.modelCalls !== 0))
    throw new Error(`SOURCE record mismatch: ${caseId}`);
  if (existsSync(rawPath)) throw new Error(`RAW already exists without output row: ${caseId}`);
  const v15AttemptHistory = technicalAttemptHistory(v15Slot);
  const cAttemptHistory = technicalAttemptHistory(cSlot);
  const request = assertCaseInputExact(row.source, row.objective);
  const attempts: Record<string, number> = {};
  const transport: Record<string, unknown> = {};
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const sourceRecord = sourceSlot.status === "success" ? sourceSlot : replaceArm(caseId, "SOURCE", {
      status: "success", startedAt, endedAt: new Date().toISOString(), wallClockMs: 0,
      text: sourceFinal(row.source), textSha256: sha256(row.source), objectiveSha256: sha256(row.objective), modelCalls: 0,
    });
  let capturedRaw: string | null = null;
  const editor = caller("v15-editor", attempts, transport);
  const recordingEditor: StructuredCaller = {
    ...editor,
    async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
      const response = await editor.callStructured(schema, name, system, user);
      const parsed = candidateSchema.parse(response.data);
      writeFileSync(rawPath, parsed.text, { flag: "wx" });
      capturedRaw = read(rawPath);
      if (capturedRaw !== parsed.text) throw new Error("V15 RAW readback mismatch");
      return response;
    },
  };
  let v15: Awaited<ReturnType<typeof runDirectiveScopedTemporalReconstruction>>;
  try {
    v15 = await runDirectiveScopedTemporalReconstruction(request, row.objective, {
      editor: recordingEditor, verifier: caller("v15-verifier", attempts, transport), repairer: caller("v15-repairer", attempts, transport),
      confirmedNoIncrementalCost: true, timeoutMs: TIMEOUT_MS,
    });
  } catch (error) {
    const endedAt = new Date().toISOString();
    const v15Failure = replaceArm(caseId, "V15", { status: "technical-failure", startedAt, endedAt,
      wallClockMs: Date.now() - started, category: failureCategory(error), rawCaptured: capturedRaw !== null,
      modelCallsAttempted: Object.values(attempts).reduce((sum, count) => sum + count, 0), callAttemptsByStage: attempts,
      transportDiagnostics: transport, ...(v15AttemptHistory.length ? { attemptHistory: v15AttemptHistory } : {}) });
    const cFailure = replaceArm(caseId, "C", { status: "technical-failure", startedAt: endedAt, endedAt,
      wallClockMs: 0, category: "v15-exception-no-c-input", ...(cAttemptHistory.length ? { attemptHistory: cAttemptHistory } : {}) });
    return { source: sourceRecord, v15: v15Failure, c: cFailure };
  }
  let rawSha256: string | null = null;
  let cInputSha256: string | null = null;
  const v15TechnicalFailure = v15.candidate === null;
  const v15Record = replaceArm(caseId, "V15", {
    status: v15TechnicalFailure ? "technical-failure" : "success", category: v15TechnicalFailure ? v15.trace.fallbackReason ?? "missing-v15-candidate" : undefined,
    startedAt, endedAt: new Date().toISOString(), wallClockMs: Date.now() - started,
    text: v15.text, textSha256: sha256(v15.text), raw: capturedRaw, rawSha256: capturedRaw === null ? null : sha256(capturedRaw), result: v15,
    modelCallsAttempted: Object.values(attempts).reduce((sum, count) => sum + count, 0), callAttemptsByStage: { ...attempts },
    transportDiagnostics: { ...transport }, ...(v15AttemptHistory.length ? { attemptHistory: v15AttemptHistory } : {}),
  });
  if (capturedRaw !== null && v15.candidate !== null) {
    const cStartedAt = new Date().toISOString();
    const cStarted = Date.now();
    try {
      const saved = readFileSync(rawPath);
      if (!saved.equals(Buffer.from(v15.candidate, "utf8"))) throw new Error("saved V15 RAW differs from V15 candidate");
      rawSha256 = sha256(saved);
      const cInput = saved.toString("utf8");
      cInputSha256 = sha256(Buffer.from(cInput, "utf8"));
      if (cInputSha256 !== rawSha256) throw new Error("C input SHA differs from saved V15 RAW SHA");
      const c = await runCandidateC(request, row.objective, cInput, {
        verifier: caller("c-verifier", attempts, transport), repairer: caller("c-repairer", attempts, transport), confirmedNoIncrementalCost: true, timeoutMs: TIMEOUT_MS,
      });
      const cRecord = replaceArm(caseId, "C", {
        status: "success", startedAt: cStartedAt, endedAt: new Date().toISOString(), wallClockMs: Date.now() - cStarted,
        text: c.text, textSha256: sha256(c.text), v15RawSha256: rawSha256, cInputSha256,
        rawInputEqualityAsserted: true, result: c,
        modelCallsAttempted: (attempts["c-verifier"] ?? 0) + (attempts["c-repairer"] ?? 0),
        callAttemptsByStage: { verifier: attempts["c-verifier"] ?? 0, repairer: attempts["c-repairer"] ?? 0 },
        transportDiagnostics: Object.fromEntries(Object.entries(transport).filter(([key]) => key.startsWith("c-"))),
        ...(cAttemptHistory.length ? { attemptHistory: cAttemptHistory } : {}),
      });
      return { source: sourceRecord, v15: v15Record, c: cRecord };
    } catch (error) {
      const cFailure = replaceArm(caseId, "C", {
        status: "technical-failure", startedAt: cStartedAt, endedAt: new Date().toISOString(), wallClockMs: Date.now() - cStarted,
        category: failureCategory(error), v15RawSha256: rawSha256, cInputSha256,
        rawInputEqualityAsserted: rawSha256 !== null && rawSha256 === cInputSha256,
        modelCallsAttempted: (attempts["c-verifier"] ?? 0) + (attempts["c-repairer"] ?? 0),
        callAttemptsByStage: { verifier: attempts["c-verifier"] ?? 0, repairer: attempts["c-repairer"] ?? 0 },
        transportDiagnostics: Object.fromEntries(Object.entries(transport).filter(([key]) => key.startsWith("c-"))),
        ...(cAttemptHistory.length ? { attemptHistory: cAttemptHistory } : {}),
      });
      return { source: sourceRecord, v15: v15Record, c: cFailure };
    }
  }
  const cFailure = replaceArm(caseId, "C", { status: "technical-failure", startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(), wallClockMs: 0, category: "missing-valid-v15-raw",
    ...(cAttemptHistory.length ? { attemptHistory: cAttemptHistory } : {}) });
  return { source: sourceRecord, v15: v15Record, c: cFailure };
}

export function reconcileTechnicalFailures() {
  const rows = loadOutputs();
  let changed = 0;
  for (const row of rows) {
    if (row.arm === "V15" && row.status === "technical-failure" && row.category === "editor-unavailable" && row.transportDiagnostics === undefined) {
      row.transportDiagnostics = null;
      row.transportDiagnosticsUnavailable = "The first-call exit code, stdout and stderr were discarded by the initial adapter.";
      changed++;
      continue;
    }
    if (row.arm !== "V15" || row.status !== "success") continue;
    const result = row.result as { candidate?: unknown; trace?: { fallbackReason?: unknown } } | undefined;
    if (result?.candidate !== null) continue;
    row.status = "technical-failure";
    row.category = typeof result.trace?.fallbackReason === "string" ? result.trace.fallbackReason : "missing-v15-candidate";
    row.modelCallsAttempted = 1;
    row.callAttemptsByStage = { "v15-editor": 1 };
    row.transportDiagnostics = null;
    row.transportDiagnosticsUnavailable = "The first-call exit code, stdout and stderr were discarded by the initial adapter.";
    changed++;
  }
  if (changed) { writeOutputs(rows); refreshSummaryAndIntegrity(); }
  return { changed };
}

function recordAstraText(caseId: string, text: string) {
  const { cases } = frozenInputs();
  if (!cases.some(row => row.caseId === caseId)) throw new Error(`unknown case: ${caseId}`);
  const current = loadOutputs().find(row => row.caseId === caseId && row.arm === "ASTRA");
  if (current?.status !== "pending") throw new Error(`ASTRA already recorded: ${caseId}`);
  const editedText = z.string().min(1).max(60_000).parse(text);
  return replaceArm(caseId, "ASTRA", {
    status: "success", text: editedText, textSha256: sha256(editedText),
    requestedModel: "gpt-6-astra", reasoningEffort: "high", runtimeModelMetadata: null,
    metadataAvailability: "unavailable", toolInvocationObserved: false, judged: false,
  });
}

export function recordAstra(caseId: string, responsePath: string) {
  const schema = z.object({ edited_text: z.string().min(1).max(60_000) }).strict();
  return recordAstraText(caseId, schema.parse(JSON.parse(read(resolve(responsePath)))).edited_text);
}

export function recordAstraSource(caseId: string) {
  const row = frozenInputs().cases.find(item => item.caseId === caseId);
  if (!row) throw new Error(`unknown case: ${caseId}`);
  return recordAstraText(caseId, row.source);
}

export function recordAstraUpdates(caseId: string, replacementsPath: string) {
  const row = frozenInputs().cases.find(item => item.caseId === caseId);
  if (!row) throw new Error(`unknown case: ${caseId}`);
  const replacements = z.array(z.object({ from: z.string().min(1), to: z.string() }).strict()).min(1)
    .parse(JSON.parse(read(resolve(replacementsPath))));
  let text = row.source;
  for (const replacement of replacements) {
    if (text.split(replacement.from).length !== 2) throw new Error(`replacement is not unique: ${replacement.from}`);
    text = text.replace(replacement.from, replacement.to);
  }
  return recordAstraText(caseId, text);
}

export function verifyPrepared() {
  const frozen = frozenInputs();
  if (!existsSync(BASE)) throw new Error("benchmark directory missing");
  for (const row of frozen.cases) {
    const actual = JSON.parse(read(resolve(PACKETS, `${row.caseId}.json`)));
    if (JSON.stringify(actual) !== JSON.stringify(packetFor(row, frozen.instructions, frozen.responseSchema))) throw new Error(`packet mismatch: ${row.caseId}`);
    if (Object.keys(actual).sort().join(",") !== "instructions,objective,responseSchema,source") throw new Error(`packet has extra fields: ${row.caseId}`);
  }
  const outputs = loadOutputs();
  if (outputs.length !== 192) throw new Error("output arm matrix must contain 192 rows");
  const keys = outputs.map(row => `${row.caseId}/${row.arm}`);
  if (new Set(keys).size !== 192) throw new Error("duplicate output arm slot");
  for (const row of frozen.cases) for (const arm of ARMS)
    if (!keys.includes(`${row.caseId}/${arm}`)) throw new Error(`missing output arm slot: ${row.caseId}/${arm}`);
  return { caseCount: frozen.cases.length, packetCount: frozen.cases.length, armRecordCount: outputs.length,
    completedArmCount: outputs.filter(row => row.status !== "pending").length, corpusSha256: EXPECTED_CORPUS_SHA256 };
}

function describe() {
  return {
    command: "node --import tsx tools/eval/astra-product-benchmark-48-v1.ts run-case AC48V2-001",
    executable: "claude",
    arguments: ["--print", "--system-prompt", "<stage-system>", "--json-schema", "<strict-stage-schema>", "--output-format", "json",
      "--no-session-persistence", "--tools", "", "--model", MODEL, "--safe-mode", "--setting-sources", "",
      "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands"],
    settings: { timeoutMs: TIMEOUT_MS, retries: 0, tools: [], apiKeysRemovedByAccountEnvironment: true },
    rawCapture: "v15-raw/<caseId>.txt is written exclusively and read back before V15 receives the editor result",
    cInputAssertion: "SHA-256(UTF-8 C input) must equal SHA-256(saved V15 RAW bytes) before runCandidateC",
    failureIsolation: "SOURCE is persisted before V15; V15 and C exceptions update only their arm slots; ASTRA remains independently pending",
    costAssumption: "confirmedNoIncrementalCost:true is passed under an internal subscription assumption and is not certified",
    files: ["provenance.json", "outputs.jsonl", "execution-summary.json", "integrity.json", "v15-raw/<caseId>.txt"],
  };
}

async function main() {
  const [mode, caseId, responsePath] = process.argv.slice(2);
  if (mode === "prepare") { prepareBenchmark(); console.log(JSON.stringify(verifyPrepared())); return; }
  if (mode === "verify") { console.log(JSON.stringify(verifyPrepared())); return; }
  if (mode === "describe") { console.log(JSON.stringify(describe(), null, 2)); return; }
  if (mode === "run-case" && caseId) { console.log(JSON.stringify(await runCase(caseId))); return; }
  if (mode === "record-astra" && caseId && responsePath) { console.log(JSON.stringify(recordAstra(caseId, responsePath))); return; }
  if (mode === "record-astra-source" && caseId) { console.log(JSON.stringify(recordAstraSource(caseId))); return; }
  if (mode === "record-astra-updates" && caseId && responsePath) { console.log(JSON.stringify(recordAstraUpdates(caseId, responsePath))); return; }
  if (mode === "reconcile") { console.log(JSON.stringify(reconcileTechnicalFailures())); return; }
  throw new Error("usage: astra-product-benchmark-48-v1.ts prepare|verify|describe|run-case <caseId>|record-astra <caseId> <response.json>|record-astra-source <caseId>|record-astra-updates <caseId> <replacements.json>|reconcile");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error instanceof Error ? error.message : "benchmark runner failed"); process.exitCode = 1; });
