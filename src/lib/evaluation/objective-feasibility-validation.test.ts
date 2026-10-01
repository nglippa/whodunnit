import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/objective-feasibility");
const manifestBytes = readFileSync(resolve(root, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files: Record<string, string> };
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("frozen objective-conditioned development input", () => {
  it("pins the manifest itself and every pre-review input", () => {
    expect(sha(manifestBytes)).toBe("624a127be8dcf70ab46082edcc735bacc5b9d6ef2dfa9d8020fe4906443ae058");
    for (const [name, digest] of Object.entries(manifest.files)) expect(sha(readFileSync(resolve(root, name)))).toBe(digest);
  });

  it("provides all tasks to pinned v3 without gold labels or requested-job annotations", () => {
    const call = spawnSync(process.execPath, ["--import", "tsx", "tools/eval/objective-feasibility-validation.ts", "requests"], { cwd: process.cwd(), encoding: "utf8" });
    expect(call.status).toBe(0);
    const bundle = JSON.parse(call.stdout) as { contractVersion: string; strategy: string; requests: { id: string; request: Record<string, unknown> }[] };
    expect(bundle.contractVersion).toBe("semantic-review.v3");
    expect(bundle.strategy).toBe("reconstruction-v7");
    expect(bundle.requests).toHaveLength(168);
    for (const task of bundle.requests) {
      expect(task.request).not.toHaveProperty("gold");
      expect(task.request).not.toHaveProperty("jobs");
      expect(task.request).not.toHaveProperty("expectedFeasibility");
    }
  });

  it("pins the one-shot v4 request transport and excludes gold annotations", () => {
    const call = spawnSync(process.execPath, ["--import", "tsx", "tools/eval/objective-feasibility-v4.ts", "requests"], { cwd: process.cwd(), encoding: "utf8" });
    expect(call.status).toBe(0);
    expect(sha(Buffer.from(call.stdout))).toBe("104ba4fd5825ecb5147e608e60db949119391d4a26384864052aabcf9466f969");
    const bundle = JSON.parse(call.stdout) as { contractVersion: string; strategy: string; requests: { id: string; request: Record<string, unknown> }[] };
    expect(bundle.contractVersion).toBe("semantic-review.v4");
    expect(bundle.strategy).toBe("reconstruction-v8");
    expect(bundle.requests).toHaveLength(168);
    for (const task of bundle.requests) {
      expect(task.request).toHaveProperty("requestedObjective");
      expect(task.request).not.toHaveProperty("gold");
      expect(task.request).not.toHaveProperty("jobs");
    }
  });
});
