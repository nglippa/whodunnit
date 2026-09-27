import { judgeOutputSchema, type JudgeFinding, type JudgeResult } from "@/domain/judge";
import type { ClaimChange } from "@/domain/semantics";
import type { Finding } from "@/domain/verification";
import type { GenerationReport, StructuredCaller } from "../ai/provider";
import { getPrompt, judgeUserPrompt } from "../prompts";
import type { ExtractedClaim } from "../semantics/claims";
import { createHash } from "node:crypto";

/**
 * The independent semantic judge. Evaluation infrastructure only: production
 * rewriting never needs it. It supplements the deterministic checks and can
 * never turn a deterministic failure into a pass.
 */

export interface JudgeInput {
  source: string;
  output: string;
  sourceClaims: ExtractedClaim[];
  outputClaims: ExtractedClaim[];
  /** Deterministic claim changes and protected-span findings, shown to the judge. */
  deterministic: (ClaimChange | Finding)[];
  /**
   * Source spans the engine classified as removable patterns, with the
   * pattern's name. Shown to judge.v2 as candidates, never as safe deletions.
   */
  intendedRemovals?: { pattern: string; text: string }[];
  /** For cache provenance only; never part of the judge input or the cache key. */
  runId?: string;
}

export interface SemanticJudge {
  readonly info: { provider: string; model: string | null };
  /** The judge's own generation settings: what was sent, what the provider could not honour. */
  readonly settings?: GenerationReport;
  /** Prompt key the judge runs with (e.g. "judge.v2"). */
  readonly prompt?: string;
  judge(input: JudgeInput): Promise<JudgeResult>;
}

/** The default judge prompt for new runs. judge.v1 stays selectable for comparison with older runs. */
export const JUDGE_PROMPT = { id: "judge" as const, version: 2 };
export type JudgePromptVersion = 1 | 2;

/**
 * Stores judge results by an exact-input key. Only equivalent inputs may hit:
 * the key covers provider, model, generation settings, prompt version and the
 * full system and user messages (which contain the source, the output, the
 * claim lists, the deterministic findings and the intended removals). Output
 * text alone is never a key.
 */
export interface JudgeCache {
  get(key: string): CachedJudgeEntry | null;
  set(key: string, entry: CachedJudgeEntry): void;
}
export interface CachedJudgeEntry {
  result: JudgeResult;
  runId: string | null;
  cachedAt: string;
}

export function judgeCacheKey(parts: { provider: string; model: string | null; settings: string[]; prompt: string; system: string; user: string }): string {
  return createHash("sha256").update(JSON.stringify([parts.provider, parts.model, [...parts.settings].sort(), parts.prompt, parts.system, parts.user]), "utf8").digest("hex");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, "")
    .trim();

/** Evidence counts only if every segment (split on ellipses) occurs in the text. */
export function evidenceFound(evidence: string, text: string): boolean {
  const segments = evidence.split(/…|\.\.\./).map(norm).filter(Boolean);
  if (!segments.length) return false;
  const t = norm(text);
  return segments.every((s) => t.includes(s));
}

const NEEDS: Record<JudgeFinding["kind"], ("source" | "output")[]> = {
  added_claim: ["output"],
  dropped_claim: ["source"],
  strengthened: ["source", "output"],
  weakened: ["source", "output"],
  contradiction: ["source", "output"],
  causal_change: ["output"],
  temporal_change: ["output"],
  comparative_change: ["source", "output"],
  modality_change: ["source", "output"],
  domain_term_substitution: ["source", "output"],
  quotation_change: ["source"],
};

export function verifyJudgeFindings(findings: ReturnType<typeof judgeOutputSchema.parse>["findings"], source: string, output: string): JudgeFinding[] {
  return findings.map((f) => {
    const need = NEEDS[f.kind];
    const ok = need.every((side) => (side === "source" ? f.sourceEvidence && evidenceFound(f.sourceEvidence, source) : f.outputEvidence && evidenceFound(f.outputEvidence, output)));
    return { ...f, evidenceVerified: Boolean(ok), effectiveSeverity: ok ? f.severity : "minor" };
  });
}

export function judgeVerdict(findings: JudgeFinding[]): JudgeResult["verdict"] {
  if (findings.some((f) => f.effectiveSeverity === "blocking")) return "FAIL";
  if (findings.some((f) => f.effectiveSeverity === "major")) return "NEEDS_REVIEW";
  return "PASS";
}

const describeClaim = (c: ExtractedClaim) => {
  const tags = [c.polarity === "negative" ? `negative (${c.negators.join(", ")})` : null, c.modality !== "asserted" ? c.modality : null, ...c.quantities.map((q) => `${q.text}: ${q.bound}`), c.causal.length ? `cause: ${c.causal.join(", ")}` : null].filter(Boolean);
  return `${c.id}: ${c.text.replace(/\s+/g, " ").slice(0, 240)}${tags.length ? ` [${tags.join("; ")}]` : ""}`;
};
const describeFinding = (f: ClaimChange | Finding) =>
  "aspect" in f ? `${f.severity} ${f.relation}/${f.aspect}: ${f.detail}` : `${f.severity} ${f.kind}: ${f.message}`;

const clipSpan = (t: string) => {
  const x = t.replace(/\s+/g, " ").trim();
  return x.length > 160 ? `${x.slice(0, 159)}…` : x;
};
export const describeRemoval = (r: { pattern: string; text: string }) => `“${clipSpan(r.text)}” (${r.pattern})`;

export class ModelSemanticJudge implements SemanticJudge {
  readonly info;
  readonly settings: GenerationReport;
  readonly prompt: string;
  private readonly version: JudgePromptVersion;
  constructor(
    private readonly caller: StructuredCaller,
    private readonly selfOf?: { provider: string; model: string | null },
    options: { promptVersion?: JudgePromptVersion; cache?: JudgeCache | null; now?: () => string } = {},
  ) {
    this.info = { provider: caller.info.provider, model: caller.info.model };
    this.settings = caller.generationReport();
    this.version = options.promptVersion ?? (JUDGE_PROMPT.version as JudgePromptVersion);
    this.prompt = getPrompt({ id: "judge", version: this.version }).key;
    this.cache = options.cache ?? null;
    this.now = options.now ?? (() => new Date().toISOString());
  }
  private readonly cache: JudgeCache | null;
  private readonly now: () => string;

  /** The exact messages the judge model receives (also the cache key's content). */
  messages(input: JudgeInput): { system: string; user: string } {
    return {
      system: getPrompt({ id: "judge", version: this.version }).system,
      user: judgeUserPrompt(
        {
          source: input.source,
          output: input.output,
          sourceClaims: input.sourceClaims.filter((c) => c.content.length).map(describeClaim),
          outputClaims: input.outputClaims.filter((c) => c.content.length).map(describeClaim),
          deterministic: input.deterministic.map(describeFinding).slice(0, 30),
          intendedRemovals: (input.intendedRemovals ?? []).map(describeRemoval).slice(0, 20),
        },
        this.version,
      ),
    };
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const prompt = this.prompt;
    const selfJudged = Boolean(this.selfOf && this.selfOf.provider === this.info.provider && this.selfOf.model === this.info.model);
    const base = { provider: this.info.provider, model: this.info.model, prompt, selfJudged };
    const { system, user } = this.messages(input);
    const key = judgeCacheKey({ provider: this.info.provider, model: this.info.model, settings: this.settings.applied, prompt, system, user });
    const hit = this.cache?.get(key);
    if (hit && hit.result.status === "ran" && hit.result.prompt === prompt) {
      // Reuse is recorded, never hidden: the verdict is the original call's.
      return { ...hit.result, selfJudged, provenance: { source: "cached", key, originalRunId: hit.runId, cachedAt: hit.cachedAt } };
    }
    try {
      const { data, meta } = await this.caller.callStructured(judgeOutputSchema, "semantic_judgement", system, user);
      const findings = verifyJudgeFindings(data.findings, input.source, input.output);
      const result: JudgeResult = {
        ...base,
        status: "ran",
        error: null,
        verdict: judgeVerdict(findings),
        findings,
        latencyMs: meta.latencyMs ?? null,
        tokens: meta.inputTokens !== undefined ? { input: meta.inputTokens, output: meta.outputTokens ?? 0 } : null,
        provenance: { source: "live", key, originalRunId: input.runId ?? null, cachedAt: null },
      };
      // Only completed judgements are cached; a failure is retried next time.
      this.cache?.set(key, { result, runId: input.runId ?? null, cachedAt: this.now() });
      return result;
    } catch (err) {
      // A judge that could not run is "not run", never "passed".
      return { ...base, status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 400), verdict: "NOT_RUN", findings: [], latencyMs: null, tokens: null, provenance: { source: "live", key, originalRunId: input.runId ?? null, cachedAt: null } };
    }
  }
}
