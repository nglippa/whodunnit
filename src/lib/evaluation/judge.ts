import { judgeOutputSchema, type JudgeFinding, type JudgeResult } from "@/domain/judge";
import type { ClaimChange } from "@/domain/semantics";
import type { Finding } from "@/domain/verification";
import type { StructuredCaller } from "../ai/provider";
import { JUDGE_SYSTEM, getPrompt, judgeUserPrompt } from "../prompts";
import type { ExtractedClaim } from "../semantics/claims";

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
}

export interface SemanticJudge {
  readonly info: { provider: string; model: string | null };
  judge(input: JudgeInput): Promise<JudgeResult>;
}

export const JUDGE_PROMPT = { id: "judge" as const, version: 1 };

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

export class ModelSemanticJudge implements SemanticJudge {
  readonly info;
  constructor(
    private readonly caller: StructuredCaller,
    private readonly selfOf?: { provider: string; model: string | null },
  ) {
    this.info = { provider: caller.info.provider, model: caller.info.model };
  }

  async judge(input: JudgeInput): Promise<JudgeResult> {
    const prompt = getPrompt(JUDGE_PROMPT).key;
    const selfJudged = Boolean(this.selfOf && this.selfOf.provider === this.info.provider && this.selfOf.model === this.info.model);
    const base = { provider: this.info.provider, model: this.info.model, prompt, selfJudged };
    try {
      const { data, meta } = await this.caller.callStructured(
        judgeOutputSchema,
        "semantic_judgement",
        JUDGE_SYSTEM,
        judgeUserPrompt({
          source: input.source,
          output: input.output,
          sourceClaims: input.sourceClaims.filter((c) => c.content.length).map(describeClaim),
          outputClaims: input.outputClaims.filter((c) => c.content.length).map(describeClaim),
          deterministic: input.deterministic.map(describeFinding).slice(0, 30),
        }),
      );
      const findings = verifyJudgeFindings(data.findings, input.source, input.output);
      return {
        ...base,
        status: "ran",
        error: null,
        verdict: judgeVerdict(findings),
        findings,
        latencyMs: meta.latencyMs ?? null,
        tokens: meta.inputTokens !== undefined ? { input: meta.inputTokens, output: meta.outputTokens ?? 0 } : null,
      };
    } catch (err) {
      // A judge that could not run is "not run", never "passed".
      return { ...base, status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 400), verdict: "NOT_RUN", findings: [], latencyMs: null, tokens: null };
    }
  }
}
