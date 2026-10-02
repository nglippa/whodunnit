import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { verifyCompositeTemporalDelta } from "./composite-temporal-verification";
import { verifyDirectiveScopedTemporalDelta } from "./directive-scoped-temporal-verification";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";
import { runCompositeTemporalReconstruction, runDirectiveScopedTemporalReconstruction } from "./verified-reconstruction";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V14, RECONSTRUCTION_V15 } from "./strategies";

const source = "The review is Tuesday, October 6. The audit is Friday, October 9.";
const candidate = "The review is Wednesday, October 7. The audit is Friday, October 9.";
const collateral = "The review is Wednesday, October 7. The audit is Saturday, October 10.";
const objective = "Do not change the audit. Move the review to Wednesday, October 7.";
const check = (from: string, to: string, request: string) =>
  verifyDirectiveScopedTemporalDelta(from, to, request, PRESETS.natural);
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true,
  voicePreserved: true, unsupportedInformation: false, reason: "Only the explicit review date changes.", issue: null };
const caller = (values: unknown[]): StructuredCaller => ({
  info: { mode: "demo", provider: "saved-fixture", model: "saved-fixture" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta: {} })) as StructuredCaller["callStructured"],
});

describe("v15 directive-scoped composite temporal authorization", () => {
  it("pins V14 and preserves production while accepting the exact live counterexample", async () => {
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V14).toMatchObject({ version: 14, status: "experimental", prompt: { id: "reconstruct", version: 8 } });
    expect(RECONSTRUCTION_V15).toMatchObject({ version: 15, status: "experimental", prompt: { id: "reconstruct", version: 8 } });
    expect(verifyCompositeTemporalDelta(source, candidate, objective, PRESETS.natural).verification.status).toBe("rejected");
    expect(check(source, candidate, objective).verification.findings.filter((finding) => finding.severity === "blocking")).toEqual([]);
    const v14Verifier = caller([pass]);
    const v15Verifier = caller([pass]);
    const v14 = await runCompositeTemporalReconstruction({ source, profile: PRESETS.natural }, objective,
      { editor: caller([{ text: candidate, changes: [] }]), verifier: v14Verifier });
    const v15 = await runDirectiveScopedTemporalReconstruction({ source, profile: PRESETS.natural }, objective,
      { editor: caller([{ text: candidate, changes: [] }]), verifier: v15Verifier });
    expect(v14).toMatchObject({ text: source, trace: { strategy: "reconstruction-v14", outcome: "source-fallback",
      deterministicVerdict: "FAIL", semanticVerificationRequested: false } });
    expect(v14Verifier.callStructured).not.toHaveBeenCalled();
    expect(v15).toMatchObject({ text: candidate, trace: { strategy: "reconstruction-v15", outcome: "accepted",
      semanticVerificationRequested: true, semanticVerdict: "PASS" } });
    expect(v15Verifier.callStructured).toHaveBeenCalledOnce();
  });

  it.each([
    [objective, candidate],
    ["Keep everything else unchanged. Move the review to Wednesday, October 7.", candidate],
    ["Keep the audit unchanged. Move the review to Wednesday, October 7.", candidate],
    ["Leave the audit date alone. Move the review to Wednesday, October 7.", candidate],
    ["Preserve the audit date. Move the review to Wednesday, October 7.", candidate],
    ["Don't touch the audit. Move the review to Wednesday, October 7.", candidate],
    ["Move the review to Wednesday, October 7. Do not change the audit.", candidate],
    ["Do not change the audit; move the review to Wednesday, October 7.", candidate],
  ])("allows only an exact update alongside independent protection: %s", (request, result) => {
    expect(check(source, result, request).verification.status).not.toBe("rejected");
  });

  it.each([
    [objective, collateral],
    ["Keep everything else unchanged. Move the review to Wednesday, October 7.", collateral],
    ["Do not change any dates. Move the review to Wednesday, October 7.", candidate],
    ["Do not change the review date. Move the review to Wednesday, October 7.", candidate],
    ["Keep all dates unchanged. Move the review to Wednesday, October 7.", candidate],
    ["Do not change the audit. Update the review date.", candidate],
    ["Make this clearer, but don't change the audit.", candidate],
    ["Do not change the review and the audit. Move the review to Wednesday, October 7.", candidate],
    ["Do not change the schedule. Move the review to Wednesday, October 7.", candidate],
  ])("keeps conflicts, collateral changes, and vague targets blocking: %s", (request, result) => {
    expect(check(source, result, request).verification.status).toBe("rejected");
  });

  it("keeps source-event identity unique when the affirmative update targets the second date", () => {
    const request = "Do not change the review. Move the audit to Saturday, October 10.";
    expect(check(source, "The review is Tuesday, October 6. The audit is Saturday, October 10.", request)
      .verification.status).not.toBe("rejected");
    expect(check(source, collateral, request).verification.status).toBe("rejected");
  });

  it("fails closed on global and same-target conflicts for a date-only replacement too", () => {
    const from = "The review is October 6. The audit is October 9.";
    const to = "The review is October 7. The audit is October 9.";
    expect(check(from, to, "Do not change any dates. Move the review to October 7.").verification.status).toBe("rejected");
    expect(check(from, to, "Do not change the review date. Move the review to October 7.").verification.status).toBe("rejected");
  });

  it.each([
    "Do not change the audit or any dates. Move the review to Wednesday, October 7.",
    "Do not change the audit or any other dates. Move the review to Wednesday, October 7.",
    "Keep the audit and all dates unchanged. Move the review to Wednesday, October 7.",
    "Leave the audit and every date alone. Move the review to Wednesday, October 7.",
    "No dates should change. Move the review to Wednesday, October 7.",
  ])("blocks a coordinated global temporal protection: %s", (request) => {
    expect(check(source, candidate, request).verification.status).toBe("rejected");
  });

  it("allows an unrelated protected non-temporal claim", () => {
    const from = "The review is Tuesday, October 6. The headline is Ready.";
    const to = "The review is Wednesday, October 7. The headline is Ready.";
    expect(check(from, to, "Do not change the headline. Move the review to Wednesday, October 7.")
      .verification.status).not.toBe("rejected");
  });

  it("fails closed when an unmatched protection could name the only source event", () => {
    const from = "The review is Tuesday, October 6.";
    const to = "The review is Wednesday, October 7.";
    const request = "Do not change the appointment. Move the review to Wednesday, October 7.";
    expect(verifyCompositeTemporalDelta(from, to, request, PRESETS.natural).verification.status).toBe("rejected");
    expect(check(from, to, request).verification.status).toBe("rejected");
  });

  it("revokes a V14 grant when an unidentified protection could name its only event", () => {
    const from = "The review is Tuesday, October 6.";
    const to = "The review is Wednesday, October 7.";
    const request = "Keep the event unchanged. Move the review to Wednesday, October 7.";
    expect(verifyCompositeTemporalDelta(from, to, request, PRESETS.natural).verification.status).not.toBe("rejected");
    expect(check(from, to, request).verification.status).toBe("rejected");
  });

  it.each([
    "Do not change the shipment. Move the audit after the review to Wednesday, October 7.",
    "Do not change the shipment. Move the audit, not the review, to Wednesday, October 7.",
    "Move the audit, not the review, to Wednesday, October 7.",
  ])("does not use an incidental or negated mention as the affirmative target: %s", (request) => {
    const from = "The review is Tuesday, October 6. The shipment is Friday, October 9. The audit is pending.";
    const to = "The review is Wednesday, October 7. The shipment is Friday, October 9. The audit is pending.";
    expect(check(from, to, request).verification.status).toBe("rejected");
  });

  it("keeps the previously authorized ar04 and ct02 exact edits", async () => {
    const ar04 = (await import("../../../data/fixtures/v13-architecture-replay/run-v13.json")).default.rows
      .find((row: { id: string }) => row.id === "ar04")!;
    expect(check(ar04.source, ar04.candidate, ar04.objective).verification.status).not.toBe("rejected");
    expect(check("The public workshop meets Tuesday, October 6, 2026, in Room 5. Registration closes at noon.",
      "The public workshop meets Thursday, October 7, 2027, in Room 5. Registration closes at noon.",
      "Move the public workshop to Thursday, October 7, 2027. Keep Room 5 and the registration time.")
      .verification.status).not.toBe("rejected");
  });

  it("keeps other protected facts in pinned ct03 and ct05", () => {
    expect(check("The permit review is Tuesday, October 6, and the audit is Friday, October 9. Both begin at 9 a.m.",
      "The permit review is Wednesday, October 7, and the audit is Friday, October 9. Both begin at 9 a.m.",
      "Move the permit review to Wednesday, October 7. Keep the audit date and both start times.")
      .verification.status).not.toBe("rejected");
    expect(check("The receipt deadline is November 2. Please use the envelope at the front desk.",
      "The receipt deadline is November 3. Please use the envelope at the front desk.",
      "Move the receipt deadline to November 3. Keep the delivery instruction.")
      .verification.status).not.toBe("rejected");
  });

  it.each([
    ["The review is October 6. The audit remains open.", "The review is October 7! The audit remains open.",
      "Do not change any dates. Move the review to October 7."],
    ["Meet October 6.", "Meet October 7!", "Do not change the meeting date. Move it to October 7."],
    ["The review is October 6. The audit is October 9.", "The review is October 6. The audit is October 7!",
      "Do not change the audit. Move the review to October 7."],
    ["The review is Tuesday, October 6, in Room 5.", "The review is Wednesday, October 7, in Room 5.",
      "Keep Room 5 and the date unchanged. Move the review to Wednesday, October 7."],
    ["The review is Tuesday, October 6, in Room 5.", "The review is Wednesday, October 7, in Room 5.",
      "Keep Room 5 and its date unchanged. Move the review to Wednesday, October 7."],
    ["The review with the audit is Tuesday, October 6, in Room 5.",
      "The review with the audit is Wednesday, October 7, in Room 5.",
      "Do not change the audit in Room 5. Move the review to Wednesday, October 7."],
    ["The review with the audit is Tuesday, October 6, in Room 5.",
      "The review with the audit is Wednesday, October 7, in Room 5.",
      "Keep the audit in Room 5 unchanged. Move the review to Wednesday, October 7."],
  ])("guards baseline date grants against protected facts, even with punctuation: %s", (from, to, request) => {
    expect(check(from, to, request).verification.status).toBe("rejected");
  });

  it("leaves non-temporal exact-delta authorization unchanged", () => {
    const from = "Taylor will prepare the report. Alex will review it.";
    const to = "Morgan will prepare the report. Alex will review it.";
    const request = "Change the report owner from Taylor to Morgan. Do not change Alex's role.";
    expect(check(from, to, request)).toEqual(verifyExactObjectiveDeltas(from, to, request, PRESETS.natural));
  });
});
