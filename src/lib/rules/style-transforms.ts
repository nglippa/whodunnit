import type { StyleProfile } from "@/domain/style";

/**
 * Register-level edits driven by the style target rather than by a detected
 * pattern: contractions, connective register, and sentence splitting at
 * semicolons for short-sentence targets. Each is meaning-preserving.
 */

type Pair = [RegExp, string];

const keepCase = (pairs: Pair[]) => (text: string) =>
  pairs.reduce((t, [re, to]) => t.replace(re, (m) => (/^[A-Z]/.test(m) ? to[0].toUpperCase() + to.slice(1) : to)), text);

const CONTRACT: Pair[] = [
  [/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"], [/\bdid not\b/gi, "didn't"], [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"], [/\bwas not\b/gi, "wasn't"], [/\bwere not\b/gi, "weren't"], [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"], [/\bwould not\b/gi, "wouldn't"], [/\bshould not\b/gi, "shouldn't"], [/\bcould not\b/gi, "couldn't"],
  [/\bhave not\b/gi, "haven't"], [/\bhas not\b/gi, "hasn't"], [/\bit is\b/gi, "it's"], [/\bthat is\b(?! to say)/gi, "that's"],
  [/\bwe are\b/gi, "we're"], [/\bthey are\b/gi, "they're"], [/\byou are\b/gi, "you're"], [/\bI am\b/g, "I'm"],
  [/\bwe will\b/gi, "we'll"], [/\bI will\b/g, "I'll"], [/\bwe have\b(?= \w+ed\b)/gi, "we've"], [/\bthere is\b/gi, "there's"],
];

const EXPAND: Pair[] = [
  [/\bdon['’]t\b/gi, "do not"], [/\bdoesn['’]t\b/gi, "does not"], [/\bdidn['’]t\b/gi, "did not"], [/\bisn['’]t\b/gi, "is not"],
  [/\baren['’]t\b/gi, "are not"], [/\bwasn['’]t\b/gi, "was not"], [/\bweren['’]t\b/gi, "were not"], [/\bcan['’]t\b/gi, "cannot"],
  [/\bwon['’]t\b/gi, "will not"], [/\bwouldn['’]t\b/gi, "would not"], [/\bshouldn['’]t\b/gi, "should not"], [/\bcouldn['’]t\b/gi, "could not"],
  [/\bhaven['’]t\b/gi, "have not"], [/\bhasn['’]t\b/gi, "has not"], [/\bit['’]s\b/gi, "it is"], [/\bthat['’]s\b/gi, "that is"],
  [/\bwe['’]re\b/gi, "we are"], [/\bthey['’]re\b/gi, "they are"], [/\byou['’]re\b/gi, "you are"], [/\bI['’]m\b/g, "I am"],
  [/\bwe['’]ll\b/gi, "we will"], [/\bI['’]ll\b/g, "I will"], [/\bthere['’]s\b/gi, "there is"],
];

const SENTENCE_START = String.raw`(^|[.!?]["'”’)]?\s+|\n\s*)`;

interface StyleTransform {
  id: string;
  note: string;
  /** `fired` = rule ids that detected a pattern in this text (not suppressed). */
  applies: (p: StyleProfile, keepWording: boolean, fired: Set<string>) => boolean;
  apply: (text: string) => string;
}

const connectiveOveruse = (fired: Set<string>) =>
  fired.has("core.transition-density") || fired.has("core.repeated-transitions") || fired.has("casual.stiff-connectives");

export const STYLE_TRANSFORMS: StyleTransform[] = [
  {
    id: "plain-additives",
    note: "Replaced a stock additive connective with “Also”",
    applies: (p, keep) => p.register !== "formal" && !keep,
    apply: (t) => t.replace(new RegExp(`${SENTENCE_START}(?:Furthermore|Moreover|Additionally),\\s+`, "g"), "$1Also, "),
  },
  {
    // Only where connectives are overused or the target is casual: a single "However" is the author's choice.
    id: "plain-connectives",
    note: "Used plainer connectives (But, So)",
    applies: (p, keep, fired) => !keep && p.register !== "formal" && (p.register === "casual" || connectiveOveruse(fired)),
    apply: (t) =>
      t
        .replace(new RegExp(`${SENTENCE_START}However,\\s+`, "g"), "$1But ")
        .replace(new RegExp(`${SENTENCE_START}(?:Therefore|Consequently|Thus),\\s+`, "g"), "$1So "),
  },
  {
    id: "formal-connectives",
    note: "Used formal connectives",
    applies: (p, keep) => p.register === "formal" && !keep,
    apply: (t) => t.replace(new RegExp(`${SENTENCE_START}But\\s+`, "g"), "$1However, ").replace(new RegExp(`${SENTENCE_START}So\\s+(?=[a-z])`, "g"), "$1Therefore, "),
  },
  { id: "contractions", note: "Used contractions", applies: (p) => p.contractions === "prefer", apply: keepCase(CONTRACT) },
  { id: "expand-contractions", note: "Wrote out contractions", applies: (p) => p.contractions === "avoid", apply: keepCase(EXPAND) },
  {
    id: "split-semicolons",
    note: "Split long sentences at semicolons",
    // Only when semicolons are actually overused; one deliberate semicolon is the author's.
    applies: (p, keep, fired) => fired.has("core.semicolon-density") && p.sentenceLengthMean <= 17 && p.register !== "formal" && !keep,
    apply: (t) => t.replace(/;\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`),
  },
];

export function applyStyleTransforms(text: string, profile: StyleProfile, keepWording = false, fired: Set<string> = new Set()): { text: string; applied: string[] } {
  const applied: string[] = [];
  let out = text;
  for (const t of STYLE_TRANSFORMS) {
    if (!t.applies(profile, keepWording, fired)) continue;
    const next = t.apply(out);
    if (next !== out) {
      applied.push(t.note);
      out = next;
    }
  }
  return { text: out, applied };
}
