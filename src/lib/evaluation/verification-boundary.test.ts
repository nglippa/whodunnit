import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/verification-boundary-development");
const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const hash = (name: string) => createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");

describe("frozen verification-boundary inputs", () => {
  it("pins source, objective, candidate, and blind reviews before V10 execution", () => {
    const manifest = read("manifest.json");
    expect(manifest.status).toBe("FROZEN_BEFORE_V10");
    expect(hash("manifest.json")).toBe("0de870df867bad7e0b6021d617e4287ff89014a02d54360cd12c917ce59bff5a");
    for (const [name, fingerprint] of Object.entries(manifest.files)) expect(hash(name)).toBe(fingerprint);
    const cases = read("cases.json") as { id: string; source: string; objective: string; candidate: string }[];
    expect(cases).toHaveLength(28);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    for (const name of ["first-reviews.json", "second-reviews.json"]) {
      const reviews = read(name) as { id: string; verdict: string }[];
      expect(reviews.map((item) => item.id)).toEqual(cases.map((item) => item.id));
      expect(reviews.every((item) => ["ACCEPT", "REPAIRABLE", "REJECT", "AMBIGUOUS"].includes(item.verdict))).toBe(true);
    }
    const paired = cases.filter((item) => cases.some((other) => other.id !== item.id &&
      other.source === item.source && other.candidate === item.candidate && other.objective !== item.objective));
    expect(paired.length).toBeGreaterThanOrEqual(4);
  });

  it("preserves the unmodified V10 baseline and separates gold from verifier requests", () => {
    const baseline = read("baseline-manifest.json");
    expect(baseline.status).toBe("PINNED_V10_BASELINE");
    expect(hash("baseline-manifest.json")).toBe("0c5130e8b545cccf468dea70daaf614ba47fc5f86888bbbe95bb6a86d4ff76a5");
    for (const [name, fingerprint] of Object.entries(baseline.files)) expect(hash(name)).toBe(fingerprint);
    const cases = read("cases.json") as { id: string }[];
    const rows = read("baseline-v10.json").rows as { id: string; trace: { strategy: string } }[];
    expect(rows.map((row) => row.id)).toEqual(cases.map((item) => item.id));
    expect(rows.every((row) => row.trace.strategy === "reconstruction-v10")).toBe(true);
    const requests = read("verifier-requests.json").requests as { system: string; user: string }[];
    expect(requests.every((request) => !request.user.includes("editorialExpectation") &&
      !request.user.includes('"verdict":"ACCEPT"') && request.system.length > 0)).toBe(true);
  });

  it("keeps the later if-possible diagnostic outside the primary baseline", () => {
    const supplement = read("if-possible-manifest.json");
    expect(supplement.status).toBe("FROZEN_POST_BASELINE_DIAGNOSTIC");
    for (const [name, fingerprint] of Object.entries(supplement.files)) expect(hash(name)).toBe(fingerprint);
    expect(read("if-possible-result.json").id).toBe("vbS1");
    expect((read("baseline-v10.json").rows as { id: string }[]).some((row) => row.id === "vbS1")).toBe(false);
  });
});
