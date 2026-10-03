import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareRunDirectory, responseMap, verifyV3Integrity, V3_MANIFEST_SHA256 } from "./holdout-v3-runner";

describe("frozen V3 offline response contract", () => {
  const ids = new Set(["synthetic-a", "synthetic-b"]);
  it("accepts structured data without altering it", () => {
    const data = { text: "Synthetic source.", changes: [] };
    expect(responseMap([{ id: "synthetic-a", data }], ids, "editor").get("synthetic-a")).toEqual(data);
  });
  it("rejects duplicate IDs, extras, and non-envelope fields", () => {
    expect(() => responseMap([{ id: "synthetic-a", data: {} }, { id: "synthetic-a", data: {} }], ids, "editor")).toThrow("duplicate");
    expect(() => responseMap([{ id: "other", data: {} }], ids, "editor")).toThrow("extra");
    expect(() => responseMap([{ id: "synthetic-a", data: {}, reason: "extra" }], ids, "editor")).toThrow();
  });
  it("verifies the externally anchored 119-case frozen corpus without parsing labels", () => {
    expect(V3_MANIFEST_SHA256).toHaveLength(64);
    expect(verifyV3Integrity()).toHaveLength(119);
  });
});


describe("V3 artifact containment", () => {
  it("rejects run root symlinks to pre-review, creation, and frozen before creating descendants", () => {
    for (const target of ["pre-review", "creation", "frozen"]) {
      const temp = realpathSync(mkdtempSync(resolve(tmpdir(), "v3-containment-")));
      try {
        mkdirSync(resolve(temp, target));
        symlinkSync(resolve(temp, target), resolve(temp, "run"), "dir");
        expect(() => prepareRunDirectory(resolve(temp, "run", "new-artifacts"), temp)).toThrow("unsafe artifact directory");
        expect(existsSync(resolve(temp, target, "new-artifacts"))).toBe(false);
      } finally { rmSync(temp, { recursive: true, force: true }); }
    }
  });
  it("rejects nested run symlinks and direct writes outside run", () => {
    const temp = realpathSync(mkdtempSync(resolve(tmpdir(), "v3-containment-")));
    try {
      mkdirSync(resolve(temp, "run")); mkdirSync(resolve(temp, "pre-review"));
      symlinkSync(resolve(temp, "pre-review"), resolve(temp, "run", "linked"), "dir");
      expect(() => prepareRunDirectory(resolve(temp, "run", "linked", "new-artifacts"), temp)).toThrow("unsafe artifact directory");
      expect(() => prepareRunDirectory(resolve(temp, "creation"), temp)).toThrow("artifacts must be under");
      expect(existsSync(resolve(temp, "pre-review", "new-artifacts"))).toBe(false);
      expect(prepareRunDirectory(resolve(temp, "run", "safe"), temp)).toBe(resolve(temp, "run", "safe"));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
