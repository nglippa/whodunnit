import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { buildRewritePlan } from "../reconstruction/rewrite-plan";
import { RECONSTRUCTION_V3, RECONSTRUCTION_V5 } from "../reconstruction/strategies";
import { analyzeDiscourse } from "./analyze";

const broad = [
  "The committee inspected the north gate on Monday. The inspection supports a strategic improvement process. The caretaker replaced the cracked latch and wrote the part number in the log. This approach provides a meaningful outcome for the site.",
  "On Tuesday, two members checked the lock with the door shut. The result demonstrates valuable progress in the implementation process. They found that the key still stuck when turned left. The team ordered a new cylinder and kept the side entrance open.",
  "The cylinder arrived Thursday, and the caretaker fitted it before lunch. This development supports a broader quality objective. The key now turns in both directions, and the old cylinder is in the cabinet. This outcome contributes to an effective management approach.",
].join("\n\n");

const precise = [
  "The committee inspected the north gate on Monday. The caretaker found a cracked latch and wrote its part number in the log. She replaced it, but the key still stuck when turned left.",
  "On Tuesday, two members checked the lock with the door shut. The key jammed again. They ordered a new cylinder and kept the side entrance open until it arrived.",
  "The cylinder arrived Thursday. The caretaker fitted it before lunch. The key now turns in both directions, and the old cylinder is in the cabinet.",
].join("\n\n");

describe("discourse evidence", () => {
  it("requires repeated broad framing across paragraphs, while leaving factual prose alone", () => {
    const weak = analyzeDiscourse(broad);
    expect(weak.findings.find((f) => f.phenomenon === "GENERIC_REGISTER")).toMatchObject({ action: "DISTRIBUTED_LIGHT_EDIT" });
    expect(weak.findings[0].supporting.length).toBeGreaterThan(1);
    expect(analyzeDiscourse(precise).findings).toEqual([]);
  });

  it("keeps short text uncertain and does not infer genericness from one broad sentence", () => {
    expect(analyzeDiscourse("This process supports a meaningful outcome. The gate is open.").uncertainty).toBe("INSUFFICIENT_EVIDENCE");
    const one = precise.replace("The key jammed again.", "This process supports a meaningful outcome.");
    expect(analyzeDiscourse(one).findings.filter((f) => f.action !== "ADVISORY")).toEqual([]);
  });

  it("treats overlapping abstract restatements as advisory rather than deletion authority", () => {
    const first = "The gate repair supports a strategic improvement process. The gate repair supports this strategic improvement process. The caretaker changed the damaged latch and checked the door before the afternoon visitors arrived at the hall. The replacement key turned without catching, and the old latch went into the labeled cabinet beside the office.";
    const second = "The lock repair supports a meaningful quality outcome. The lock repair supports this meaningful quality outcome. The manager wrote the work in the maintenance log and told the evening staff which entrance they should use. The side door stayed open until the inspector completed the final check the following morning.";
    const analysis = analyzeDiscourse(`${first}\n\n${second}`);
    expect(analysis.findings.find((f) => f.phenomenon === "POSSIBLE_RESTATEMENT")).toMatchObject({ action: "ADVISORY", paragraphIndices: [0, 1] });
  });

  it("never lets uniform paragraph counts alone order reconstruction", () => {
    const repeated = [0, 1, 2, 3].map((n) => `The crew inspected door ${n} before lunch. The hinge moved freely. The caretaker wrote the result in the log. The crew will check it again next month.`).join("\n\n");
    expect(analyzeDiscourse(repeated).findings.filter((f) => f.action !== "ADVISORY")).toEqual([]);
  });

  it("keeps a strong distributed finding after an unrelated factual sentence is appended", () => {
    const original = analyzeDiscourse(broad);
    const appended = analyzeDiscourse(`${broad}\n\nThe key is in the cabinet by the office door.`);
    expect(appended.findings.map((f) => f.phenomenon)).toEqual(original.findings.map((f) => f.phenomenon));
  });

  it("does not change findings when quoted material uses curly marks", () => {
    const straight = `${broad}\n\nThe caretaker wrote "the key turned" in the log.`;
    const curly = straight.replace('"the key turned"', '“the key turned”');
    expect(analyzeDiscourse(straight).findings.map((f) => f.phenomenon)).toEqual(analyzeDiscourse(curly).findings.map((f) => f.phenomenon));
  });

  it("keeps long deterministic analysis within a generous sanity budget", () => {
    analyzeDiscourse(broad); // warm imports and regexes before timing
    const started = performance.now();
    const result = analyzeDiscourse(Array.from({ length: 10 }, (_, n) => broad.replaceAll("gate", `door ${n}`)).join("\n\n"));
    expect(result.words).toBeGreaterThan(1000);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("carries formal and Voiceprint counterevidence into the action", () => {
    const formal = analyzeDiscourse(broad, { profile: PRESETS.academic });
    expect(formal.findings[0]).toMatchObject({ action: "ADVISORY" });
    const voiceprint = { confidence: 0.9, stats: { vocabulary: { longWordRate: { value: 0.4 } } } } as Voiceprint;
    const withVoiceprint = analyzeDiscourse(broad, { voiceprint });
    expect(withVoiceprint.findings[0].action).toBe("ADVISORY");
    expect(withVoiceprint.findings[0].counterevidence.join(" ")).toMatch(/Voiceprint/);
  });

  it("does not order a rewrite of factual academic prose under Natural", () => {
    const academic = [
      "The trial enrolled 240 patients across four clinics. A regression model provides a significant estimate of 0.42 percentage points per additional visit. The confidence interval ran from 0.11 to 0.73 points, and the comparison group received routine care.",
      "The retention result supports an important interpretation of a treatment effect. However, attendance was recorded by staff rather than verified independently. The estimate therefore describes an association in these records, not a proven benefit of extra visits.",
      "A sensitivity analysis provides an important check on the primary result. When the researchers excluded patients with incomplete records, the estimated difference narrowed. The report presents both estimates and states that the smaller group may not represent every clinic patient.",
    ].join("\n\n");
    const analysis = analyzeDiscourse(academic, { profile: PRESETS.natural });
    expect(analysis.findings.find((f) => f.phenomenon === "GENERIC_REGISTER")).toMatchObject({ action: "ADVISORY" });
    const plan = buildRewritePlan({ source: academic, profile: PRESETS.natural }, RECONSTRUCTION_V5);
    expect(plan.discourse?.findings.find((f) => f.phenomenon === "GENERIC_REGISTER")).toMatchObject({ action: "ADVISORY" });
  });

  it("does not let many transcript turns override genre counterevidence", () => {
    const text = [
      "Maya: The gate would not open on Monday. The inspection process supports a useful maintenance record.",
      "Lee: I saw the latch catch at the bottom. This observation provides a meaningful account of the issue.",
      "Maya: Did you try the spare key? The follow-up review supports an important check.",
      "Lee: Yes, I tried it after lunch. The second attempt provides a valuable comparison.",
      "Maya: The key turned, but the door stayed shut. Our review provides a useful record of the lock failure.",
      "Lee: I called the caretaker, and she moved the hinge pin. We left the door closed until she could replace the part in the morning, because the latch still caught when the wind pushed on it.",
    ].join("\n\n");
    const analysis = analyzeDiscourse(text);
    expect(analysis.structure.type).toBe("TRANSCRIPT");
    expect(analysis.findings.find((f) => f.phenomenon === "GENERIC_REGISTER")).toMatchObject({ action: "ADVISORY" });
  });

  it("records source-local repetition without treating it as permission for unrelated generic framing", () => {
    const repeated = analyzeDiscourse(broad, { sourceVoice: { deliberate: { repetition: true, dashes: false, fragments: false, lowercase: false, semicolons: false, parentheses: false }, repeatedOpening: null } });
    expect(repeated.findings[0].counterevidence.join(" ")).toMatch(/source-local voice/);
    expect(repeated.findings[0].action).toBe(analyzeDiscourse(broad).findings[0].action);
  });

  it("keeps the published plan unchanged and includes discourse only in experimental v5", () => {
    const v3 = buildRewritePlan({ source: broad, profile: PRESETS.natural }, RECONSTRUCTION_V3);
    const v5 = buildRewritePlan({ source: broad, profile: PRESETS.natural }, RECONSTRUCTION_V5);
    expect(v3.discourse).toBeUndefined();
    expect(v3.changeScope).toBeUndefined();
    expect(v5.discourse?.findings.some((f) => f.action === "DISTRIBUTED_LIGHT_EDIT")).toBe(true);
    expect(v5.changeScope).toBe("DISTRIBUTED_LIGHT_EDIT");
    expect(v5.minimalChange.unchangedPreferred).toBe(false);
  });

  it("does not expose input text in observations", () => {
    const source = broad.replace("north gate", "PRIVATE_SOURCE_SENTINEL");
    const analysis = analyzeDiscourse(source);
    expect(JSON.stringify(analysis)).not.toContain("PRIVATE_SOURCE_SENTINEL");
  });
});
