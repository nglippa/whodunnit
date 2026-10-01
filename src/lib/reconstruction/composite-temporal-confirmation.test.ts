import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/composite-temporal-confirmation");
const read = (name: string) => readFileSync(resolve(root, name));
const hash = (name: string) => createHash("sha256").update(read(name)).digest("hex");

describe("frozen composite temporal confirmation", () => {
  it("pins eight cases before blind review and verifier execution", () => {
    const manifest = JSON.parse(read("input-manifest.json").toString()) as {
      status: string; caseCount: number; casesSha256: string;
    };
    expect(manifest).toMatchObject({ status: "FROZEN_BEFORE_BLIND_REVIEW_AND_EXECUTION", caseCount: 8 });
    expect(hash("cases.json")).toBe(manifest.casesSha256);
    const cases = JSON.parse(read("cases.json").toString()) as { id: string }[];
    expect(cases.map((item) => item.id)).toEqual(Array.from({ length: 8 }, (_, i) => `ct0${i + 1}`));
  });

  it("pins independent labels before execution and saved confirmation afterward", () => {
    const labels = JSON.parse(read("labels-manifest.json").toString()) as { status: string; files: Record<string, string> };
    expect(labels.status).toBe("FROZEN_BEFORE_VERIFIER_EXECUTION");
    for (const [name, expected] of Object.entries(labels.files)) expect(hash(name), name).toBe(expected);
    const results = JSON.parse(read("results-manifest.json").toString()) as { status: string; files: Record<string, string> };
    expect(results.status).toBe("FROZEN_AFTER_CONFIRMATION");
    for (const [name, expected] of Object.entries(results.files)) expect(hash(name), name).toBe(expected);
    const run = JSON.parse(read("replay.json").toString()) as { rows: { id: string }[] };
    expect(run.rows.map((item) => item.id)).toEqual(["ar04", ...Array.from({ length: 8 }, (_, i) => `ct0${i + 1}`)]);
  });
});
