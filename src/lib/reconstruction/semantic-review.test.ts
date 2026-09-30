import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V1, RECONSTRUCTION_V5, RECONSTRUCTION_V6 } from "./strategies";
import { buildSemanticPlan, reconcileSemanticReview, routeSemanticReview, semanticRequest, semanticReviewSchema, structuredSemanticReviewer, validateSemanticReview, type SemanticReview, type SemanticReviewClient } from "./semantic-review";
import { runReconstructionDetailed } from "./pipeline";
import { DemoProvider } from "../ai/demo";
import type { StructuredCaller } from "../ai/provider";

const clean = "Maya opened the old ticket after lunch. The screenshots still showed the earlier form, so she replaced them. I checked the new images against the live page. The labels now match. We left the release note alone because it already describes the change accurately. Maya will send the support team the new link on Thursday.";
const source = [
  "The team moved the report to Friday after the service failed twice. We told support before the noon handoff. The report still includes the earlier figures.",
  "The delivery timeline changed because the technical service had two failures. This adjustment reflects the team's response to the revised schedule. It shows how the group handled the situation.",
  "The change in timing required an updated report date. That change again illustrates the need to respond to service issues. The broader point is the value of schedule awareness.",
].join("\n\n");
const span = (text: string, phrase: string) => {
  const start = text.indexOf(phrase);
  if (start < 0) throw new Error("fixture span absent");
  return { start, end: start + phrase.length, text: phrase };
};
const review = (text: string, overrides: Partial<SemanticReview> = {}): SemanticReview => ({
  disposition: "LOCAL_EDIT",
  confidence: 0.85,
  deterministicDecisionAgreement: false,
  findings: [{ phenomenon: "REDUNDANCY", scope: "LOCAL", severity: "MODERATE", confidence: 0.83, evidence: [span(text, text.split(".")[0] + ".")], reason: "The follow-up wording repeats the same schedule change.", counterevidence: [] }],
  counterevidence: [],
  brakeReason: null,
  missingInformation: [],
  safeToRewriteWithoutNewFacts: true,
  paragraphRoles: [],
  ...overrides,
});
const plan = (text: string) => buildRewritePlan({ source: text, profile: PRESETS.natural }, RECONSTRUCTION_V6);

describe("bounded semantic review", () => {
  it("uses a strict schema and exact source-bound UTF-16 spans", () => {
    expect(semanticReviewSchema.safeParse({ ...review(source), surprise: true }).success).toBe(false);
    expect(validateSemanticReview(source, review(source)).findings).toHaveLength(1);
    expect(() => validateSemanticReview(source, review(source, { findings: [{ ...review(source).findings[0], evidence: [{ start: 0, end: 4, text: "fake" }] }] }))).toThrow(/evidence/);
    expect(() => validateSemanticReview(source, review(source, { disposition: "SUBSTANTIVE_RECONSTRUCTION" }))).toThrow(/distributed/);
  });

  it("requires missing information when safe rewriting is impossible", () => {
    expect(() => validateSemanticReview(source, review(source, { safeToRewriteWithoutNewFacts: false }))).toThrow(/missing-information/);
    const p = plan(source);
    const guarded = review(source, { safeToRewriteWithoutNewFacts: false, missingInformation: ["the decision made after the failure"] });
    expect(reconcileSemanticReview(source, p, guarded)).toBe(semanticRequest({ source, profile: PRESETS.natural }, p).deterministicScope);
  });

  it("routes advisory or long uncertain prose, while short clean text stays local", () => {
    expect(routeSemanticReview(plan("I sent the draft. She approved it."))).toEqual({ requested: false, reasons: [] });
    expect(routeSemanticReview(plan(source), "all").requested).toBe(true);
    const p = plan(source);
    p.discourse!.findings.push({ phenomenon: "POSSIBLE_RESTATEMENT", confidence: 0.6, scope: "distributed", paragraphIndices: [0, 1], supporting: [], counterevidence: [], action: "ADVISORY" });
    expect(routeSemanticReview(p).reasons).toContain("advisory discourse evidence");
  });

  it("refuses confident unsupported expansion and requires multiple paragraphs for substantive scope", () => {
    const p = plan(clean);
    const weak = review(clean, { findings: [{ ...review(clean).findings[0], confidence: 0.4 }] });
    expect(reconcileSemanticReview(clean, p, weak)).toBe(semanticRequest({ source: clean, profile: PRESETS.natural }, p).deterministicScope);
    const one = review(source, { disposition: "SUBSTANTIVE_RECONSTRUCTION", findings: [{ ...review(source).findings[0], scope: "DISTRIBUTED", severity: "MAJOR" }] });
    expect(reconcileSemanticReview(source, p, one)).not.toBe("SUBSTANTIVE_RECONSTRUCTION");
    const two = review(source, { disposition: "SUBSTANTIVE_RECONSTRUCTION", findings: [{ ...one.findings[0], evidence: [span(source, "The team moved the report to Friday"), span(source, "The delivery timeline changed")], reason: "The document repeatedly restates the schedule change without adding facts." }] });
    expect(reconcileSemanticReview(source, p, two)).toBe("SUBSTANTIVE_RECONSTRUCTION");
    expect(reconcileSemanticReview(source, p, { ...two, missingInformation: ["the missing decision record"] })).not.toBe("SUBSTANTIVE_RECONSTRUCTION");
  });

  it("can brake heuristic pressure with source counterevidence but preserves deterministic triggers", () => {
    const p = plan(source);
    const no = review(source, { disposition: "LEAVE_ALONE", findings: [], counterevidence: [span(source, "The report still includes the earlier figures.")], brakeReason: "The sentence is a factual reminder, not empty summary." });
    p.avoid = [{ ruleId: "heuristic", name: "Possible repeated opening", severity: "suggestion", determinism: "heuristic", occurrences: 1, examples: ["The report still includes the earlier figures."], guidance: "Review" }];
    expect(reconcileSemanticReview(source, p, no)).toBe("LEAVE_ALONE");
    p.avoid[0].determinism = "deterministic";
    expect(reconcileSemanticReview(source, p, no)).toBe("LOCAL_EDIT");
    p.avoid[0].determinism = "heuristic";
    p.refinement = { asks: ["shorter"] };
    expect(reconcileSemanticReview(source, p, no)).not.toBe("LEAVE_ALONE");
  });

  it("falls back on malformed results, timeout and errors without logging source text", async () => {
    const input = { source, profile: PRESETS.natural };
    const bad: SemanticReviewClient = { model: "fake", review: vi.fn(async () => ({ review: { ...review(source), findings: [{ ...review(source).findings[0], evidence: [{ start: 0, end: 6, text: "SECRET" }] }] }, meta: { inputTokens: 100, outputTokens: 50 } })) };
    const invalid = await buildSemanticPlan(input, bad, { mode: "all", pricing: { inputPerMillion: 1, outputPerMillion: 2 } });
    expect(invalid.telemetry).toMatchObject({ outcome: "invalid", inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.0002 });
    expect(JSON.stringify(invalid.telemetry)).not.toContain("SECRET");
    let signal: AbortSignal | undefined;
    const timeout: SemanticReviewClient = { model: "fake", review: (_, s) => { signal = s; return new Promise(() => {}); } };
    const expired = await buildSemanticPlan(input, timeout, { mode: "all", timeoutMs: 2 });
    expect(expired.telemetry.outcome).toBe("timeout");
    expect(signal?.aborted).toBe(true);
    expect(expired.finalScope).toBe(semanticRequest(input, plan(source)).deterministicScope);
    const failed = await buildSemanticPlan(input, { model: "fake", review: async () => { throw new Error("SECRET source echoed by provider"); } }, { mode: "all" });
    expect(failed.telemetry.outcome).toBe("error");
    expect(JSON.stringify(failed.telemetry)).not.toContain("SECRET");
  });

  it("adapts a provider-neutral structured caller and validates its response", async () => {
    const caller: StructuredCaller = {
      info: { mode: "live", provider: "fake-cloud", model: "fake-model" },
      callStructured: vi.fn(async (schema, name, system, user) => {
        expect(name).toBe("semantic-review");
        expect(system).toContain("bounded editorial reviewer");
        expect(JSON.parse(user as string).source).toBe(source);
        return { data: schema.parse(review(source)), meta: { inputTokens: 11, outputTokens: 7 } };
      }) as StructuredCaller["callStructured"],
      generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
    };
    const result = await buildSemanticPlan({ source, profile: PRESETS.natural }, structuredSemanticReviewer(caller), { mode: "all" });
    expect(result.telemetry).toMatchObject({ outcome: "accepted", model: "fake-model", inputTokens: 11, outputTokens: 7 });
  });

  it("keeps v1 and v5 plans pinned when v6 is present", () => {
    const a = buildRewritePlan({ source: clean, profile: PRESETS.natural }, RECONSTRUCTION_V1);
    const b = buildRewritePlan({ source: clean, profile: PRESETS.natural }, RECONSTRUCTION_V5);
    expect(a.discourse).toBeUndefined();
    expect(b.discourse).toBeDefined();
    expect(a.budget.strategy).toBe("reconstruction-v1");
    expect(b.budget.strategy).toBe("reconstruction-v5");
    const unmarked = "Check the seal before opening.\nRecord the serial number.\nIf the label is torn, call the supervisor.\nAttach the record to the case.";
    expect(buildRewritePlan({ source: unmarked, profile: PRESETS.natural }, RECONSTRUCTION_V5).discourse?.structure.type).not.toBe("PROCEDURE");
    expect(buildRewritePlan({ source: unmarked, profile: PRESETS.natural }, RECONSTRUCTION_V6).discourse?.structure.type).toBe("PROCEDURE");
  });

  it("uses v6 review before unchanged bypass, and never calls it for v1 or v5", async () => {
    const reviewer: SemanticReviewClient = { model: "fake", review: vi.fn(async () => ({ review: review(clean) })) };
    const request = { source: clean, profile: PRESETS.natural };
    const provider = new DemoProvider();
    await runReconstructionDetailed(request, provider, { strategy: RECONSTRUCTION_V1, semanticReviewer: reviewer });
    await runReconstructionDetailed(request, provider, { strategy: RECONSTRUCTION_V5, semanticReviewer: reviewer });
    expect(reviewer.review).not.toHaveBeenCalled();
    const telemetry: string[] = [];
    const v6 = await runReconstructionDetailed(request, provider, { strategy: RECONSTRUCTION_V6, semanticReviewer: reviewer, semanticReviewMode: "all", onSemanticPlan: (m) => telemetry.push(m.outcome) });
    expect(reviewer.review).toHaveBeenCalledTimes(1);
    expect(telemetry).toEqual(["accepted"]);
    expect(v6.plan.changeScope).toBe("LOCAL_EDIT");
  });
});
