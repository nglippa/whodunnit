import { describe, expect, it } from "vitest";
import { rulePackSchema, writingRuleSchema, type WritingRuleInput } from "./writing-rules";
import { ruleCandidateSchema, sourceDocumentSchema } from "./sources";

const base: WritingRuleInput = {
  id: "test.rule",
  version: 1,
  name: "Test rule",
  description: "A test rule.",
  category: "lexical",
  severity: "suggestion",
  determinism: "deterministic",
  detection: { kind: "phrase", phrases: ["delve"] },
  remediation: { guidance: "Say it plainly." },
  source: { type: "builtin" },
};

describe("WritingRule schema", () => {
  it("accepts a well-formed rule and fills defaults", () => {
    const r = writingRuleSchema.parse(base);
    expect(r.enabled).toBe(true);
    expect(r.tags).toEqual([]);
    expect(r.detection).toMatchObject({ kind: "phrase", sentenceStart: false, minOccurrences: 1 });
  });

  it("keeps determinism honest: advisory rules cannot have detectors, detected rules must", () => {
    expect(writingRuleSchema.safeParse({ ...base, determinism: "advisory" }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, determinism: "model-assisted" }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, detection: { kind: "none" } }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, determinism: "advisory", detection: { kind: "none" } }).success).toBe(true);
  });

  it("only allows automatic transforms on deterministic rules", () => {
    const withTransform = { ...base, remediation: { guidance: "x", transform: { kind: "delete-match" as const } } };
    expect(writingRuleSchema.safeParse(withTransform).success).toBe(true);
    expect(writingRuleSchema.safeParse({ ...withTransform, determinism: "heuristic" }).success).toBe(false);
  });

  it("rejects bad ids, flags, unknown keys and invalid source URLs", () => {
    expect(writingRuleSchema.safeParse({ ...base, id: "Bad Id" }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, detection: { kind: "regex", pattern: "x", flags: "g" } }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, activateOnLoad: true }).success).toBe(false);
    expect(writingRuleSchema.safeParse({ ...base, source: { type: "webpage", url: "not a url" } }).success).toBe(false);
  });

  it("validates rule packs as a whole", () => {
    const pack = { id: "p", name: "P", description: "", version: 1, layer: "general", source: { type: "builtin" }, rules: [base] };
    expect(rulePackSchema.safeParse(pack).success).toBe(true);
    expect(rulePackSchema.safeParse({ ...pack, layer: "vibes" }).success).toBe(false);
  });
});

describe("source and candidate schemas", () => {
  const hash = "a".repeat(64);
  it("validates source metadata", () => {
    const doc = { id: "src", type: "webpage", title: "T", url: "https://example.com/x", usage: "derived-rules-only", contentHash: hash, status: "extracted" };
    expect(sourceDocumentSchema.safeParse(doc).success).toBe(true);
    expect(sourceDocumentSchema.safeParse({ ...doc, contentHash: "abc" }).success).toBe(false);
    expect(sourceDocumentSchema.safeParse({ ...doc, status: "live" }).success).toBe(false);
  });

  it("refuses an unreviewed candidate that carries an enabled rule, and long anchors", () => {
    const candidate = {
      id: "src.test",
      sourceDocumentId: "src",
      proposedRule: { ...base, enabled: false },
      anchor: { sectionAnchor: "s1", sectionHeading: "H", excerpt: "Short anchor." },
      detectionStrategy: "phrase",
      determinism: "deterministic",
      confidence: 0.5,
      origin: "heuristic-extractor",
      warnings: [],
      status: "candidate",
    };
    expect(ruleCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(ruleCandidateSchema.safeParse({ ...candidate, proposedRule: { ...base, enabled: true } }).success).toBe(false);
    expect(ruleCandidateSchema.safeParse({ ...candidate, anchor: { ...candidate.anchor, excerpt: "x".repeat(281) } }).success).toBe(false);
  });
});
