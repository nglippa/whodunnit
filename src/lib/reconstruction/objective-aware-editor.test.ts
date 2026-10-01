import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { PRESETS } from "@/domain/style";
import { getPrompt } from "@/lib/prompts";
import { DEFAULT_STRATEGY, RECONSTRUCTION_V11, RECONSTRUCTION_V12 } from "./strategies";
import { runObjectiveAwareEditorReconstruction, runObjectiveAwareReconstruction } from "./verified-reconstruction";

const caller = (responses: unknown[], capture?: (system: string, user: string) => void, mode: "demo" | "live" = "demo"): StructuredCaller => ({
  info: { mode, provider: mode === "live" ? "metered-test" : "fake", model: "fixture" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>, _name: string, system: string, user: string) => {
    capture?.(system, user);
    return { data: schema.parse(responses.shift()), meta: {} };
  }) as unknown as StructuredCaller["callStructured"],
});
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "Only the exact user-requested source fact changed.", issue: null };

describe("versioned objective-aware editor", () => {
  it("changes only the editor prompt and retains V11 verification input and behavior", async () => {
    const source = "Taylor will present at the meeting Tuesday at 2 PM.";
    const objective = "Move the meeting to Wednesday.";
    const candidate = "Taylor will present at the meeting Wednesday at 2 PM.";
    const oldCalls: { system: string; user: string }[] = [];
    const nextCalls: { system: string; user: string }[] = [];
    const old = await runObjectiveAwareReconstruction({ source, profile: PRESETS.natural }, objective, {
      editor: caller([{ text: candidate, changes: [] }], (system, user) => oldCalls.push({ system, user })),
      verifier: caller([pass], (system, user) => oldCalls.push({ system, user })),
    });
    const next = await runObjectiveAwareEditorReconstruction({ source, profile: PRESETS.natural }, objective, {
      editor: caller([{ text: candidate, changes: [] }], (system, user) => nextCalls.push({ system, user })),
      verifier: caller([pass], (system, user) => nextCalls.push({ system, user })),
    });
    expect(DEFAULT_STRATEGY.version).toBe(1);
    expect(RECONSTRUCTION_V11.prompt).toEqual({ id: "reconstruct", version: 7 });
    expect(RECONSTRUCTION_V12.prompt).toEqual({ id: "reconstruct", version: 8 });
    expect(oldCalls[0].system).toBe(getPrompt(RECONSTRUCTION_V11.prompt).system);
    expect(nextCalls[0].system).toBe(getPrompt(RECONSTRUCTION_V12.prompt).system);
    expect(nextCalls[0].system).toContain("explicit replacement fact");
    expect(JSON.parse(nextCalls[0].user)).toEqual(JSON.parse(oldCalls[0].user));
    expect(nextCalls[1]).toEqual(oldCalls[1]);
    expect(old.text).toBe(candidate);
    expect(next.text).toBe(candidate);
    expect(next.trace.strategy).toBe("reconstruction-v12");
    expect(JSON.stringify(next.trace)).not.toContain(source);
    expect(JSON.stringify(next.trace)).not.toContain(objective);
  });

  it("keeps the paid-provider guard before editor execution", async () => {
    await expect(runObjectiveAwareEditorReconstruction({ source: "We met Tuesday.", profile: PRESETS.natural }, "Move it to Wednesday.", {
      editor: caller([], undefined, "live"), verifier: caller([pass]),
    })).rejects.toThrow(/no incremental API charge/);
  });
});
