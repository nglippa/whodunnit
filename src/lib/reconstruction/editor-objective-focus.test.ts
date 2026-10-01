import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/editor-objective-focus");
const read = (name: string) => readFileSync(resolve(root, name));

describe("frozen editor objective inputs", () => {
  it("pins sources, objectives, blind labels, and same-source pairs before generation", () => {
    const manifest = JSON.parse(read("manifest.json").toString());
    const cases = JSON.parse(read("cases.json").toString()) as { id: string; source: string; objective: string }[];
    expect(manifest.status).toBe("FROZEN_BEFORE_GENERATION");
    expect(cases).toHaveLength(14);
    expect(new Set(cases.map((item) => item.id)).size).toBe(14);
    expect(Object.keys(manifest.files).sort()).toEqual(["cases.json", "labels-first.json", "labels-second.json", "pairs.json"].sort());
    for (const [name, digest] of Object.entries(manifest.files))
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(digest);
    for (const name of ["labels-first.json", "labels-second.json"]) {
      const labels = JSON.parse(read(name).toString()) as { id: string }[];
      expect(labels.map((item) => item.id)).toEqual(cases.map((item) => item.id));
    }
    const pairs = JSON.parse(read("pairs.json").toString()) as { ids: [string, string] }[];
    expect(pairs).toHaveLength(3);
    for (const pair of pairs)
      expect(cases.find((item) => item.id === pair.ids[0])?.source).toBe(cases.find((item) => item.id === pair.ids[1])?.source);
  });
});
