import { z } from "zod";
import type { ReconstructionRequest } from "@/domain/document";
import type { StyleProfile } from "@/domain/style";
import type { Finding, VerificationResult } from "@/domain/verification";
import type { AIProvider, CallMeta, StructuredCaller } from "../ai/provider";
import { ProviderError } from "../ai/provider";
import { candidateSchema, meaningCheckSchema, parseModelJson, type Candidate } from "../ai/schemas";
import { rulesForProfile } from "../rules/packs";
import { verifyDeterministic } from "../verification/verify";
import { comparePatterns } from "./postcheck";
import { getPrompt, verifyUserPrompt } from "../prompts";
import { runReconstructionDetailed, type DetailedPipelineResult } from "./pipeline";
import type { RewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V4 } from "./strategies";

/** Only one bounded worker class is justified initially: optional local wording alternatives. */
export const localAlternativeTaskSchema = z.object({
  type: z.literal("local-alternative"),
  span: z.string().min(1).max(300),
  purpose: z.enum(["plain-language", "flow", "brevity"]),
}).strict();
export type DelegatedTask = z.infer<typeof localAlternativeTaskSchema>;
const localAlternativeSchema = z.object({ alternative: z.string().min(1).max(600) }).strict();
export type WorkerSuggestion = { task: DelegatedTask; alternative: string; route: string };

export interface OrchestratorInput {
  source: string;
  current?: string;
  profile: StyleProfile;
  plan: RewritePlan;
  refinement?: ReconstructionRequest["refinement"];
  protectedPhrases: string[];
}

export interface AgentCall<T> { data: T; meta?: CallMeta }
export interface FrontierAgent {
  /** The frontier owns the decision to leave text unchanged and to request assistance. */
  decide(input: OrchestratorInput): Promise<AgentCall<{ unchanged: boolean; tasks: DelegatedTask[] }>>;
  draft(input: OrchestratorInput, suggestions: WorkerSuggestion[]): Promise<AgentCall<Candidate>>;
  /** Return only the replacement for the exact offending span. */
  repair(input: OrchestratorInput, candidate: string, issue: Finding, span: string): Promise<AgentCall<{ replacement: string }>>;
}

export type Capability = "orchestration" | "local-alternative" | "semantic-review";
export type ModelTier = "frontier" | "strong" | "fast" | "cheap";
export interface ModelRoute {
  id: string;
  tier: ModelTier;
  capability: Capability;
  timeoutMs: number;
  /** Optional observed acceptance rate from evaluation; a known weak route is excluded. */
  reliability?: number;
  /** Pricing is configuration, never domain logic. USD per million tokens. */
  price?: { input: number; output: number };
}
export interface WorkerRoute extends ModelRoute { capability: "local-alternative"; caller: StructuredCaller }
export interface OrchestrationConfig {
  frontier: ModelRoute & { capability: "orchestration" };
  workers: WorkerRoute[];
  semanticReviewer?: { route: ModelRoute & { capability: "semantic-review" }; caller: StructuredCaller };
  maxRepairs?: 0 | 1;
  /** At most one stronger eligible worker after a failed first attempt. */
  maxWorkerEscalations?: 0 | 1;
  now?: () => number;
}

/** Deterministic capability routing. A missing or unsuitable route means no delegation. */
export function routeTask(task: DelegatedTask, routes: WorkerRoute[]): WorkerRoute | null {
  const eligible = routes.filter((r) => r.capability === task.type && r.timeoutMs > 0 && r.caller.info.mode === "live" && (r.reliability === undefined || r.reliability >= 0.9));
  const rank = { cheap: 0, fast: 1, strong: 2, frontier: 3 };
  return eligible.sort((a, b) => rank[a.tier] - rank[b.tier] || a.timeoutMs - b.timeoutMs)[0] ?? null;
}

export interface CallTrace {
  role: "frontier-decision" | "frontier-draft" | "frontier-repair" | "worker" | "semantic-review";
  route: string;
  tier: ModelTier;
  outcome: "accepted" | "rejected" | "timeout" | "error";
  used: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostUsd: number | null;
}
export interface OrchestrationTrace {
  calls: CallTrace[];
  delegationCount: number;
  acceptedWorkerOutputs: number;
  rejectedWorkerOutputs: number;
  repairCount: number;
  finalDecision: "unchanged" | "candidate" | "repaired" | "source-fallback";
  verificationStatus: VerificationResult["status"];
  tokens: { input: number; output: number };
  estimatedCostUsd: number | null;
  latencyMs: { analysis: number; frontier: number; workers: number; verification: number; repair: number; total: number };
}

const timeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
};

/** The frontier result is untrusted too; a schema failure never becomes candidate text. */
const parsed = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = parseModelJson(schema, value);
  if (!result.ok) throw new ProviderError(result.error, "invalid_output");
  return result.data;
};

export const decisionSchema = z.object({ unchanged: z.boolean(), tasks: z.array(localAlternativeTaskSchema).max(1) }).strict();
export const replacementSchema = z.object({ replacement: z.string().min(1).max(600) }).strict();

/** Experimental runner. No route or default strategy calls this function. */
export async function runOrchestratedReconstruction(request: ReconstructionRequest, agent: FrontierAgent, config: OrchestrationConfig): Promise<{ detailed: DetailedPipelineResult; trace: OrchestrationTrace }> {
  const now = config.now ?? Date.now;
  const started = now();
  const calls: CallTrace[] = [];
  let analysisMs = 0, frontierMs = 0, workerMs = 0, verificationMs = 0, repairMs = 0;
  let accepted = 0, rejected = 0, delegationCount = 0, repairCount = 0;
  let decision: OrchestrationTrace["finalDecision"] = "candidate";
  const track = (role: CallTrace["role"], route: ModelRoute, outcome: CallTrace["outcome"], used: boolean, elapsed: number, meta?: CallMeta) => {
    calls.push({ role, route: route.id, tier: route.tier, outcome, used, inputTokens: meta?.inputTokens ?? null, outputTokens: meta?.outputTokens ?? null, latencyMs: elapsed,
      estimatedCostUsd: route.price && meta?.inputTokens !== undefined && meta.outputTokens !== undefined ? (meta.inputTokens * route.price.input + meta.outputTokens * route.price.output) / 1_000_000 : null });
  };
  let input: OrchestratorInput | undefined;
  const facade: AIProvider = {
    info: { mode: "live", provider: "orchestrated", model: config.frontier.id },
    analyzeText: async () => null,
    analyzeVoiceprint: async () => [],
    verifyMeaning: async (source, text) => {
      if (!config.semanticReviewer) return null;
      const { route, caller } = config.semanticReviewer;
      const begin = now();
      try {
        const result = await timeout(caller.callStructured(meaningCheckSchema, "meaning-review", getPrompt({ id: "verify", version: 1 }).system, verifyUserPrompt(source, text)), route.timeoutMs);
        const findings = parsed(meaningCheckSchema, result.data).findings.map((f) => ({ ...f, origin: "model" as const }));
        track("semantic-review", route, "accepted", true, now() - begin, result.meta);
        return findings;
      } catch (err) {
        track("semantic-review", route, err instanceof Error && err.message === "timeout" ? "timeout" : "error", false, now() - begin, err instanceof ProviderError ? err.meta : undefined);
        return null;
      }
    },
    reconstructText: async (base) => {
      input = { source: base.source, current: base.current, profile: base.profile, plan: base.plan, refinement: request.refinement,
        protectedPhrases: base.plan.protectedPhrases.map((p) => p.text) };
      const t0 = now();
      let choice: z.infer<typeof decisionSchema>;
      let choiceMeta: CallMeta | undefined;
      try {
        const choiceCall = await timeout(agent.decide(input), config.frontier.timeoutMs);
        choiceMeta = choiceCall.meta;
        choice = parsed(decisionSchema, choiceCall.data);
        track("frontier-decision", config.frontier, "accepted", true, now() - t0, choiceMeta);
      } catch (err) {
        track("frontier-decision", config.frontier, err instanceof Error && err.message === "timeout" ? "timeout" : "error", false, now() - t0, choiceMeta ?? (err instanceof ProviderError ? err.meta : undefined));
        frontierMs += now() - t0;
        decision = "source-fallback";
        return { text: base.source, changes: ["Preserved original wording after an unavailable decision."] };
      }
      frontierMs += now() - t0;
      if (choice.unchanged && !request.refinement && base.plan.minimalChange.unchangedPreferred) { decision = "unchanged"; return { text: base.source, changes: [], meta: choiceMeta }; }
      const workersStarted = now();
      const jobs = choice.tasks.map(async (task) => {
        delegationCount++;
        const first = routeTask(task, config.workers);
        const localText = base.current ?? base.source;
        if (!first || task.span.length > Math.floor(localText.length * 0.45) || !localText.includes(task.span) || localText.indexOf(task.span) !== localText.lastIndexOf(task.span)) {
          track("worker", first ?? { id: "unrouted", tier: "cheap", capability: "local-alternative", timeoutMs: 0 }, "rejected", false, 0);
          rejected++;
          return null;
        }
        const rank = { cheap: 0, fast: 1, strong: 2, frontier: 3 };
        const second = (config.maxWorkerEscalations ?? 1) > 0
          ? routeTask(task, config.workers.filter((r) => rank[r.tier] > rank[first.tier]))
          : null;
        for (const route of [first, second].filter((r): r is WorkerRoute => r !== null)) {
          const begin = now();
          try {
            const response = await timeout(route.caller.callStructured(localAlternativeSchema, "local-alternative", getPrompt({ id: "local-alternative", version: 1 }).system,
              JSON.stringify({ span: task.span, purpose: task.purpose })), route.timeoutMs);
            const output = parsed(localAlternativeSchema, response.data);
            const local = verifyDeterministic(task.span, output.alternative, base.profile);
            const safe = local.status !== "rejected" && !local.findings.some((f) => f.kind === "added_claim" || f.kind === "assertion_strength_changed");
            const elapsed = now() - begin;
            track("worker", route, safe ? "accepted" : "rejected", false, elapsed, response.meta);
            if (!safe) { rejected++; continue; }
            accepted++;
            return { task, alternative: output.alternative, route: route.id };
          } catch (err) {
            const elapsed = now() - begin;
            track("worker", route, err instanceof Error && err.message === "timeout" ? "timeout" : "error", false, elapsed, err instanceof ProviderError ? err.meta : undefined);
            rejected++;
          }
        }
        return null;
      });
      const suggestions = (await Promise.all(jobs)).filter((x): x is WorkerSuggestion => x !== null);
      workerMs += now() - workersStarted;
      const draftStart = now();
      let draftMeta: CallMeta | undefined;
      try {
        const draftCall = await timeout(agent.draft(input, suggestions), config.frontier.timeoutMs);
        draftMeta = draftCall.meta;
        const candidate = parsed(candidateSchema, draftCall.data);
        for (const suggestion of suggestions) {
          if (suggestion.alternative === suggestion.task.span || !candidate.text.includes(suggestion.alternative)) continue;
          const call = calls.find((c) => c.role === "worker" && c.route === suggestion.route && c.outcome === "accepted");
          if (call) call.used = true;
        }
        frontierMs += now() - draftStart;
        track("frontier-draft", config.frontier, "accepted", true, now() - draftStart, draftMeta);
        return { ...candidate, meta: draftMeta };
      } catch (err) {
        frontierMs += now() - draftStart;
        track("frontier-draft", config.frontier, err instanceof Error && err.message === "timeout" ? "timeout" : "error", false, now() - draftStart, draftMeta ?? (err instanceof ProviderError ? err.meta : undefined));
        decision = "source-fallback";
        return { text: base.source, changes: ["Preserved original wording after an unavailable draft."] };
      }
    },
  };
  const verifyStart = now();
  let detailed: DetailedPipelineResult;
  try { detailed = await runReconstructionDetailed(request, facade, { strategy: RECONSTRUCTION_V4, maxAttempts: 1, onPlanReady: (ms) => { analysisMs += ms; } }); }
  catch { throw new ProviderError("The orchestrated reconstruction failed safely.", "upstream"); }
  verificationMs += Math.max(0, now() - verifyStart - analysisMs - frontierMs - workerMs);
  if (detailed.plannerWouldBypass) decision = "unchanged";
  const source = request.source;
  const candidate = detailed.result.text;
  const issue = detailed.result.verification.findings.find((f) => f.severity === "blocking" && f.candidate && candidate.includes(f.candidate) && candidate.indexOf(f.candidate) === candidate.lastIndexOf(f.candidate));
  if (issue?.candidate && input && (config.maxRepairs ?? 1) > 0) {
    repairCount++;
    const begin = now();
    let repairMeta: CallMeta | undefined;
    try {
      const response = await timeout(agent.repair(input, candidate, issue, issue.candidate), config.frontier.timeoutMs);
      repairMeta = response.meta;
      const replacement = parsed(replacementSchema, response.data).replacement;
      const repaired = candidate.replace(issue.candidate, replacement);
      const localVerify = verifyDeterministic(source, repaired, detailed.result.profile, { removableSpans: detailed.plan.removableSpans, licenses: detailed.plan.refinementDelta?.licenses, protectedPhrases: detailed.plan.protectedPhrases });
      const safe = localVerify.findings.filter((f) => f.severity === "blocking").length < detailed.result.verification.findings.filter((f) => f.severity === "blocking").length;
      if (safe) {
        const second: AIProvider = { ...facade, reconstructText: async () => ({ text: repaired, changes: ["Repaired a localized meaning finding."] }) };
        const verified = await runReconstructionDetailed(request, second, { strategy: RECONSTRUCTION_V4, maxAttempts: 1, onPlanReady: (ms) => { analysisMs += ms; } });
        const repairedModelRan = verified.attempts.at(-1)?.modelMeaning === "ran";
        if ((!config.semanticReviewer || repairedModelRan) && verified.result.verification.findings.filter((f) => f.severity === "blocking").length < detailed.result.verification.findings.filter((f) => f.severity === "blocking").length) {
          detailed = { ...verified, attempts: [...detailed.attempts, ...verified.attempts], result: { ...verified.result, attempts: detailed.result.attempts + verified.result.attempts } };
          decision = "repaired";
        }
      }
      track("frontier-repair", config.frontier, decision === "repaired" ? "accepted" : "rejected", decision === "repaired", now() - begin, repairMeta);
    } catch (err) { track("frontier-repair", config.frontier, err instanceof Error && err.message === "timeout" ? "timeout" : "error", false, now() - begin, repairMeta ?? (err instanceof ProviderError ? err.meta : undefined)); }
    repairMs += now() - begin;
  }
  const semanticReviewUnavailable = Boolean(config.semanticReviewer) && !detailed.plannerWouldBypass && detailed.attempts.at(-1)?.modelMeaning !== "ran";
  if (detailed.result.verification.status === "rejected" || semanticReviewUnavailable) {
    const verification = verifyDeterministic(source, source, detailed.result.profile);
    detailed = { ...detailed, result: { ...detailed.result, text: source, verification, patterns: comparePatterns(detailed.plan, source, rulesForProfile(detailed.result.profile)),
      preserved: { numbers: detailed.plan.preserve.numbers.length, dates: detailed.plan.preserve.dates.length, names: detailed.plan.preserve.names.length,
        quotations: detailed.plan.preserve.quotations.length, links: detailed.plan.preserve.links.length }, changes: ["Preserved original wording after verification failed."] } };
    decision = "source-fallback";
  }
  if (decision === "source-fallback") for (const call of calls) if (call.role === "worker" || call.role === "frontier-draft" || call.role === "frontier-repair") call.used = false;
  const tokens = calls.reduce((a, c) => ({ input: a.input + (c.inputTokens ?? 0), output: a.output + (c.outputTokens ?? 0) }), { input: 0, output: 0 });
  const knownCosts = calls.map((c) => c.estimatedCostUsd);
  return { detailed, trace: { calls, delegationCount, acceptedWorkerOutputs: accepted, rejectedWorkerOutputs: rejected, repairCount, finalDecision: decision,
    verificationStatus: detailed.result.verification.status, tokens, estimatedCostUsd: knownCosts.every((c) => c !== null) ? knownCosts.reduce<number>((a, c) => a + (c ?? 0), 0) : null,
    latencyMs: { analysis: analysisMs, frontier: frontierMs, workers: workerMs, verification: verificationMs, repair: repairMs, total: now() - started } } };
}
