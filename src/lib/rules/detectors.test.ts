import { describe, expect, it } from "vitest";
import { analyzeWriting } from "./engine";
import { createRegistry } from "./packs";

/**
 * Positive and negative fixtures for each detector, run through the real
 * built-in rule definitions. Negative fixtures are ordinary prose that should
 * stay quiet: false positives matter more than missed weak patterns.
 */

const registry = createRegistry();
const fired = (ruleId: string, text: string) => {
  const rule = registry.get(ruleId);
  if (!rule) throw new Error(`no rule ${ruleId}`);
  return analyzeWriting(text, [rule]).findings[0]?.matches ?? [];
};

const cases: { rule: string; positive: string; negative: string }[] = [
  {
    rule: "slop.not-x-its-y",
    positive: "This isn't a price increase. It's a betrayal of trust.",
    negative: "The price went up by 20%, and customers noticed within a day.",
  },
  {
    rule: "slop.throat-clearing",
    positive: "Here's the thing: nobody reads the docs.",
    negative: "Nobody reads the docs, so we moved the key steps into the app. Here the thing to check is the log.",
  },
  {
    rule: "slop.faux-insight",
    positive: "Here's what nobody tells you about hiring: it takes months.",
    negative: "Hiring took us four months, twice as long as planned.",
  },
  {
    rule: "slop.fake-profound-ending",
    positive: "We fixed the build. Then we fixed the tests. The team shipped on Friday. And that makes all the difference.",
    negative: "We fixed the build. Then we fixed the tests. The team shipped on Friday, a day late.",
  },
  {
    rule: "slop.recap-ending",
    positive: "The plan has three stages.\n\nThe first starts in May.\n\nOverall, the plan is ambitious but achievable.",
    negative: "The plan has three stages.\n\nThe first starts in May.\n\nThe second depends on hiring two engineers.",
  },
  {
    rule: "slop.negative-listing",
    positive: "Not a tool. Not a toy. A partner for the whole team.",
    negative: "It is not a toy, and it took two years to build.",
  },
  {
    rule: "slop.self-answered-questions",
    positive: "The result? Chaos. The fix? Simple. We rolled back the change on Tuesday.",
    negative: "What changed? We rolled back the release on Tuesday after the error rate doubled in an hour.",
  },
  {
    rule: "slop.colon-reveal",
    positive: "The best part: it learns. The catch: it is slow on large files.",
    negative: "The best part of the release is the new search, which finds old drafts in a second.",
  },
  {
    rule: "slop.dash-density",
    positive: "The results — surprising as they were — held. The team — all six — agreed. Nobody — not even Dana — objected.",
    negative: "The results held up. The team agreed after a short discussion, and nobody objected to the new plan in the end.",
  },
  {
    rule: "core.tool-markup",
    positive: "Revenue rose 4% :contentReference[oaicite:2]{index=2} last year.",
    negative: "Revenue rose 4% last year, according to the annual report.",
  },
  {
    rule: "core.repeated-transitions",
    positive: "It works. Furthermore, it scales. Moreover, it is cheap.",
    negative: "It works. It also scales. However, it is expensive.",
  },
  {
    rule: "core.repeated-sentence-openers",
    positive: "Honestly, it works. Honestly, it is fast. Honestly, it is cheap.",
    negative: "The build passed. The tests are green. We shipped on Friday.",
  },
  {
    rule: "slop.synonym-cycling",
    positive: "The tool is fast. The platform is flexible. The solution is secure.",
    negative: "The tool is fast. The tool is flexible. It is also secure.",
  },
];

describe("detectors: positive and negative fixtures", () => {
  for (const c of cases) {
    it(`${c.rule} fires on the pattern and stays quiet on ordinary prose`, () => {
      expect(fired(c.rule, c.positive).length, "positive").toBeGreaterThan(0);
      expect(fired(c.rule, c.negative), "negative").toEqual([]);
    });
  }
});

describe("phrase detection", () => {
  it("matches on word boundaries, case-insensitively, including curly apostrophes", () => {
    expect(fired("slop.throat-clearing", "Here’s the thing, though.")).toHaveLength(1);
    expect(fired("slop.inflated-vocabulary", "A paradigm shifted slightly.")).toEqual([]);
  });

  it("does not flag phrases inside quotations or code", () => {
    expect(fired("slop.announcements", 'The style guide lists "it is worth noting that" as filler.')).toEqual([]);
    expect(fired("slop.announcements", "Avoid `it is worth noting that` in docs.")).toEqual([]);
  });

  it("respects sentence-start constraints", () => {
    expect(fired("slop.throat-clearing", "Let me be clear about the budget.")).toHaveLength(1);
    expect(fired("slop.throat-clearing", "She asked me to let me be clear, oddly.")).toEqual([]);
  });

  it("needs two corporate verbs before firing (single literal uses are normal)", () => {
    expect(fired("slop.corporate-verbs", "The bank used leverage to buy the firm.")).toEqual([]);
    expect(fired("slop.corporate-verbs", "We leverage data to empower teams.")).toHaveLength(2);
  });

  it("reports offsets that point at the matched text", () => {
    const text = "In short, it is worth noting that the release shipped.";
    const [m] = fired("slop.announcements", text);
    expect(text.slice(m.start, m.end).toLowerCase()).toBe("it is worth noting that");
    expect(m.confidence).toBe(1);
  });
});

describe("metric and density detectors", () => {
  const even = Array.from({ length: 16 }, (_, i) => `Sentence number ${i} carries the same measured cadence across this longer passage today.`).join(" ");
  const varied =
    "Short one. This sentence runs a fair bit longer than the one before it, with a clause or two. Then another. We tested the patch on three machines, and two of them reproduced the crash within an hour of starting. Fine. It shipped. The logs showed nothing unusual until the second restart, when memory climbed steadily. Odd. We rolled back.";

  it("flags uniform sentence length with enough sentences, not varied prose", () => {
    expect(fired("core.uniform-sentence-length", even).length).toBe(1);
    expect(fired("core.uniform-sentence-length", varied)).toEqual([]);
    expect(fired("core.uniform-sentence-length", even.split(". ").slice(0, 10).join(". "))).toEqual([]);
    expect(fired("core.uniform-sentence-length", "One two three. Four five six.")).toEqual([]);
  });

  it("flags uniform paragraph blocks only with four or more prose paragraphs", () => {
    const para = "This paragraph has about the same length as the others here. It says one thing and then stops.";
    expect(fired("core.uniform-paragraph-length", [para, para, para, para].join("\n\n")).length).toBe(1);
    expect(fired("core.uniform-paragraph-length", [para, para].join("\n\n"))).toEqual([]);
  });

  it("flags dense hedging but not ordinary qualification", () => {
    const dense =
      "It may perhaps be possible that the results could arguably suggest a trend. It seems likely, though it might not, that prices may rise. Perhaps the market could shift, and it appears that demand may fall. Possibly the data is somewhat noisy. " +
      "It could also be that the sample was small, which might explain why the effect seems weaker than it may otherwise appear.";
    // The rule needs at least 120 words before density means anything.
    expect(fired("core.hedge-density", dense)).toEqual([]);
    expect(fired("core.hedge-density", `${dense}\n\n${dense}`).length).toBeGreaterThan(5);
    expect(fired("core.hedge-density", varied)).toEqual([]);
  });

  it("flags three-item lists only when they are dense", () => {
    const triads = "We value speed, quality, and trust. Our teams are small, focused, and fast. The product is simple, secure, and reliable. Customers feel safe, heard, and valued.";
    expect(fired("core.triad-overuse", triads).length).toBeGreaterThanOrEqual(3);
    expect(fired("core.triad-overuse", "We bought eggs, milk, and bread. " + varied)).toEqual([]);
  });

  it("flags dense intensifiers only above the threshold", () => {
    const dense = Array.from({ length: 6 }, () => "It was really very good and truly incredibly fast.").join(" ") + " " + varied;
    expect(fired("core.intensifier-density", dense).length).toBeGreaterThan(3);
    expect(fired("core.intensifier-density", varied + " It was very good.")).toEqual([]);
  });
});
