import { describe, expect, it } from "vitest";
import { coefficientOfVariation, computeMetrics, mean, median, stdDev } from "./metrics";
import { indexText, maskExclusions } from "./text-index";

describe("statistics", () => {
  it("computes mean, median (odd and even), sample standard deviation and CV exactly", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    // sample sd of [2,4,4,4,5,5,7,9] = sqrt(32/7)
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(coefficientOfVariation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7) / 5, 10);
    expect(stdDev([7])).toBe(0);
    expect(coefficientOfVariation([])).toBe(0);
  });
});

describe("computeMetrics", () => {
  it("measures sentence and paragraph statistics", () => {
    const m = computeMetrics(indexText("One two three. One two three four five.\n\nOne two three four five six seven."));
    expect(m).toMatchObject({ words: 15, sentences: 3, paragraphs: 2 });
    expect(m.sentenceLength).toMatchObject({ mean: 5, median: 5, min: 3, max: 7, stdDev: 2 });
    expect(m.sentenceLength.cv).toBe(0.4);
    // paragraph word counts 8 and 7
    expect(m.paragraphLength.mean).toBe(7.5);
  });

  it("counts rates per 100 words and transition openers by name", () => {
    const text = "However, it works. However, it is slow. We don't mind. It's fine; really fine.";
    const m = computeMetrics(indexText(text));
    // However it works However it is slow We don't mind It's fine really fine = 14 words
    expect(m.words).toBe(14);
    expect(m.per100.contractions).toBeCloseTo((2 / 14) * 100, 1);
    expect(m.per100.semicolons).toBeCloseTo((1 / 14) * 100, 1);
    expect(m.transitions).toEqual({ however: 2 });
    expect(m.shares.transitionOpeners).toBe(0.5);
  });

  it("reports repeated openers and repeated content words", () => {
    const text = "Teams ship. Teams test. Teams review. Release notes matter. Release notes help. Release notes ship. Release notes stay.";
    const m = computeMetrics(indexText(text));
    expect(m.repeatedOpeners).toEqual([{ word: "release", count: 4 }, { word: "teams", count: 3 }]);
    expect(m.repeatedWords.map((w) => w.word)).toEqual(expect.arrayContaining(["release", "notes"]));
  });

  it("excludes quotations and code from lexical counts but keeps offsets aligned", () => {
    const text = 'She said "we really, truly, deeply, very much mean it" and `very` code.';
    const masked = maskExclusions(text);
    expect(masked.length).toBe(text.length);
    expect(masked).not.toContain("truly");
    expect(computeMetrics(indexText(text)).per100.intensifiers).toBe(0);
  });

  it("keeps headings and lists out of sentence rhythm", () => {
    const ix = indexText("# A heading\n\n- one item\n- two items\n\nA real sentence here. And another one here.");
    expect(ix.paragraphs.map((p) => [p.isHeading, p.isList])).toEqual([[true, false], [false, true], [false, false]]);
    expect(ix.sentences.map((s) => s.text)).toEqual(["A real sentence here.", "And another one here."]);
  });
});
