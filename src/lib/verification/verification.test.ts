import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { extractDateWords, extractLinks, extractNames, extractNumbers, extractQuotations } from "./protected";
import { checkNegation, checkProtectedSpans, lexicalCoverage, mergeVerification, verifyDeterministic } from "./verify";

describe("protected span extraction", () => {
  it("canonicalises numbers, currency, percentages and thousands separators", () => {
    const n = extractNumbers("Revenue rose 12% to $4,200,000 in 2024, up from 3.5 million.");
    expect([...n.keys()].sort()).toEqual(["$4200000", "1000000", "12%", "2024", "3.5"].sort());
  });

  it("treats spelled-out numbers as equal to digits", () => {
    const a = extractNumbers("We hired three people.");
    const b = extractNumbers("We hired 3 people.");
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("does not count the pronoun 'one' as a number", () => {
    expect(extractNumbers("No one knows which one to pick.").size).toBe(0);
  });

  it("finds month and weekday references but not the modal verb 'may'", () => {
    expect([...extractDateWords("The launch is on Tuesday, March 3. You may attend.").keys()].sort()).toEqual(["march", "tuesday"]);
    expect(extractDateWords("You may go.").size).toBe(0);
    expect([...extractDateWords("Signed 2024-05-01, due May 9.").keys()].sort()).toEqual(["2024-05-01", "may"]);
  });

  it("extracts quotations of two or more words, straight or curly", () => {
    expect(extractQuotations(`She said "we ship on Friday" and “not before”.`)).toEqual(["we ship on Friday", "not before"]);
  });

  it("extracts links and emails without trailing punctuation", () => {
    expect(extractLinks("See https://example.com/a. Or mail ann@example.org, thanks.")).toEqual(["https://example.com/a", "ann@example.org"]);
  });

  it("finds names mid-sentence and multi-word names at sentence start", () => {
    const names = extractNames("Sarah Chen met the team. Later she called Priya about Acme Corp. The call went well.");
    expect(names).toEqual(expect.arrayContaining(["Sarah Chen", "Priya", "Acme Corp"]));
    expect(names).not.toContain("The");
    expect(names).not.toContain("Later");
  });
});

describe("deterministic verification", () => {
  const source =
    'On March 3, Sarah Chen told the board that revenue grew 12% to $4.2 million. She said "we are not raising prices" and asked for a review by Friday.';

  it("passes a faithful restyle", () => {
    const candidate =
      'Sarah Chen told the board on March 3 that revenue was up 12%, to $4.2 million. "We are not raising prices," she said, and she wants a review by Friday.';
    const v = verifyDeterministic(source, candidate, PRESETS.natural);
    const blocking = v.findings.filter((f) => f.severity === "blocking");
    // The quotation was re-capitalised, which changes it: that is a real change and must be caught.
    expect(blocking.map((f) => f.kind)).toEqual(["altered_quotation"]);
  });

  it("blocks a changed figure and reports both sides", () => {
    const f = checkProtectedSpans("Revenue grew 12%.", "Revenue grew 15%.");
    expect(f.map((x) => x.kind)).toEqual(["altered_number", "altered_number"]);
    expect(f.every((x) => x.severity === "blocking")).toBe(true);
  });

  it("blocks a dropped name and a changed date", () => {
    const f = checkProtectedSpans("The update from Priya is due Friday.", "The update from her is due Monday.");
    expect(f.map((x) => x.kind).sort()).toEqual(["altered_date", "altered_date", "altered_name"]);
    expect(f.find((x) => x.kind === "altered_name")?.severity).toBe("blocking");
  });

  it("never treats sentence-initial connectives as names (regression)", () => {
    const f = checkProtectedSpans("Furthermore, it works. Moreover, it scales. Additionally, it is cheap.", "It works and scales, and it is cheap.");
    expect(f).toEqual([]);
  });

  it("treats a lone sentence-initial name as weaker evidence (warning)", () => {
    const f = checkProtectedSpans("Priya will present.", "She will present.");
    expect(f).toEqual([expect.objectContaining({ kind: "altered_name", severity: "warning" })]);
  });

  it("warns (not blocks) when negations differ", () => {
    expect(checkNegation("We did not ship.", "We shipped.")[0]).toMatchObject({ kind: "negation_changed", severity: "warning" });
    expect(checkNegation("We did not ship.", "We didn't ship.")).toEqual([]);
  });

  it("measures lexical coverage over content words only", () => {
    expect(lexicalCoverage("The quarterly report shows strong growth", "The report shows growth that is strong this quarter")).toBeGreaterThan(0.7);
    expect(lexicalCoverage("The quarterly report shows strong growth", "Cats enjoy sleeping")).toBe(0);
  });

  it("flags length outside the target's range for non-trivial inputs", () => {
    const long = Array(40).fill("word").join(" ") + ".";
    const v = verifyDeterministic(long, "word word word.", PRESETS.natural);
    expect(v.findings.some((f) => f.kind === "length_out_of_range")).toBe(true);
  });

  it("records which checks ran and merges model findings without inventing a pass", () => {
    const base = verifyDeterministic("We shipped it.", "We shipped it.", PRESETS.natural);
    expect(base.status).toBe("preserved");
    expect(base.checks).not.toContain("model_meaning");
    expect(mergeVerification(base, null)).toBe(base);
    const merged = mergeVerification(base, [{ kind: "added_claim", severity: "blocking", message: "Adds a claim.", origin: "model" }]);
    expect(merged.status).toBe("rejected");
    expect(merged.checks).toContain("model_meaning");
  });
});
