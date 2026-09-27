import type { ClaimChange } from "@/domain/semantics";
import { extractNameSpans } from "../verification/protected";

/**
 * Obvious mechanical damage a rewrite introduced. Not a grammar checker:
 * every check compares with the source, so an author's own lowercase style,
 * spacing or punctuation habits are never reported as damage.
 */

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function checkMechanics(source: string, output: string): ClaimChange[] {
  const issues: ClaimChange[] = [];
  const base = { relation: "added" as const, aspect: "mechanics" as const, sourceClaimId: null, outputClaimId: null, source: null, licensedBy: null };
  const names = new Set(extractNameSpans(source).filter((n) => n.strength === "strong").flatMap((n) => n.name.split(" ")));

  // A capital after a dash, comma or semicolon mid-sentence: "weekend—Five boards".
  for (const m of output.matchAll(/(\p{L})\s*(—|–|--|,|;)\s*(\p{Lu}\p{Ll}+)/gu)) {
    const word = m[3];
    if (names.has(word) || /^I(?:'|’|$)/.test(word)) continue;
    if (source.includes(`${m[2]}${word}`) || source.includes(`${m[2]} ${word}`)) continue;
    // A word that is only ever capitalised in the source (a name we did not catch) is left alone.
    const lowerElsewhere = new RegExp(`(?<![\\p{L}])${word.toLowerCase()}(?![\\p{L}])`, "u").test(source + " " + output);
    const inSourceMidSentence = new RegExp(`\\p{Ll}\\s+${word}\\b`, "u").test(source);
    if (inSourceMidSentence && !lowerElsewhere) continue;
    issues.push({ ...base, severity: "minor", output: m[0], detail: `Unexpected capital after “${m[2]}”: “${m[0]}”.` });
  }

  const pairs: [RegExp, string][] = [
    [/([,;:!?])\1|(?<!\.)\.\.(?!\.)|,\s*\.|\.\s*,/g, "Duplicated or clashing punctuation"],
    [/ +[,.;:!?](?!\d)/g, "A space before punctuation"],
    [/\S {2,}\S/g, "Double spaces inside a line"],
  ];
  for (const [re, label] of pairs) {
    if (count(output, re) > count(source, re)) issues.push({ ...base, severity: "minor", output: output.match(re)![0], detail: `${label} the source does not have.` });
  }

  // Lowercase after a sentence end, only when the source never does this (so a lowercase style is kept).
  const lowerStart = /(?<!\b(?:e\.g|i\.e|etc|vs|cf|approx))[.!?]["'”’)]?\s+\p{Ll}/gu;
  if (count(source, lowerStart) === 0 && count(output, lowerStart) > 0)
    issues.push({ ...base, severity: "minor", output: output.match(lowerStart)![0], detail: "A sentence starts in lowercase." });

  for (const [open, close] of [["(", ")"], ["[", "]"]]) {
    const bal = (t: string) => t.split(open).length === t.split(close).length;
    if (bal(source) && !bal(output)) issues.push({ ...base, relation: "contradicted", severity: "major", output: null, detail: `Unbalanced “${open}${close}”.` });
  }
  return issues;
}
