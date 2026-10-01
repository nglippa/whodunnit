import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/objective-aware-replay");

describe("frozen objective-aware editor inputs", () => {
  it("keeps the source/objective corpus unchanged after model execution", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    const contents = readFileSync(resolve(root, "cases.json"));
    const cases = JSON.parse(contents.toString()) as { id: string; source: string; objective: string }[];
    expect(manifest.status).toBe("FROZEN_BEFORE_EDITING");
    expect(createHash("sha256").update(contents).digest("hex")).toBe(manifest.casesSha256);
    expect(cases).toHaveLength(manifest.count);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(cases.every((item) => item.source && item.objective)).toBe(true);
  });
});
