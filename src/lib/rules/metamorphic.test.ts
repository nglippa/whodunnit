import { describe, expect, it } from "vitest";
import { computeVoiceprintStats } from "../voiceprints/aggregate";
import { analyzeWriting } from "./engine";
import { createRegistry } from "./packs";

const registry = createRegistry();
const matchesFor = (ruleId: string, text: string) => {
  const rule = registry.get(ruleId);
  if (!rule) throw new Error(`Missing rule ${ruleId}`);
  return analyzeWriting(text, [rule]).findings.flatMap((finding) => finding.matches);
};

describe("writing-rule metamorphic properties", () => {
  it.each([
    ["slop.throat-clearing", "Here's the thing: the queue is full."],
    ["slop.announcements", "It is worth noting that the queue is full."],
  ])("keeps %s findings when unrelated prose is appended", (rule, source) => {
    const original = matchesFor(rule, source);
    expect(original.length).toBeGreaterThan(0);
    const extended = matchesFor(rule, `${source} The operators checked the queue at noon.`);
    expect(extended).toEqual(original);
  });

  it.each([
    ["Here's the thing: the queue is full.", "Here’s the thing: the queue is full."],
    ["Let's be honest about the schedule.", "Let’s be honest about the schedule."],
  ])("treats straight and curly apostrophes alike in phrase findings", (straight, curly) => {
    const project = (text: string) => matchesFor("slop.throat-clearing", text).map((m) => ({ confidence: m.confidence, excerpt: text.slice(m.start, m.end).replace(/’/g, "'").toLowerCase() }));
    expect(project(straight).length).toBeGreaterThan(0);
    expect(project(curly)).toEqual(project(straight));
  });

  it("keeps a local phrase finding when its sentence moves to another paragraph", () => {
    const target = "Here's the thing: the queue is full.";
    const other = "The operators checked the queue at noon.";
    const inFirst = matchesFor("slop.throat-clearing", `${target}\n\n${other}`);
    const inSecond = matchesFor("slop.throat-clearing", `${other}\n\n${target}`);
    expect(inFirst).toHaveLength(1);
    expect(inSecond).toHaveLength(1);
    expect(inFirst[0].confidence).toBe(inSecond[0].confidence);
  });

  it("does not start a phrase finding inside a quoted example after quote style changes", () => {
    const straight = 'The style guide quotes "here is the thing" as an example.';
    const curly = "The style guide quotes “here is the thing” as an example.";
    expect(matchesFor("slop.throat-clearing", straight)).toEqual([]);
    expect(matchesFor("slop.throat-clearing", curly)).toEqual([]);
  });
});

describe("Voiceprint case stability", () => {
  it("preserves case independent measurements and recurring phrases", () => {
    const samples = [
      "I don't think the release can wait; we need a plan for Friday.",
      "I don't think the release can wait; we need a plan for Monday.",
    ];
    const original = computeVoiceprintStats(samples.map((text) => ({ text })))!;
    const lower = computeVoiceprintStats(samples.map((text) => ({ text: text.toLowerCase() })))!;
    expect(lower.totalWords).toBe(original.totalWords);
    expect(lower.stats.vocabulary.contractionRate).toEqual(original.stats.vocabulary.contractionRate);
    expect(lower.stats.vocabulary.firstPersonRate).toEqual(original.stats.vocabulary.firstPersonRate);
    expect(lower.stats.recurringPhrases).toEqual(original.stats.recurringPhrases);
  });
});
