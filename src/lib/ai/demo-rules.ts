import type { Refinement } from "@/domain/refinement";
import type { StyleProfile } from "@/domain/style";
import { analyzeWriting } from "../rules/engine";
import { rulesForProfile } from "../rules/packs";
import { applyRuleTransforms, type AppliedTransform } from "../rules/transforms";
import { applyStyleTransforms } from "../rules/style-transforms";
import type { TargetConstraint } from "../rules/constraints";

/**
 * The demo engine, driven by the rule system. It analyses the text with the
 * rules for the chosen style, applies only the deterministic transforms those
 * rules own (delete an announcement, map a wordy phrase, collapse a chain of
 * connectives), then the style's register edits (contractions, connectives).
 *
 * It does not paraphrase: rhythm, openings and structure are reported as
 * remaining patterns, not rewritten. A model is needed for that.
 */
export function applyDemoRules(
  text: string,
  profile: StyleProfile,
  refinement?: Refinement,
  constraints: TargetConstraint[] = [],
  options: { minimal?: boolean } = {},
): { text: string; applied: string[]; transforms: AppliedTransform[] } {
  const keepWording = profile.wordingRetention === "high" || Boolean(refinement?.directives.includes("keep_wording"));
  const rules = rulesForProfile(profile);
  const analysis = analyzeWriting(text, rules, { constraints });
  const byId = new Map(rules.map((r) => [r.id, r]));
  const ruleStep = applyRuleTransforms(text, analysis.findings, byId, { keepWording });
  const fired = new Set(analysis.findings.filter((f) => !f.suppressedBy).map((f) => f.rule.id));
  // Minimal intervention: fix what the rules found, but no register edits on text that needs none.
  const styleStep = options.minimal ? { text: ruleStep.text, applied: [] } : applyStyleTransforms(ruleStep.text, profile, keepWording, fired);
  const applied = [
    ...ruleStep.applied.map((a) => `${a.ruleName}: fixed ${a.count}`),
    ...styleStep.applied,
  ];
  return { text: styleStep.text.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1"), applied, transforms: ruleStep.applied };
}
