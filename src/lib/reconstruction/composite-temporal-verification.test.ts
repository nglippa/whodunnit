import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { verifyExactObjectiveDeltas } from "./exact-delta-verification";
import { verifyCompositeTemporalDelta } from "./composite-temporal-verification";
import { runCompositeTemporalReconstruction, runExactDeltaReconstruction } from "./verified-reconstruction";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V13, RECONSTRUCTION_V14 } from "./strategies";

const check = (source: string, candidate: string, objective: string) =>
  verifyCompositeTemporalDelta(source, candidate, objective, PRESETS.natural);
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true,
  voicePreserved: true, unsupportedInformation: false, reason: "The objective supplies the exact replacement; other facts remain.", issue: null };
const caller = (values: unknown[]): StructuredCaller => ({
  info: { mode: "demo", provider: "saved-fixture", model: "saved-fixture" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta: {} })) as StructuredCaller["callStructured"],
});

describe("v14 composite temporal authorization", () => {
  it("preserves production and pinned V13 while accepting the frozen ar04 candidate", async () => {
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V13).toMatchObject({ version: 13, status: "experimental", prompt: { id: "reconstruct", version: 8 } });
    expect(RECONSTRUCTION_V14).toMatchObject({ version: 14, status: "experimental", prompt: { id: "reconstruct", version: 8 } });
    const frozen = (await import("../../../data/fixtures/v13-architecture-replay/run-v13.json")).default.rows
      .find((row: { id: string }) => row.id === "ar04")!;
    const old = verifyExactObjectiveDeltas(frozen.source, frozen.candidate, frozen.objective, PRESETS.natural);
    const next = check(frozen.source, frozen.candidate, frozen.objective);
    expect(old.verification.status).toBe("rejected");
    expect(old.verification.findings.filter((item) => item.severity === "blocking").map((item) => item.source ?? item.candidate))
      .toEqual(["April 18", "April 19"]);
    expect(next.verification.status).not.toBe("rejected");
    expect(next.verification.findings.filter((item) => item.severity === "blocking")).toEqual([]);
    const pinned = await runExactDeltaReconstruction({ source: frozen.source, profile: PRESETS.natural }, frozen.objective,
      { editor: caller([{ text: frozen.candidate, changes: [] }]), verifier: caller([pass]) });
    const corrected = await runCompositeTemporalReconstruction({ source: frozen.source, profile: PRESETS.natural }, frozen.objective,
      { editor: caller([{ text: frozen.candidate, changes: [] }]), verifier: caller([pass]) });
    expect(pinned).toMatchObject({ text: frozen.source, trace: { strategy: "reconstruction-v13", outcome: "source-fallback" } });
    expect(corrected).toMatchObject({ text: frozen.candidate, trace: { strategy: "reconstruction-v14", outcome: "accepted" } });
    expect(JSON.stringify(corrected.trace)).not.toContain(frozen.source);
  });

  it.each([
    ["Meet Tuesday, October 6.", "Meet Wednesday, October 7.", "Move it to Wednesday, October 7."],
    ["Meet Tuesday, October 6. Ship Friday, October 9.", "Meet Wednesday, October 7. Ship Friday, October 9.", "Move the meeting to Wednesday, October 7."],
    ["Meet October 6.", "Meet October 7.", "Move it to October 7."],
    ["Meet Tuesday.", "Meet Wednesday.", "Move it to Wednesday."],
    ["Meet Tuesday, October 6, 2026.", "Meet Wednesday, October 7, 2026.", "Move it to Wednesday, October 7, 2026."],
    ["Meet Tuesday, October 6, 2026.", "Meet Wednesday, October 7, 2027.", "Move it to Wednesday, October 7, 2027."],
    ["The review is Tuesday, October 6 and the audit is Friday, October 9.",
      "The review is Wednesday, October 7 and the audit is Friday, October 9.", "Move the review to Wednesday, October 7."],
  ])("allows exactly the supplied replacement: %s", (source, candidate, objective) => {
    expect(check(source, candidate, objective).verification.status).not.toBe("rejected");
  });

  it.each([
    ["Meet Tuesday, October 6. Ship Friday, October 9.", "Meet Wednesday, October 7. Ship Saturday, October 10.", "Move the meeting to Wednesday, October 7."],
    ["Meet Tuesday, October 6, 2026.", "Meet Wednesday, October 7, 2027.", "Move it to Wednesday, October 7."],
    ["Meet Tuesday, October 6.", "Meet Wednesday, October 7.", "Update the meeting date."],
    ["Meet Tuesday, October 6.", "Meet Wednesday, October 7.", "Make this more concise."],
    ["Meet Tuesday, October 6.", "Meet Wednesday, October 7.", "Move it to October 7."],
    ["The review is Tuesday, October 6. The audit is Friday, October 9.",
      "The review is Wednesday, October 7. The audit is Friday, October 9.", "Move the audit to Wednesday, October 7."],
    ["The meeting is Tuesday, October 6. The audit is Friday, October 9.",
      "The meeting is Wednesday, October 7. The audit is Friday, October 9.",
      "Move the audit to Wednesday, October 7. Keep the meeting unchanged."],
    ["The meeting is Tuesday, October 6. The audit is Friday, October 9.",
      "The meeting is Wednesday, October 7. The audit is Friday, October 9.",
      "Keep the meeting unchanged. Move the audit to Wednesday, October 7."],
    ["The review is Tuesday, October 6.", "The review is Wednesday, October 7.",
      "Move the audit to Wednesday, October 7."],
  ])("keeps unlicensed or partial temporal changes blocking: %s", (source, candidate, objective) => {
    expect(check(source, candidate, objective).verification.status).toBe("rejected");
  });

  it("does not let repair broaden a licensed date change", async () => {
    const source = "Meet Tuesday, October 6. Ship Friday, October 9.";
    const candidate = "Meet Wednesday, October 7. Ship Saturday, October 10.";
    const result = await runCompositeTemporalReconstruction({ source, profile: PRESETS.natural },
      "Move the meeting to Wednesday, October 7.", { editor: caller([{ text: candidate, changes: [] }]),
        verifier: caller([pass]), repairer: caller([{ replacement: "Saturday, October 10" }]) });
    expect(result.text).toBe(source);
    expect(result.trace).toMatchObject({ repairRequested: true, repairAccepted: false, outcome: "source-fallback" });
  });
});
