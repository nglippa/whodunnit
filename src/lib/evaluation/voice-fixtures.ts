import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PRESET_IDS, PRESETS } from "@/domain/style";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V3 } from "../reconstruction/strategies";
import { compareVoiceDevices } from "../semantics/voice-devices";
import { integrityReport, verifyDeterministic } from "../verification/verify";
import { semanticGate } from "./measures";

/**
 * Voice-device fixtures (data/evaluation/voice-fixtures.json): habits a
 * rewrite can erase or impose without touching a fact. Each positive case
 * must be reported; each negative control must come back PRESERVED.
 *
 * `dashRule` checks the other half of the dash conflict: deliberate dashes
 * make the dash-density rule yield to the source's voice (permitted), while
 * dashes inside slop keep it active (avoid). `semantic` checks that a pure
 * style change is not a meaning failure.
 */

export const voiceFixtureSchema = z
  .object({
    id: z.string().min(1),
    class: z.string().min(1),
    source: z.string().min(1),
    output: z.string().min(1),
    style: z.enum(PRESET_IDS).optional(),
    expect: z
      .object({
        verdict: z.enum(["PRESERVED", "DEVIATION", "DAMAGED"]),
        /** "device:change", e.g. "dashes:erased". */
        deviation: z.string().regex(/^[a-z-]+:[a-z]+$/).optional(),
        dashRule: z.enum(["permitted", "avoid", "inactive"]).optional(),
        semantic: z.enum(["PASS", "NEEDS_REVIEW", "FAIL"]).optional(),
      })
      .strict(),
    provenance: z.string().min(1),
  })
  .strict();
export type VoiceFixture = z.infer<typeof voiceFixtureSchema>;

const fileSchema = z
  .object({ version: z.number().int(), description: z.string(), fixtures: z.array(voiceFixtureSchema) })
  .strict()
  .refine((f) => new Set(f.fixtures.map((x) => x.id)).size === f.fixtures.length, { error: "Fixture ids must be unique" });

const DASH_RULE = "slop.dash-density";

export function evaluateVoiceFixture(f: VoiceFixture) {
  const profile = PRESETS[f.style ?? "natural"];
  const plan = buildRewritePlan({ source: f.source, profile }, RECONSTRUCTION_V3);
  const report = compareVoiceDevices(f.source, f.output, plan.sourceVoice.slopDensity);
  const dashRule = plan.permitted.some((p) => p.ruleId === DASH_RULE) ? "permitted" : plan.avoid.some((a) => a.ruleId === DASH_RULE) ? "avoid" : "inactive";
  const semantic = f.expect.semantic
    ? semanticGate(verifyDeterministic(f.source, f.output, profile), f.output, [], { integrity: integrityReport(f.source, f.output, profile) }).verdict
    : null;
  const devs = report.deviations.map((d) => `${d.device}:${d.change}`);
  const passed =
    report.verdict === f.expect.verdict &&
    (!f.expect.deviation || devs.includes(f.expect.deviation)) &&
    (!f.expect.dashRule || dashRule === f.expect.dashRule) &&
    (!f.expect.semantic || semantic === f.expect.semantic);
  const got = `${report.verdict}${devs.length ? ` (${devs.join(", ")})` : ""}${f.expect.dashRule ? ` dash rule ${dashRule}` : ""}${semantic ? ` semantic ${semantic}` : ""}`;
  return { passed, report, dashRule, semantic, got };
}

export function loadVoiceFixtures(root: string) {
  return fileSchema.parse(JSON.parse(readFileSync(join(root, "data/evaluation/voice-fixtures.json"), "utf8"))).fixtures;
}

export function runVoiceFixtures(root: string) {
  const results = loadVoiceFixtures(root).map((f) => {
    const r = evaluateVoiceFixture(f);
    const e = f.expect;
    return { id: f.id, class: f.class, expected: [e.verdict, e.deviation, e.dashRule && `dash rule ${e.dashRule}`, e.semantic && `semantic ${e.semantic}`].filter(Boolean).join(" "), got: r.got, passed: r.passed };
  });
  return { results, passed: results.filter((r) => r.passed).length };
}
