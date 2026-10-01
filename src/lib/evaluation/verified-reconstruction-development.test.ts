import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("data/fixtures/verified-reconstruction-development");
const read = (name: string) => readFileSync(resolve(root, name));
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("v10 synthetic development replay", () => {
  it("pins the creator corpus, model responses, blind audits, and initial/final runs", () => {
    expect(hash(read("manifest.json"))).toBe("c792202571fa3fd4dcafce989d7fd09435b686671417b25f289fe0d161233afc");
    const manifest = JSON.parse(read("manifest.json").toString("utf8")) as { files: Record<string, string> };
    expect(Object.keys(manifest.files)).toHaveLength(13);
    for (const [name, expected] of Object.entries(manifest.files)) expect(hash(read(name))).toBe(expected);
  });

  it("keeps editorial expectations out of editor and verifier requests", () => {
    const cases = JSON.parse(read("cases.json").toString("utf8")) as { id: string; editorialExpectation: string }[];
    const editor = JSON.parse(read("editor-requests.json").toString("utf8")) as { requests: { id: string; user: string }[] };
    const verifier = JSON.parse(read("verifier-requests.json").toString("utf8")) as { requests: { user: string }[] };
    expect(cases).toHaveLength(32);
    expect(editor.requests.map((item) => item.id)).toEqual(cases.map((item) => item.id));
    for (const request of [...editor.requests, ...verifier.requests]) expect(request.user).not.toContain("editorialExpectation");
  });
});
