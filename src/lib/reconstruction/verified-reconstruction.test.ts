import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { PRESETS } from "@/domain/style";
import { DemoProvider } from "@/lib/ai/demo";
import { computeVoiceprintStats } from "@/lib/voiceprints/aggregate";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V10 } from "./strategies";
import { runReconstructionDetailed } from "./pipeline";
import { runVerifiedReconstruction } from "./verified-reconstruction";

const meta = { inputTokens: 10, outputTokens: 5, latencyMs: 3 };
const caller = (values: unknown[], provider = "fake"): StructuredCaller => ({
  info: { mode: provider === "fake" ? "demo" : "live", provider, model: provider },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta })) as unknown as StructuredCaller["callStructured"],
});
const request = (source: string) => ({ source, profile: PRESETS.natural });
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "The source meaning and requested expression survive.", issue: null };
const reject = { ...pass, verdict: "REJECT", meaningPreserved: false, reason: "The new claim is unsupported." };

describe("experimental verified frontier loop", () => {
  it("keeps v1 as the production default and isolates the v10 prompt", async () => {
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V10).toMatchObject({ version: 10, status: "experimental", prompt: { id: "reconstruct", version: 7 } });
    await expect(runReconstructionDetailed(request("We met Tuesday."), new DemoProvider(), { strategy: RECONSTRUCTION_V10 })).rejects.toThrow(/verified frontier runner/);
  });

  it("accepts an unchanged source only after independent objective review", async () => {
    const source = "We sent the team a clear update on Tuesday.";
    const editor = caller([{ text: source, changes: [] }]);
    const verifier = caller([pass]);
    const result = await runVerifiedReconstruction(request(source), "Keep this wording if it already reads clearly.", { editor, verifier });
    expect(result.trace).toMatchObject({ outcome: "unchanged", candidateUnchanged: true, semanticVerdict: "PASS", fallbackReason: null });
    expect(result.text).toBe(source);
    expect(verifier.callStructured).toHaveBeenCalledTimes(1);
  });

  it("accepts a verified edit and records text-free telemetry", async () => {
    const source = "On Friday, we will use the checklist.";
    const candidate = "We will use the checklist on Friday.";
    const result = await runVerifiedReconstruction(request(source), "Make this flow more naturally.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]),
    });
    expect(result.trace.outcome).toBe("accepted");
    expect(result.text).toBe(candidate);
    expect(result.trace.deterministicVerdict).toBe("PASS");
    expect(JSON.stringify(result.trace)).not.toContain(source);
    expect(JSON.stringify(result.trace)).not.toContain(candidate);
    expect(result.trace.tokens).toEqual({ input: 20, output: 10 });
  });

  it("returns the source on a hard semantic failure when no safe local repair is available", async () => {
    const source = "Costs fell 12% last year.";
    const verifier = caller([pass]);
    const result = await runVerifiedReconstruction(request(source), "Make this shorter.", {
      editor: caller([{ text: "Costs fell 21% last year.", changes: [] }]), verifier,
    });
    expect(result.trace).toMatchObject({ deterministicVerdict: "FAIL", outcome: "source-fallback", fallbackReason: "repair-unavailable" });
    expect(result.text).toBe(source);
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("repairs one exact local span and reverifies the entire candidate", async () => {
    const source = "Costs fell 12% last year.";
    const result = await runVerifiedReconstruction(request(source), "Make this clearer.", {
      editor: caller([{ text: "Costs fell 21% last year.", changes: [] }]),
      repairer: caller([{ replacement: "12%" }]), verifier: caller([pass]),
    });
    expect(result.trace).toMatchObject({ outcome: "repaired", repairRequested: true, repairAccepted: true });
    expect(result.text).toBe(source);
    expect(result.finalVerification.status).toBe("preserved");
  });

  it("uses semantic review for a localized uncertainty error and rejects failed repair", async () => {
    const source = "The library may reopen Tuesday.";
    const candidate = "The library will reopen Tuesday.";
    const start = candidate.indexOf("will");
    const local = { ...pass, verdict: "LOCAL_REPAIR", meaningPreserved: false, reason: "The plan became certain.",
      issue: { span: { start, end: start + 4, text: "will" }, constraint: "Retain the source's possibility, not certainty." } };
    const result = await runVerifiedReconstruction(request(source), "Make the plan clearer.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([local, reject]), repairer: caller([{ replacement: "might" }]),
    });
    expect(result.trace).toMatchObject({ repairRequested: true, repairAccepted: false, outcome: "source-fallback" });
    expect(result.text).toBe(source);
  });

  it("rejects an independent verifier rejection and unavailable verification", async () => {
    const source = "On Friday, we will use the checklist.";
    const candidate = "We will use the checklist on Friday.";
    const rejected = await runVerifiedReconstruction(request(source), "Improve flow.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([reject]),
    });
    expect(rejected.trace.fallbackReason).toBe("verifier-rejected");
    const unavailable = await runVerifiedReconstruction(request(source), "Improve flow.", { editor: caller([{ text: candidate, changes: [] }]) });
    expect(unavailable.trace.fallbackReason).toBe("verifier-unavailable");
  });

  it("requires objective satisfaction and voice preservation before accepting a semantic PASS", async () => {
    const source = "On Friday, we will use the checklist.";
    const candidate = "We will use the checklist on Friday.";
    const editor = caller([{ text: candidate, changes: [] }]);
    const verifier = caller([{ ...pass, objectiveSatisfied: false }]);
    const result = await runVerifiedReconstruction(request(source), "Shorten this and keep my wording.", { editor, verifier });
    expect(result.trace.fallbackReason).toBe("invalid-verifier");
    expect(result.text).toBe(source);
    const editorPayload = JSON.parse((editor.callStructured as ReturnType<typeof vi.fn>).mock.calls[0][3] as string) as { objective: string; sourceVoice: string[] };
    expect(editorPayload.objective).toMatch(/Shorten/);
    expect(editorPayload.sourceVoice).toBeDefined();
    const verifyPayload = JSON.parse((verifier.callStructured as ReturnType<typeof vi.fn>).mock.calls[0][3] as string) as { source: string; candidate: string; voiceDeviations: unknown[] };
    expect(verifyPayload).toMatchObject({ source, candidate });
    expect(verifyPayload.voiceDeviations).toBeDefined();
  });

  it("does not let a verifier PASS erase a strong source-local voice device", async () => {
    const source = [
      "I don't know why the door stuck — the hinge looked fine.", "We weren't late — the bus simply never came.",
      "She couldn't see the sign — the rain covered it.", "I'd brought the map — it stayed folded in my pocket.",
      "They didn't leave early — the meeting ended on time.", "We couldn't use the lamp — the cord was missing.",
      "I hadn't noticed the crack — it ran along the window.", "He wasn't certain — the receipt had faded by then.",
    ].join(" ");
    const candidate = source.replaceAll(" — ", ", ");
    const result = await runVerifiedReconstruction(request(source), "Make this clearer.", {
      editor: caller([{ text: candidate, changes: [] }]), verifier: caller([pass]),
    });
    expect(result.trace.voiceVerdict).toBe("DAMAGED");
    expect(result.trace.fallbackReason).toBe("invalid-verifier");
    expect(result.text).toBe(source);
  });

  it("requires a separate verifier caller", async () => {
    const shared = caller([]);
    await expect(runVerifiedReconstruction(request("We met Tuesday."), "Improve flow.", { editor: shared, verifier: shared })).rejects.toThrow(/separate verifier/);
  });

  it("passes saved Voiceprint evidence to both editor and verifier", async () => {
    const source = "We met Tuesday, then wrote the report.";
    const stats = computeVoiceprintStats([{ text: source }, { text: source }])?.stats;
    expect(stats).toBeDefined();
    const voiceprint = { id: "vp", name: "Author", description: "", sampleCount: 2, totalWords: 16,
      stats: stats!, observations: [], confidence: 0.5, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
    const editor = caller([{ text: source, changes: [] }]);
    const verifier = caller([pass]);
    await runVerifiedReconstruction({ ...request(source), voiceprint }, "Keep this if it is already clear.", { editor, verifier });
    const editorPayload = JSON.parse((editor.callStructured as ReturnType<typeof vi.fn>).mock.calls[0][3] as string) as { voiceprint: { observations: unknown[] } };
    const verifierPayload = JSON.parse((verifier.callStructured as ReturnType<typeof vi.fn>).mock.calls[0][3] as string) as { voiceprint: { stats: unknown } };
    expect(editorPayload.voiceprint.observations).toEqual([]);
    expect(verifierPayload.voiceprint.stats).toEqual(stats);
  });

  it("falls back on malformed output, provider error, and timeout", async () => {
    const source = "The meeting starts on Friday.";
    const malformed = await runVerifiedReconstruction(request(source), "Make it concise.", { editor: caller([{ text: "", changes: [] }]) });
    expect(malformed.trace.outcome).toBe("source-fallback");
    const failed = caller([]);
    failed.callStructured = vi.fn(async () => { throw Error("provider failed"); }) as unknown as StructuredCaller["callStructured"];
    expect((await runVerifiedReconstruction(request(source), "Make it concise.", { editor: failed })).trace.fallbackReason).toBe("editor-unavailable");
    const slow = caller([]);
    slow.callStructured = vi.fn(<T>() => new Promise<{ data: T; meta: typeof meta }>(() => {})) as unknown as StructuredCaller["callStructured"];
    expect((await runVerifiedReconstruction(request(source), "Make it concise.", { editor: slow, timeoutMs: 2 })).trace.fallbackReason).toBe("timeout");
  });

  it("denies metered live routes even if a caller asserts free access", async () => {
    await expect(runVerifiedReconstruction(request("We met Tuesday."), "Make it concise.", {
      editor: caller([], "anthropic"), confirmedNoIncrementalCost: true,
    })).rejects.toThrow(/denies live providers/);
    await expect(runVerifiedReconstruction(request("We met Tuesday."), "Make it concise.", {
      editor: caller([]), verifier: caller([], "gemini"), confirmedNoIncrementalCost: true,
    })).rejects.toThrow(/denies live providers/);
  });
});
