import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/v13-architecture-replay");
const read = (name: string) => readFileSync(resolve(root, name));

describe("frozen V13 architecture replay inputs", () => {
  it("pins all 40 sources, objectives, metadata, and the blind review rubric before generation", () => {
    const manifest = JSON.parse(read("manifest.json").toString()) as {
      status: string; caseCount: number; strategy: string; editorPrompt: string; route: string; files: Record<string, string>;
    };
    expect(manifest).toMatchObject({ status: "FROZEN_BEFORE_GENERATION", caseCount: 40,
      strategy: "reconstruction-v13", editorPrompt: "reconstruct.v8", route: "account-backed-no-metered-api" });
    expect(Object.keys(manifest.files).sort()).toEqual(["cases.json", "review-rubric.json"]);
    for (const [name, hash] of Object.entries(manifest.files))
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(hash);
    const cases = JSON.parse(read("cases.json").toString()) as { id: string; source: string; objective: string }[];
    expect(cases.map((item) => item.id)).toEqual(Array.from({ length: 40 }, (_, i) => `ar${String(i + 1).padStart(2, "0")}`));
    expect(new Set(cases.map((item) => item.source)).size).toBe(40);
    expect(cases.every((item) => item.source.length > 20 && item.objective.length > 5)).toBe(true);
  });

  it("pins the saved first candidates, verification calls, final replay, and independent labels", () => {
    const manifest = JSON.parse(read("results-manifest.json").toString()) as {
      status: string; caseCount: number; files: Record<string, string>;
    };
    expect(manifest.status).toBe("FROZEN_AFTER_BLIND_REVIEW");
    expect(manifest.caseCount).toBe(40);
    expect(Object.keys(manifest.files).sort()).toEqual([
      "editor-results.json", "labels-first.json", "labels-second.json", "repair-results.json",
      "reverify-results.json", "run-v13.json", "verifier-results.json",
    ]);
    for (const [name, hash] of Object.entries(manifest.files))
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(hash);
    const run = JSON.parse(read("run-v13.json").toString()) as { rows: { id: string }[] };
    const first = JSON.parse(read("labels-first.json").toString()) as { id: string }[];
    const second = JSON.parse(read("labels-second.json").toString()) as { id: string }[];
    expect(run.rows.map((row) => row.id)).toEqual(first.map((row) => row.id));
    expect(run.rows.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });

  it("pins the separate post-result audit without changing the blind labels", () => {
    const manifest = JSON.parse(read("audit-manifest.json").toString()) as {
      status: string; files: Record<string, string>;
    };
    expect(manifest.status).toBe("FROZEN_AFTER_INDEPENDENT_AUDIT");
    expect(Object.keys(manifest.files).sort()).toEqual(["audit-safety-findings.json", "audit-utility-findings.json"]);
    for (const [name, hash] of Object.entries(manifest.files))
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(hash);
  });
});
