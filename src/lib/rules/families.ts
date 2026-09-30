import { ruleFamiliesFileSchema, type RuleFamily, type RuleFinding } from "@/domain/writing-rules";
import familiesFile from "../../../data/rules/families.json";

/**
 * Rule families (data/rules/families.json). Validated on load; members must
 * exist in the registry (checked by rules:validate and the tests).
 */
export const RULE_FAMILIES: readonly RuleFamily[] = ruleFamiliesFileSchema.parse(familiesFile).families;
export const RULE_FAMILIES_VERSION: number = ruleFamiliesFileSchema.parse(familiesFile).version;

const byRule = new Map<string, RuleFamily>();
for (const f of RULE_FAMILIES) for (const m of f.members) byRule.set(m, f);

export function familyOf(ruleId: string): RuleFamily | undefined {
  return byRule.get(ruleId);
}

/** Source spans matched by rules whose family allows deleting the sentence (filler the rewrite may drop). */
export function removableSpans(findings: RuleFinding[]): [number, number][] {
  return findings
    .filter((f) => !f.suppressedBy && f.rule.severity !== "info" && familyOf(f.rule.id)?.removable)
    .flatMap((f) => f.matches.map((m) => [m.start, m.end] as [number, number]));
}

/** Families present in the text. Planning omits informational observations; descriptive comparison may retain them. */
export function activeFamilies(findings: RuleFinding[], actionableOnly = false): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of findings) {
    if (f.suppressedBy || (actionableOnly && f.rule.severity === "info")) continue;
    const fam = familyOf(f.rule.id);
    if (!fam) continue;
    out.set(fam.id, [...(out.get(fam.id) ?? []), f.rule.id]);
  }
  return out;
}

/** Which families were resolved, which persisted (possibly via a reworded member), which appeared. */
export function familyDiff(before: RuleFinding[], after: RuleFinding[]) {
  const b = activeFamilies(before);
  const a = activeFamilies(after);
  return {
    resolved: [...b.keys()].filter((k) => !a.has(k)),
    persisted: [...b.keys()].filter((k) => a.has(k)).map((k) => ({ family: k, before: b.get(k)!, after: a.get(k)! })),
    introduced: [...a.keys()].filter((k) => !b.has(k)),
  };
}
