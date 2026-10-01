import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/semantic-scope-validation");

describe("frozen semantic scope development inputs", () => {
  it("retains the frozen document, label, and blind review fingerprints", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")) as { status: string; files: Record<string, string> };
    expect(manifest.status).toBe("FROZEN_DEVELOPMENT");
    expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(["documents.json", "labels.json", "blind-reviews.json", "creator-requests.json"]));
    expect(manifest.files).not.toHaveProperty("reviewer-output.json");
    for (const [name, fingerprint] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex"), name).toBe(fingerprint);
    }
  });

  it("keeps evaluator labels separate from review requests", () => {
    const documents = JSON.parse(readFileSync(resolve(root, "documents.json"), "utf8")) as { id: string; text: string }[];
    const labels = JSON.parse(readFileSync(resolve(root, "labels.json"), "utf8")) as { id: string }[];
    expect(documents).toHaveLength(99);
    expect(labels.map((label) => label.id)).toEqual(documents.map((document) => document.id));
    expect(documents.every((document) => !Object.hasOwn(document, "scope") && !Object.hasOwn(document, "requestedScope"))).toBe(true);
  });
});
