import { z, ZodError } from "zod";
import { reconstructionRequestSchema, type ReconstructionRequest } from "@/domain/document";
import type { VerificationResult } from "@/domain/verification";
import { ProviderError, type CallMeta, type StructuredCaller } from "@/lib/ai/provider";
import { candidateSchema } from "@/lib/ai/schemas";
import { words } from "@/lib/analysis/tokenize";
import { allChanges } from "@/lib/semantics/integrity";
import { compareVoiceDevices } from "@/lib/semantics/voice-devices";
import { integrityReport, verifyDeterministic } from "@/lib/verification/verify";
import { getPrompt } from "@/lib/prompts";
import { applyRefinement } from "@/domain/refinement";
import { wordingRetention } from "@/lib/evaluation/measures";
import { buildRewritePlan } from "./rewrite-plan";
import type { SemanticReviewV3 } from "./semantic-review";
import { verifyObjectiveAware } from "./objective-aware-verification";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";
import { RECONSTRUCTION_V10, RECONSTRUCTION_V11, RECONSTRUCTION_V12, RECONSTRUCTION_V13 } from "./strategies";

const spanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(300) }).strict();
export const candidateReviewSchemaV10 = z.object({
  verdict: z.enum(["PASS", "LOCAL_REPAIR", "REJECT"]),
  meaningPreserved: z.boolean(),
  objectiveSatisfied: z.boolean(),
  voicePreserved: z.boolean(),
  unsupportedInformation: z.boolean(),
  reason: z.string().min(8).max(300),
  issue: z.object({ span: spanSchema, constraint: z.string().min(8).max(300) }).strict().nullable(),
}).strict();
export type CandidateReviewV10 = z.infer<typeof candidateReviewSchemaV10>;
const repairSchema = z.object({ replacement: z.string().min(1).max(600) }).strict();

export interface VerifiedEditorConfig {
  editor: StructuredCaller;
  verifier?: StructuredCaller;
  repairer?: StructuredCaller;
  /** A live route must be account-backed and independently confirmed to have no incremental API charge. */
  confirmedNoIncrementalCost?: boolean;
  timeoutMs?: number;
  /** Optional previously validated editorial diagnosis; it is guidance, not a safety waiver. */
  diagnosis?: Pick<SemanticReviewV3, "disposition" | "findings" | "missingInformation">;
}

type Outcome = "accepted" | "repaired" | "unchanged" | "source-fallback";
type FallbackReason = "editor-unavailable" | "invalid-candidate" | "hard-meaning-failure" | "verifier-unavailable" | "verifier-rejected" | "invalid-verifier" | "repair-unavailable" | "repair-failed" | "timeout";
export interface VerifiedTraceV10 {
  strategy: "reconstruction-v10";
  editor: string;
  verifier: string | null;
  objectiveType: "brevity" | "wording" | "register" | "other";
  candidateGenerated: boolean;
  candidateUnchanged: boolean;
  deterministicVerdict: "PASS" | "NEEDS_REVIEW" | "FAIL" | null;
  semanticVerificationRequested: boolean;
  semanticVerdict: CandidateReviewV10["verdict"] | null;
  repairRequested: boolean;
  repairAccepted: boolean;
  outcome: Outcome;
  fallbackReason: FallbackReason | null;
  sourceChars: number;
  candidateChars: number | null;
  finalChars: number;
  sourceWords: number;
  candidateWords: number | null;
  finalWords: number;
  /** Word-level normalized edit distance; null when no candidate or the input exceeds the bounded metric. */
  wordEditDistance: { candidate: number | null; final: number | null };
  changeCount: number;
  voiceVerdict: "PRESERVED" | "DEVIATION" | "DAMAGED" | null;
  tokens: { input: number | null; output: number | null };
  latencyMs: { editor: number; verification: number; repair: number; total: number };
  estimatedCostUsd: null;
}
export interface VerifiedResultV10 {
  source: string;
  candidate: string | null;
  text: string;
  candidateVerification: VerificationResult | null;
  finalVerification: VerificationResult;
  review: CandidateReviewV10 | null;
  trace: VerifiedTraceV10;
}

export interface VerifiedTraceV11 extends Omit<VerifiedTraceV10, "strategy" | "fallbackReason"> {
  strategy: "reconstruction-v11";
  fallbackReason: FallbackReason | "verifier-malformed" | null;
  authorizedChangeCount: number;
  repairClassification: "USEFUL_REPAIR" | "SAFE_REVERSION" | "FAILED_REPAIR" | null;
}
export interface VerifiedResultV11 extends Omit<VerifiedResultV10, "trace"> { trace: VerifiedTraceV11 }
export interface VerifiedTraceV12 extends Omit<VerifiedTraceV11, "strategy"> { strategy: "reconstruction-v12" }
export interface VerifiedResultV12 extends Omit<VerifiedResultV10, "trace"> { trace: VerifiedTraceV12 }
export interface VerifiedTraceV13 extends Omit<VerifiedTraceV11, "strategy"> { strategy: "reconstruction-v13" }
export interface VerifiedResultV13 extends Omit<VerifiedResultV10, "trace"> { trace: VerifiedTraceV13 }

function assertFree(caller: StructuredCaller | undefined, confirmed: boolean): void {
  if (caller?.info.mode === "live" && !(confirmed && caller.info.provider === "account-backed"))
    throw new Error("V10 denies live providers unless account-backed access is confirmed to incur no incremental API charge.");
}

async function timed<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}

const kindForObjective = (objective: string): VerifiedTraceV10["objectiveType"] =>
  /\b(shorter|shorten|concise|compress|cut)\b/i.test(objective) ? "brevity"
    : /\b(wording|phrasing|repetition)\b/i.test(objective) ? "wording"
      : /\b(casual|formal|register|tone|corporate)\b/i.test(objective) ? "register" : "other";

function deterministicVerdict(result: VerificationResult): VerifiedTraceV10["deterministicVerdict"] {
  return result.status === "rejected" ? "FAIL" : result.status === "review" ? "NEEDS_REVIEW" : "PASS";
}

function localSpan(candidate: string, review: CandidateReviewV10 | null, finding: VerificationResult["findings"][number] | null) {
  if (review?.verdict === "LOCAL_REPAIR" && review.issue) {
    const { span } = review.issue;
    return candidate.slice(span.start, span.end) === span.text ? span : null;
  }
  const text = finding?.candidate;
  if (!text || text.length > 300) return null;
  const start = candidate.indexOf(text);
  return start >= 0 && candidate.indexOf(text, start + text.length) < 0 ? { start, end: start + text.length, text } : null;
}

function validReview(candidate: string, value: CandidateReviewV10): boolean {
  if (value.verdict === "PASS") return value.issue === null && value.meaningPreserved && value.objectiveSatisfied && value.voicePreserved && !value.unsupportedInformation;
  if (value.verdict === "LOCAL_REPAIR") return Boolean(value.issue && candidate.slice(value.issue.span.start, value.issue.span.end) === value.issue.span.text);
  return value.issue === null;
}

const requestsVoiceChange = (objective: string) => /\b(?:voice|tone|style|register|casual|formal|punctuation|fragments?|less polished)\b/i.test(objective);

/** Published v10 behavior stays pinned. */
export async function runVerifiedReconstruction(requestRaw: ReconstructionRequest, objectiveRaw: string, config: VerifiedEditorConfig): Promise<VerifiedResultV10> {
  return runVerifiedCore(requestRaw, objectiveRaw, config, 10) as Promise<VerifiedResultV10>;
}

/** Experimental v11 branch. No production route selects it. */
export async function runObjectiveAwareReconstruction(requestRaw: ReconstructionRequest, objectiveRaw: string, config: VerifiedEditorConfig): Promise<VerifiedResultV11> {
  return runVerifiedCore(requestRaw, objectiveRaw, config, 11) as Promise<VerifiedResultV11>;
}

/** Editor v2 only; all V11 verification, repair, and fallback behavior is shared unchanged. */
export async function runObjectiveAwareEditorReconstruction(requestRaw: ReconstructionRequest, objectiveRaw: string, config: VerifiedEditorConfig): Promise<VerifiedResultV12> {
  return runVerifiedCore(requestRaw, objectiveRaw, config, 12) as Promise<VerifiedResultV12>;
}

/** V13 uses the same editor and semantic verifier as V12; only exact-delta matching differs. */
export async function runExactDeltaReconstruction(requestRaw: ReconstructionRequest, objectiveRaw: string, config: VerifiedEditorConfig): Promise<VerifiedResultV13> {
  return runVerifiedCore(requestRaw, objectiveRaw, config, 13) as Promise<VerifiedResultV13>;
}

async function runVerifiedCore(requestRaw: ReconstructionRequest, objectiveRaw: string, config: VerifiedEditorConfig,
  version: 10 | 11 | 12 | 13): Promise<VerifiedResultV10 | VerifiedResultV11 | VerifiedResultV12 | VerifiedResultV13> {
  const request = reconstructionRequestSchema.parse(requestRaw);
  const objective = objectiveRaw.trim();
  if (!objective || objective.length > 500) throw new Error("An explicit editing objective of at most 500 characters is required.");
  assertFree(config.editor, config.confirmedNoIncrementalCost === true);
  assertFree(config.verifier, config.confirmedNoIncrementalCost === true);
  assertFree(config.repairer, config.confirmedNoIncrementalCost === true);
  if (config.verifier && config.verifier === config.editor) throw new Error("V10 requires a separate verifier caller.");
  const started = Date.now();
  const source = request.source;
  const strategy = version === 13 ? RECONSTRUCTION_V13 : version === 12 ? RECONSTRUCTION_V12 : version === 11 ? RECONSTRUCTION_V11 : RECONSTRUCTION_V10;
  const profile = request.refinement ? applyRefinement(request.profile, request.refinement.change) : request.profile;
  const plan = buildRewritePlan({ source, profile, current: request.refinement?.current, refinement: request.refinement?.change,
    voiceprint: request.voiceprint, protectedPhrases: request.protectedPhrases }, strategy);
  const verifyContext = { removableSpans: plan.removableSpans, licenses: plan.refinementDelta?.licenses, protectedPhrases: plan.protectedPhrases };
  const prompt = getPrompt(strategy.prompt).system;
  const verify = (text: string) => version === 13 ? verifyExactObjectiveDeltas(source, text, objective, profile, verifyContext)
    : version !== 10 ? verifyObjectiveAware(source, text, objective, profile, verifyContext)
      : { verification: verifyDeterministic(source, text, profile, verifyContext), authorized: [] };
  const timeoutMs = config.timeoutMs ?? 20_000;
  let candidate: string | null = null;
  let candidateVerification: VerificationResult | null = null;
  let review: CandidateReviewV10 | null = null;
  let editorMs = 0, verificationMs = 0, repairMs = 0;
  const metas: CallMeta[] = [];
  const trace = { strategy: version === 13 ? "reconstruction-v13" : version === 12 ? "reconstruction-v12" : version === 11 ? "reconstruction-v11" : "reconstruction-v10", editor: config.editor.info.model ?? config.editor.info.provider,
    verifier: config.verifier ? config.verifier.info.model ?? config.verifier.info.provider : null,
    objectiveType: kindForObjective(objective), candidateGenerated: false, candidateUnchanged: false, deterministicVerdict: null,
    semanticVerificationRequested: false, semanticVerdict: null, repairRequested: false, repairAccepted: false,
    outcome: "source-fallback", fallbackReason: null, sourceChars: source.length, candidateChars: null, finalChars: source.length,
    sourceWords: words(source).length, candidateWords: null, finalWords: words(source).length,
    wordEditDistance: { candidate: null, final: 0 },
    changeCount: 0, voiceVerdict: null, tokens: { input: null, output: null },
    latencyMs: { editor: 0, verification: 0, repair: 0, total: 0 }, estimatedCostUsd: null,
    ...(version !== 10 ? { authorizedChangeCount: 0, repairClassification: null } : {}) } as VerifiedTraceV10 | VerifiedTraceV11 | VerifiedTraceV12 | VerifiedTraceV13;

  const finish = (text: string, outcome: Outcome, reason: FallbackReason | "verifier-malformed" | null): VerifiedResultV10 | VerifiedResultV11 | VerifiedResultV12 | VerifiedResultV13 => {
    trace.outcome = outcome; trace.fallbackReason = reason; trace.finalChars = text.length; trace.finalWords = words(text).length;
    if (trace.strategy !== "reconstruction-v10" && trace.repairRequested)
      trace.repairClassification = outcome === "repaired" ? text === source ? "SAFE_REVERSION" : "USEFUL_REPAIR" : "FAILED_REPAIR";
    trace.wordEditDistance = { candidate: candidate === null ? null : wordingRetention(source, candidate).wordEditDistance,
      final: wordingRetention(source, text).wordEditDistance };
    trace.latencyMs = { editor: editorMs, verification: verificationMs, repair: repairMs, total: Date.now() - started };
    const input = metas.map((meta) => meta.inputTokens);
    const output = metas.map((meta) => meta.outputTokens);
    trace.tokens = { input: input.every((n) => n !== undefined) ? input.reduce<number>((n, x) => n + (x ?? 0), 0) : null,
      output: output.every((n) => n !== undefined) ? output.reduce<number>((n, x) => n + (x ?? 0), 0) : null };
    return { source, candidate, text, candidateVerification, finalVerification: verify(text).verification, review, trace } as VerifiedResultV10 | VerifiedResultV11 | VerifiedResultV12 | VerifiedResultV13;
  };

  try {
    const t = Date.now();
    const response = await timed(config.editor.callStructured(candidateSchema, "frontier-editor", prompt, JSON.stringify({
      source, objective, current: request.refinement?.current, style: plan.style,
      localFindings: plan.avoid.slice(0, 8).map(({ name, guidance, examples }) => ({ name, guidance, examples })),
      discourseFindings: plan.discourse?.findings.slice(0, 5), sourceVoice: plan.sourceVoice.notes,
      voiceprint: request.voiceprint ? { observations: request.voiceprint.observations, recurringPhrases: request.voiceprint.stats?.recurringPhrases } : undefined,
      protected: plan.preserve, protectedPhrases: plan.protectedPhrases.map((p) => p.text),
      semanticDiagnosis: config.diagnosis ? { disposition: config.diagnosis.disposition,
        findings: config.diagnosis.findings.slice(0, 5).map(({ phenomenon, scope, reason, evidence }) =>
          ({ phenomenon, scope, reason, evidence: evidence.map((span) => span.text) })),
        missingInformation: config.diagnosis.missingInformation } : undefined,
    })), timeoutMs);
    editorMs += Date.now() - t; metas.push(response.meta);
    const parsed = candidateSchema.safeParse(response.data);
    if (!parsed.success || !parsed.data.text.trim()) return finish(source, "source-fallback", "invalid-candidate");
    candidate = parsed.data.text;
    trace.candidateGenerated = true; trace.candidateUnchanged = candidate === source;
    trace.candidateChars = candidate.length; trace.candidateWords = words(candidate).length;
  } catch (error) { return finish(source, "source-fallback", error instanceof Error && error.message === "timeout" ? "timeout" : "editor-unavailable"); }

  async function inspect(text: string): Promise<{ verification: VerificationResult; voice: ReturnType<typeof compareVoiceDevices>; semantic: CandidateReviewV10 | null; reason: FallbackReason | "verifier-malformed" | null }> {
    const t = Date.now();
    const checked = verify(text);
    const verification = checked.verification;
    const voice = compareVoiceDevices(source, text, plan.sourceVoice.slopDensity);
    if (text === candidate) {
      candidateVerification = verification;
      trace.deterministicVerdict = deterministicVerdict(verification);
      trace.voiceVerdict = voice.verdict;
      trace.changeCount = allChanges(integrityReport(source, text, profile, verifyContext)).length;
      if (trace.strategy !== "reconstruction-v10") trace.authorizedChangeCount = checked.authorized.length;
    }
    if (verification.status === "rejected") { verificationMs += Date.now() - t; return { verification, voice, semantic: null, reason: "hard-meaning-failure" }; }
    if (!config.verifier) { verificationMs += Date.now() - t; return { verification, voice, semantic: null, reason: "verifier-unavailable" }; }
    trace.semanticVerificationRequested = true;
    try {
      const response = await timed(config.verifier.callStructured(candidateReviewSchemaV10, "candidate-verifier", getPrompt({ id: "verify", version: version === 10 ? 2 : 3 }).system,
        JSON.stringify({ source, candidate: text, objective, deterministicFindings: verification.findings,
          ...(version !== 10 ? { authorizedChanges: checked.authorized } : {}),
          voiceDeviations: voice.deviations, voiceprint: request.voiceprint ? {
            observations: request.voiceprint.observations, stats: request.voiceprint.stats,
          } : undefined, protectedPhrases: plan.protectedPhrases.map((p) => p.text) })), timeoutMs);
      metas.push(response.meta);
      const parsed = candidateReviewSchemaV10.safeParse(response.data);
      verificationMs += Date.now() - t;
      if (!parsed.success || !validReview(text, parsed.data) ||
        (voice.verdict === "DAMAGED" && parsed.data.verdict === "PASS" && !requestsVoiceChange(objective)))
        return { verification, voice, semantic: null, reason: version !== 10 && !parsed.success ? "verifier-malformed" : "invalid-verifier" };
      trace.semanticVerdict = parsed.data.verdict;
      return { verification, voice, semantic: parsed.data, reason: parsed.data.verdict === "REJECT" ? "verifier-rejected" : null };
    } catch (error) {
      verificationMs += Date.now() - t;
      return { verification, voice, semantic: null, reason: error instanceof Error && error.message === "timeout" ? "timeout"
        : version !== 10 && (error instanceof ZodError || error instanceof ProviderError && error.code === "invalid_output") ? "verifier-malformed" : "verifier-unavailable" };
    }
  }

  const first = await inspect(candidate);
  review = first.semantic;
  if (!first.reason && review?.verdict === "PASS") return finish(candidate, candidate === source ? "unchanged" : "accepted", null);
  const finding = first.verification.findings.find((item) => item.severity === "blocking" && item.candidate) ?? null;
  const span = localSpan(candidate, review, finding);
  if ((!first.reason && review?.verdict === "LOCAL_REPAIR" || first.reason === "hard-meaning-failure") && span) {
    if (!config.repairer) return finish(source, "source-fallback", "repair-unavailable");
    trace.repairRequested = true;
    try {
      const t = Date.now();
      const response = await timed(config.repairer.callStructured(repairSchema, "local-repair", getPrompt({ id: "repair", version: 2 }).system,
        JSON.stringify({ source, candidate, objective, affectedSpan: span,
          constraint: review?.issue?.constraint ?? finding?.message ?? "Restore the source claim without adding information." })), timeoutMs);
      repairMs += Date.now() - t; metas.push(response.meta);
      const parsed = repairSchema.safeParse(response.data);
      if (!parsed.success) return finish(source, "source-fallback", "repair-failed");
      const repaired = candidate.slice(0, span.start) + parsed.data.replacement + candidate.slice(span.end);
      if (repaired === candidate) return finish(source, "source-fallback", "repair-failed");
      const second = await inspect(repaired); // Full source/candidate verification, not a span-only check.
      if (!second.reason && second.semantic?.verdict === "PASS") { trace.repairAccepted = true; review = second.semantic; return finish(repaired, "repaired", null); }
      return finish(source, "source-fallback", second.reason ?? "repair-failed");
    } catch (error) { return finish(source, "source-fallback", error instanceof Error && error.message === "timeout" ? "timeout" : "repair-failed"); }
  }
  return finish(source, "source-fallback", first.reason ?? "verifier-rejected");
}
