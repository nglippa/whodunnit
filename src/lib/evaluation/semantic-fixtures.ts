import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CHANGE_ASPECTS, CLAIM_RELATIONS } from "@/domain/semantics";
import { PRESET_IDS, PRESETS } from "@/domain/style";
import { allChanges } from "../semantics/integrity";
import { integrityReport, verifyDeterministic } from "../verification/verify";
import { semanticGate } from "./measures";

/**
 * Semantic-integrity regression fixtures (data/evaluation/semantic-fixtures.json):
 * failure classes with positive cases that must be flagged and negative
 * controls that must pass. They test the deterministic layer only.
 */

export const semanticFixtureSchema = z
  .object({
    id: z.string().min(1),
    class: z.string().min(1),
    source: z.string().min(1),
    output: z.string().min(1),
    style: z.enum(PRESET_IDS).optional(),
    licenses: z.object({ strengthen: z.string().optional(), weaken: z.string().optional(), remove: z.string().optional() }).strict().optional(),
    expect: z
      .object({ verdict: z.enum(["PASS", "NEEDS_REVIEW", "FAIL"]), aspect: z.enum(CHANGE_ASPECTS).optional(), relation: z.enum(CLAIM_RELATIONS).optional() })
      .strict(),
    provenance: z.string().min(1),
  })
  .strict();
export type SemanticFixture = z.infer<typeof semanticFixtureSchema>;

export const semanticFixturesFileSchema = z
  .object({ version: z.number().int(), description: z.string(), fixtures: z.array(semanticFixtureSchema) })
  .strict()
  .refine((f) => new Set(f.fixtures.map((x) => x.id)).size === f.fixtures.length, { error: "Fixture ids must be unique" });

export function evaluateFixture(f: SemanticFixture) {
  const profile = PRESETS[f.style ?? "natural"];
  const ctx = { licenses: f.licenses };
  const verification = verifyDeterministic(f.source, f.output, profile, ctx);
  const integrity = integrityReport(f.source, f.output, profile, ctx);
  const gate = semanticGate(verification, f.output, [], { integrity });
  const changes = allChanges(integrity);
  const aspectOk = !f.expect.aspect || changes.some((c) => c.aspect === f.expect.aspect && (!f.expect.relation || c.relation === f.expect.relation));
  const got = `${gate.verdict}${changes.length ? ` (${[...new Set(changes.filter((c) => c.severity !== "minor").map((c) => `${c.relation}/${c.aspect}`))].join(", ")})` : ""}`;
  return { passed: gate.verdict === f.expect.verdict && aspectOk, gate, changes, got };
}

export function loadSemanticFixtures(root: string) {
  return semanticFixturesFileSchema.parse(JSON.parse(readFileSync(join(root, "data/evaluation/semantic-fixtures.json"), "utf8"))).fixtures;
}

export function runSemanticFixtures(root: string) {
  const results = loadSemanticFixtures(root).map((f) => {
    const r = evaluateFixture(f);
    return { id: f.id, class: f.class, expected: `${f.expect.verdict}${f.expect.aspect ? ` ${f.expect.relation ?? ""}/${f.expect.aspect}` : ""}`, got: r.got, passed: r.passed };
  });
  return { results, passed: results.filter((r) => r.passed).length };
}
