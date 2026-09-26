import {
  rulePackSchema,
  writingRuleSchema,
  type DeterminismLevel,
  type RuleCategory,
  type RuleLayer,
  type RulePack,
  type RulePackInput,
  type SourceType,
  type WritingRule,
  type WritingRuleInput,
} from "@/domain/writing-rules";
import { checkPattern } from "./regex-safety";

/**
 * The central rule registry. Packs and rules are validated on registration,
 * ids are unique across all packs, and every query returns resolved rules
 * (layer inherited from the pack) that the engine can execute directly.
 */

export interface RegisteredRule extends WritingRule {
  layer: RuleLayer;
  packId: string;
}

export class RuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleRegistryError";
  }
}

export interface RuleQuery {
  packIds?: string[];
  category?: RuleCategory;
  tag?: string;
  sourceType?: SourceType;
  determinism?: DeterminismLevel;
  enabledOnly?: boolean;
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export class WritingRuleRegistry {
  private readonly rules = new Map<string, RegisteredRule>();
  private readonly packs = new Map<string, Omit<RulePack, "rules">>();

  registerPack(input: RulePackInput): void {
    const parsed = rulePackSchema.safeParse(input);
    if (!parsed.success) throw new RuleRegistryError(`Invalid rule pack ${(input as { id?: string }).id ?? "?"}: ${formatIssues(parsed.error.issues)}`);
    const pack = parsed.data;
    if (this.packs.has(pack.id)) throw new RuleRegistryError(`Rule pack "${pack.id}" is already registered`);
    const seen = new Set<string>();
    for (const r of pack.rules) {
      if (seen.has(r.id) || this.rules.has(r.id)) throw new RuleRegistryError(`Duplicate rule id "${r.id}" (pack "${pack.id}")`);
      seen.add(r.id);
      this.assertExecutable(r);
    }
    const { rules, ...meta } = pack;
    this.packs.set(pack.id, meta);
    for (const r of rules) this.rules.set(r.id, { ...r, layer: r.layer ?? pack.layer, packId: pack.id });
  }

  register(input: WritingRuleInput, packId: string): void {
    const pack = this.packs.get(packId);
    if (!pack) throw new RuleRegistryError(`Unknown pack "${packId}"`);
    const parsed = writingRuleSchema.safeParse(input);
    if (!parsed.success) throw new RuleRegistryError(`Invalid rule: ${formatIssues(parsed.error.issues)}`);
    if (this.rules.has(parsed.data.id)) throw new RuleRegistryError(`Duplicate rule id "${parsed.data.id}"`);
    this.assertExecutable(parsed.data);
    this.rules.set(parsed.data.id, { ...parsed.data, layer: parsed.data.layer ?? pack.layer, packId });
  }

  private assertExecutable(r: WritingRule) {
    if (r.detection.kind === "regex") {
      const check = checkPattern(r.detection.pattern, r.detection.flags);
      if (!check.ok) throw new RuleRegistryError(`Rule "${r.id}" has an unsafe pattern: ${check.problems.join(" ")}`);
    }
  }

  setEnabled(id: string, enabled: boolean): void {
    const r = this.rules.get(id);
    if (!r) throw new RuleRegistryError(`Unknown rule "${id}"`);
    this.rules.set(id, { ...r, enabled });
  }

  get(id: string): RegisteredRule | undefined {
    return this.rules.get(id);
  }

  listPacks(): Omit<RulePack, "rules">[] {
    return [...this.packs.values()];
  }

  query(q: RuleQuery = {}): RegisteredRule[] {
    return [...this.rules.values()].filter(
      (r) =>
        (!q.packIds || q.packIds.includes(r.packId)) &&
        (!q.category || r.category === q.category) &&
        (!q.tag || r.tags.includes(q.tag)) &&
        (!q.sourceType || r.source.type === q.sourceType) &&
        (!q.determinism || r.determinism === q.determinism) &&
        (!q.enabledOnly || r.enabled),
    );
  }

  /**
   * Compose packs into an executable rule set: enabled rules only, in pack
   * order. Later packs cannot redefine a rule id (registration forbids it), so
   * composition is order-independent apart from display order.
   */
  compose(packIds: string[], options: { disable?: string[] } = {}): RegisteredRule[] {
    const unknown = packIds.filter((id) => !this.packs.has(id));
    if (unknown.length) throw new RuleRegistryError(`Unknown packs: ${unknown.join(", ")}`);
    const off = new Set(options.disable ?? []);
    return packIds.flatMap((pid) => [...this.rules.values()].filter((r) => r.packId === pid && r.enabled && !off.has(r.id)));
  }
}
