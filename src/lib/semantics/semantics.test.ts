import { describe, expect, it } from "vitest";
import { semanticClaimSchema } from "@/domain/semantics";
import { PRESETS } from "@/domain/style";
import { extractNames } from "../verification/protected";
import { checkProtectedSpans, integrityReport } from "../verification/verify";
import { extractClaims, modalityOf, negatorsOf } from "./claims";
import { compareClaims } from "./compare";
import { datesCompatible, extractDates } from "./dates";
import { allChanges, analyzeIntegrity } from "./integrity";
import { checkMechanics } from "./mechanics";
import { checkPhrases, protectedPhrasesFor } from "./phrases";
import { boundRelation, extractQuantities } from "./quantities";
import { checkQuotations, quotesBalanced } from "./quotes";

const changes = (source: string, output: string, ctx = {}) => allChanges(analyzeIntegrity(source, output, ctx));

describe("SemanticClaim extraction", () => {
  it("produces schema-valid claims with spans, polarity, modality and quantities", () => {
    const claims = extractClaims("It took an hour. Maybe more. We did not ship on Friday? Costs may fall 12%.");
    for (const c of claims) expect(semanticClaimSchema.safeParse(semanticClaimSchema.keyof().options.reduce((o, k) => ({ ...o, [k]: c[k] }), {})).success).toBe(true);
    expect(claims.map((c) => c.type)).toEqual(["assertion", "fragment", "question", "assertion"]);
    expect(claims[0].quantities[0]).toMatchObject({ value: "1", unit: "hour", bound: "at-least", qualifiers: ["maybe more"] });
    expect(claims[2].polarity).toBe("negative");
    expect(claims[3].modality).toBe("possible");
  });

  it("reads polarity from explicit, contracted and implicit negators, but not from 'not only'", () => {
    expect(negatorsOf("We won't ship.")).toEqual(["won't"]);
    expect(negatorsOf("The team will postpone the launch.")).toEqual(["postpone"]);
    expect(negatorsOf("It is not only fast but cheap.")).toEqual([]);
    expect(negatorsOf("No one came.")).toEqual(["no one"]);
  });

  it("ranks modality: hedges win over emphasis, the month May is not a modal", () => {
    expect(modalityOf("It may work.").level).toBe("possible");
    expect(modalityOf("It probably works.").level).toBe("probable");
    expect(modalityOf("It certainly works.").level).toBe("emphatic");
    expect(modalityOf("It certainly might work.").level).toBe("possible");
    expect(modalityOf("We start on 18 May.").level).toBe("asserted");
  });
});

describe("quantities and bounds", () => {
  const q = (t: string) => extractQuantities(t).map(({ value, unit, bound }) => ({ value, unit, bound }));

  it("reads approximation and bound markers before and after a number", () => {
    expect(q("almost three weeks")).toEqual([{ value: "3", unit: "week", bound: "below" }]);
    expect(q("about 7 minutes")).toEqual([{ value: "7", unit: "minute", bound: "approximate" }]);
    expect(q("closer to nine")).toEqual([{ value: "9", unit: null, bound: "approximate" }]);
    expect(q("up to nine")).toEqual([{ value: "9", unit: null, bound: "at-most" }]);
    expect(q("more than 40 people")).toEqual([{ value: "40", unit: "person", bound: "above" }]);
    expect(q("at least 3 days")).toEqual([{ value: "3", unit: "day", bound: "at-least" }]);
    expect(q("It took an hour. Maybe more.")).toEqual([{ value: "1", unit: "hour", bound: "at-least" }]);
    expect(q("most of an hour")).toEqual([{ value: "1", unit: "hour", bound: "below" }]);
    expect(q("half an hour")).toEqual([{ value: "0.5", unit: "hour", bound: "exact" }]);
  });

  it("treats 'maybe more' as part of the quantity, not a hedge on the claim", () => {
    expect(changes("It took an hour. Maybe more.", "It took an hour, maybe more.")).toEqual([]);
  });

  it("flips a negated comparative: 'never got more than five' is at most five", () => {
    expect(q("It never got more than five hours of sun.")).toEqual([{ value: "5", unit: "hour", bound: "at-most" }]);
  });

  it("leaves years, times of day and dates out of quantities", () => {
    expect(q("In 2024 we met at 14:02 on 12 March.")).toEqual([]);
  });

  it("relates bounds as sets: disjoint contradicts, subset strengthens, partial overlap is flagged", () => {
    expect(boundRelation("below", "exact")).toEqual({ relation: "contradicted", severity: "blocking" });
    expect(boundRelation("at-least", "below")).toEqual({ relation: "contradicted", severity: "blocking" });
    expect(boundRelation("approximate", "exact")).toEqual({ relation: "strengthened", severity: "major" });
    expect(boundRelation("approximate", "at-most")).toEqual({ relation: "uncertain", severity: "major" });
    expect(boundRelation("above", "at-least")).toEqual({ relation: "weakened", severity: "minor" });
    expect(boundRelation("exact", "exact")).toBeNull();
  });

  it("reports a changed unit for the same value", () => {
    expect(changes("The detour adds 7 minutes.", "The detour adds 7 hours.").some((c) => c.aspect === "quantity" && c.relation === "contradicted")).toBe(true);
  });
});

describe("assertion strength", () => {
  it("treats a change on an ordered scale as a meaning change, both markers explicit", () => {
    const c = changes("Clear communication helps teams ship.", "Clear communication determines whether teams ship.");
    expect(c).toContainEqual(expect.objectContaining({ aspect: "causation", relation: "strengthened", severity: "blocking" }));
    expect(changes("Some teams saw fewer defects.", "Most teams saw fewer defects.")).toContainEqual(expect.objectContaining({ aspect: "quantifier", relation: "strengthened" }));
    expect(changes("The data suggests a link.", "The data proves a link.")).toContainEqual(expect.objectContaining({ aspect: "evidence", relation: "strengthened" }));
  });

  it("flags hedges dropped or added as major, and weakening too", () => {
    expect(changes("Error rates probably fell.", "Error rates fell.")).toContainEqual(expect.objectContaining({ aspect: "modality", relation: "strengthened", severity: "major" }));
    expect(changes("Error rates fell.", "Error rates may have fell.")).toContainEqual(expect.objectContaining({ aspect: "modality", relation: "weakened" }));
  });

  it("does not report a change the author licensed, but records it", () => {
    const c = changes("The fix probably works.", "The fix works.", { licenses: { strengthen: "sound more confident" } });
    expect(c).toContainEqual(expect.objectContaining({ aspect: "modality", severity: "minor", licensedBy: "sound more confident" }));
  });
});

describe("added and dropped claims", () => {
  it("detects an invented cause, question and temporal clause", () => {
    expect(changes("Costs rose to $1.4 million. Engineers found corrosion.", "Costs rose to $1.4 million because engineers found corrosion.")).toContainEqual(expect.objectContaining({ aspect: "causal-relation", severity: "blocking" }));
    expect(changes("I'll probably see it every time.", "Will I see it every time? Probably.")).toContainEqual(expect.objectContaining({ aspect: "question", relation: "added" }));
    expect(changes("Six cauls kept everything flat.", "Six cauls kept everything flat while the glue dried.")).toContainEqual(expect.objectContaining({ aspect: "temporal-clause", relation: "added" }));
  });

  it("does not treat a split or merged sentence as an added claim", () => {
    const merged = changes("We shipped on Friday. Costs fell 12%.", "We shipped on Friday, and costs fell 12%.");
    expect(merged.filter((c) => c.severity !== "minor")).toEqual([]);
    const split = changes("We shipped on Friday and costs fell 12% in the first month.", "We shipped on Friday. Costs fell 12% in the first month.");
    expect(split.filter((c) => c.severity !== "minor")).toEqual([]);
  });

  it("detects a dropped high-information claim, but lets removable filler go", () => {
    expect(changes("The launch slipped. We did not miss the audit deadline.", "The launch slipped.")).toContainEqual(expect.objectContaining({ relation: "dropped", severity: "blocking" }));
    const src = "It works in production. Not a trend. Not a fad. A movement.";
    const report = integrityReport(src, "It works in production. It is a movement.", PRESETS.natural);
    expect(report.verdict).toBe("PASS");
    expect(report.removableClaims.length).toBeGreaterThan(0);
  });

  it("aligns claims across a merge so markers are compared in context", () => {
    const src = extractClaims("Some teams shipped early. Most met the deadline.");
    const out = extractClaims("Some teams shipped early and most met the deadline.");
    const r = compareClaims("", "", src, out);
    expect(r.aligned).toBe(2);
    expect(r.changes.filter((c) => c.aspect === "quantifier")).toEqual([]);
  });
});

describe("quotation integrity", () => {
  it("checks balance for straight and curly double quotes, not apostrophes or inch marks", () => {
    expect(quotesBalanced('She said "yes" and "no".')).toBe(true);
    expect(quotesBalanced("She said “yes” and “no”.")).toBe(true);
    expect(quotesBalanced('She said "yes and left.')).toBe(false);
    expect(quotesBalanced("She said “yes and left.")).toBe(false);
    expect(quotesBalanced("It's the team's 12\" board.")).toBe(true);
  });

  it("fails a dropped quotation mark, a changed speaker, and flags new framing", () => {
    const src = 'As Priya put it, "the boring parts finally got boring."';
    expect(checkQuotations(src, 'As Priya put it, "the boring parts finally got boring.').issues).toContainEqual(expect.objectContaining({ severity: "blocking" }));
    expect(checkQuotations(src, 'As Omar put it, "the boring parts finally got boring."').issues).toContainEqual(expect.objectContaining({ severity: "blocking", detail: expect.stringMatching(/Omar/) }));
    expect(checkQuotations(src, 'Priya highlights the improved efficiency: "the boring parts finally got boring."').issues).toContainEqual(expect.objectContaining({ relation: "added", severity: "major" }));
    expect(checkQuotations(src, "As Priya put it, “the boring parts finally got boring.”").issues).toEqual([]);
  });
});

describe("protected phrases", () => {
  const src = "The trick is to work across the grain first, then clean up with the grain. Check the grain often.";

  it("protects recurring domain phrases and the author's own list, not every n-gram", () => {
    const p = protectedPhrasesFor(src, { user: ["straightedge"] });
    expect(p).toContainEqual({ text: "straightedge", mode: "exact", reason: "user" });
    expect(p.map((x) => x.text)).toEqual(expect.arrayContaining(["across the grain", "with the grain"]));
    expect(p.length).toBeLessThan(8);
  });

  it("fails a contrast substitution in the same frame, allows a same-sense synonym", () => {
    expect(checkPhrases(src, src.replace("across the grain", "against the grain"), [])).toContainEqual(expect.objectContaining({ aspect: "phrase", severity: "blocking" }));
    expect(checkPhrases(src, src.replace("with the grain", "along the grain"), [])).toEqual([]);
  });

  it("fails when an exact phrase the author protected is gone", () => {
    expect(checkPhrases("Use the straightedge.", "Use a ruler.", [{ text: "straightedge", mode: "exact", reason: "user" }])).toContainEqual(expect.objectContaining({ severity: "blocking" }));
  });
});

describe("mechanical damage", () => {
  it("catches a capital after a dash mid-sentence, but not the author's own style", () => {
    const src = "I glued up the walnut tabletop last weekend. Five boards, edge to edge.";
    expect(checkMechanics(src, "I glued up the walnut tabletop last weekend—Five boards, edge to edge.")).toContainEqual(expect.objectContaining({ aspect: "mechanics" }));
    const messy = "ok so the van thing — its fine now?? mechanic said 40 quid";
    expect(checkMechanics(messy, messy)).toEqual([]);
  });

  it("catches duplicated punctuation the source did not have", () => {
    expect(checkMechanics("It works.", "It works..")).toHaveLength(1);
    expect(checkMechanics("Wait... what?", "Wait... what?")).toEqual([]);
  });
});

describe("false-positive fixes", () => {
  it("does not read an ordinary sentence-initial word as a name", () => {
    expect(extractNames("The result? Better outcomes for everyone.")).not.toContain("Better");
    expect(extractNames("Five boards, edge to edge.")).not.toContain("Five");
    expect(extractNames("Priya presented. Later, Dana agreed.")).toEqual(expect.arrayContaining(["Priya", "Dana"]));
  });

  it("normalises dates across formats and flags real changes", () => {
    expect(extractDates("12 March 2026, March 12, 2026, 2026-03-12").map((d) => d.canonical)).toEqual(["2026-03-12", "2026-03-12", "2026-03-12"]);
    expect(datesCompatible("2026-03-12", "?-03-12")).toBe(true);
    expect(checkProtectedSpans("Signed on 12 March 2026.", "Signed on March 12, 2026.")).toEqual([]);
    expect(checkProtectedSpans("Signed on 12 March 2026.", "Signed on 13 March 2026.").some((f) => f.severity === "blocking")).toBe(true);
  });

  it("compares figures as sets: repeating a source figure is not an added figure", () => {
    expect(checkProtectedSpans("Two of the four bearings.", "Two of the four bearings; two of four.")).toEqual([]);
    expect(checkProtectedSpans("Two of the four bearings.", "Three of the four bearings.").map((f) => f.kind)).toEqual(["altered_number", "altered_number"]);
  });

  it("accepts a negation expressed by an implicit negative", () => {
    expect(changes("The team will not be taking on new work until January.", "The team will postpone new work until January.")).toEqual([]);
  });
});
