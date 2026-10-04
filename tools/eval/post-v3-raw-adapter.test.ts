import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { rawEditorArguments, runRawEditor } from "./post-v3-raw-adapter";

describe("post V3 RAW editor adapter", () => {
  it("loads the prompt and exact source/objective request, invokes once, and accepts only text", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "post-v3-raw-test-"));
    try {
      const promptPath = resolve(dir, "prompt.txt");
      const requestPath = resolve(dir, "request.json");
      writeFileSync(promptPath, readFileSync(resolve("data/evaluation/post-v3-comparison/raw-editor-prompt-v1.txt")));
      writeFileSync(requestPath, JSON.stringify({ source: "Original", objective: "Make concise" }));
      let calls = 0;
      const value = await runRawEditor({ promptPath, requestPath, cwd: dir,
        env: { NODE_ENV: "test", PATH: "/bin", ANTHROPIC_API_KEY: "do-not-pass" },
        execute: async (args, stdin, cwd, env) => {
          calls++;
          expect(args).toContain(readFileSync(promptPath, "utf8"));
          expect(args).toContain("--no-session-persistence");
          expect(args).toContain("--tools");
          expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
          expect(args[args.indexOf("--effort") + 1]).toBe("medium");
          expect(JSON.parse(stdin)).toEqual({ source: "Original", objective: "Make concise" });
          expect(cwd).toBe(dir);
          expect(env.ANTHROPIC_API_KEY).toBeUndefined();
          expect(env.CLAUDE_CODE_MAX_RETRIES).toBe("0");
          expect(env.MAX_STRUCTURED_OUTPUT_RETRIES).toBe("0");
          return { code: 0, stdout: JSON.stringify({ structured_output: { text: "Edited." }, model: "claude-sonnet-5-5" }), stderr: "" };
        } });
      expect(calls).toBe(1);
      expect(value).toMatchObject({ text: "Edited.", provenance: { reportedModel: "claude-sonnet-5-5", modelUsageModels: [], resolvedModel: "claude-sonnet-5-5", effort: "medium", timeoutMs: 120_000 } });
      expect(value.provenance.requestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(value.provenance.responseEnvelopeSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("uses a strict minimal response schema in its CLI args", () => {
    const args = rawEditorArguments("prompt");
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1]);
    expect(schema).toEqual({ type: "object", properties: { text: { type: "string", minLength: 1, maxLength: 60000 } }, required: ["text"], additionalProperties: false });
  });

  it("rejects extra fields, invalid envelopes, and nonzero exits without retrying", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "post-v3-raw-failure-"));
    try {
      const promptPath = resolve(dir, "prompt.txt"), requestPath = resolve(dir, "request.json");
      writeFileSync(promptPath, readFileSync(resolve("data/evaluation/post-v3-comparison/raw-editor-prompt-v1.txt")));
      writeFileSync(requestPath, JSON.stringify({ source: "s", objective: "o" }));
      for (const result of [
        { code: 0, stdout: JSON.stringify({ structured_output: { text: "Edited", changes: [] } }), stderr: "" },
        { code: 0, stdout: "not json", stderr: "" },
        { code: 1, stdout: "", stderr: "failed" },
      ]) {
        let calls = 0;
        await expect(runRawEditor({ promptPath, requestPath, execute: async () => { calls++; return result; } })).rejects.toThrow();
        expect(calls).toBe(1);
      }
      expect(readFileSync(promptPath, "utf8")).toBe(readFileSync(resolve("data/evaluation/post-v3-comparison/raw-editor-prompt-v1.txt"), "utf8"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects unresolved or substituted models and classifies timeout before output parsing", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "post-v3-raw-stop-"));
    try {
      const promptPath = resolve(dir, "prompt.txt"), requestPath = resolve(dir, "request.json");
      writeFileSync(promptPath, readFileSync(resolve("data/evaluation/post-v3-comparison/raw-editor-prompt-v1.txt")));
      writeFileSync(requestPath, JSON.stringify({ source: "s", objective: "o" }));
      let calls = 0;
      for (const response of [
        { code: 0, stdout: JSON.stringify({ structured_output: { text: "edited" } }), stderr: "" },
        { code: 0, stdout: JSON.stringify({ structured_output: { text: "edited" }, model: "claude-sonnet-4-5" }), stderr: "" },
      ]) {
        await expect(runRawEditor({ promptPath, requestPath, execute: async () => { calls++; return response; } })).rejects.toThrow(/raw-editor-model-(unresolved|mismatch)/);
      }
      await expect(runRawEditor({ promptPath, requestPath, execute: async () => { calls++; return { code: null, stdout: "", stderr: "", timedOut: true }; } })).rejects.toThrow("raw-editor-timeout");
      expect(calls).toBe(3);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects prompt content changes before starting the process", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "post-v3-raw-prompt-"));
    try {
      const promptPath = resolve(dir, "prompt.txt"), requestPath = resolve(dir, "request.json");
      writeFileSync(promptPath, "modified prompt");
      writeFileSync(requestPath, JSON.stringify({ source: "s", objective: "o" }));
      let calls = 0;
      await expect(runRawEditor({ promptPath, requestPath, execute: async () => { calls++; return { code: 0, stdout: "", stderr: "" }; } })).rejects.toThrow("prompt-hash-mismatch");
      expect(calls).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
