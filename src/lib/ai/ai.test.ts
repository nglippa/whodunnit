import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { applyDemoRules } from "./demo-rules";
import { candidateSchema, meaningCheckSchema, parseModelJson } from "./schemas";
import { verifyDeterministic } from "../verification/verify";

describe("model response validation", () => {
  it("accepts a well-formed candidate, including a fenced JSON string", () => {
    const raw = '```json\n{"text":"Rewritten.","changes":["Shorter sentences"]}\n```';
    expect(parseModelJson(candidateSchema, raw)).toEqual({ ok: true, data: { text: "Rewritten.", changes: ["Shorter sentences"] } });
  });

  it("rejects non-JSON, empty text and unexpected keys", () => {
    expect(parseModelJson(candidateSchema, "Sure! Here is your text").ok).toBe(false);
    expect(parseModelJson(candidateSchema, { text: "", changes: [] }).ok).toBe(false);
    expect(parseModelJson(candidateSchema, { text: "x", changes: [], note: "I also added a fact" }).ok).toBe(false);
  });

  it("rejects meaning findings with unknown kinds or severities", () => {
    expect(parseModelJson(meaningCheckSchema, { findings: [{ kind: "vibes", severity: "blocking", message: "m" }] }).ok).toBe(false);
    expect(parseModelJson(meaningCheckSchema, { findings: [{ kind: "added_claim", severity: "fatal", message: "m" }] }).ok).toBe(false);
    expect(parseModelJson(meaningCheckSchema, { findings: [] }).ok).toBe(true);
  });

  it("never throws on hostile input", () => {
    for (const raw of [null, undefined, 42, "[]", "{", { findings: "none" }]) {
      expect(() => parseModelJson(meaningCheckSchema, raw)).not.toThrow();
    }
  });
});

describe("demo engine rules", () => {
  const sterile =
    "In today's fast-paced world, teams must leverage robust processes. It is worth noting that the March 3 release cut costs by 12% for Acme Corp. Furthermore, we do not expect delays. In conclusion, the plan is working.";

  it("removes stock phrasing and records what it did", () => {
    const { text, applied } = applyDemoRules(sterile, PRESETS.casual);
    expect(text).not.toMatch(/fast-paced|worth noting|In conclusion|Furthermore/);
    expect(text).toMatch(/don't expect delays/);
    expect(applied.length).toBeGreaterThan(2);
  });

  it("preserves protected facts, so its output passes the blocking checks", () => {
    for (const preset of Object.values(PRESETS)) {
      const { text } = applyDemoRules(sterile, preset);
      const v = verifyDeterministic(sterile, text, preset);
      expect(v.findings.filter((f) => f.severity === "blocking"), preset.id).toEqual([]);
    }
  });

  it("does not turn a chain of additive openers into a chain of “Also” (regression)", () => {
    const { text } = applyDemoRules("It works. Furthermore, it scales. Moreover, it is cheap. Additionally, it is fast.", PRESETS.natural);
    expect(text).toBe("It works. Also, it scales. It is cheap. It is fast.");
  });

  it("writes out contractions for formal targets", () => {
    expect(applyDemoRules("We don't know. It's early.", PRESETS.academic).text).toBe("We do not know. It is early.");
  });

  it("keeps more wording when asked", () => {
    const loose = applyDemoRules("Moreover, we utilize the tool.", PRESETS.natural).text;
    const kept = applyDemoRules("Moreover, we utilize the tool.", PRESETS.natural, { directives: ["keep_wording"] }).text;
    expect(loose).toBe("Also, we use the tool.");
    expect(kept).toBe("Moreover, we utilize the tool.");
  });
});
