import { describe, expect, it } from "vitest";
import { semanticDevelopmentCorpusSchema, evaluateSemanticDevelopment } from "./semantic-development-eval";

const clean = "I checked the draft after lunch. Mira found one wrong date in the header, and I fixed it. The figures in the table already matched the ledger, so I left them as they were. We sent the revised copy to the team before the meeting.";
const bad = "The team considered the work in relation to the process. The process was considered in relation to the team. The work was part of a larger effort to consider how the process might be considered. This consideration made the broader effort relevant to the work.";
const make = (id: string, text: string, disposition: "LEAVE_ALONE" | "LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION" | "AMBIGUOUS") => ({
  id, text, genre: "PROSE", creator: "test", requestedDisposition: disposition,
  annotation: { disposition, concepts: [], confidence: 0.9, safeToRewriteWithoutNewFacts: true, missingInformation: [], rationale: "Independent editorial label." },
});

describe("semantic development evaluator", () => {
  it("validates schema and rejects duplicate IDs", () => {
    expect(semanticDevelopmentCorpusSchema.safeParse([make("sa001", clean, "LEAVE_ALONE")]).success).toBe(true);
    expect(semanticDevelopmentCorpusSchema.safeParse([make("sa001", clean, "LEAVE_ALONE"), make("sa001", bad, "LIGHT_EDIT")]).success).toBe(false);
  });

  it("reports separate restraint, coverage, routing and length without raw text or a composite score", async () => {
    const cases = semanticDevelopmentCorpusSchema.parse([make("sa001", clean, "LEAVE_ALONE"), make("sa002", bad, "LIGHT_EDIT"), make("sa003", clean, "AMBIGUOUS")]);
    const { rows, report } = await evaluateSemanticDevelopment(cases);
    expect(rows).toHaveLength(3);
    expect(report.deterministic.v5.cleanTotal).toBe(1);
    expect(report.deterministic.v5.problematicTotal).toBe(1);
    expect(report.labels.AMBIGUOUS).toBe(1);
    expect(report.routing.allCount).toBe(3);
    expect(report.byLength).toHaveProperty("VERY_SHORT");
    expect(JSON.stringify({ rows, report })).not.toContain("Mira found");
    expect(JSON.stringify(report)).not.toMatch(/composite|qualityScore|aiProbability/i);
  });
});
