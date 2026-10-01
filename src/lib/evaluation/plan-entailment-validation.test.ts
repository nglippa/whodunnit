import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/plan-entailment-development");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

describe("frozen plan-entailment development input", () => {
  it("pins the manifest and every pre-review input", () => {
    const bytes = readFileSync(resolve(root, "manifest.json"));
    expect(hash(bytes)).toBe("f2011ef4c0dd22973de3dbde59e61eaa0f29db67e9d15af2bfd55226aeb958d8");
    const manifest = JSON.parse(bytes.toString("utf8")) as { status: string; files: Record<string, string> };
    expect(manifest.status).toBe("FROZEN_DEVELOPMENT");
    for (const [name, expected] of Object.entries(manifest.files)) expect(hash(readFileSync(resolve(root, name)))).toBe(expected);
  });

  it("sends all sources and objectives to pinned v4 without labels or expected outcomes", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", "tools/eval/plan-entailment.ts", "requests"], { cwd: process.cwd(), encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(hash(run.stdout)).toBe("5f394b8e798dd57a7592c202853cfea9105b58cbc4b764c4d502c7828f495352");
    const bundle = JSON.parse(run.stdout) as { contractVersion: string; strategy: string; requests: { id: string; request: Record<string, unknown> }[] };
    expect(bundle.contractVersion).toBe("semantic-review.v4");
    expect(bundle.strategy).toBe("reconstruction-v8");
    expect(bundle.requests).toHaveLength(90);
    for (const item of bundle.requests) {
      expect(item.request).toHaveProperty("requestedObjective");
      expect(item.request).not.toHaveProperty("gold");
      expect(item.request).not.toHaveProperty("requirements");
      expect(item.request).not.toHaveProperty("constraints");
      expect(item.request).not.toHaveProperty("jobs");
    }
  });

  it("sends the same frozen tasks to versioned v5 without editorial gold", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", "tools/eval/plan-entailment-v5.ts", "requests"], { cwd: process.cwd(), encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(hash(run.stdout)).toBe("1033f8ac4261d79c386e435b4c27bcd4f12983b0d9a44916b45c85696abc03e0");
    const bundle = JSON.parse(run.stdout) as { contractVersion: string; strategy: string; requests: { request: Record<string, unknown> }[] };
    expect(bundle.contractVersion).toBe("semantic-review.v5");
    expect(bundle.strategy).toBe("reconstruction-v9");
    expect(bundle.requests).toHaveLength(90);
    for (const { request } of bundle.requests) {
      expect(request).toHaveProperty("requestedObjective");
      expect(request).not.toHaveProperty("gold");
      expect(request).not.toHaveProperty("requirements");
      expect(request).not.toHaveProperty("constraints");
      expect(request).not.toHaveProperty("jobs");
    }
  });

  it("pins both saved review outputs without asserting a preferred model decision", () => {
    for (const [metaName, reviewName] of [["review-execution.json", "reviews-v4.json"], ["review-execution-v5.json", "reviews-v5.json"]]) {
      const execution = JSON.parse(readFileSync(resolve(root, metaName), "utf8")) as { outputSha256: string; route: string };
      expect(execution.route).toBe("account-backed-no-metered-api");
      expect(hash(readFileSync(resolve(root, reviewName)))).toBe(execution.outputSha256);
    }
  });
});
