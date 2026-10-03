import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliJsonSchema, type CommandResult, type Execute } from "./holdout-v3-generate";
import { runV3, verifyV3Integrity } from "./holdout-v3-runner";
import { generateStage, STAGE_RUN_DIRECTORY, type StageName } from "./holdout-v3-stages";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
let templateRoot = "";
const validVerifier = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "The candidate preserves the source meaning and requested objective.", issue: null };
const cliVersion = "fake-cli-version";

async function prepareTemplate() {
  templateRoot = mkdtempSync(resolve(STAGE_RUN_DIRECTORY, ".stage-template-"));
  const run = resolve(templateRoot, "run"); mkdirSync(run);
  const editorBytes = readFileSync(resolve(STAGE_RUN_DIRECTORY, "editor-requests.json"));
  const editorBundle = JSON.parse(editorBytes.toString("utf8"));
  writeFileSync(resolve(run, "editor-requests.json"), editorBytes);
  const cases = verifyV3Integrity();
  const editorResults = cases.map(item => ({ id: item.id, data: { text: item.source, changes: [] } }));
  const editorResultsBytes = JSON.stringify(editorResults, null, 2) + "\n";
  writeFileSync(resolve(run, "editor-results.json"), editorResultsBytes);
  const editorEvents = editorBundle.requests.flatMap((request: { id: string; requestSha256: string }) => {
    const data = editorResults.find(row => row.id === request.id)!.data;
    const common = { id: request.id, requestSha256: request.requestSha256, start: "2026-10-02T00:00:00.000Z", model: "sonnet", cliVersion };
    return [
      { ...common, status: "started" },
      { ...common, end: "2026-10-02T00:00:01.000Z", status: "success", resultSha256: sha(JSON.stringify(data)), resolvedModels: ["claude-sonnet-test"] },
    ];
  });
  writeFileSync(resolve(run, "editor-attempts.jsonl"), editorEvents.map((row: unknown) => JSON.stringify(row)).join("\n") + "\n");

  const writeStage = async (stage: StageName, makeData: (user: string) => unknown) => {
    await runV3(`${stage}-requests`, run);
    const requestBytes = readFileSync(resolve(run, `${stage}-requests.json`));
    const requests = (JSON.parse(requestBytes.toString("utf8")) as { requests: { id: string; requestSha256: string; user: string }[] }).requests;
    const predecessorResultSha256: Record<string, string> = {};
    const before = stage === "verifier" ? ["editor"] : stage === "repair" ? ["editor", "verifier"] : ["editor", "verifier", "repair"];
    for (const prior of before) predecessorResultSha256[`${prior}-results.json`] = sha(readFileSync(resolve(run, `${prior}-results.json`)));
    const results = requests.map(request => ({ id: request.id, data: makeData(request.user) }));
    writeFileSync(resolve(run, `${stage}-results.json`), JSON.stringify(results, null, 2) + "\n");
    const events = requests.flatMap(request => {
      const data = results.find(row => row.id === request.id)!.data;
      const common = { id: request.id, stage, requestSha256: request.requestSha256, requestBundleSha256: sha(requestBytes), predecessorResultSha256,
        start: "2026-10-02T00:00:00.000Z", cliVersion, model: "sonnet" };
      return [
        { ...common, status: "started" },
        { ...common, end: "2026-10-02T00:00:01.000Z", status: "success", resultSha256: sha(JSON.stringify(data)), resolvedModels: ["claude-sonnet-test"], data },
      ];
    });
    writeFileSync(resolve(run, `${stage}-attempts.jsonl`), events.map((row: unknown) => JSON.stringify(row)).join("\n") + (events.length ? "\n" : ""));
  };
  await writeStage("verifier", user => {
    const { candidate } = JSON.parse(user) as { candidate: string };
    const text = candidate.slice(0, Math.min(12, candidate.length));
    return { verdict: "LOCAL_REPAIR", meaningPreserved: true, objectiveSatisfied: false, voicePreserved: true, unsupportedInformation: false,
      reason: "A localized candidate edit needs a source grounded correction.", issue: { span: { start: 0, end: text.length, text }, constraint: "Restore the original source wording without adding information." } };
  });
  await writeStage("repair", user => ({ replacement: (JSON.parse(user) as { affectedSpan: { text: string } }).affectedSpan.text }));
  await runV3("reverify-requests", run);
  const smokeBytes = JSON.stringify({ mode: "smoke-05", diagnosticsVersion: 4, status: "success", cliVersion, model: "sonnet",
    diagnostics: { errorClass: "none", modelInvocation: "response-received" } }, null, 2) + "\n";
  writeFileSync(resolve(run, "editor-smoke-05.json"), smokeBytes);
}
function fixture(stage: StageName) {
  const base = mkdtempSync(resolve(STAGE_RUN_DIRECTORY, ".stage-test-"));
  const run = resolve(base, "run"); mkdirSync(run);
  for (const name of ["editor-requests.json", "editor-results.json", "editor-attempts.jsonl", "editor-smoke-05.json",
    "verifier-requests.json", "verifier-results.json", "verifier-attempts.jsonl", "repair-requests.json", "repair-results.json", "repair-attempts.jsonl", "reverify-requests.json"]) {
    const source = resolve(templateRoot, "run", name);
    try { cpSync(source, resolve(run, name)); } catch { /* reverify result/ledger need not exist */ }
  }
  // A fixture carries only predecessor outputs. Clear the selected stage's
  // result and attempt files so the at-most-once path starts unconsumed.
  for (const suffix of ["results.json", "failures.json", "attempts.jsonl"])
    rmSync(resolve(run, `${stage}-${suffix}`), { force: true });
  const bytes = readFileSync(resolve(run, `${stage}-requests.json`), "utf8");
  const smokeBytes = readFileSync(resolve(run, "editor-smoke-05.json"));
  return { base, run, bundle: JSON.parse(bytes), smokePin: sha(smokeBytes), cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
function mockExecute(onCall: (args: string[], stdin: string, cwd: string, env: NodeJS.ProcessEnv) => CommandResult) {
  const calls: string[][] = [];
  const execute: Execute = async (args, stdin, cwd, env) => {
    calls.push(args);
    if (args[0] === "auth") return { code: 0, stdout: JSON.stringify({ authMethod: "claude.ai", loggedIn: true }), stderr: "" };
    if (args[0] === "--version") return { code: 0, stdout: `${cliVersion}\n`, stderr: "" };
    expect(env.ANTHROPIC_API_KEY).toBeUndefined(); expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined(); expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    return onCall(args, stdin, cwd, env);
  };
  return { calls, execute };
}

beforeAll(async () => { await prepareTemplate(); }, 60_000);
afterAll(() => { if (templateRoot) rmSync(templateRoot, { recursive: true, force: true }); });

describe("V3 stage account bridge", () => {
  it("replays captured verifier requests verbatim once and validates strict responses", async () => {
    const f = fixture("verifier");
    try {
      const mock = mockExecute((args, stdin, cwd) => {
        expect(args).toContain("--safe-mode"); expect(args).toContain("--no-session-persistence");
        expect(args[args.indexOf("--system-prompt") + 1]).toBe(f.bundle.requests[0].system);
        expect(args[args.indexOf("--json-schema") + 1]).toBe(cliJsonSchema(f.bundle.requests[0].responseJsonSchema));
        expect(f.bundle.requests.some((request: { user: string }) => request.user === stdin)).toBe(true); expect(cwd).toContain("whodunnit-v3-stage-call-");
        return { code: 0, stderr: "", stdout: JSON.stringify({ structured_output: validVerifier, model: "claude-sonnet-test" }) };
      });
      const result = await generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin });
      expect(result).toMatchObject({ requests: f.bundle.requests.length, successes: f.bundle.requests.length, failures: 0, modelCalls: f.bundle.requests.length });
      const ledger = readFileSync(resolve(f.run, "verifier-attempts.jsonl"), "utf8").trim().split("\n").map(row => JSON.parse(row));
      expect(ledger[0].status).toBe("started"); expect(ledger[1].status).toBe("success");
      expect(ledger[0].requestBundleSha256).toBe(result.requestBundleSha256);
      expect(ledger[0].predecessorResultSha256["editor-results.json"]).toBe(sha(readFileSync(resolve(f.run, "editor-results.json"))));
      const again = await generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin });
      expect(again.modelCalls).toBe(0); expect(mock.calls.filter(args => args[0] === "--print")).toHaveLength(f.bundle.requests.length);
    } finally { f.cleanup(); }
  }, 30_000);
  it("executes repair with its exact schema and treats a valid empty reverify stage as zero calls", async () => {
    const f = fixture("repair"), mock = mockExecute(args => {
      expect(args[args.indexOf("--json-schema") + 1]).toBe(cliJsonSchema(f.bundle.requests[0].responseJsonSchema));
      return { code: 0, stderr: "", stdout: JSON.stringify({ structured_output: { replacement: "Fixed sentence." } }) };
    });
    try {
      expect(await generateStage("repair", f.run, mock.execute, { smoke05Sha256: f.smokePin })).toMatchObject({ successes: f.bundle.requests.length, modelCalls: f.bundle.requests.length });
      expect(JSON.parse(readFileSync(resolve(f.run, "repair-results.json"), "utf8"))[0].data).toEqual({ replacement: "Fixed sentence." });
    } finally { f.cleanup(); }
    const empty = fixture("reverify"), noCalls = mockExecute(() => { throw new Error("must not call CLI"); });
    try {
      expect(empty.bundle.requests).toHaveLength(0);
      expect(await generateStage("reverify", empty.run, noCalls.execute, { smoke05Sha256: empty.smokePin })).toMatchObject({ requests: 0, successes: 0, failures: 0, modelCalls: 0 });
      expect(noCalls.calls).toEqual([]);
      expect(readFileSync(resolve(empty.run, "reverify-results.json"), "utf8").trim()).toBe("[]");
    } finally { empty.cleanup(); }
  }, 30_000);
  it("marks failures consumed and never retries a request ID", async () => {
    const f = fixture("verifier"), mock = mockExecute(() => ({ code: 1, stderr: "unknown CLI failure", stdout: "" }));
    try {
      expect(await generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin })).toMatchObject({ successes: 0, failures: 1, modelCalls: 1 });
      await expect(generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin })).rejects.toThrow("previous verifier failure requires stopping this stage");
      expect(mock.calls.filter(args => args[0] === "--print")).toHaveLength(1);
      expect(JSON.parse(readFileSync(resolve(f.run, "verifier-failures.json"), "utf8"))[0].status).toBe("technical-failure");
    } finally { f.cleanup(); }
  }, 30_000);
  it("requires claude.ai auth, the pinned successful smoke, and matching CLI version", async () => {
    const f = fixture("verifier");
    try {
      const apiKeyAuth: Execute = async args => ({ code: 0, stdout: args[0] === "auth" ? JSON.stringify({ authMethod: "api_key", loggedIn: true }) : cliVersion, stderr: "" });
      await expect(generateStage("verifier", f.run, apiKeyAuth, { smoke05Sha256: f.smokePin })).rejects.toThrow("Claude account authentication required");
      const mismatch = mockExecute(() => ({ code: 0, stderr: "", stdout: JSON.stringify({ structured_output: validVerifier }) }));
      const badPin = "0".repeat(64);
      await expect(generateStage("verifier", f.run, mismatch.execute, { smoke05Sha256: badPin })).rejects.toThrow("smoke-05 artifact pin mismatch");
      writeFileSync(resolve(f.run, "editor-smoke-05.json"), JSON.stringify({ mode: "smoke-05", diagnosticsVersion: 4, status: "success", cliVersion: "older", model: "sonnet", diagnostics: { errorClass: "none", modelInvocation: "response-received" } }));
      const newPin = sha(readFileSync(resolve(f.run, "editor-smoke-05.json")));
      await expect(generateStage("verifier", f.run, mismatch.execute, { smoke05Sha256: newPin })).rejects.toThrow("smoke-05 CLI version mismatch");
      expect(mismatch.calls.filter(args => args[0] === "--print")).toHaveLength(0);
    } finally { f.cleanup(); }
  }, 30_000);
  it("stops run-wide on account-limit records in any stage ledger", async () => {
    for (const prior of ["editor", "verifier", "repair", "reverify"]) {
      const f = fixture("repair"), mock = mockExecute(() => ({ code: 0, stderr: "", stdout: JSON.stringify({ structured_output: { replacement: "x" } }) }));
      try {
        writeFileSync(resolve(f.run, `${prior}-attempts.jsonl`), JSON.stringify({ status: "account-limit-stop" }) + "\n", { flag: "a" });
        await expect(generateStage("repair", f.run, mock.execute, { smoke05Sha256: f.smokePin })).rejects.toThrow("previous account limit");
        expect(mock.calls.filter(args => args[0] === "--print")).toHaveLength(0);
      } finally { f.cleanup(); }
    }
  });
  it("rejects tampered request provenance, predecessor results, and non-frozen IDs before model calls", async () => {
    for (const kind of ["duplicate", "self-hash", "schema", "predecessor", "id"] as const) {
      const f = fixture("verifier"), mock = mockExecute(() => { throw new Error("must not invoke model"); });
      try {
        if (kind === "predecessor") {
          const path = resolve(f.run, "editor-results.json"), rows = JSON.parse(readFileSync(path, "utf8")); rows[0].data.text += "tampered"; writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
        } else {
          const path = resolve(f.run, "verifier-requests.json"), changed = JSON.parse(readFileSync(path, "utf8"));
          if (kind === "duplicate") changed.requests.push({ ...changed.requests[0] });
          if (kind === "self-hash") changed.requests[0].user += "tampered";
          if (kind === "schema") changed.requests[0].responseJsonSchema = { type: "object", additionalProperties: true };
          if (kind === "id") changed.requests[0].id = "V3-999";
          writeFileSync(path, JSON.stringify(changed));
        }
        await expect(generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin })).rejects.toThrow();
        expect(mock.calls).toEqual([]);
      } finally { f.cleanup(); }
    }
  });
  it("rejects predecessor byte drift on resume even when JSON semantics are unchanged", async () => {
    const f = fixture("verifier"), mock = mockExecute(() => { throw new Error("must not invoke model"); });
    try {
      const predecessorPath = resolve(f.run, "editor-results.json");
      const original = readFileSync(predecessorPath);
      const predecessorResultSha256 = { "editor-results.json": sha(original) };
      const request = f.bundle.requests[0];
      writeFileSync(resolve(f.run, "verifier-attempts.jsonl"), JSON.stringify({
        id: request.id, stage: "verifier", requestSha256: request.requestSha256,
        requestBundleSha256: sha(readFileSync(resolve(f.run, "verifier-requests.json"))), predecessorResultSha256,
        start: "2026-10-02T00:00:00.000Z", status: "started", cliVersion, model: "sonnet",
      }) + "\n");
      const sameRows = JSON.parse(original.toString("utf8"));
      writeFileSync(predecessorPath, JSON.stringify(sameRows) + "\n");
      expect(JSON.parse(readFileSync(predecessorPath, "utf8"))).toEqual(sameRows);
      expect(readFileSync(predecessorPath)).not.toEqual(original);
      await expect(generateStage("verifier", f.run, mock.execute, { smoke05Sha256: f.smokePin }))
        .rejects.toThrow("stage ledger predecessor result commitment mismatch");
      expect(mock.calls).toEqual([]);
      expect(readFileSync(resolve(f.run, "verifier-attempts.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
    } finally { f.cleanup(); }
  }, 30_000);
});
