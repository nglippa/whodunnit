import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RuleCandidate } from "@/domain/sources";
import { writingRuleSchema, type WritingRule } from "@/domain/writing-rules";
import { words } from "../analysis/tokenize";
import { analyzeWriting } from "../rules/engine";
import type { RegisteredRule, WritingRuleRegistry } from "../rules/registry";
import { checkPattern } from "../rules/regex-safety";

/**
 * Validation shared by `rules:validate` (active packs) and candidate review:
 * schema, pattern safety, id collisions, the rule's own examples, and its
 * false-positive rate on a corpus of ordinary, clean prose.
 */

export interface RuleValidation {
  ruleId: string;
  errors: string[];
  warnings: string[];
  /** Matches per 1,000 words on the clean corpus. null when the rule has no detector. */
  falsePositivesPer1000: number | null;
}

/** Clean prose that should not trip deterministic rules: fixtures B–F. */
export function loadCleanCorpus(root: string): { name: string; text: string }[] {
  const dir = join(root, "data/fixtures/prose");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("a-"))
    .sort()
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
}

const asRegistered = (rule: WritingRule): RegisteredRule => ({ ...rule, enabled: true, layer: rule.layer ?? "general", packId: "validation" });

export function validateRule(rule: WritingRule, corpus: { name: string; text: string }[], options: { registry?: WritingRuleRegistry; allowExisting?: boolean } = {}): RuleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = writingRuleSchema.safeParse(rule);
  if (!parsed.success) {
    return { ruleId: rule.id, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), warnings, falsePositivesPer1000: null };
  }
  if (rule.detection.kind === "regex") {
    const c = checkPattern(rule.detection.pattern, rule.detection.flags);
    errors.push(...c.problems);
  }
  if (!options.allowExisting && options.registry?.get(rule.id)) errors.push(`A rule with id "${rule.id}" already exists.`);
  const detects = !["none", "comparison"].includes(rule.detection.kind);
  if (!detects || errors.length) return { ruleId: rule.id, errors, warnings, falsePositivesPer1000: null };

  const r = asRegistered(rule);
  for (const ex of rule.examples.problematic) {
    if (!analyzeWriting(ex, [r]).findings.length) warnings.push(`Problematic example does not trigger the rule: “${ex.slice(0, 60)}”.`);
  }
  for (const ex of rule.examples.preferred) {
    if (analyzeWriting(ex, [r]).findings.length) errors.push(`Preferred example triggers the rule: “${ex.slice(0, 60)}”.`);
  }
  let matches = 0;
  let total = 0;
  const hitIn: string[] = [];
  for (const doc of corpus) {
    total += words(doc.text).length;
    const f = analyzeWriting(doc.text, [r]).findings[0];
    if (f) {
      matches += f.matches.length;
      hitIn.push(doc.name);
    }
  }
  const fp = total ? Math.round((matches / total) * 1000 * 100) / 100 : 0;
  if (fp > 0) {
    const msg = `Fires on clean prose (${fp} per 1,000 words in ${hitIn.join(", ")}).`;
    // Style-layer rules only run for their own target; firing on general prose is expected.
    if (rule.determinism === "deterministic" && fp > 5 && rule.layer !== "style") errors.push(msg);
    else warnings.push(rule.layer === "style" ? `${msg} Expected: style rules only run for their target.` : msg);
  }
  return { ruleId: rule.id, errors, warnings, falsePositivesPer1000: fp };
}

export function validateCandidate(candidate: RuleCandidate, corpus: { name: string; text: string }[], registry?: WritingRuleRegistry): RuleValidation {
  const v = validateRule(candidate.proposedRule, corpus, { registry });
  return { ...v, warnings: [...candidate.warnings, ...v.warnings] };
}
