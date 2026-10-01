import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/exact-delta-confirmation");
const read = (name: string) => readFileSync(resolve(root, name));

describe("frozen exact-delta confirmation inputs", () => {
  it("pins candidates and both blind labels before verifier execution", () => {
    const manifest = JSON.parse(read("manifest.json").toString()) as { status: string; caseCount: number; files: Record<string, string> };
    expect(manifest.status).toBe("FROZEN_BEFORE_VERIFIER");
    expect(manifest.caseCount).toBe(10);
    expect(Object.keys(manifest.files).sort()).toEqual(["cases.json", "labels-first.json", "labels-second.json"].sort());
    for (const [name, hash] of Object.entries(manifest.files))
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(hash);
    const cases = JSON.parse(read("cases.json").toString()) as { id: string }[];
    expect(cases).toHaveLength(10);
    expect(new Set(cases.map((item) => item.id)).size).toBe(10);
    for (const name of ["labels-first.json", "labels-second.json"])
      expect((JSON.parse(read(name).toString()) as { id: string }[]).map((item) => item.id)).toEqual(cases.map((item) => item.id));
  });
});
