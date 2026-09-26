import { describe, expect, it } from "vitest";
import { analyzeText, isLikelyPassive, lexicalVariety } from "./analyze";
import { findFormulaicPatterns } from "./patterns";
import { splitParagraphs, splitSentences, words } from "./tokenize";

describe("segmentation", () => {
  it("splits sentences without breaking on abbreviations, initials or decimals", () => {
    const s = splitSentences("Dr. Smith paid $3.50 for it. J. R. Tolkien agreed! Did he? Yes.");
    expect(s).toEqual(["Dr. Smith paid $3.50 for it.", "J. R. Tolkien agreed!", "Did he?", "Yes."]);
  });

  it("splits paragraphs on blank lines and normalises CRLF", () => {
    expect(splitParagraphs("One.\r\n\r\nTwo.\n\n\nThree.")).toEqual(["One.", "Two.", "Three."]);
  });

  it("keeps contractions and hyphenated words as single tokens", () => {
    expect(words("It's a well-known fact, isn't it?")).toEqual(["It's", "a", "well-known", "fact", "isn't", "it"]);
  });
});

describe("analyzeText", () => {
  it("measures sentence length statistics exactly", () => {
    const a = analyzeText("One two three. One two three four five six seven.");
    expect(a.counts).toMatchObject({ words: 10, sentences: 2, paragraphs: 1 });
    expect(a.sentenceLength).toMatchObject({ mean: 5, min: 3, max: 7 });
    expect(a.sentenceLength.stdDev).toBeCloseTo(2.8, 1);
  });

  it("counts contractions and first person per 100 words", () => {
    const a = analyzeText("I don't think we're late. It's fine, honestly, and I can't complain about it at all.");
    // don't, we're, It's, can't = 4 contractions over 16 words
    expect(a.counts.words).toBe(16);
    expect(a.rates.contractions).toBe(25);
    // I, we're, I = 3 first-person tokens
    expect(a.rates.firstPerson).toBe(18.8); // 18.75, reported to one decimal
  });

  it("reports the share of sentences opening with a stock connective", () => {
    const a = analyzeText("Furthermore, it works. Moreover, it scales. It is cheap. However, it is new.");
    expect(a.sentenceShares.transitionOpeners).toBe(0.75);
  });

  it("returns zeros, not NaN, for empty input", () => {
    const a = analyzeText("");
    expect(a.counts.words).toBe(0);
    expect(a.sentenceLength.mean).toBe(0);
    expect(a.rates.contractions).toBe(0);
  });

  it("measures uniform paragraph blocks as low variation", () => {
    const para = "This is one sentence of eight words here. ";
    const a = analyzeText([para, para, para].join("\n\n"));
    expect(a.paragraphLength.variation).toBe(0);
  });
});

describe("heuristics", () => {
  it("flags likely passive constructions but not simple adjectives", () => {
    expect(isLikelyPassive("The report was written by the team.")).toBe(true);
    expect(isLikelyPassive("The results were carefully reviewed.")).toBe(true);
    expect(isLikelyPassive("The team is happy.")).toBe(false);
  });

  it("computes a moving-average type/token ratio that is stable for repetition", () => {
    const repeated = Array(120).fill("word").join(" ");
    expect(lexicalVariety(words(repeated))).toBeCloseTo(1 / 50, 5);
  });

  it("detects catalogued formulaic constructions with counts and examples", () => {
    const text =
      "In today's fast-paced world, teams leverage robust tools. It is worth noting that this plays a crucial role. In conclusion, it helps.";
    const ids = findFormulaicPatterns(text).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["in-todays-world", "inflated-vocab", "worth-noting", "plays-a-role", "summary-closer"]));
    const inflated = findFormulaicPatterns(text).find((m) => m.id === "inflated-vocab");
    expect(inflated?.count).toBe(2);
  });

  it("does not flag plain prose", () => {
    expect(findFormulaicPatterns("We shipped the fix on Tuesday. It took two days.")).toEqual([]);
  });
});
