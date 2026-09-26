import { describe, expect, it } from "vitest";
import type { RulePackInput, WritingRuleInput } from "@/domain/writing-rules";
import { PRESETS } from "@/domain/style";
import { WritingRuleRegistry } from "./registry";
import { BUILTIN_PACKS, createRegistry, packsForProfile, rulesForProfile } from "./packs";
import { checkPattern } from "./regex-safety";

const rule = (id: string, extra: Partial<WritingRuleInput> = {}): WritingRuleInput => ({
  id,
  version: 1,
  name: id,
  description: "d",
  category: "lexical",
  severity: "suggestion",
  determinism: "deterministic",
  detection: { kind: "phrase", phrases: ["foo"] },
  remediation: { guidance: "g" },
  source: { type: "builtin" },
  ...extra,
});
const pack = (id: string, rules: WritingRuleInput[], layer: RulePackInput["layer"] = "general"): RulePackInput => ({
  id,
  name: id,
  description: "",
  version: 1,
  layer,
  source: { type: "builtin" },
  rules,
});

describe("WritingRuleRegistry", () => {
  it("rejects duplicate rule ids within a pack and across packs", () => {
    const r = new WritingRuleRegistry();
    expect(() => r.registerPack(pack("a", [rule("x.one"), rule("x.one")]))).toThrow(/Duplicate rule id/);
    r.registerPack(pack("b", [rule("x.two")]));
    expect(() => r.registerPack(pack("c", [rule("x.two")]))).toThrow(/Duplicate rule id/);
    expect(() => r.registerPack(pack("b", []))).toThrow(/already registered/);
  });

  it("rejects invalid definitions and unsafe patterns at registration", () => {
    const r = new WritingRuleRegistry();
    expect(() => r.registerPack(pack("a", [rule("x.bad", { determinism: "advisory" })]))).toThrow(/Invalid rule pack/);
    expect(() => r.registerPack(pack("b", [rule("x.redos", { determinism: "heuristic", detection: { kind: "regex", pattern: "(a+)+b" } })]))).toThrow(/unsafe pattern/);
  });

  it("inherits the pack layer unless the rule overrides it", () => {
    const r = new WritingRuleRegistry();
    r.registerPack(pack("s", [rule("x.a"), rule("x.b", { layer: "advisory", determinism: "advisory", detection: { kind: "none" } })], "style"));
    expect(r.get("x.a")?.layer).toBe("style");
    expect(r.get("x.b")?.layer).toBe("advisory");
  });

  it("composes packs in order, skipping disabled rules", () => {
    const r = new WritingRuleRegistry();
    r.registerPack(pack("one", [rule("a.1"), rule("a.2")]));
    r.registerPack(pack("two", [rule("b.1", { enabled: false }), rule("b.2")]));
    expect(r.compose(["two", "one"]).map((x) => x.id)).toEqual(["b.2", "a.1", "a.2"]);
    expect(r.compose(["one"], { disable: ["a.1"] }).map((x) => x.id)).toEqual(["a.2"]);
    r.setEnabled("a.2", false);
    expect(r.compose(["one"]).map((x) => x.id)).toEqual(["a.1"]);
    expect(() => r.compose(["nope"])).toThrow(/Unknown packs/);
  });

  it("queries by category, tag, source type and determinism", () => {
    const r = new WritingRuleRegistry();
    r.registerPack(pack("p", [rule("q.a", { tags: ["x"] }), rule("q.b", { category: "rhythm", source: { type: "webpage", url: "https://e.com" } })]));
    expect(r.query({ category: "rhythm" }).map((x) => x.id)).toEqual(["q.b"]);
    expect(r.query({ tag: "x" }).map((x) => x.id)).toEqual(["q.a"]);
    expect(r.query({ sourceType: "webpage" }).map((x) => x.id)).toEqual(["q.b"]);
    expect(r.query({ determinism: "heuristic" })).toEqual([]);
  });
});

describe("built-in packs", () => {
  it("all load, with unique ids and attribution on adapted rules", () => {
    const r = createRegistry();
    const all = r.query();
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(BUILTIN_PACKS.map((p) => p.id)).toEqual(expect.arrayContaining(["core", "anti-slop", "semantic-safety", "imported"]));
    for (const x of r.query({ packIds: ["anti-slop"] })) {
      expect(x.source.license, x.id).toBe("MIT");
      expect(x.source.url, x.id).toContain("petergyang/no-ai-slop");
    }
  });

  it("composes style-specific packs, and a tight length budget brings in the concise rules", () => {
    expect(packsForProfile(PRESETS.academic)).toContain("style-academic");
    expect(packsForProfile(PRESETS.natural)).not.toContain("style-concise");
    expect(packsForProfile({ ...PRESETS.natural, lengthRatio: { min: 0.5, max: 0.8 } })).toContain("style-concise");
    expect(rulesForProfile(PRESETS.natural).some((x) => x.packId === "semantic-safety")).toBe(false);
  });
});

describe("regex safety", () => {
  it("rejects catastrophic shapes, backreferences, bad flags and invalid syntax", () => {
    expect(checkPattern("(a+)+$").ok).toBe(false);
    expect(checkPattern("(.*|x)y").ok).toBe(false);
    expect(checkPattern("(a)\\1").ok).toBe(false);
    expect(checkPattern("abc", "g").ok).toBe(false);
    expect(checkPattern("([a-z]").ok).toBe(false);
    expect(checkPattern("\\bnot (?:just|only)\\b").ok).toBe(true);
  });
});
