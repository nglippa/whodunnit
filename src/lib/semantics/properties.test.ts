import { describe, expect, it } from "vitest";
import { sentenceSpans } from "../analysis/tokenize";
import { extractClaims, negatorsOf } from "./claims";
import { datesCompatible, extractDates } from "./dates";
import { allChanges, analyzeIntegrity } from "./integrity";
import { extractQuantities } from "./quantities";
import { checkQuotations, quotesBalanced } from "./quotes";

const significantChanges = (source: string, output: string) =>
  allChanges(analyzeIntegrity(source, output)).filter((change) => change.severity !== "minor");

describe("semantic equivalence under surface edits", () => {
  it.each([
    ["The team shipped on Friday. Costs fell 12% in March.", "The team shipped on Friday.\n\nCosts fell 12% in March."],
    ["The team shipped on Friday. Costs fell 12% in March.", "The team shipped on Friday.\nCosts fell 12% in March."],
  ])("keeps meaning when a paragraph or line break separates intact sentences", (source, output) => {
    expect(significantChanges(source, output)).toEqual([]);
  });

  it.each([
    ["The detour adds 7 minutes.", "The detour adds seven minutes."],
    ["The detour adds 7 minutes.", "The detour adds   7 minutes."],
    ["The detour adds 7 minutes.", "The detour adds 7 minutes.  "],
  ])("preserves the quantity under equivalent spelling and whitespace", (source, output) => {
    expect(significantChanges(source, output)).toEqual([]);
  });

  it("keeps quantity bounds when only unrelated whitespace changes", () => {
    const forms = ["At least 3 days remain.", "At least   3 days remain.", "At least 3 days remain.\n"];
    const quantities = forms.map((text) => extractQuantities(text).map(({ value, unit, bound }) => ({ value, unit, bound })));
    expect(quantities[0]).toEqual([{ value: "3", unit: "day", bound: "at-least" }]);
    expect(quantities[1]).toEqual(quantities[0]);
    expect(quantities[2]).toEqual(quantities[0]);
  });

  it.each([
    ["12 March 2026", "March 12, 2026"],
    ["March 12, 2026", "2026-03-12"],
    ["12th of March 2026", "2026-03-12"],
  ])("normalizes equivalent date formats", (a, b) => {
    expect(extractDates(a).map((date) => date.canonical)).toEqual(extractDates(b).map((date) => date.canonical));
    expect(datesCompatible(extractDates(a)[0].canonical, extractDates(b)[0].canonical)).toBe(true);
  });

  it("distinguishes a changed calendar day after format normalization", () => {
    expect(datesCompatible(extractDates("12 March 2026")[0].canonical, extractDates("March 13, 2026")[0].canonical)).toBe(false);
  });

  it("keeps quoted words and attribution across straight and curly quotes", () => {
    const straight = 'As Priya put it, "the release is ready."';
    const curly = "As Priya put it, “the release is ready.”";
    expect(quotesBalanced(straight)).toBe(true);
    expect(quotesBalanced(curly)).toBe(true);
    expect(checkQuotations(straight, curly).issues).toEqual([]);
    expect(checkQuotations(curly, straight).issues).toEqual([]);
  });

  it.each([["don't", "don’t"], ["won't", "won’t"]])("reads %s and %s as the same negation", (straight, curly) => {
    const normalize = (text: string) => negatorsOf(`We ${text} ship.`).map((word) => word.replace(/’/g, "'"));
    expect(normalize(straight)).not.toEqual([]);
    expect(normalize(curly)).toEqual(normalize(straight));
  });

  it("keeps claim boundaries when a sentence moves across paragraphs", () => {
    const sentences = ["The team shipped on Friday.", "Costs fell 12% in March."];
    const forms = [sentences.join(" "), sentences.join("\n\n")];
    expect(forms.map((text) => extractClaims(text).map((claim) => claim.text))).toEqual([sentences, sentences]);
  });

  it("does not split at an abbreviation or inside a decimal", () => {
    const text = "Dr. Chen approved 1.5 hours. The team shipped.";
    expect(sentenceSpans(text).map((sentence) => sentence.text)).toEqual(["Dr. Chen approved 1.5 hours.", "The team shipped."]);
  });
});
