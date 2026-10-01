import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { verifyObjectiveAware } from "./objective-aware-verification";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";
import { runExactDeltaReconstruction, runObjectiveAwareEditorReconstruction } from "./verified-reconstruction";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V11, RECONSTRUCTION_V12, RECONSTRUCTION_V13 } from "./strategies";

const check = (source: string, candidate: string, objective: string) =>
  verifyExactObjectiveDeltas(source, candidate, objective, PRESETS.natural);
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true,
  voicePreserved: true, unsupportedInformation: false, reason: "Requested change only; all other facts remain.", issue: null };
const caller = (values: unknown[]): StructuredCaller => ({
  info: { mode: "demo", provider: "fake", model: "fake" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta: {} })) as StructuredCaller["callStructured"],
});

describe("v13 exact objective deltas", () => {
  it("keeps production and pinned V11/V12 behavior isolated", async () => {
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V11.prompt.version).toBe(7);
    expect(RECONSTRUCTION_V12.prompt.version).toBe(8);
    expect(RECONSTRUCTION_V13).toMatchObject({ version: 13, status: "experimental", prompt: { id: "reconstruct", version: 8 } });
    const source = "The clinic opens May 14. The book sale is May 14.";
    const candidate = "The clinic opens May 21. The book sale is May 14.";
    const objective = "Update the clinic opening date to May 21.";
    expect(verifyObjectiveAware(source, candidate, objective, PRESETS.natural).verification.status).toBe("rejected");
    const old = await runObjectiveAwareEditorReconstruction({ source, profile: PRESETS.natural }, objective,
      { editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]) });
    const next = await runExactDeltaReconstruction({ source, profile: PRESETS.natural }, objective,
      { editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]) });
    expect(old.text).toBe(source);
    expect(next.text).toBe(candidate);
    expect(JSON.stringify(next.trace)).not.toContain(source);
  });

  it.each([
    ["The review is Tuesday and the audit is Friday.", "The review is Wednesday and the audit is Friday.", "The review is Wednesday and the audit is Saturday.", "Move the review to Wednesday."],
    ["Taylor will prepare the report. Alex will review it.", "Morgan will prepare the report. Alex will review it.", "Morgan will prepare the report. Jordan will review it.", "Change the report owner from Taylor to Morgan."],
    ["Order 12 units and keep 4 in reserve.", "Order 15 units and keep 4 in reserve.", "Order 15 units and keep 6 in reserve.", "Change the order quantity to 15."],
    ["The request is not approved. The budget is unchanged.", "The request is approved. The budget is unchanged.", "The request is approved. The budget increased.", "Update this to say the request is approved."],
  ])("allows the requested delta while blocking a collateral change: %s", (source, allowed, collateral, objective) => {
    expect(check(source, allowed, objective).verification.status).not.toBe("rejected");
    expect(check(source, collateral, objective).verification.status).toBe("rejected");
  });

  it("accepts a requested decision transition but not an unrequested one", () => {
    const source = "We may postpone the launch.";
    const candidate = "We have decided to postpone the launch.";
    expect(check(source, candidate, "Update this to say we have decided to postpone the launch.").verification.status).not.toBe("rejected");
    expect(check(source, candidate, "Make this more concise.").authorized).toHaveLength(0);
  });

  it("fails closed when the objective names no replacement value", () => {
    expect(check("The briefing is on Monday. The audit is on Friday.",
      "The briefing is on Thursday. The audit is on Friday.", "Update the briefing date.").verification.status).toBe("rejected");
  });

  it("does not let a semantic verifier or local repair override collateral hard failure", async () => {
    const source = "Order 12 units and keep 4 in reserve.";
    const candidate = "Order 15 units and keep 6 in reserve.";
    const verifier = caller([pass]);
    const result = await runExactDeltaReconstruction({ source, profile: PRESETS.natural }, "Change the order quantity to 15.",
      { editor: caller([{ text: candidate, changes: [] }]), verifier });
    expect(result.trace).toMatchObject({ deterministicVerdict: "FAIL", outcome: "source-fallback" });
    expect(result.text).toBe(source);
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("re-verifies the entire candidate after one attempted local repair", async () => {
    const source = "Order 12 units and keep 4 in reserve.";
    const candidate = "Order 15 units and keep 6 in reserve.";
    const result = await runExactDeltaReconstruction({ source, profile: PRESETS.natural }, "Change the order quantity to 15.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]),
      repairer: caller([{ replacement: "7" }]),
    });
    expect(result.trace).toMatchObject({ repairRequested: true, repairAccepted: false,
      repairClassification: "FAILED_REPAIR", outcome: "source-fallback" });
    expect(result.text).toBe(source);
  });

  it("rejects paid live callers and does not expose source in telemetry", async () => {
    const source = "The review is Tuesday and the audit is Friday.";
    await expect(runExactDeltaReconstruction({ source, profile: PRESETS.natural }, "Move the review to Wednesday.", {
      editor: { ...caller([]), info: { mode: "live", provider: "anthropic", model: "metered" } },
    })).rejects.toThrow(/no incremental API charge/);
    const result = await runExactDeltaReconstruction({ source, profile: PRESETS.natural }, "Move the review to Wednesday.", {
      editor: caller([{ text: source, changes: [] }]), verifier: caller([pass]),
    });
    expect(JSON.stringify(result.trace)).not.toContain(source);
  });
});
