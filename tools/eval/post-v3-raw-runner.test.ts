import { describe, expect, it } from "vitest";
import { constants, mkdtempSync, openSync, closeSync, fsyncSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { checkCallerPreflight, executeRawCase, verifyFrozenRawCases } from "./post-v3-raw-runner";

describe("post-v3 RAW runner offline gates", () => {
  it("validates the frozen 40-case metadata without emitting case text", () => {
    const frozen = verifyFrozenRawCases();
    expect(frozen.cases).toHaveLength(40);
    expect(new Set(frozen.cases.map(row => row.caseId)).size).toBe(40);
    expect(frozen.casesFileSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("checks CLI version and auth class with sanitized environment and no provider call", () => {
    const calls: string[][] = [];
    const env: NodeJS.ProcessEnv = { ...process.env, ANTHROPIC_API_KEY: "must-not-pass", CLAUDE_CODE_MAX_RETRIES: "9" };
    const result = checkCallerPreflight(env, (args, safeEnv) => {
      calls.push(args);
      expect(safeEnv.ANTHROPIC_API_KEY).toBeUndefined();
      expect(safeEnv.CLAUDE_CODE_MAX_RETRIES).toBe("0");
      return args[0] === "--version" ? "2.1.288 (Claude Code)\n" : JSON.stringify({ loggedIn: true, authMethod: "claude.ai" });
    });
    expect(calls).toEqual([["--version"], ["auth", "status"]]);
    expect(result).toMatchObject({ cliVersion: "2.1.288", authClass: "claude.ai" });
  });

  it("makes one fake CLI invocation with only source/objective and removes private request files", async () => {
    let count = 0;
    let requestPath = "";
    const result = await executeRawCase({ caseId: "PVC-001", source: "fixture source", objective: "fixture objective" }, async (args, stdin, cwd) => {
      count++;
      expect(args).toContain("--model");
      expect(JSON.parse(stdin)).toEqual({ source: "fixture source", objective: "fixture objective" });
      expect(JSON.parse(readFileSync(resolve(cwd, "request.json"), "utf8"))).toEqual({ source: "fixture source", objective: "fixture objective" });
      expect(statSync(cwd).mode & 0o777).toBe(0o700);
      expect(statSync(resolve(cwd, "request.json")).mode & 0o777).toBe(0o600);
      requestPath = resolve(cwd, "request.json");
      return { code: 0, stdout: JSON.stringify({ model: "claude-sonnet-5-5", modelUsage: { "claude-sonnet-5-5": {} }, structured_output: { text: "result" } }), stderr: "" };
    });
    expect(count).toBe(1);
    expect(result.status).toBe("success");
    expect(exists(requestPath)).toBe(false);
  });

  it("supports exclusive no-follow file and directory fsync on the host filesystem", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "whodunnit-raw-fsync-test-"));
    try {
      const file = resolve(directory, "probe");
      const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, "offline"); fsyncSync(fd); closeSync(fd);
      const dirfd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      fsyncSync(dirfd); closeSync(dirfd);
      expect(readFileSync(file, "utf8")).toBe("offline");
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

function exists(path: string) {
  try { readFileSync(path); return true; } catch { return false; }
}
