import { closeSync, constants, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { candidateSchema } from "@/lib/ai/schemas";
import { STAGE_RESPONSE_SCHEMAS } from "./holdout-v3-stages";
import { accountEnvironment, cliJsonSchema, editorArguments, generateV3, isAccountLimit, parseCandidate, type EditorRequest, acquireRunLock, safeOpen, safeRead, syntheticSmoke, verifyRequestBundle, recoverInterruptedAttempts, smokeDiagnostics, verifySmoke05 } from "./holdout-v3-generate";
const Ajv6 = createRequire(resolve(process.cwd(), "package.json"))(resolve(process.cwd(), "node_modules/.pnpm/ajv@6.15.0/node_modules/ajv")) as new () => { compile: (schema: unknown) => unknown };
const request: EditorRequest = { id: "test", stage: "editor", schemaName: "frontier-editor", system: "exact system\n", user: "exact user\n", requestSha256: "test", responseJsonSchema: { type: "object" } };
describe("V3 account bridge", () => {
  it("scrubs API and alternate provider credentials without mutating source", () => {
    const source = { NODE_ENV: "test" as const, ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "secret", ANTHROPIC_BASE_URL: "url", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_USE_VERTEX: "1", CLAUDE_CODE_USE_FOUNDRY: "1", PATH: "/bin" };
    expect(accountEnvironment(source)).toEqual({ NODE_ENV: "test", PATH: "/bin", MAX_STRUCTURED_OUTPUT_RETRIES: "1", CLAUDE_CODE_MAX_RETRIES: "0" }); expect(source.ANTHROPIC_API_KEY).toBe("secret");
  });
  it("constructs exact system/schema and disables tools/persistence", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false };
    expect(editorArguments({ ...request, responseJsonSchema: schema })).toEqual(["--print", "--system-prompt", request.system, "--json-schema", "{\"type\":\"object\",\"properties\":{\"value\":{\"type\":\"string\"}},\"required\":[\"value\"],\"additionalProperties\":false}", "--output-format", "json", "--no-session-persistence", "--tools", "", "--model", "sonnet", "--safe-mode", "--setting-sources", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands"]);
  });
  it("removes only the declared top-level dialect for all role schemas and leaves their source objects unchanged", () => {
    for (const schema of [candidateSchema, STAGE_RESPONSE_SCHEMAS.verifier, STAGE_RESPONSE_SCHEMAS.repair, STAGE_RESPONSE_SCHEMAS.reverify].map(value => z.toJSONSchema(value))) {
      const snapshot = JSON.stringify(schema);
      const expected = { ...schema } as Record<string, unknown>;
      expect(expected.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      delete expected.$schema;
      const adapted = cliJsonSchema(schema);
      expect(adapted).toBe(JSON.stringify(expected));
      expect(schema).toEqual(JSON.parse(snapshot));
      expect(() => new Ajv6().compile(schema)).toThrow();
      expect(() => new Ajv6().compile(JSON.parse(adapted))).not.toThrow();
    }
    for (const invalid of [null, [], {}, { $schema: "https://json-schema.org/draft/2019-09/schema", type: "object" }, { $schema: "https://json-schema.org/draft/2020-12/schema" }])
      expect(() => cliJsonSchema(invalid)).toThrow("unsupported CLI JSON schema dialect or shape");
  });
  it("parses CLI structured output using the existing strict candidate schema", () => {
    const result = { code: 0, stderr: "", stdout: JSON.stringify({ structured_output: { text: "Candidate", changes: [] }, modelUsage: { "claude-sonnet-test": {} } }) };
    expect(parseCandidate(result).resolvedModels).toEqual(["claude-sonnet-test"]);
    expect(() => parseCandidate({ ...result, stdout: JSON.stringify({ structured_output: { text: "Candidate", changes: [], extra: true } }) })).toThrow();
    expect(() => parseCandidate({ ...result, code: 1 })).toThrow();
  });
  it("recognizes usage and paywall failures", () => {
    for (const stdout of ["Usage limit reached", "insufficient credits", "Upgrade your plan", "Credit balance too low"]) expect(isAccountLimit({ code: 1, stdout, stderr: "" })).toBe(true);
  });
  it("validates all frozen requests in dry-run without invoking a model", async () => {
    const calls: string[][] = [];
    const result = await generateV3("dry-run", undefined, async (args, stdin, cwd, env) => {
      calls.push(args); expect(stdin).toBe(""); expect(cwd).toContain("whodunnit-v3-"); expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      return { code: 0, stderr: "", stdout: args[0] === "auth" ? JSON.stringify({ authMethod: "claude.ai", loggedIn: true }) : "synthetic-cli-version" };
    });
    expect(calls).toEqual([["auth", "status"], ["--version"]]); expect(result).toMatchObject({ modelCalls: 0, caseCount: 119, smoke05Ready: false });
  });
  it("refuses API authentication before any model invocation", async () => {
    const calls: string[][] = [];
    await expect(generateV3("dry-run", undefined, async args => { calls.push(args); return { code: 0, stderr: "", stdout: JSON.stringify({ authMethod: "api_key", loggedIn: true }) }; })).rejects.toThrow();
    expect(calls).toEqual([["auth", "status"]]);
  });

  it("refuses alternate generation ledger directories before invoking CLI", async () => {
    let calls = 0;
    await expect(generateV3("generate", "/tmp/alternate-ledger", async () => { calls++; return { code: 0, stdout: "", stderr: "" }; })).rejects.toThrow("canonical");
    expect(calls).toBe(0);
  });
  it("pins the full request artifact independently of its self-reported hash", () => {
    const original = readFileSync(resolve("data/evaluation/holdout-v3/run/editor-requests.json"), "utf8");
    expect(() => verifyRequestBundle(original)).not.toThrow();
    const changed = JSON.parse(original); changed.requests[0].system += "injected"; changed.requests[0].requestSha256 = "new self hash";
    expect(() => verifyRequestBundle(JSON.stringify(changed))).toThrow("anchor");
  });
  it("rejects symlink artifact files for all supported open modes", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-safe-test-"));
    try {
      const target = resolve(dir, "target"); writeFileSync(target, "untouched");
      for (const name of ["editor-results.json", "editor-failures.json", "editor-attempts.jsonl", "editor-generation.lock", "editor-smoke.json"]) {
        const path = resolve(dir, name); symlinkSync(target, path);
        expect(() => safeRead(path)).toThrow("unsafe");
        expect(() => safeOpen(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND)).toThrow("unsafe");
      }
      expect(readFileSync(target, "utf8")).toBe("untouched");
      expect(() => safeRead(dir)).toThrow("unsafe");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("recovers a dead local lock, refuses live owners and foreign owners", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-lock-test-")), path = resolve(dir, "lock");
    try {
      writeFileSync(path, JSON.stringify({ pid: 2147483647, host: hostname() }));
      const fd = acquireRunLock(path); closeSync(fd);
      expect(JSON.parse(safeRead(path)).pid).toBe(process.pid);
      expect(() => acquireRunLock(path)).toThrow("already running");
      rmSync(path); writeFileSync(path, JSON.stringify({ pid: 2147483647, host: "other-host" }));
      expect(() => acquireRunLock(path)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("records interrupted attempts permanently and never repeats recovery entries", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-interrupted-test-")), path = resolve(dir, "ledger");
    try {
      const row = { id: "V3-001", status: "started", start: "2026-10-02", requestSha256: "hash", model: "sonnet", cliVersion: "fake" };
      writeFileSync(path, JSON.stringify(row) + "\n");
      expect(recoverInterruptedAttempts(path).map(item => item.id)).toEqual(["V3-001"]);
      const recovered = recoverInterruptedAttempts(path);
      expect(recovered.map(item => item.status)).toEqual(["started", "technical-failure-interrupted"]);
      expect(safeRead(path).trim().split("\n")).toHaveLength(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("smokes the same transport once, writes a separate result and fails closed", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-smoke-test-"));
    try {
      let calls = 0;
      const path = resolve(dir, "smoke.json");
      const result = await syntheticSmoke(path, async (args, stdin, cwd, env) => {
        calls++; expect(args).toContain("--safe-mode"); expect(args[0]).toBe("--print"); expect(args).toContain("--json-schema");
        expect(env.MAX_STRUCTURED_OUTPUT_RETRIES).toBe("1"); expect(env.CLAUDE_CODE_MAX_RETRIES).toBe("0");
        expect(stdin).toBe("Synthetic transport check. Return the specified object."); expect(cwd).toContain("whodunnit-v3-smoke-");
        return { code: 0, stderr: "", stdout: JSON.stringify({ structured_output: { text: "SMOKE_OK", changes: [] } }) };
      }, accountEnvironment(), "fake-version");
      expect(result.status).toBe("success"); expect(calls).toBe(1);
      await expect(syntheticSmoke(path, async () => { calls++; throw new Error("must not execute"); }, accountEnvironment(), "fake-version")).rejects.toThrow(); expect(calls).toBe(1);
      const failedPath = resolve(dir, "failed.json");
      await expect(syntheticSmoke(failedPath, async () => ({ code: 1, stdout: "usage limit reached", stderr: "" }), accountEnvironment(), "fake-version")).rejects.toThrow("smoke failed");
      expect(JSON.parse(safeRead(failedPath)).status).toBe("account-limit-stop");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("classifies safe bounded diagnostics without copying secrets or output", () => {
    const cases = [
      { code: null, stdout: "", stderr: "secret-key", expected: "spawn-failure" },
      { code: 1, stdout: "", stderr: "error: unknown option --safe-mode secret-key", expected: "flag-failure" },
      { code: 1, stdout: "", stderr: "Authentication failed secret-key", expected: "auth-failure" },
      { code: 1, stdout: "", stderr: "usage limit reached secret-key", expected: "limit-failure" },
      { code: 0, stdout: "private malformed candidate", stderr: "secret-key", expected: "schema-failure" },
      { code: 1, stdout: JSON.stringify({ is_error: true, result: "private output" }), stderr: "secret-key", expected: "cli-failure" },
    ];
    for (const row of cases) {
      const diagnostic = smokeDiagnostics(row);
      expect(diagnostic.errorClass).toBe(row.expected);
      expect(diagnostic.exitCode).toBe(row.code);
      expect(diagnostic.stderrSummary.length).toBeLessThanOrEqual(160);
      expect(JSON.stringify(diagnostic)).not.toMatch(/secret-key|private output|private malformed/);
    }
    expect(smokeDiagnostics(cases[5]).cliJsonReturned).toBe(true);
    expect(smokeDiagnostics(cases[1]).reportedFlags).toEqual(["--safe-mode"]);
    expect(smokeDiagnostics(cases[1]).diagnosticCode).toBe("UNSUPPORTED_KNOWN_FLAG");
  });
  it("stores only allowlisted diagnostic codes, never credential, email, path, or prompt text", () => {
    const diagnostic = smokeDiagnostics({
      code: 1,
      stdout: "private candidate text",
      stderr: "CLI failed for a.user@example.test using sk-ant-api03-secret1234567890 at /Users/alice/private/settings.json; Synthetic transport check. Return the specified object.",
    });
    const artifactFields = JSON.stringify(diagnostic);
    expect(diagnostic.diagnosticCode).toBe("UNCLASSIFIED_CLI_FAILURE");
    expect(artifactFields).not.toMatch(/a\.user@example\.test|sk-ant-api03-secret|\/Users\/alice|Synthetic transport check|private candidate text/);
  });
  it("keeps a bounded allowlisted summary for an unknown 122-byte CLI error", () => {
    const prefix = "Error: Claude Code had an unexpected error while communicating with the server. Please try again later.";
    const stderr = (prefix + " untrusted-variable-value ".repeat(10)).slice(0, 122);
    expect(Buffer.byteLength(stderr, "utf8")).toBe(122);
    const diagnostic = smokeDiagnostics({ code: 1, stdout: "", stderr });
    expect(diagnostic.diagnosticCode).toBe("UNCLASSIFIED_CLI_FAILURE");
    expect(diagnostic.stderrDetail).toContain("error");
    expect(diagnostic.stderrDetail).toContain("communicating");
    expect(diagnostic.stderrDetail).toContain("server");
    expect(diagnostic.stderrDetail.length).toBeLessThanOrEqual(240);
    expect(diagnostic.stderrDetail).not.toContain("untrusted");
  });
  it("redacts secrets and synthetic prompt echoes before retaining allowlisted words", () => {
    const stderr = "Failed to connect to https://private.example/auth?token=opaque for alice@example.test using sk-ant-api03-secret1234567890 at /Users/alice/private/settings.json. Synthetic transport check. Return the specified object. SMOKE_OK";
    const diagnostic = smokeDiagnostics({ code: 1, stdout: "", stderr });
    expect(diagnostic.stderrDetail).toContain("failed");
    expect(diagnostic.stderrDetail).toContain("connect");
    expect(diagnostic.stderrDetail).not.toMatch(/private\.example|opaque|alice@example|sk-ant|\/Users\/alice|Synthetic|specified|SMOKE_OK/);
  });
  it("retains only contextual known HTTP statuses and summarizes multiple bounded lines", () => {
    const stderr = [
      "Warning: Claude Code request failed for account 1234567890 with short token x7.",
      "Error: HTTP 503 request failed; reference 429 and identifier 9876543210.",
      "HTTP 418 is not in the status allowlist and should be dropped.",
      "This fifth line must not appear: authentication failed.",
      "A sixth line is also omitted.",
    ].join("\n");
    const detail = smokeDiagnostics({ code: 1, stdout: "", stderr }).stderrDetail;
    expect(detail).toContain("warning");
    expect(detail).toContain("error");
    expect(detail).toContain("http status 503");
    expect(detail).not.toMatch(/1234567890|9876543210|x7|429|418|fifth|sixth/);
    expect(detail.length).toBeLessThanOrEqual(240);
  });
  it("writes smoke-02 separately and preserves immutable first smoke", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-smoke-version-test-"));
    try {
      const first = resolve(dir, "editor-smoke.json"), second = resolve(dir, "editor-smoke-02.json");
      writeFileSync(first, "immutable first failure");
      let calls = 0;
      await expect(syntheticSmoke(second, async () => { calls++; return { code: 1, stdout: "", stderr: "unknown option --safe-mode private-secret" }; }, accountEnvironment(), "fake", "smoke-02")).rejects.toThrow();
      const artifact = JSON.parse(safeRead(second));
      expect(artifact.mode).toBe("smoke-02"); expect(artifact.diagnosticsVersion).toBe(4); expect(artifact.diagnostics.errorClass).toBe("flag-failure"); expect(artifact.diagnostics.exitCode).toBe(1); expect(artifact.diagnostics.cliJsonReturned).toBe(false);
      expect(safeRead(second)).not.toContain("private-secret"); expect(safeRead(first)).toBe("immutable first failure");
      await expect(syntheticSmoke(second, async () => { calls++; throw new Error(); }, accountEnvironment(), "fake", "smoke-02")).rejects.toThrow(); expect(calls).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("classifies allowlisted infrastructure and startup markers without raw text", () => {
    const groups = [
      { codes: ["EPERM", "EACCES", "EROFS", "ENOENT"], expected: "filesystem-failure" },
      { codes: ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"], expected: "network-failure" },
    ];
    for (const group of groups) for (const code of group.codes) {
      const result = smokeDiagnostics({ code: 1, stdout: "", stderr: `Error ${code}: private-secret /private/path` });
      expect(result.errorClass).toBe(group.expected); expect(result.safeMarkers).toEqual([code]); expect(JSON.stringify(result)).not.toMatch(/private-secret|private.path/);
    }
    for (const [stderr, errorClass, marker] of [
      ["Claude Code cannot be launched inside another Claude Code session", "nested-session-failure", "NESTED_SESSION"],
      ["Invalid JSON schema: private-schema", "startup-schema-failure", "STARTUP_SCHEMA"],
      ["Failed to load settings: private-path", "startup-config-failure", "STARTUP_CONFIG"],
    ]) {
      const diagnostic = smokeDiagnostics({ code: 1, stdout: "", stderr }); expect(diagnostic.errorClass).toBe(errorClass); expect(diagnostic.safeMarkers).toContain(marker);
    }
    expect(smokeDiagnostics({ code: 1, stdout: "é", stderr: "😀" })).toMatchObject({ stdoutBytes: 2, stderrBytes: 4 });
    expect(smokeDiagnostics({ code: null, stdout: "", stderr: "", spawnErrorCode: "EPERM" })).toMatchObject({ errorClass: "spawn-failure", safeMarkers: ["EPERM"], spawnErrorCode: "EPERM" });
    expect(smokeDiagnostics({ code: null, stdout: "", stderr: "", spawnErrorCode: "secret" }).spawnErrorCode).toBeNull();
  });
  it("writes exclusive smoke-03 while preserving both prior smoke artifacts", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-smoke03-test-"));
    try {
      const first = resolve(dir, "editor-smoke.json"), second = resolve(dir, "editor-smoke-02.json"), third = resolve(dir, "editor-smoke-03.json");
      writeFileSync(first, "first immutable"); writeFileSync(second, "second immutable");
      let calls = 0;
      const fake = async () => { calls++; return { code: 1, stdout: "", stderr: "EPERM private-path secret" }; };
      await expect(syntheticSmoke(third, fake, accountEnvironment(), "fake", "smoke-03")).rejects.toThrow();
      expect(JSON.parse(safeRead(third))).toMatchObject({ mode: "smoke-03", diagnosticsVersion: 4, diagnostics: { errorClass: "filesystem-failure", diagnosticCode: "FILESYSTEM_EPERM", safeMarkers: ["EPERM"], stdoutBytes: 0 } });
      expect(safeRead(first)).toBe("first immutable"); expect(safeRead(second)).toBe("second immutable");
      await expect(syntheticSmoke(third, fake, accountEnvironment(), "fake", "smoke-03")).rejects.toThrow(); expect(calls).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("supports exclusive smoke-05 and gates it on an exact successful artifact and CLI version", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "v3-smoke05-test-"));
    try {
      const smoke03 = resolve(dir, "editor-smoke-03.json"), smoke04 = resolve(dir, "editor-smoke-04.json"), smoke05 = resolve(dir, "editor-smoke-05.json");
      writeFileSync(smoke03, "smoke-03 immutable failure"); writeFileSync(smoke04, "smoke-04 immutable failure");
      const fake = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ structured_output: { text: "SMOKE_OK", changes: [] }, model: "claude-sonnet-test" }) });
      await syntheticSmoke(smoke05, fake, accountEnvironment(), "current", "smoke-05");
      const bytes = safeRead(smoke05);
      expect(verifySmoke05(bytes, "current", createHash("sha256").update(bytes).digest("hex"))).toMatchObject({ mode: "smoke-05", status: "success" });
      expect(() => verifySmoke05(bytes, "different", createHash("sha256").update(bytes).digest("hex"))).toThrow();
      expect(safeRead(smoke03)).toBe("smoke-03 immutable failure"); expect(safeRead(smoke04)).toBe("smoke-04 immutable failure");
      await expect(syntheticSmoke(smoke05, fake, accountEnvironment(), "current", "smoke-05")).rejects.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("permits one structured-output attempt, disables API retries and removes model fallbacks", () => {
    const source = { ...process.env, MAX_STRUCTURED_OUTPUT_RETRIES: "5", CLAUDE_CODE_MAX_RETRIES: "10", ANTHROPIC_FALLBACK_MODEL: "paid-fallback", CLAUDE_CODE_FALLBACK_MODEL: "other", FALLBACK_FOR_ALL_PRIMARY_MODELS: "1", CLAUDE_CODE_RETRY_WATCHDOG: "1" };
    const env = accountEnvironment(source);
    expect(env.MAX_STRUCTURED_OUTPUT_RETRIES).toBe("1"); expect(env.CLAUDE_CODE_MAX_RETRIES).toBe("0");
    expect(env.ANTHROPIC_FALLBACK_MODEL).toBeUndefined(); expect(env.CLAUDE_CODE_FALLBACK_MODEL).toBeUndefined(); expect(env.FALLBACK_FOR_ALL_PRIMARY_MODELS).toBeUndefined(); expect(env.CLAUDE_CODE_RETRY_WATCHDOG).toBeUndefined();
    expect(source.MAX_STRUCTURED_OUTPUT_RETRIES).toBe("5"); expect(source.ANTHROPIC_FALLBACK_MODEL).toBe("paid-fallback");
  });

  it("recognizes errno word boundaries in realistic startup stderr", () => {
    const filesystem = smokeDiagnostics({ code: 1, stdout: "", stderr: "Error: EPERM: operation not permitted, open '/private/redacted/settings.json'" });
    expect(filesystem.errorClass).toBe("filesystem-failure"); expect(filesystem.safeMarkers).toContain("EPERM");
    const network = smokeDiagnostics({ code: 1, stdout: "", stderr: "Error: getaddrinfo ENOTFOUND private-hostname" });
    expect(network.errorClass).toBe("network-failure"); expect(network.safeMarkers).toContain("ENOTFOUND");
    expect(smokeDiagnostics({ code: 1, stdout: "", stderr: "XEPERM unrelated" }).safeMarkers).toEqual([]);
    expect(JSON.stringify(filesystem)).not.toContain("/private/redacted");
  });

});
