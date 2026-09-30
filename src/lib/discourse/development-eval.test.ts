import { describe, expect, it, vi } from "vitest";
import { developmentCorpusSchema, evaluateDevelopmentCorpus, type DevelopmentCase } from "./development-eval";
import type { DiscourseAnalysis } from "./analyze";

const base: DevelopmentCase = {
  id: "one", pairId: "p1", variant: "A", genre: "PROSE", text: "SECRET_RAW_SOURCE_SENTINEL",
  disposition: "LEAVE_ALONE", phenomena: [], rationale: "synthetic", provenance: "test",
};
const finding: DiscourseAnalysis["findings"][number] = {
  phenomenon: "GENERIC_REGISTER", confidence: 0.67, scope: "distributed", paragraphIndices: [0, 1],
  supporting: [], counterevidence: [], action: "DISTRIBUTED_LIGHT_EDIT",
};

describe("discourse development evaluation", () => {
  it("rejects malformed fixtures and extra fields", () => {
    expect(() => developmentCorpusSchema.parse([{ ...base, disposition: "MAYBE" }])).toThrow();
    expect(() => developmentCorpusSchema.parse([{ ...base, extra: "value" }])).toThrow();
    expect(() => developmentCorpusSchema.parse([{ ...base, text: "" }])).toThrow();
  });

  it("calculates precision, restraint, coverage, pairs, and timing without emitting text", () => {
    const cases: DevelopmentCase[] = [base, { ...base, id: "two", variant: "B", disposition: "LIGHT_EDIT", phenomena: ["GENERICNESS"] }];
    const analyze = vi.fn((text: string): DiscourseAnalysis => ({
      structure: { type: "PROSE", confidence: 0.7, evidence: [] }, words: 120,
      uncertainty: null, observations: [], findings: text === "SECOND_SECRET_SENTINEL" ? [finding] : [],
    }));
    cases[1].text = "SECOND_SECRET_SENTINEL";
    let tick = 0;
    const result = evaluateDevelopmentCorpus(cases, { analyze, strategy: null, now: () => (tick += 2) });
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(result.structure).toMatchObject({ known: 2, correct: 2, accuracyOnKnown: 1 });
    expect(result.findings).toMatchObject({ count: 1, trueFindings: 1, precision: 1 });
    expect(result.cleanRestraint).toEqual({ total: 1, restrained: 1, rate: 1 });
    expect(result.problematicCoverage).toEqual({ total: 1, covered: 1, rate: 1 });
    expect(result.pairs).toMatchObject({ complete: 1, findingOrdered: 1, findingAgreement: 1 });
    expect(result.performance.byLength["100to299"]).toEqual({ count: 2, medianMs: 2, p95Ms: 2, worstMs: 2 });
    expect(result.planner.available).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|SENTINEL|synthetic/);
  });

  it("runs the real planner without a model or network call", () => {
    const fetch = vi.fn(() => { throw new Error("model call attempted"); });
    vi.stubGlobal("fetch", fetch);
    try {
      const result = evaluateDevelopmentCorpus([base]);
      expect(result.planner.strategy).toBe("reconstruction-v5");
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(base.text);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("counts false findings on clean documents and rejects duplicate ids", () => {
    const analyze = vi.fn((): DiscourseAnalysis => ({
      structure: { type: "UNKNOWN", confidence: 0.3, evidence: [] }, words: 10,
      uncertainty: null, observations: [], findings: [finding],
    }));
    const result = evaluateDevelopmentCorpus([base], { analyze, strategy: null });
    expect(result.structure).toMatchObject({ known: 0, accuracyOnKnown: null });
    expect(result.findings).toMatchObject({ count: 1, trueFindings: 0, precision: 0 });
    expect(result.cleanRestraint.rate).toBe(0);
    expect(() => evaluateDevelopmentCorpus([base, base], { analyze, strategy: null })).toThrow("Duplicate case id");
  });

  it("reports same-label pairs as non-contrastive rather than ordered successes", () => {
    const same = [base, { ...base, id: "two", variant: "B" as const }];
    const result = evaluateDevelopmentCorpus(same, { strategy: null });
    expect(result.pairs).toMatchObject({ complete: 1, contrastive: 0, nonContrastive: 1, findingOrdered: 0, findingAgreement: null });
  });
});
