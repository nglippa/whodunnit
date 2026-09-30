import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateSemanticReview } from "./semantic-review";

const data = <T>(name: string): T => JSON.parse(readFileSync(`data/fixtures/semantic-review-development/${name}`, "utf8")) as T;
type Control = { id: string; text: string; expected: string; pairId: string };
type Review = { id: string; review: unknown };

describe("synthetic substantive development controls", () => {
  it("keeps creator and independent red-team annotations separate", () => {
    const controls = data<Control[]>("substantive-controls.json");
    const redTeam = data<{ id: string; disposition: string }[]>("substantive-controls-redteam.json");
    expect(controls).toHaveLength(24);
    expect(new Set(controls.map((c) => c.id)).size).toBe(24);
    expect(new Set(controls.map((c) => c.pairId)).size).toBe(12);
    expect(new Set(redTeam.map((r) => r.id))).toEqual(new Set(controls.map((c) => c.id)));
  });

  it("validates saved v3 reviews against exact synthetic source spans", () => {
    const controls = new Map(data<Control[]>("substantive-controls.json").map((c) => [c.id, c]));
    const reviews = data<Review[]>("substantive-controls-v3-reviews.json");
    expect(new Set(reviews.map((r) => r.id))).toEqual(new Set(controls.keys()));
    for (const record of reviews) expect(() => validateSemanticReview(controls.get(record.id)!.text, record.review, 3)).not.toThrow();
  });

  it("pins the saved synthetic request and review artifacts for contract comparison", () => {
    const manifest = data<{ sha256: Record<string, string> }>("substantive-experiment-manifest.json");
    for (const [name, expected] of Object.entries(manifest.sha256)) {
      const bytes = readFileSync(`data/fixtures/semantic-review-development/${name}`);
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(expected);
    }
  });
});
