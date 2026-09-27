import { EVALUATION_RECORD_VERSION, type EvaluationConfig, type EvaluationRecord, type GoldRewrite, type StageRecord } from "@/domain/evaluation";
import { REFINEMENT_LABELS, type Refinement } from "@/domain/refinement";
import { PRESETS, type StyleProfile } from "@/domain/style";
import { promptKey, strategyKey, type RewriteStrategy } from "@/domain/strategy";
import type { Voiceprint } from "@/domain/voiceprint";
import type { AIProvider } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { getPrompt, renderContract } from "../prompts";
import { runReconstructionDetailed, type AttemptRecord } from "../reconstruction/pipeline";
import { planSize, type RewritePlan } from "../reconstruction/rewrite-plan";
import { getStrategy } from "../reconstruction/strategies";
import { analyzeWriting, type WritingAnalysis } from "../rules/engine";
import { getRegistry, rulesForProfile } from "../rules/packs";
import { integrityReport, verifyDeterministic } from "../verification/verify";
import type { GenerationReport } from "../ai/provider";
import { extractClaims } from "../semantics/claims";
import { SEMANTIC_ANALYSIS_VERSION, allChanges } from "../semantics/integrity";
import type { SemanticJudge } from "./judge";
import { voiceprintToProfile } from "../voiceprints/to-profile";
import type { Corpus, LoadedCase } from "./corpus";
import { anchorPresent, compareVoice, metricDeltas, ruleDiff, semanticGate, sha256, wordingRetention } from "./measures";

/**
 * One corpus case through one configuration:
 *
 *   original analysis → plan → strategy → model → reconstruction →
 *   semantic verification → rule analysis → voice comparison → record
 *
 * Refinement chains run stage after stage exactly as the editor does: each
 * stage revises the previous output with the effective profile carried
 * forward, and every stage is verified and measured against the ORIGINAL.
 */

export class EvaluationCaseError extends Error {
  constructor(
    message: string,
    readonly caseId: string,
    readonly stage: number,
    readonly code: string,
    readonly attempts: AttemptRecord[],
  ) {
    super(message);
    this.name = "EvaluationCaseError";
  }
}

export interface RunContext {
  corpus: Corpus;
  config: EvaluationConfig;
  provider: AIProvider;
  runId: string;
  now?: () => string;
  /** Independent semantic judge (optional). */
  judge?: SemanticJudge | null;
  /** What the provider actually sent of the requested generation settings. */
  generation?: GenerationReport;
}

export const promptFingerprint = (s: RewriteStrategy) => sha256(getPrompt(s.prompt).system).slice(0, 16);

export function voiceprintHash(vp: Voiceprint) {
  return sha256(JSON.stringify({ stats: vp.stats, totalWords: vp.totalWords, sampleCount: vp.sampleCount })).slice(0, 16);
}

export function baseProfile(c: LoadedCase, vp: Voiceprint | undefined): StyleProfile {
  return vp ? voiceprintToProfile(vp) : PRESETS[c.style];
}

const stageLabel = (r: Refinement | undefined, profile: StyleProfile) =>
  r ? [...r.directives.map((d) => REFINEMENT_LABELS[d]), ...(r.note ? [`note: ${r.note}`] : [])].join(" + ") : profile.label;

function goldComparison(gold: GoldRewrite, c: LoadedCase, before: WritingAnalysis, output: WritingAnalysis, profile: StyleProfile, rules: ReturnType<typeof rulesForProfile>): NonNullable<StageRecord["gold"]> {
  const goldAnalysis = analyzeWriting(gold.text, rules, { constraints: [] });
  const byGold = ruleDiff(before, goldAnalysis);
  const byOutput = ruleDiff(before, output);
  return {
    author: gold.author,
    provenance: gold.provenance,
    goldRetention: wordingRetention(c.text, gold.text),
    removedByGold: byGold.resolved,
    removedByOutput: byOutput.resolved,
    removedByBoth: byGold.resolved.filter((id) => byOutput.resolved.includes(id)),
    sentenceCv: { source: before.metrics.sentenceLength.cv, gold: goldAnalysis.metrics.sentenceLength.cv, output: output.metrics.sentenceLength.cv },
    paragraphs: { source: before.metrics.paragraphs, gold: goldAnalysis.metrics.paragraphs, output: output.metrics.paragraphs },
    goldSemanticVerdict: semanticGate(verifyDeterministic(c.text, gold.text, profile), gold.text, c.expectations.anchors).verdict,
  };
}

export async function evaluateCase(c: LoadedCase, ctx: RunContext): Promise<EvaluationRecord> {
  const now = ctx.now ?? (() => new Date().toISOString());
  const strategy = getStrategy(ctx.config.strategy);
  const vp = c.voiceprint ? ctx.corpus.voiceprints.get(c.voiceprint) : undefined;
  if (c.voiceprint && !vp) throw new EvaluationCaseError(`Voiceprint fixture "${c.voiceprint}" not loaded`, c.id, 0, "config", []);
  const profile0 = baseProfile(c, vp);
  const steps: (Refinement | undefined)[] = [undefined, ...(c.refinementChain ?? [])];

  let original: WritingAnalysis | null = null;
  let originalPlan: RewritePlan | null = null;
  let previous: { text: string; profile: StyleProfile } | null = null;
  const stages: StageRecord[] = [];

  for (let i = 0; i < steps.length; i++) {
    const refinement = steps[i];
    const attempts: AttemptRecord[] = [];
    const request = {
      source: c.text,
      profile: previous?.profile ?? profile0,
      voiceprint: vp,
      refinement: refinement && previous ? { current: previous.text, change: refinement } : undefined,
    };
    let detailed;
    try {
      detailed = await runReconstructionDetailed(request, ctx.provider, { strategy, onAttempt: (a) => attempts.push(a) });
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : "error";
      throw new EvaluationCaseError(err instanceof Error ? err.message.slice(0, 400) : "Unknown failure", c.id, i, code, attempts);
    }
    const { result, plan } = detailed;
    const rules = rulesForProfile(result.profile);
    if (!original) {
      original = plan.analysis;
      originalPlan = plan;
    }
    const after = analyzeWriting(result.text, rules, { constraints: plan.constraints });
    // The same meaning context the pipeline verified with: filler it may drop, what the author licensed, what is protected.
    const integrity = integrityReport(c.text, result.text, result.profile, { removableSpans: plan.removableSpans, licenses: plan.refinementDelta?.licenses, protectedPhrases: plan.protectedPhrases });
    // Identical text cannot have changed meaning: the judge is not asked (and the stage is marked skipped, never passed).
    const identical = result.text === c.text;
    const judge = ctx.judge && identical
      ? { provider: ctx.judge.info.provider, model: ctx.judge.info.model, prompt: "judge.v1", selfJudged: false, status: "skipped" as const, error: null, verdict: "NOT_RUN" as const, findings: [], latencyMs: null, tokens: null }
      : ctx.judge
      ? await ctx.judge.judge({
          source: c.text,
          output: result.text,
          sourceClaims: extractClaims(c.text),
          outputClaims: extractClaims(result.text),
          deterministic: [...allChanges(integrity), ...result.verification.findings.filter((f) => f.origin === "deterministic" && f.severity === "blocking")],
        })
      : undefined;
    const semantic = semanticGate(result.verification, result.text, c.expectations.anchors, { integrity, ...(ctx.judge ? { judge } : {}) });
    const retention = wordingRetention(c.text, result.text);
    const expectations: StageRecord["expectations"] = [];
    for (const k of c.expectations.keep) {
      expectations.push({ id: `keep:${k.slice(0, 40)}`, description: `keeps “${k}”`, passed: anchorPresent(result.text, k), detail: "" });
    }
    if (c.expectations.minTokenRetention !== undefined && i === 0) {
      const ok = retention.tokenRetention >= c.expectations.minTokenRetention;
      expectations.push({ id: "minimal-change", description: `keeps ≥ ${c.expectations.minTokenRetention} of source tokens`, passed: ok, detail: `token retention ${retention.tokenRetention}` });
    }
    if (c.expectations.lengthRatio) {
      const { min, max } = c.expectations.lengthRatio;
      expectations.push({ id: "length", description: `length ratio ${min}–${max}`, passed: retention.lengthRatio >= min && retention.lengthRatio <= max, detail: `ratio ${retention.lengthRatio}` });
    }
    const gold = i === 0 && ctx.corpus.gold.get(c.id) ? goldComparison(ctx.corpus.gold.get(c.id)!, c, original, after, result.profile, rules) : null;
    const tokens = attempts.reduce(
      (acc, a) => (a.provider?.inputTokens !== undefined ? { input: (acc?.input ?? 0) + (a.provider.inputTokens ?? 0), output: (acc?.output ?? 0) + (a.provider.outputTokens ?? 0) } : acc),
      null as { input: number; output: number } | null,
    );

    stages.push({
      index: i,
      label: stageLabel(refinement, result.profile),
      refinement,
      profileLabel: result.profile.label,
      plan: { intensity: plan.intensity, intensityReasons: plan.intensityReasons, size: planSize(plan), omitted: plan.budget.omitted, contractChars: renderContract(plan, strategy.prompt).length },
      output: { text: result.text, hash: sha256(result.text).slice(0, 16), words: after.metrics.words, changesReported: result.changes },
      attempts,
      retries: Math.max(0, attempts.length - 1),
      latencyMs: attempts.reduce((a, x) => a + x.latencyMs, 0),
      tokens,
      semantic,
      rules: ruleDiff(original, after),
      metricsAfter: after.metrics as unknown as Record<string, unknown>,
      metricDeltas: metricDeltas(original.metrics, after.metrics),
      retention,
      retentionVsPrevious: previous ? wordingRetention(previous.text, result.text) : null,
      voice: compareVoice(original.metrics, after.metrics, vp),
      expectations,
      gold,
      originalWordingRetention: retention.tokenRetention,
      unchangedByPolicy: detailed.attempts.length === 0,
      refinementDelta: plan.refinementDelta
        ? {
            objectives: plan.refinementDelta.objectives.map((o) => ({ id: o.id, reference: o.reference })),
            licenses: Object.entries(plan.refinementDelta.licenses).filter(([, v]) => v).map(([k]) => k),
            restorations: plan.refinementDelta.restorations,
            triage: plan.refinementDelta.triage ? { mustKeep: plan.refinementDelta.triage.mustKeep.length, mayCompress: plan.refinementDelta.triage.mayCompress.length, mayRemove: plan.refinementDelta.triage.mayRemove.length } : null,
          }
        : null,
    });
    previous = { text: result.text, profile: result.profile };
  }

  const registry = getRegistry();
  const usedPacks = new Set(rulesForProfile(profile0).map((r) => r.packId));
  const engine = ctx.provider.info;
  return {
    schemaVersion: EVALUATION_RECORD_VERSION as 2,
    id: `${ctx.runId}:${c.id}`,
    runId: ctx.runId,
    createdAt: now(),
    case: { id: c.id, version: c.version, category: c.category, title: c.title, corpusVersion: ctx.corpus.manifest.version, textHash: c.textHash },
    config: {
      provider: engine.provider,
      mode: engine.mode,
      realModel: engine.mode === "live",
      model: engine.model,
      sampling: "provider-default",
      strategy: { key: strategyKey(strategy), name: strategy.name, status: strategy.status },
      prompt: { key: promptKey(strategy.prompt), fingerprint: promptFingerprint(strategy) },
      rulePacks: registry.listPacks().filter((p) => usedPacks.has(p.id)).map((p) => ({ id: p.id, version: p.version })),
      voiceprint: vp ? { id: vp.id, name: vp.name, hash: voiceprintHash(vp), confidence: vp.confidence } : null,
      style: vp ? `voiceprint:${vp.id}` : c.style,
      generation: { requested: ctx.config.generation ?? {}, applied: ctx.generation?.applied ?? [], unsupported: ctx.generation?.unsupported ?? [], declared: ctx.generation?.declared ?? [] },
      judge: ctx.judge
        ? {
            provider: ctx.judge.info.provider,
            model: ctx.judge.info.model,
            selfJudged: ctx.judge.info.provider === engine.provider && ctx.judge.info.model === engine.model,
            prompt: "judge.v1",
            ...(ctx.judge.settings ? { settings: { applied: ctx.judge.settings.applied, unsupported: ctx.judge.settings.unsupported } } : {}),
          }
        : null,
      analysisVersion: SEMANTIC_ANALYSIS_VERSION,
    },
    source: { text: c.text, words: original!.metrics.words },
    before: {
      metrics: original!.metrics as unknown as Record<string, unknown>,
      triggered: ruleDiff(original!, original!).before,
      anchors: originalPlan!.preserve,
    },
    stages,
    review: null,
  };
}
