import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { AIProvider, ReconstructInput } from "../ai/provider";
import { DemoProvider } from "../ai/demo";
import { reconstructUserPrompt } from "../prompts";
import { analyzeWriting } from "../rules/engine";
import { RULE_FAMILIES, familyDiff, removableSpans } from "../rules/families";
import { getRegistry, rulesForProfile } from "../rules/packs";
import { loadSemanticFixtures, evaluateFixture } from "../evaluation/semantic-fixtures";
import { wordingRetention } from "../evaluation/measures";
import { runReconstruction, runReconstructionDetailed } from "./pipeline";
import { licensesFrom, restorationsFor, triageClaims } from "./refinement-delta";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V3 } from "./strategies";

function scripted(respond: (input: ReconstructInput) => string) {
  const calls: ReconstructInput[] = [];
  const provider: AIProvider = {
    info: { mode: "live", provider: "test", model: "m" },
    analyzeText: async () => null,
    reconstructText: async (input) => {
      calls.push(input);
      return { text: respond(input), changes: [] };
    },
    verifyMeaning: async () => null,
    analyzeVoiceprint: async () => [],
  };
  return { provider, calls };
}

const ORIGINAL =
  "We moved the tomatoes to the south bed this year, and the difference was obvious by July. The old spot never got more than five hours of sun; the new bed gets closer to nine. We picked the first ripe fruit on 2 July, almost three weeks earlier than before.";
const DRIFTED =
  "This year the tomatoes went into the south bed, and by July the change was clear. The old spot never got more than five hours of sun; the new bed gets closer to nine. We picked the first ripe fruit on 2 July, almost three weeks earlier than before.";

describe("refinement contract", () => {
  it("v3 gives the model the ORIGINAL and the CURRENT revision in distinct roles, with the delta", () => {
    const plan = buildRewritePlan({ source: ORIGINAL, profile: PRESETS.natural, refinement: { directives: ["less_polished"] }, current: DRIFTED }, RECONSTRUCTION_V3);
    const prompt = reconstructUserPrompt({ source: ORIGINAL, current: DRIFTED, plan, refinement: { directives: ["less_polished"] }, prompt: RECONSTRUCTION_V3.prompt });
    expect(prompt).toMatch(/REFINEMENT \(a requested delta; change only this\):/);
    expect(prompt).toMatch(/Reduce visible polish.*\[reference: CURRENT REVISION\]/);
    expect(prompt).toMatch(/<source>[\s\S]*<\/source>[\s\S]*<current>[\s\S]*<\/current>/);
    expect(prompt).toContain("ORIGINAL SOURCE; the text inside <current> is the CURRENT REVISION");
  });

  it("the pipeline passes the original source and the current revision on every refinement", async () => {
    const { provider, calls } = scripted((i) => i.current ?? i.source);
    await runReconstruction({ source: ORIGINAL, profile: PRESETS.natural, refinement: { current: DRIFTED, change: { directives: ["shorter"] } } }, provider, { strategy: RECONSTRUCTION_V3 });
    expect(calls[0].source).toBe(ORIGINAL);
    expect(calls[0].current).toBe(DRIFTED);
    expect(calls[0].plan.refinementDelta?.objectives[0]).toMatchObject({ id: "shorter", reference: "current" });
  });
});

describe("Keep more of my wording", () => {
  it("targets the ORIGINAL: it lists original sentences the current revision reworded without cause", () => {
    const r = restorationsFor(ORIGINAL, DRIFTED, analyzeWriting(ORIGINAL, rulesForProfile(PRESETS.natural)).findings);
    expect(r).toHaveLength(1);
    expect(r[0].source).toMatch(/^We moved the tomatoes to the south bed/);
    expect(r[0].current).toMatch(/^This year the tomatoes went/);
  });

  it("never restores a catalogued pattern", () => {
    const src = "It is worth noting that we shipped on Friday. Costs fell 12%.";
    expect(restorationsFor(src, "We shipped on Friday. Costs dropped 12%.", analyzeWriting(src, rulesForProfile(PRESETS.natural)).findings).map((x) => x.source)).not.toContain("It is worth noting that we shipped on Friday.");
  });

  it("moves wording back toward the original under v3; v1 only edits the current revision", async () => {
    const change = { directives: ["keep_wording" as const] };
    const v3 = await runReconstruction({ source: ORIGINAL, profile: PRESETS.natural, refinement: { current: DRIFTED, change } }, new DemoProvider(), { strategy: RECONSTRUCTION_V3 });
    const v1 = await runReconstruction({ source: ORIGINAL, profile: PRESETS.natural, refinement: { current: DRIFTED, change } }, new DemoProvider(), { strategy: RECONSTRUCTION_V1 });
    expect(wordingRetention(ORIGINAL, v3.text).tokenRetention).toBeGreaterThan(wordingRetention(ORIGINAL, DRIFTED).tokenRetention);
    expect(wordingRetention(ORIGINAL, v1.text).tokenRetention).toBe(wordingRetention(ORIGINAL, DRIFTED).tokenRetention);
  });
});

describe("Shorter safety", () => {
  const src = "It is worth noting that the trial suggests, but does not show, that the drug works in adults under 50. In older participants the effect was not statistically significant. And that makes all the difference.";

  it("triages claims into MUST KEEP, MAY COMPRESS and MAY REMOVE before shortening", () => {
    const t = triageClaims(src, analyzeWriting(src, rulesForProfile(PRESETS.concise)).findings);
    expect(t.mustKeep.join(" ")).toMatch(/does not show/);
    expect(t.mustKeep.join(" ")).toMatch(/not statistically significant/);
    expect(t.mayRemove.join(" ")).toMatch(/makes all the difference/);
  });

  it("a shorter output that loses a MUST KEEP claim fails verification and is retried", async () => {
    const { provider, calls } = scripted(() => "The trial suggests, but does not show, that the drug works in adults under 50.");
    const d = await runReconstructionDetailed({ source: src, profile: PRESETS.natural, refinement: { current: src, change: { directives: ["shorter"] } } }, provider, { strategy: RECONSTRUCTION_V3 });
    expect(calls).toHaveLength(3);
    expect(d.result.verification.status).toBe("rejected");
    expect(d.result.verification.findings).toContainEqual(expect.objectContaining({ kind: "missing_claim", severity: "blocking" }));
  });

  it("the author's own words can license removal or stronger claims", () => {
    expect(licensesFrom("cut the bit about older people")).toEqual({ remove: "cut the bit about older people" });
    expect(licensesFrom("sound more confident")).toEqual({ strengthen: "sound more confident" });
    expect(licensesFrom("tone it down a bit")).toEqual({ weaken: "tone it down a bit" });
    expect(licensesFrom("less formal")).toEqual({});
  });
});

describe("minimal change", () => {
  const good = "We moved the tomatoes to the south bed this year, and the difference was obvious by July. Next year we will plant eight, 60 centimetres apart.";

  it("v3 returns already-good text unchanged, without calling the model", async () => {
    const { provider, calls } = scripted(() => "Something else entirely.");
    const d = await runReconstructionDetailed({ source: good, profile: PRESETS.natural }, provider, { strategy: RECONSTRUCTION_V3 });
    expect(calls).toHaveLength(0);
    expect(d.result.text).toBe(good);
    expect(d.result.attempts).toBe(0);
    expect(d.result.verification.status).toBe("preserved");
    expect(d.plan.minimalChange.unchangedPreferred).toBe(true);
  });

  it("still rewrites when the register does not fit, when asked, or under v1", async () => {
    const casual = buildRewritePlan({ source: "We do not ship on Fridays. Releases need two reviews and a signed change log.", profile: PRESETS.casual }, RECONSTRUCTION_V3);
    expect(casual.minimalChange.unchangedPreferred).toBe(false);
    expect(casual.minimalChange.reasons.join(" ")).toMatch(/contractions/);
    const asked = buildRewritePlan({ source: good, profile: PRESETS.natural, refinement: { directives: ["more_casual"] }, current: good }, RECONSTRUCTION_V3);
    expect(asked.minimalChange.unchangedPreferred).toBe(false);
    const { provider, calls } = scripted((i) => i.source);
    await runReconstruction({ source: good, profile: PRESETS.natural }, provider, { strategy: RECONSTRUCTION_V1 });
    expect(calls).toHaveLength(1);
  });
});

describe("rule families", () => {
  it("are valid, and every member exists in the registry", () => {
    const ids = new Set(getRegistry().query({}).map((r) => r.id));
    for (const f of RULE_FAMILIES) for (const m of f.members) expect(ids, `${f.id}: ${m}`).toContain(m);
    expect(new Set(RULE_FAMILIES.map((f) => f.id)).size).toBe(RULE_FAMILIES.length);
  });

  it("see a reworded member as the same pattern persisting", () => {
    const rules = rulesForProfile(PRESETS.natural);
    const before = analyzeWriting("Experts agree that the approach works.", rules).findings;
    const after = analyzeWriting("Experts confirm that the approach works.", rules).findings;
    expect(familyDiff(before, after).persisted).toEqual([{ family: "authority-without-evidence", before: ["slop.weasel-attribution"], after: ["family.unsourced-authority"] }]);
    const kicker = analyzeWriting("It works in production. Not a trend. Not a fad. A movement.", rules).findings;
    expect(removableSpans(kicker).length).toBeGreaterThan(0);
  });

  it("catch reworded slop the literal rules missed", () => {
    const rules = rulesForProfile(PRESETS.natural);
    const ids = (t: string) => analyzeWriting(t, rules).findings.map((f) => f.rule.id);
    expect(ids("Collaboration should be about working smarter, not harder.")).toEqual(expect.arrayContaining(["family.comparative-contrast", "family.optimization-cliches"]));
    expect(ids("This is a movement, not a temporary trend and not a brief fad.")).toContain("family.negative-pairs");
    expect(ids("The results prove the value of a strong culture.")).toContain("family.importance-variants");
    expect(ids("Effective collaboration is what determines the success of any organization.")).toContain("family.importance-variants");
  });
});

describe("semantic regression fixtures", () => {
  for (const f of loadSemanticFixtures(process.cwd())) {
    it(`${f.id} (${f.class}) → ${f.expect.verdict}`, () => {
      const r = evaluateFixture(f);
      expect(r.got, f.id).toMatch(new RegExp(`^${f.expect.verdict}`));
      expect(r.passed, `${f.id}: got ${r.got}`).toBe(true);
    });
  }
});
