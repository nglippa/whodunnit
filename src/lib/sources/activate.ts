import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rulePackSchema, writingRuleSchema, type RulePackInput, type Severity } from "@/domain/writing-rules";
import { BUILTIN_PACKS, createRegistry } from "../rules/packs";
import type { SourceLibrary } from "./library";
import { loadCleanCorpus, validateCandidate } from "./validate";

/**
 * The only path from candidate to active rule: an explicit, human-run command.
 * The candidate is re-validated, optionally restated in the reviewer's own
 * words, written into data/rules/packs/imported.json, and the whole registry
 * is reloaded to prove it still composes.
 */

export interface ActivateOverrides {
  name?: string;
  description?: string;
  guidance?: string;
  severity?: Severity;
}

export function activateCandidate(lib: SourceLibrary, candidateId: string, overrides: ActivateOverrides = {}): { ruleId: string; warnings: string[] } {
  const found = lib.findCandidate(candidateId);
  if (!found) throw new Error(`No candidate "${candidateId}". Run rules:review <source> to list them.`);
  const { sourceId, candidate } = found;
  if (candidate.status !== "candidate") throw new Error(`Candidate "${candidateId}" is already ${candidate.status}.`);

  const registry = createRegistry();
  const validation = validateCandidate(candidate, loadCleanCorpus(lib.root), registry);
  if (validation.errors.length) throw new Error(`Candidate "${candidateId}" is not valid:\n- ${validation.errors.join("\n- ")}`);

  const rule = writingRuleSchema.parse({
    ...candidate.proposedRule,
    name: overrides.name ?? candidate.proposedRule.name,
    description: overrides.description ?? candidate.proposedRule.description,
    severity: overrides.severity ?? candidate.proposedRule.severity,
    remediation: { ...candidate.proposedRule.remediation, guidance: overrides.guidance ?? candidate.proposedRule.remediation.guidance },
    source: { ...candidate.proposedRule.source, importedAt: new Date().toISOString() },
    enabled: true,
  });

  const packPath = join(lib.root, "data/rules/packs/imported.json");
  const pack = rulePackSchema.parse(JSON.parse(readFileSync(packPath, "utf8")));
  const nextPack = { ...pack, rules: [...pack.rules, rule] };
  // Prove the registry still loads with the new rule before writing anything.
  createRegistry(BUILTIN_PACKS.map((p) => (p.id === "imported" ? (nextPack as RulePackInput) : p)));
  writeFileSync(packPath, `${JSON.stringify(nextPack, null, 2)}\n`);

  lib.saveCandidates(
    sourceId,
    lib.loadCandidates(sourceId).map((c) => (c.id === candidateId ? { ...c, status: "approved" as const, proposedRule: { ...c.proposedRule, enabled: true } } : c)),
  );
  lib.setStatus(sourceId, "reviewed");
  return { ruleId: rule.id, warnings: validation.warnings };
}

export function rejectCandidate(lib: SourceLibrary, candidateId: string): void {
  const found = lib.findCandidate(candidateId);
  if (!found) throw new Error(`No candidate "${candidateId}".`);
  lib.saveCandidates(
    found.sourceId,
    lib.loadCandidates(found.sourceId).map((c) => (c.id === candidateId ? { ...c, status: "rejected" as const } : c)),
  );
}
