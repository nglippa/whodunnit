import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V3 } from "../reconstruction/strategies";
import { analyzeWriting } from "./engine";
import { rulesForProfile } from "./packs";
import type { TargetConstraint } from "./constraints";

type CorpusCase = { id: string; tags: string[]; text: string; expectedRuleIds?: string[]; observedRuleIds?: string[]; expectAction?: boolean };
const read = (name: string): CorpusCase[] => JSON.parse(readFileSync(join(process.cwd(), "data/fixtures/writing-intelligence", name), "utf8")) as CorpusCase[];
const clean = read("clean.json");
const adversarial = read("adversarial.json");
const rules = rulesForProfile(PRESETS.natural);
const activeIds = (text: string) => analyzeWriting(text, rules).findings
  .filter((f) => !f.suppressedBy && f.rule.severity !== "info")
  .map((f) => f.rule.id);

describe("synthetic writing intelligence corpus", () => {
  it("covers independent voices and attack shapes without duplicate passages", () => {
    const required = ["casual", "professional", "academic", "technical", "messy", "terse", "long-form", "conversational", "personal", "formal", "fragment-heavy", "dash-heavy", "lowercase", "intentional-repetition", "structured-triad", "list", "plain-language", "first-person", "quote-heavy"];
    const tags = new Set(clean.flatMap((c) => c.tags));
    for (const tag of required) expect(tags.has(tag), tag).toBe(true);
    const all = [...clean, ...adversarial];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.text)).size).toBe(all.length);
    expect(all.every((c) => c.text.trim().length > 25)).toBe(true);
    expect(adversarial.some((c) => c.tags.includes("overlap"))).toBe(true);
    expect(adversarial.some((c) => c.tags.includes("short"))).toBe(true);
  });

  for (const c of clean) {
    it(`does not target clean ${c.id} prose`, () => {
      const ids = activeIds(c.text);
      const plan = buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V3);
      const devices = ["slop.dramatic-fragments", "slop.dash-density", "core.repeated-sentence-openers"];
      expect(ids.filter((id) => !devices.includes(id)), c.id).toEqual([]);
      expect({ planned: plan.avoid.map((a) => a.ruleId), unchanged: plan.minimalChange.unchangedPreferred }, c.id)
        .toEqual({ planned: [], unchanged: true });
    });
  }

  for (const c of adversarial) {
    it(`makes a contextual decision for ${c.id}`, () => {
      const ids = activeIds(c.text);
      const plan = buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V3);
      for (const id of c.expectedRuleIds ?? []) {
        expect(ids, `${c.id}: ${id}`).toContain(id);
        expect(plan.avoid.map((a) => a.ruleId), `${c.id}: ${id}`).toContain(id);
      }
      for (const id of c.observedRuleIds ?? [])
        expect(plan.analysis.findings.map((f) => f.rule.id), `${c.id}: observed ${id}`).toContain(id);
      expect(plan.minimalChange.unchangedPreferred).toBe(c.expectAction === false);
      if (c.expectAction === false) expect(plan.avoid, c.id).toEqual([]);
    });
  }

  it("keeps a short formulaic opener actionable without a length threshold", () => {
    const c = adversarial.find((item) => item.id === "short-formula")!;
    const analysis = analyzeWriting(c.text, rules);
    expect(analysis.metrics.words).toBeLessThan(12);
    expect(activeIds(c.text)).toContain("slop.throat-clearing");
  });

  it("records a formal summary opener without deleting it on sight", () => {
    const source = "It is worth noting that the inspection found no leak in the west pipe. The north valve still needs a new seal.\n\nIn conclusion, the building can reopen after the valve is repaired.";
    const plan = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(plan.analysis.findings.find((f) => f.rule.id === "slop.summary-openers")?.rule.severity).toBe("info");
    expect(plan.avoid.map((p) => p.ruleId)).not.toContain("slop.summary-openers");
    expect(plan.families.map((f) => f.id)).not.toContain("fake-profound-conclusion");
    expect(plan.removableSpans.some(([start, end]) => source.slice(start, end).includes("In conclusion"))).toBe(false);
  });

  it("treats business verbs as a context-dependent observation", () => {
    const source = clean.find((c) => c.id === "business-register")!.text;
    const plan = buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(plan.analysis.findings.find((f) => f.rule.id === "slop.corporate-verbs")?.rule.severity).toBe("info");
    expect(plan.avoid.map((p) => p.ruleId)).not.toContain("slop.corporate-verbs");
    expect(plan.families.map((f) => f.id)).not.toContain("generic-optimization-cliche");
    expect(plan.minimalChange.unchangedPreferred).toBe(true);
  });

  it("preserves hedged facts, a quote, and a negation while proposing a rewrite", () => {
    const c = adversarial.find((item) => item.id === "hedged-fact-and-quote")!;
    const plan = buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    expect(plan.preserve.numbers).toContain("17%");
    expect(plan.preserve.dates).toContain("March 12");
    expect(plan.preserve.quotations).toContain("the count may change.");
    expect(plan.preserve.negations).toBeGreaterThan(0);
    expect(plan.avoid.map((a) => a.ruleId)).toContain("slop.announcements");
  });

  it.each([
    { id: "dash-heavy", ruleId: "slop.dash-density", dimension: "punctuation.dashes" as const },
    { id: "fragment-heavy", ruleId: "slop.dramatic-fragments", dimension: "voice.fragments" as const },
  ])("suppresses a measured author habit in $id when stronger evidence permits it", ({ id, ruleId, dimension }) => {
    const source = clean.find((c) => c.id === id)!.text;
    const baseline = analyzeWriting(source, rules);
    const value = dimension === "punctuation.dashes" ? baseline.metrics.per100.dashes : baseline.metrics.shares.fragments;
    const constraint: TargetConstraint = { dimension, min: value - 0.01, max: value + 0.01, layer: "voiceprint", strength: 0.9, origin: "Measured author habit", unit: "" };
    const permitted = analyzeWriting(source, rules, { constraints: [constraint] });
    expect(baseline.findings.map((f) => f.rule.id)).toContain(ruleId);
    expect(permitted.findings.find((f) => f.rule.id === ruleId)?.suppressedBy?.layer).toBe("voiceprint");
    expect(permitted.summary.patternCount).toBeLessThan(baseline.summary.patternCount);
  });
});
