import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "./rewrite-plan";
import { RECONSTRUCTION_V3 } from "./strategies";
import { auditWording } from "./wording-audit";

const planFor = (source: string) => buildRewritePlan({ source, profile: PRESETS.natural }, RECONSTRUCTION_V3);

describe("advisory wording audit", () => {
  it("counts a clean sentence changed while an unrelated detected sentence is edited", () => {
    const source = "Here's the thing: the schedule changed. We sent the signed form to Mina on Tuesday.";
    const plan = planFor(source);
    const changed = auditWording(source, "The schedule changed. The signed form was delivered to Mina on Tuesday.", plan);
    const preserved = auditWording(source, "The schedule changed. We sent the signed form to Mina on Tuesday.", plan);
    expect(changed.untargetedChangedSentences).toBe(1);
    expect(preserved.untargetedChangedSentences).toBe(0);
  });

  it("records corporate and nominalized drift only when the source used a plain action", () => {
    const source = "We use the checklist. We decide the order after the meeting.";
    const report = auditWording(source, "We leverage the checklist. We make a decision about the order after the meeting.", planFor(source));
    expect(report.plainToCorporate).toBe(1);
    expect(report.verbToNoun).toBe(1);
    expect(auditWording(source, source, planFor(source))).toMatchObject({ plainToCorporate: 0, verbToNoun: 0 });
  });

  it("tracks loss of a source-specific domain phrase without inventing a replacement", () => {
    const source = "The grain runs across the panel. We marked the grain before cutting across the grain again.";
    const plan = planFor(source);
    expect(plan.protectedPhrases.some((p) => p.reason === "domain-phrase")).toBe(true);
    expect(auditWording(source, source, plan).unretainedDomainPhrases).toBe(0);
    expect(auditWording(source, "The grain runs through the panel. We marked the grain before cutting again.", plan).unretainedDomainPhrases).toBeGreaterThan(0);
  });

  it("does not treat an explicit refinement as an unexplained sentence change", () => {
    const source = "The gate is open. The truck is parked beside it.";
    const plan = planFor(source);
    plan.refinement = { asks: ["Shorter"] };
    expect(auditWording(source, "The gate is open; the truck is beside it.", plan).untargetedChangedSentences).toBe(0);
  });

  it("does not count quote style or punctuation alone as changed wording", () => {
    const source = 'Nora said "the gate is open." We can leave now.';
    const output = "Nora said “the gate is open”. We can leave now!";
    expect(auditWording(source, output, planFor(source)).untargetedChangedSentences).toBe(0);
  });
});
