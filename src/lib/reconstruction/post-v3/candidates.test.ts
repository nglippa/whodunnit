import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { PRESETS } from "@/domain/style";
import { runCandidateA, runCandidateB, runCandidateC, runCandidateD, type PostV3Review } from "./index";

const meta = { inputTokens: 10, outputTokens: 5, latencyMs: 3 };
const caller = (values: unknown[], provider = "fake"): StructuredCaller => ({
  info: { mode: provider === "fake" ? "demo" : "live", provider, model: provider },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  callStructured: vi.fn(async <T>(schema: z.ZodType<T>) => ({ data: schema.parse(values.shift()), meta })) as unknown as StructuredCaller["callStructured"],
});
const request = (source: string) => ({ source, profile: PRESETS.natural });
const safe = (overrides: Partial<PostV3Review> = {}): PostV3Review => ({
  safety: "SAFE", objectiveSatisfied: "YES", voicePreserved: true, unsupportedInformation: false,
  usefulPartial: false, reason: "The candidate is supported and fulfills the requested edit.", issue: null, ...overrides,
});
const unsafe = (candidate: string, spanText: string, constraint = "Preserve the source fact without adding a new claim."): PostV3Review => {
  const start = candidate.indexOf(spanText);
  return { ...safe(), safety: "UNSAFE", objectiveSatisfied: "NO", usefulPartial: false,
    unsupportedInformation: true, reason: "The candidate adds or changes unsupported meaning.",
    issue: { span: { start, end: start + spanText.length, text: spanText }, constraint } };
};

describe("post-V3 candidate arms", () => {
  it("keeps an explicit quoted X-to-Y update while preserving the surrounding claim", async () => {
    const source = "The workshop begins Tuesday at the library, and the doors open at 8 a.m.";
    const objective = 'Replace “Tuesday” with “Wednesday” and keep the doors opening at 8 a.m. unchanged.';
    const candidate = "The workshop begins Wednesday at the library, and the doors open at 8 a.m.";
    const result = await runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(result).toMatchObject({ text: candidate, status: "completed", trace: { arm: "A", outcome: "raw", reviewAttempts: 1 } });
  });

  it("does not let a vague update authorize an invented replacement", async () => {
    const source = "The workshop begins Tuesday at the library.";
    const result = await runCandidateD(request(source), "Update the latest details when available.",
      "The workshop begins Friday at the library.", { verifier: caller([unsafe("The workshop begins Friday at the library.", "Friday")]) });
    expect(result.text).not.toContain("Friday");
    expect(result.status).toBe("abstained");
  });

  it("does not mark a semantically plausible but unsupplied update as completed", async () => {
    const source = "The workshop begins Tuesday at the library.";
    const result = await runCandidateD(request(source), "Update the latest date using the new information.",
      "The workshop begins Wednesday at the library.", { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toContain("Wednesday");
  });

  it("protects a nearby unrelated fact during an authorized update", async () => {
    const source = "The workshop begins Tuesday, and the doors open at 8 a.m.";
    const result = await runCandidateA(request(source), 'Replace “Tuesday” with “Wednesday”.',
      "The workshop begins Wednesday, and the doors open at 9 a.m.",
      { verifier: caller([unsafe("The workshop begins Wednesday, and the doors open at 9 a.m.", "9 a.m.")]) });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
  });

  it("accepts a safe substantial paraphrase after whole-candidate review", async () => {
    const source = "We met in the small room after lunch and reviewed the draft together.";
    const candidate = "After lunch, we met in the small room to review the draft together.";
    const result = await runCandidateD(request(source), "Make this easier to read.", candidate, { verifier: caller([safe()]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("completed");
  });

  it.each([
    ["negation flip", "The team did not approve the proposal.", "The team approved the proposal.", "approved"],
    ["certainty upgrade", "The library may reopen Tuesday.", "The library will reopen Tuesday.", "will"],
    ["invented cause", "The meeting ended early.", "The meeting ended early because the client objected.", "because the client objected"],
    ["unrelated date and number", "The report was shared in June.", "The report was shared on June 18 after a 40-page review.", "June 18"],
  ])("rejects %s", async (_label, source, candidate, span) => {
    const reviewer = caller([unsafe(candidate, span)]);
    const result = await runCandidateD(request(source), "Make this clearer.", candidate, { verifier: reviewer });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
  });

  it("fails safely when the objective could refer to more than one source fact", async () => {
    const source = "The first meeting is Tuesday; the second meeting is also Tuesday.";
    const result = await runCandidateA(request(source), 'Replace “Tuesday” with “Wednesday”.',
      "The first meeting is Wednesday; the second meeting is also Wednesday.", { verifier: caller([safe()]) });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
  });

  it("preserves already-good wording when the objective allows it", async () => {
    const source = "We met Tuesday and sent the notes afterward.";
    const result = await runCandidateD(request(source), "Keep this wording if it already reads clearly.", source, { verifier: caller([safe()]) });
    expect(result.text).toBe(source);
    expect(result.status).toBe("completed");
  });

  it("retains a safe edit that carries the author's voice", async () => {
    const source = "I don't know why the door stuck — the hinge looked fine.";
    const candidate = "I don't know why the door got stuck — the hinge looked fine.";
    const result = await runCandidateD(request(source), "Make this a little clearer while keeping my voice.", candidate, { verifier: caller([safe()]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("completed");
  });

  it("rejects a repair that introduces a harmful unsupported change", async () => {
    const source = "We met Tuesday.";
    const candidate = "We met on Tuesday.";
    const result = await runCandidateD(request(source), "Make this clearer.", candidate, {
      verifier: caller([unsafe(candidate, "on")]),
      repairer: caller([{ replacement: "Friday " }]),
    });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
    expect(result.trace.repairAttempts).toBe(1);
    expect(result.trace.recheckAttempts).toBeLessThanOrEqual(1);
  });

  it("does not erase an authorized update when an unrelated raw detail needs repair", async () => {
    const source = "The workshop begins Tuesday at the library, and the board did not approve the proposal.";
    const objective = 'Replace “Tuesday” with “Wednesday”.';
    const raw = "The workshop begins Wednesday at the library, and the board approved the proposal.";
    const updated = "The workshop begins Wednesday at the library, and the board did not approve the proposal.";
    const result = await runCandidateB(request(source), objective, raw, {
      verifier: caller([safe()]),
    });
    expect(result.text).toBe(updated);
    expect(result.status).toBe("completed");
    expect(result.trace).toMatchObject({ outcome: "objective-update", reviewAttempts: 1, repairAttempts: 0, recheckAttempts: 0 });
  });

  it("accepts an independently safe partial when one part of the request cannot be done", async () => {
    const source = "The workshop is at the library, with a draft agenda.";
    const candidate = "The workshop is at the library, with a report agenda.";
    const result = await runCandidateC(request(source), 'Replace “draft” with “report” and add the unprovided room number.', candidate, {
      verifier: caller([safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true, reason: "The agenda wording changed safely, but no room number was supplied." })]),
    });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("incomplete");
  });

  it("enforces one review, one repair, and one recheck", async () => {
    const source = "The library may reopen Tuesday.";
    const candidate = "The library will reopen Tuesday.";
    const result = await runCandidateD(request(source), "Make this clearer.", candidate, {
      verifier: caller([unsafe(candidate, "will"), safe()]), repairer: caller([{ replacement: "may" }]),
    });
    expect(result.trace.reviewAttempts).toBeLessThanOrEqual(1);
    expect(result.trace.repairAttempts).toBeLessThanOrEqual(1);
    expect(result.trace.recheckAttempts).toBeLessThanOrEqual(1);
  });

  it("does not depend on an editor and abstains when review or repair is unavailable", async () => {
    const source = "We met Tuesday.";
    const unavailable = await runCandidateD(request(source), "Make this clearer.", "We met on Tuesday.");
    expect(unavailable).toMatchObject({ text: source, status: "abstained", trace: { technicalFailure: "verifier-unavailable" } });
    const repairUnavailable = await runCandidateD(request(source), "Make this clearer.", "We met on Tuesday.", {
      verifier: caller([unsafe("We met on Tuesday.", "on")]),
    });
    expect(repairUnavailable).toMatchObject({ text: source, status: "abstained", trace: { technicalFailure: "repair-unavailable" } });
  });

  it("abstains on malformed review, verifier errors, and timeout", async () => {
    const source = "We met Tuesday.";
    const malformed = await runCandidateD(request(source), "Make this clearer.", "We met on Tuesday.", { verifier: caller([{}]) });
    expect(malformed.status).toBe("abstained");
    expect(malformed.trace.technicalFailure).toBeTruthy();
    const failed = caller([]);
    failed.callStructured = vi.fn(async () => { throw Error("provider failed"); }) as unknown as StructuredCaller["callStructured"];
    const errored = await runCandidateD(request(source), "Make this clearer.", "We met on Tuesday.", { verifier: failed });
    expect(errored.status).toBe("abstained");
    const slow = caller([]);
    slow.callStructured = vi.fn(<T>() => new Promise<{ data: T; meta: typeof meta }>(() => {})) as unknown as StructuredCaller["callStructured"];
    const timedOut = await runCandidateD(request(source), "Make this clearer.", "We met on Tuesday.", { verifier: slow, timeoutMs: 2 });
    expect(timedOut.status).toBe("abstained");
  });

  it("denies metered live calls unless confirmed zero-cost account access is used", async () => {
    await expect(runCandidateD(request("We met Tuesday."), "Make this clearer.", "We met on Tuesday.", {
      verifier: caller([], "anthropic"), confirmedNoIncrementalCost: true,
    })).rejects.toThrow(/zero incremental cost/);
    const allowed = await runCandidateD(request("We met Tuesday."), "Make this clearer.", "We met on Tuesday.", {
      verifier: caller([safe()], "account-backed"), confirmedNoIncrementalCost: true,
    });
    expect(allowed.status).toBe("completed");
  });

  it("keeps the four arm wrappers distinct and validates each trace arm", async () => {
    const source = "The meeting is Tuesday.";
    const objective = 'Replace “Tuesday” with “Wednesday”.';
    const candidate = "The meeting is Wednesday.";
    const results = await Promise.all([
      runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) }),
      runCandidateB(request(source), objective, candidate, { verifier: caller([safe()]) }),
      runCandidateC(request(source), objective, candidate, { verifier: caller([safe()]) }),
      runCandidateD(request(source), objective, candidate, { verifier: caller([safe()]) }),
    ]);
    expect(results.map((result) => result.trace.arm)).toEqual(["A", "B", "C", "D"]);
    expect(results.every((result) => result.trace.reviewAttempts <= 1)).toBe(true);
  });

  it("does not turn a conditional update into an unconditional current truth", async () => {
    const source = "The proposal is still a draft.";
    const result = await runCandidateA(request(source), 'If approved, replace “draft” with “final”.',
      "The proposal is final.", { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toContain("is final");
  });

  it("does not apply a banquet guest-count instruction to the workshop", async () => {
    const source = "The workshop expects 12 guests; the banquet count is unconfirmed.";
    const verifier = caller([safe()]);
    const result = await runCandidateB(request(source), "Change the banquet count from 12 guests to 20 guests.",
      "The workshop expects 20 guests; the banquet count is unconfirmed.", { verifier });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toContain("workshop expects 20 guests");
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("does not authorize a quoted replacement when its named event is not the source event", async () => {
    const source = "The workshop is on Tuesday, and the banquet time is unconfirmed.";
    const verifier = caller([safe()]);
    const result = await runCandidateA(request(source), 'For the banquet, replace “Tuesday” with “Wednesday”.',
      "The workshop is on Wednesday, and the banquet time is unconfirmed.", { verifier });
    expect(result.status).not.toBe("completed");
    expect(result.text).toBe(source);
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("fails closed when the objective gives contradictory replacements for one literal", async () => {
    const source = "The workshop begins Tuesday.";
    const objective = 'Replace “Tuesday” with “Wednesday” and replace “Tuesday” with “Thursday”.';
    const result = await runCandidateA(request(source), objective, "The workshop begins Wednesday.", { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).toBe(source);
  });

  it("allows a unique explicit update with a natural everything-else constraint", async () => {
    const source = "The workshop begins Tuesday, and the doors open at 8 a.m.";
    const objective = 'Replace “Tuesday” with “Wednesday” and keep everything else unchanged.';
    const candidate = "The workshop begins Wednesday, and the doors open at 8 a.m.";
    const accepted = await runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(accepted.text).toBe(candidate);
    expect(accepted.status).toBe("completed");

    const collateral = "The workshop begins Wednesday, and the doors open at 9 a.m.";
    const rejected = await runCandidateA(request(source), objective, collateral, {
      verifier: caller([unsafe(collateral, "9 a.m.")]),
    });
    expect(rejected.text).toBe(source);
    expect(rejected.status).toBe("abstained");
  });

  it.each([runCandidateB, runCandidateC, runCandidateD])("does not complete an explicit update when RAW is unchanged", async (runCandidate) => {
    const source = "The workshop begins Tuesday.";
    const result = await runCandidate(request(source), 'Replace “Tuesday” with “Wednesday”.', source, { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
  });

  it.each([
    ["policy", "The current attendance policy allows guests.", "Update the latest attendance policy; the new policy text has not been provided.", "The updated attendance policy prohibits guests."],
    ["operational access instruction", "Staff may enter through the north door.", "Update the latest access instruction; the new instruction has not been provided.", "Staff must enter through the west door."],
  ])("does not deliver an invented %s when a semantic stub says SAFE and YES", async (_label, source, objective, invented) => {
    const result = await runCandidateD(request(source), objective, invented, { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toBe(invented);
  });

  it("does not invent a replacement policy from a vague policy-update request", async () => {
    const source = "The handbook allows remote work.";
    const objective = "Update the remote-work policy; its replacement text was not provided.";
    const invented = "The policy now requires three office days each week.";
    const result = await runCandidateD(request(source), objective, invented, { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toBe(invented);
  });

  it("does not let a SAFE semantic review overrule deterministic blocking", async () => {
    const source = "Costs fell 12% last year.";
    const candidate = "Costs fell 21% last year.";
    const verifier = caller([safe()]);
    const result = await runCandidateD(request(source), "Make this clearer.", candidate, { verifier });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it.each([
    ["approval prerequisite", "Only with committee approval, replace “Friday” with “Saturday”."],
    ["open question", "Should we replace “Friday” with “Saturday”?"],
  ])("does not treat an %s as current replacement authority", async (_label, objective) => {
    const source = "The lesson starts Friday.";
    // The false SAFE/YES stub challenges whether the authority gate runs before semantic review.
    const result = await runCandidateA(request(source), objective, "The lesson starts Saturday.", { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).toBe(source);
  });

  it("does not apply a weekday replacement to the wrong event when scope follows a dash", async () => {
    const source = "The rehearsal is Friday. The reception is Sunday.";
    const verifier = caller([safe()]);
    const result = await runCandidateA(request(source), 'Replace “Friday” with “Saturday” — the reception date.',
      "The rehearsal is Saturday. The reception is Sunday.", { verifier });
    expect(result.status).not.toBe("completed");
    expect(result.text).toBe(source);
    expect(verifier.callStructured).not.toHaveBeenCalled();
  });

  it("does not complete a missing policy update just because a separate style edit was made", async () => {
    const source = "We are writing to inform you that the lesson takes place in the hall.";
    const objective = "Update the registration policy and improve clarity.";
    const candidate = "The lesson takes place in the hall. Registration is free.";
    // SAFE/YES is deliberately false for the unsupported policy fact; this checks the pre-review boundary.
    const result = await runCandidateD(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(result.status).not.toBe("completed");
    expect(result.text).not.toContain("Registration is free");
  });

  it("accepts a plain replacement fact supplied directly in the objective", async () => {
    const source = "The lesson starts Friday.";
    const objective = "The lesson now starts Saturday. Please update the notice.";
    const candidate = "The lesson starts Saturday.";
    const result = await runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("completed");
  });

  it("allows an unrelated temporal condition to remain protected alongside the authorized update", async () => {
    const source = "The lesson starts Friday. Doors open before noon.";
    const objective = 'Replace “Friday” with “Saturday”. Preserve that the doors open before noon.';
    const candidate = "The lesson starts Saturday. Doors open before noon.";
    const result = await runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("completed");
  });

  it.each([runCandidateC, runCandidateD])("can retain safe useful partial work when the requested fact is missing", async (runCandidate) => {
    const source = "We are writing to inform you that the lesson takes place in the hall.";
    const objective = "Update the opening date, which is not supplied, and simplify the wording.";
    const candidate = "The lesson takes place in the hall.";
    const review = safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true,
      reason: "The wording is simpler, but the requested opening date was not supplied." });
    const result = await runCandidate(request(source), objective, candidate, { verifier: caller([review]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("incomplete");
  });

  it("treats an identical repeated replacement directive as redundant rather than conflicting", async () => {
    const source = "The lesson starts Friday.";
    const objective = 'Replace “Friday” with “Saturday”; replace “Friday” with “Saturday”.';
    const candidate = "The lesson starts Saturday.";
    const result = await runCandidateA(request(source), objective, candidate, { verifier: caller([safe()]) });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("completed");
  });

  it("does not apply a numeric update to an event named only in the objective prefix", async () => {
    const source = "The recital seats 12 guests. The supper seats 40 guests.";
    const objective = "For the supper, change seats from 12 guests to 18 guests.";
    const candidate = "The recital seats 18 guests. The supper seats 40 guests.";
    // False SAFE/YES challenges whether the wrong-event authorization is blocked before delivery.
    const verifier = caller([safe()]);
    const result = await runCandidateA(request(source), objective, candidate, { verifier });
    expect(result.status).not.toBe("completed");
    expect(result.text).toBe(source);
  });

  it("does not let C's incomplete path discard a source approval condition", async () => {
    const source = "If approved, the lecture is Thursday.";
    const objective = "If approved, the lecture is now Friday. Update the notice.";
    const candidate = "The lecture is Friday.";
    // This deliberately false partial review tests whether C can bypass the preserved condition.
    const reviewer = caller([safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true,
      reason: "The date wording changed, but approval remains a condition." })]);
    const result = await runCandidateC(request(source), objective, candidate, { verifier: reviewer });
    expect(result.text).not.toBe(candidate);
    expect(result.status).not.toBe("completed");
  });

  it("allows a safe partial paraphrase using a synonym when the missing fact stays absent", async () => {
    const source = "We wish to advise you that the lecture is in the annex.";
    const objective = "Update the closing date, which is not supplied, and simplify the wording.";
    const candidate = "The talk is in the annex.";
    // SAFE/PARTIAL is a parser and delivery-gate control, not evidence of semantic model accuracy.
    const reviewer = caller([safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true,
      reason: "The wording is simpler; the closing date was not supplied." })]);
    const result = await runCandidateC(request(source), objective, candidate, { verifier: reviewer });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("incomplete");
  });

  it("rejects a new lowercase factual assertion after a semicolon even with SAFE useful-partial review", async () => {
    const source = "The seminar is in the hall.";
    const objective = "Update the closing date, which is not provided, and simplify the wording.";
    const candidate = "The seminar is in the hall; admission is free.";
    // Deliberately false SAFE/PARTIAL tests the deterministic guard, not model accuracy.
    const reviewer = caller([safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true,
      reason: "The venue wording is clear, but the closing date is missing." })]);
    const result = await runCandidateD(request(source), objective, candidate, { verifier: reviewer });
    expect(result.text).toBe(source);
    expect(result.status).toBe("abstained");
  });

  it("allows a faithful sentence split as useful partial work after SAFE review", async () => {
    const source = "The seminar is in the hall and admission is free.";
    const objective = "Update the closing date, which is not provided, and make this easier to scan.";
    const candidate = "The seminar is in the hall. Admission is free.";
    // SAFE/PARTIAL controls whether a verified equivalent split can pass the code's partial gate.
    const reviewer = caller([safe({ objectiveSatisfied: "PARTIAL", usefulPartial: true,
      reason: "The assertions remain the same and the date was not supplied." })]);
    const result = await runCandidateD(request(source), objective, candidate, { verifier: reviewer });
    expect(result.text).toBe(candidate);
    expect(result.status).toBe("incomplete");
  });
});
