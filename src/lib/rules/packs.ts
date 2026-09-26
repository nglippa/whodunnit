import type { StyleProfile } from "@/domain/style";
import type { RulePackInput } from "@/domain/writing-rules";
import core from "../../../data/rules/packs/core.json";
import antiSlop from "../../../data/rules/packs/anti-slop.json";
import semanticSafety from "../../../data/rules/packs/semantic-safety.json";
import styles from "../../../data/rules/packs/styles.json";
import imported from "../../../data/rules/packs/imported.json";
import { WritingRuleRegistry, type RegisteredRule } from "./registry";

/**
 * Built-in rule packs live as JSON under data/rules/packs so they can be read,
 * diffed and reviewed without touching code. They are validated when the
 * registry loads; an invalid pack fails loudly in development and tests.
 */

export const BUILTIN_PACKS: RulePackInput[] = [
  semanticSafety as RulePackInput,
  core as RulePackInput,
  antiSlop as RulePackInput,
  ...(styles as RulePackInput[]),
  imported as RulePackInput,
];

let cached: WritingRuleRegistry | null = null;

export function createRegistry(packs: RulePackInput[] = BUILTIN_PACKS): WritingRuleRegistry {
  const r = new WritingRuleRegistry();
  for (const p of packs) r.registerPack(p);
  return r;
}

export function getRegistry(): WritingRuleRegistry {
  cached ??= createRegistry();
  return cached;
}

const STYLE_PACK: Partial<Record<string, string>> = {
  concise: "style-concise",
  academic: "style-academic",
  professional: "style-professional",
  casual: "style-casual",
  personal: "style-casual",
};

/** Pack composition for a style: shared packs plus the target's own style pack. */
export function packsForProfile(profile: StyleProfile): string[] {
  const packs = ["core", "anti-slop", "imported"];
  const stylePack = profile.kind === "preset" ? STYLE_PACK[profile.id] : undefined;
  if (stylePack) packs.push(stylePack);
  // A tight length budget (Concise, or a "Shorter" refinement) brings in the concise rules.
  if (profile.lengthRatio.max <= 0.9 && !packs.includes("style-concise")) packs.push("style-concise");
  return packs;
}

/** The executable (single-text) rules for a style. */
export function rulesForProfile(profile: StyleProfile, registry = getRegistry()): RegisteredRule[] {
  return registry.compose(packsForProfile(profile));
}

/** Everything that runs on a single text regardless of style (for neutral analysis). */
export function defaultRules(registry = getRegistry()): RegisteredRule[] {
  return registry.compose(["core", "anti-slop", "imported"]);
}
