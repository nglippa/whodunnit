import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { PRESETS } from "@/domain/style";
import { DemoProvider } from "@/lib/ai/demo";
import { runReconstructionDetailed } from "./pipeline";
import { runObjectiveAwareReconstruction, runVerifiedReconstruction } from "./verified-reconstruction";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V10, RECONSTRUCTION_V11 } from "./strategies";

const caller = (values: unknown[], provider = "fake"): StructuredCaller => ({
  info: { mode: provider === "fake" ? "demo" : "live", provider, model: provider },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta: {} })) as unknown as StructuredCaller["callStructured"],
});
const request = (source: string) => ({ source, profile: PRESETS.natural });
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "The objective and all remaining source claims are preserved.", issue: null };

describe("experimental objective-aware verified reconstruction v11", () => {
  it("is version-isolated from v1 and the pinned v10 hard failure", async () => {
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V10.version).toBe(10);
    expect(RECONSTRUCTION_V11).toMatchObject({ version: 11, status: "experimental", prompt: { id: "reconstruct", version: 7 } });
    await expect(runReconstructionDetailed(request("We met Tuesday."), new DemoProvider(), { strategy: RECONSTRUCTION_V11 })).rejects.toThrow(/objective-aware verified runner/);
    const source = "The meeting is scheduled for Tuesday.";
    const candidate = "The meeting is scheduled for Wednesday.";
    const objective = "Update this to say the meeting is now Wednesday.";
    const old = await runVerifiedReconstruction(request(source), objective, { editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]) });
    const next = await runObjectiveAwareReconstruction(request(source), objective, { editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]) });
    expect(old.trace.deterministicVerdict).toBe("FAIL");
    expect(old.text).toBe(source);
    expect(next.trace).toMatchObject({ strategy: "reconstruction-v11", outcome: "accepted", authorizedChangeCount: 2 });
    expect(next.text).toBe(candidate);
    expect(JSON.stringify(next.trace)).not.toContain(objective);
  });

  it("keeps unrelated semantic damage blocking beside one authorized change", async () => {
    const source = "The review is Tuesday at 2 PM with Alex.";
    const candidate = "The review is Wednesday at 4 PM with Jordan.";
    const verifier = caller([pass]);
    const result = await runObjectiveAwareReconstruction(request(source), "Move the review to Wednesday.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier,
    });
    expect(result.trace.deterministicVerdict).toBe("FAIL");
    expect(result.text).toBe(source);
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("classifies malformed verifier output separately from rejection and transport failure", async () => {
    const source = "The team sent the update on Tuesday.";
    const result = await runObjectiveAwareReconstruction(request(source), "Keep this clear.", {
      editor: caller([{ text: source, changes: [] }]), verifier: caller([{ ...pass, issue: { text: "bad" } }]),
    });
    expect(result.trace).toMatchObject({ fallbackReason: "verifier-malformed", outcome: "source-fallback" });
  });

  it("separates source restoration, useful repair, and failed repair", async () => {
    const source = "The library may reopen Tuesday. Staff will post an update Monday.";
    const candidate = "The library will reopen Tuesday. Staff will post an update Monday.";
    const start = candidate.indexOf("will");
    const local = { ...pass, verdict: "LOCAL_REPAIR", meaningPreserved: false,
      issue: { span: { start, end: start + 4, text: "will" }, constraint: "Keep the opening date uncertain as in the source." } };
    const reverted = await runObjectiveAwareReconstruction(request(source), "Clarify the update.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([local, pass]), repairer: caller([{ replacement: "may" }]),
    });
    expect(reverted.trace.repairClassification).toBe("SAFE_REVERSION");
    const usefulSource = "It is important to note that the library may reopen Tuesday. Staff will post an update Monday.";
    const usefulCandidate = "The library will reopen Tuesday. Staff will post an update Monday.";
    const usefulStart = usefulCandidate.indexOf("will");
    const usefulLocal = { ...local, issue: { ...local.issue, span: { start: usefulStart, end: usefulStart + 4, text: "will" } } };
    const useful = await runObjectiveAwareReconstruction(request(usefulSource), "Remove empty framing.", {
      editor: caller([{ text: usefulCandidate, changes: [] }]), verifier: caller([usefulLocal, pass]), repairer: caller([{ replacement: "may" }]),
    });
    expect(useful.trace.repairClassification).toBe("USEFUL_REPAIR");
    expect(useful.text).not.toBe(usefulSource);
    const failed = await runObjectiveAwareReconstruction(request(source), "Clarify the update.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([local]), repairer: caller([{ replacement: "will" }]),
    });
    expect(failed.trace.repairClassification).toBe("FAILED_REPAIR");
  });

  it("preserves the zero-paid guard and source-only telemetry", async () => {
    await expect(runObjectiveAwareReconstruction(request("We met Tuesday."), "Clarify this.", {
      editor: caller([], "anthropic"), verifier: caller([pass]),
    })).rejects.toThrow(/no incremental API charge/);
    const source = "We met Tuesday.";
    const result = await runObjectiveAwareReconstruction(request(source), "Keep this if already clear.", {
      editor: caller([{ text: source, changes: [] }]), verifier: caller([pass]),
    });
    expect(result.trace.outcome).toBe("unchanged");
    expect(JSON.stringify(result.trace)).not.toContain(source);
  });
});
