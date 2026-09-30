import { z } from "zod";
import type { CallMeta, StructuredCaller } from "../ai/provider";
import type { PlanInput, RewritePlan } from "./rewrite-plan";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V6 } from "./strategies";
import { getPrompt } from "../prompts";

export const editingScopeSchema = z.enum(["LEAVE_ALONE", "LOCAL_EDIT", "DISTRIBUTED_LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "INSUFFICIENT_EVIDENCE"]);
export type EditingScope = z.infer<typeof editingScopeSchema>;
const spanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(600) }).strict();
export const semanticFindingSchema = z.object({
  phenomenon: z.enum(["GENERICNESS", "REDUNDANCY", "MECHANICAL_STRUCTURE", "REGISTER_INFLATION", "EMPTY_SIGNIFICANCE", "FORMULAIC_ARGUMENT", "LOCAL_WORDING", "VOICE", "MISSING_INFORMATION", "OTHER"]),
  scope: z.enum(["LOCAL", "DISTRIBUTED"]),
  severity: z.enum(["MINOR", "MODERATE", "MAJOR"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(spanSchema).min(1).max(4),
  reason: z.string().min(10).max(400),
  counterevidence: z.array(spanSchema).max(3),
}).strict();
export const semanticReviewSchema = z.object({
  disposition: editingScopeSchema,
  confidence: z.number().min(0).max(1),
  deterministicDecisionAgreement: z.boolean(),
  findings: z.array(semanticFindingSchema).max(8),
  counterevidence: z.array(spanSchema).max(6),
  brakeReason: z.string().min(12).max(350).nullable(),
  missingInformation: z.array(z.string().min(3).max(160)).max(5),
  safeToRewriteWithoutNewFacts: z.boolean(),
  /** One entry per reviewed paragraph. An editorial role, never a quality score. */
  paragraphRoles: z.array(z.enum(["ADDS_NEW_FACT", "ADDS_REASONING", "ADDS_EXAMPLE", "ADDS_CONTEXT", "ADDS_COUNTERPOINT", "RESTATES", "SUMMARIZES", "META_COMMENTARY", "UNCLEAR"])).max(40),
}).strict();
export type SemanticReview = z.infer<typeof semanticReviewSchema>;

export interface SemanticReviewRequest {
  source: string;
  documentType: string;
  documentTypeConfidence: number;
  deterministicScope: Exclude<EditingScope, "INSUFFICIENT_EVIDENCE">;
  localFindings: { name: string; severity: string; determinism: string; examples: string[] }[];
  discourseFindings: { phenomenon: string; action: string; paragraphIndices: number[]; counterevidence: string[] }[];
  voice: { confidence: number; notes: string[]; repeatedOpening: string | null };
  voiceprint?: { confidence: number; recurringPhrases: string[]; recurringOpeners: string[] };
  protectedContent: { numbers: string[]; dates: string[]; names: string[]; quotations: string[]; phrases: string[] };
  plannerRationale: string[];
}
export interface SemanticReviewClient {
  readonly model: string;
  review(request: SemanticReviewRequest, signal: AbortSignal): Promise<{ review: unknown; meta?: CallMeta }>;
}

/** StructuredCaller is transport only: no provider identity enters the domain contract. */
export function structuredSemanticReviewer(caller: StructuredCaller): SemanticReviewClient {
  return {
    model: caller.info.model ?? caller.info.provider,
    async review(request) {
      const { data, meta } = await caller.callStructured(semanticReviewSchema, "semantic-review", getPrompt({ id: "semantic-review", version: 2 }).system, JSON.stringify(request));
      return { review: data, meta };
    },
  };
}

export function semanticRequest(input: PlanInput, plan: RewritePlan): SemanticReviewRequest {
  const structure = plan.discourse?.structure;
  return {
    source: input.source,
    documentType: structure?.type ?? "UNKNOWN",
    documentTypeConfidence: structure?.confidence ?? 0,
    deterministicScope: plan.changeScope === "UNCHANGED" || !plan.changeScope && plan.minimalChange.unchangedPreferred ? "LEAVE_ALONE" : plan.changeScope ?? "LOCAL_EDIT",
    localFindings: plan.avoid.map(({ name, severity, determinism, examples }) => ({ name, severity, determinism, examples })),
    discourseFindings: plan.discourse?.findings.map(({ phenomenon, action, paragraphIndices, counterevidence }) => ({ phenomenon, action, paragraphIndices, counterevidence })) ?? [],
    voice: { confidence: plan.sourceVoice.confidence, notes: plan.sourceVoice.notes, repeatedOpening: plan.sourceVoice.repeatedOpening },
    ...(input.voiceprint?.stats ? { voiceprint: { confidence: input.voiceprint.confidence, recurringPhrases: input.voiceprint.stats.recurringPhrases.slice(0, 4), recurringOpeners: input.voiceprint.stats.recurringOpeners.slice(0, 3) } } : {}),
    protectedContent: { numbers: plan.preserve.numbers, dates: plan.preserve.dates, names: plan.preserve.names, quotations: plan.preserve.quotations, phrases: plan.protectedPhrases.map((p) => p.text) },
    plannerRationale: plan.intensityReasons,
  };
}

export function validateSemanticReview(source: string, raw: unknown): SemanticReview {
  const review = semanticReviewSchema.parse(raw);
  const spans = [...review.counterevidence, ...review.findings.flatMap((finding) => [...finding.evidence, ...finding.counterevidence])];
  if (spans.some(({ start, end, text }) => end <= start || source.slice(start, end) !== text)) throw new Error("semantic-review evidence does not match source");
  if (!review.safeToRewriteWithoutNewFacts && review.missingInformation.length === 0) throw new Error("missing-information explanation required");
  if (review.disposition !== "LEAVE_ALONE" && review.disposition !== "INSUFFICIENT_EVIDENCE" && review.findings.length === 0) throw new Error("editing requires findings");
  if (review.disposition === "LEAVE_ALONE" && review.counterevidence.length > 0 && !review.brakeReason) throw new Error("brake requires an editorial reason");
  if (review.disposition === "SUBSTANTIVE_RECONSTRUCTION" && !review.findings.some((finding) => finding.scope === "DISTRIBUTED")) throw new Error("substantive editing requires distributed evidence");
  return review;
}

export interface ReviewRoute { requested: boolean; reasons: string[] }
export function routeSemanticReview(plan: RewritePlan, mode: "selective" | "all" = "selective"): ReviewRoute {
  if (mode === "all") return { requested: true, reasons: ["development all-review comparison"] };
  const reasons: string[] = [];
  const scope = plan.changeScope ?? (plan.minimalChange.unchangedPreferred ? "UNCHANGED" : "LOCAL_EDIT");
  const structure = plan.discourse?.structure;
  if (plan.discourse?.findings.some((f) => f.action === "ADVISORY")) reasons.push("advisory discourse evidence");
  if (scope === "UNCHANGED" && plan.discourse && plan.discourse.words >= 150 && (structure?.type === "PROSE" || structure?.type === "UNKNOWN")) reasons.push("long prose or unknown form with no actionable local evidence");
  if (scope === "SUBSTANTIVE_RECONSTRUCTION") reasons.push("broad editing needs independent review");
  if (plan.avoid.length && (plan.permitted.length || (structure?.confidence ?? 0) < 0.7)) reasons.push("local finding with possible voice or genre counterevidence");
  return { requested: reasons.length > 0, reasons };
}

function paragraphIndex(source: string, start: number): number { return source.slice(0, start).split(/\n\s*\n/).length - 1; }
function distributedEvidence(source: string, review: SemanticReview): boolean {
  const paragraphs = new Set(review.findings.filter((f) => f.scope === "DISTRIBUTED" && f.confidence >= 0.7).flatMap((f) => f.evidence.map((span) => paragraphIndex(source, span.start))));
  return paragraphs.size >= 2 && review.findings.some((f) => f.scope === "DISTRIBUTED" && f.severity === "MAJOR");
}
const HARD_DETERMINISTIC = new Set(["deterministic"]);
function counterevidenceCoversLocalFindings(source: string, plan: RewritePlan, review: SemanticReview): boolean {
  if (plan.avoid.length === 0) return true;
  return plan.avoid.every((finding) => finding.examples.length > 0 && finding.examples.some((example) => {
    const excerpt = example.endsWith("…") ? example.slice(0, -1) : example;
    const start = source.indexOf(excerpt);
    return start >= 0 && review.counterevidence.some((span) => span.start < start + excerpt.length && span.end > start);
  }));
}
export function reconcileSemanticReview(source: string, plan: RewritePlan, review: SemanticReview): Exclude<EditingScope, "INSUFFICIENT_EVIDENCE"> {
  const base = plan.changeScope === "UNCHANGED" || !plan.changeScope && plan.minimalChange.unchangedPreferred ? "LEAVE_ALONE" : plan.changeScope ?? "LOCAL_EDIT";
  if (review.disposition === "INSUFFICIENT_EVIDENCE") return base;
  if (review.disposition === "LEAVE_ALONE") {
    if (plan.refinement || plan.targetRanges.some((t) => t.action !== "keep" && (t.layer === "user-instruction" || t.layer === "voiceprint" && t.strength >= 0.6))) return base === "LEAVE_ALONE" ? "LOCAL_EDIT" : base;
    if (plan.avoid.some((f) => HARD_DETERMINISTIC.has(f.determinism))) return "LOCAL_EDIT";
    return review.confidence >= 0.7 && review.brakeReason && counterevidenceCoversLocalFindings(source, plan, review) ? "LEAVE_ALONE" : base;
  }
  if (!review.safeToRewriteWithoutNewFacts) return base;
  const supported = review.findings.some((f) => f.confidence >= 0.7 && f.evidence.length >= 1 && f.severity !== "MINOR");
  if (!supported || review.confidence < 0.7) return base;
  // Missing facts can be named by a reviewer that still claims editing is safe.
  // They must never become a reason to widen the entire document's editing scope.
  if (review.disposition === "SUBSTANTIVE_RECONSTRUCTION") return review.missingInformation.length === 0 && distributedEvidence(source, review) ? "SUBSTANTIVE_RECONSTRUCTION" : base;
  if (review.disposition === "DISTRIBUTED_LIGHT_EDIT") return review.findings.some((f) => f.scope === "DISTRIBUTED") ? "DISTRIBUTED_LIGHT_EDIT" : base;
  return base === "SUBSTANTIVE_RECONSTRUCTION" ? "LOCAL_EDIT" : "LOCAL_EDIT";
}

export interface SemanticPlanningResult {
  plan: RewritePlan;
  route: ReviewRoute;
  review: SemanticReview | null;
  finalScope: Exclude<EditingScope, "INSUFFICIENT_EVIDENCE">;
  telemetry: { requested: boolean; outcome: "not-routed" | "unavailable" | "accepted" | "invalid" | "error" | "timeout"; model: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number; estimatedCostUsd: number | null; deterministicScope: string; reviewDisposition: EditingScope | null; agreement: boolean | null; findingCount: number; missingInformationCount: number; finalScope: string };
}
function effectivePlan(plan: RewritePlan, scope: Exclude<EditingScope, "INSUFFICIENT_EVIDENCE">, review: SemanticReview | null): RewritePlan {
  const unchanged = scope === "LEAVE_ALONE";
  const changeScope = unchanged ? "UNCHANGED" : scope;
  const intensity = unchanged ? "minimal" : scope === "SUBSTANTIVE_RECONSTRUCTION" ? "substantial" : "normal";
  return {
    ...plan,
    changeScope,
    intensity,
    intensityReasons: review && !unchanged ? [...plan.intensityReasons, "validated semantic review supports the selected scope"] : plan.intensityReasons,
    minimalChange: unchanged ? { unchangedPreferred: true, reasons: ["deterministic evidence and bounded semantic review support leaving wording unchanged"] } : { unchangedPreferred: false, reasons: ["editing has an evidence-backed reason"] },
    ...(review && !unchanged && review.safeToRewriteWithoutNewFacts ? { semanticEditing: { scope: changeScope as "LOCAL_EDIT" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION", findings: review.findings.filter((f) => f.confidence >= 0.7).slice(0, 4), missingInformation: review.missingInformation } } : {}),
  };
}
export async function buildSemanticPlan(input: PlanInput, client: SemanticReviewClient | null, options: { mode?: "selective" | "all"; timeoutMs?: number; pricing?: { inputPerMillion: number; outputPerMillion: number } } = {}): Promise<SemanticPlanningResult> {
  const plan = buildRewritePlan(input, RECONSTRUCTION_V6);
  const route = routeSemanticReview(plan, options.mode);
  const base = semanticRequest(input, plan).deterministicScope;
  const telemetry: SemanticPlanningResult["telemetry"] = { requested: route.requested, outcome: "not-routed", model: null, inputTokens: null, outputTokens: null, latencyMs: 0, estimatedCostUsd: null, deterministicScope: base, reviewDisposition: null, agreement: null, findingCount: 0, missingInformationCount: 0, finalScope: base };
  if (!route.requested || !client) {
    if (route.requested) telemetry.outcome = "unavailable";
    return { plan: effectivePlan(plan, base, null), route, review: null, finalScope: base, telemetry };
  }
  telemetry.model = client.model;
  const controller = new AbortController();
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = client.review(semanticRequest(input, plan), controller.signal);
    const reply = await Promise.race([call, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs); })]);
    telemetry.inputTokens = reply.meta?.inputTokens ?? null;
    telemetry.outputTokens = reply.meta?.outputTokens ?? null;
    if (options.pricing && telemetry.inputTokens !== null && telemetry.outputTokens !== null) telemetry.estimatedCostUsd = (telemetry.inputTokens * options.pricing.inputPerMillion + telemetry.outputTokens * options.pricing.outputPerMillion) / 1_000_000;
    const review = validateSemanticReview(input.source, reply.review);
    const finalScope = reconcileSemanticReview(input.source, plan, review);
    telemetry.outcome = "accepted";
    telemetry.reviewDisposition = review.disposition;
    telemetry.agreement = review.disposition === "INSUFFICIENT_EVIDENCE" ? null : review.disposition === base;
    telemetry.findingCount = review.findings.length;
    telemetry.missingInformationCount = review.missingInformation.length;
    telemetry.finalScope = finalScope;
    return { plan: effectivePlan(plan, finalScope, review), route, review, finalScope, telemetry };
  } catch (error) {
    telemetry.outcome = error instanceof Error && error.message === "timeout" ? "timeout" : error instanceof z.ZodError || error instanceof Error && /evidence|requires|missing-information/.test(error.message) ? "invalid" : "error";
    return { plan: effectivePlan(plan, base, null), route, review: null, finalScope: base, telemetry };
  } finally {
    if (timer) clearTimeout(timer);
    telemetry.latencyMs = Math.round(performance.now() - started);
  }
}
