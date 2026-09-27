import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import type { VerificationResult } from "@/domain/verification";
import { analyzeWriting } from "../rules/engine";
import { integrityReport, verifyDeterministic } from "../verification/verify";
import { rulesForProfile } from "../rules/packs";
import { anchorPresent, compareVoice, metricDeltas, ruleDiff, semanticGate, wordEditDistance, wordingRetention } from "./measures";

describe("source wording retention", () => {
  it("computes token, n-gram, edit-distance and novelty shares exactly", () => {
    // source: the×2 cat sat on mat (6 tokens); output swaps one "the" for "a".
    const r = wordingRetention("The cat sat on the mat.", "The cat sat on a mat.");
    expect(r).toEqual({
      sourceWords: 6,
      outputWords: 6,
      lengthRatio: 1,
      tokenRetention: 0.833, // 5 of 6 source tokens
      bigramRetention: 0.6, // the cat, cat sat, sat on of 5
      trigramRetention: 0.5, // the cat sat, cat sat on of 4
      wordEditDistance: 0.167, // one substitution in 6
      novelTokenShare: 0.167, // "a"
    });
  });

  it("is 1/0 for identical text and near 0 for a complete rewrite", () => {
    const t = "We moved the tomatoes to the south bed this year.";
    expect(wordingRetention(t, t)).toMatchObject({ tokenRetention: 1, trigramRetention: 1, wordEditDistance: 0, novelTokenShare: 0 });
    const r = wordingRetention(t, "Our crop relocated southward during this season.");
    expect(r.trigramRetention).toBe(0);
    expect(r.wordEditDistance).toBeGreaterThan(0.8);
  });

  it("returns null edit distance beyond the size limit rather than stalling", () => {
    expect(wordEditDistance(["a", "b"], ["a", "c"])).toBe(0.5);
    expect(wordEditDistance(Array(3000).fill("a"), Array(3000).fill("b"))).toBeNull();
  });
});

describe("metric deltas", () => {
  it("reports raw before/after values without judging direction", () => {
    const rules = rulesForProfile(PRESETS.natural);
    const before = analyzeWriting("We do not know. We will not guess. We cannot tell.", rules).metrics;
    const after = analyzeWriting("We don't know. We won't guess. We can't tell.", rules).metrics;
    const d = metricDeltas(before, after);
    const c = d.find((x) => x.metric === "contractions.per100")!;
    expect(c.before).toBe(0);
    expect(c.after).toBeGreaterThan(0);
    expect(c.delta).toBe(c.after);
    expect(d.find((x) => x.metric === "sentences")).toMatchObject({ before: 3, after: 3, delta: 0 });
    expect(Object.keys(d[0])).toEqual(["metric", "label", "unit", "before", "after", "delta"]);
  });
});

describe("voice comparison", () => {
  const rules = rulesForProfile(PRESETS.natural);
  const src = "I planed it by hand — slowly. It took an hour. Maybe more. The trick is to work across the grain first, then clean up with it, and check with a straightedge every few passes instead of trusting your eye.";

  it("against the source's own tendencies: identical output stays in range everywhere", () => {
    const m = analyzeWriting(src, rules).metrics;
    const v = compareVoice(m, m);
    expect(v.reference).toBe("source");
    expect(v.dimensions.every((d) => d.withinRange === d.sourceWithinRange)).toBe(true);
    expect(v.movedOut).toEqual([]);
  });

  it("names the dimensions a rewrite pushed out of the author's range", () => {
    const flat = "I planed it by hand slowly, which took about an hour or maybe more than that. The trick is to work across the grain first and then clean up with it while checking with a straightedge every few passes instead of trusting your eye.";
    const v = compareVoice(analyzeWriting(src, rules).metrics, analyzeWriting(flat, rules).metrics);
    expect(v.movedOut).toContain("punctuation.dashes");
    expect(v.movedOut).toContain("rhythm.sentence-length");
    expect(v).not.toHaveProperty("score");
  });
});

describe("semantic hard gate", () => {
  const base: VerificationResult = { status: "preserved", findings: [], checks: ["protected_spans", "negation", "length", "lexical_coverage"], lexicalCoverage: 0.9 };

  it("a deterministic failure fails the gate even when the model found nothing", () => {
    const v: VerificationResult = {
      ...base,
      status: "rejected",
      checks: [...base.checks, "model_meaning"],
      findings: [{ kind: "altered_number", severity: "blocking", origin: "deterministic", message: "The figure 12% is missing." }],
    };
    const g = semanticGate(v, "text");
    expect(g.verdict).toBe("FAIL");
    expect(g.deterministic.verdict).toBe("FAIL");
    expect(g.model.status).toBe("pass");
  });

  it("reports model findings separately, and says when the model check did not run", () => {
    const withModel = semanticGate({ ...base, checks: [...base.checks, "model_meaning"], findings: [{ kind: "changed_assertion", severity: "blocking", origin: "model", message: "Softened." }] }, "t");
    expect(withModel).toMatchObject({ verdict: "FAIL", deterministic: { verdict: "PASS" }, model: { status: "fail" } });
    expect(semanticGate(base, "t").model.status).toBe("not-run");
  });

  it("judges negation per claim: a flip fails, a paraphrase with an implicit negative passes", () => {
    const rules = PRESETS.professional;
    const flip = integrityReport("The update does not delete your files.", "The update deletes your files.", rules);
    expect(semanticGate(verifyDeterministic("The update does not delete your files.", "The update deletes your files.", rules), "x", [], { integrity: flip }).verdict).toBe("FAIL");
    const src = "The team will not be taking on new infrastructure work until January.";
    const out = "The team will pause new infrastructure work until January.";
    expect(semanticGate(verifyDeterministic(src, out, rules), out, [], { integrity: integrityReport(src, out, rules) }).verdict).toBe("PASS");
  });

  it("checks case anchors, accepting listed alternatives", () => {
    expect(anchorPresent("The update won’t delete your files.", "does not delete|won't delete")).toBe(true);
    const g = semanticGate(base, "The update deletes your files.", ["does not delete|doesn't delete"]);
    expect(g.verdict).toBe("FAIL");
    expect(g.caseAnchorsLost).toEqual(["does not delete|doesn't delete"]);
  });
});

describe("before/after rule diff", () => {
  it("separates resolved, remaining and introduced, and flags deterministic introductions", () => {
    const rules = rulesForProfile(PRESETS.natural);
    const before = analyzeWriting("It is worth noting that costs fell 12%. In conclusion, we saved money.", rules);
    const after = analyzeWriting("Here's the thing: costs fell 12%. In conclusion, we saved money.", rules);
    const d = ruleDiff(before, after);
    expect(d.resolved).toContain("slop.announcements");
    expect(d.remaining).toContain("slop.summary-openers");
    expect(d.introduced).toContain("slop.throat-clearing");
    expect(d.introducedDeterministic).toContain("slop.throat-clearing");
  });
});
