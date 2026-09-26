import type { StyleProfile } from "@/domain/style";
import type { Refinement } from "@/domain/refinement";

/**
 * The demo engine: a small set of meaning-preserving, rule-based edits used
 * when no model is configured. It is honest about its limits: it removes stock
 * phrasing, adjusts contractions and plain-English substitutions, and splits
 * sentences only at safe boundaries. It does not paraphrase freely.
 */

interface Rule {
  id: string;
  note: string;
  applies: (p: StyleProfile) => boolean;
  apply: (text: string) => string;
}

const capitalizeAfter = (text: string) =>
  text.replace(/(^|[.!?]["'”’)]?\s+|\n\s*)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());

const replaceAll = (pairs: [RegExp, string][]) => (text: string) => pairs.reduce((t, [re, to]) => t.replace(re, to), text);

/** Keep the case of the first letter of the matched text. */
const keepCase = (pairs: [RegExp, string][]) => (text: string) =>
  pairs.reduce((t, [re, to]) => t.replace(re, (m) => (/^[A-Z]/.test(m) ? to[0].toUpperCase() + to.slice(1) : to)), text);

const CONTRACT: [RegExp, string][] = [
  [/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"], [/\bdid not\b/gi, "didn't"], [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"], [/\bwas not\b/gi, "wasn't"], [/\bwere not\b/gi, "weren't"], [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"], [/\bwould not\b/gi, "wouldn't"], [/\bshould not\b/gi, "shouldn't"], [/\bcould not\b/gi, "couldn't"],
  [/\bhave not\b/gi, "haven't"], [/\bhas not\b/gi, "hasn't"], [/\bit is\b/gi, "it's"], [/\bthat is\b(?! to say)/gi, "that's"],
  [/\bwe are\b/gi, "we're"], [/\bthey are\b/gi, "they're"], [/\byou are\b/gi, "you're"], [/\bI am\b/g, "I'm"],
  [/\bwe will\b/gi, "we'll"], [/\bI will\b/g, "I'll"], [/\bwe have\b(?= \w+ed\b)/gi, "we've"], [/\bthere is\b/gi, "there's"],
];

const EXPAND: [RegExp, string][] = [
  [/\bdon['’]t\b/gi, "do not"], [/\bdoesn['’]t\b/gi, "does not"], [/\bdidn['’]t\b/gi, "did not"], [/\bisn['’]t\b/gi, "is not"],
  [/\baren['’]t\b/gi, "are not"], [/\bwasn['’]t\b/gi, "was not"], [/\bweren['’]t\b/gi, "were not"], [/\bcan['’]t\b/gi, "cannot"],
  [/\bwon['’]t\b/gi, "will not"], [/\bwouldn['’]t\b/gi, "would not"], [/\bshouldn['’]t\b/gi, "should not"], [/\bcouldn['’]t\b/gi, "could not"],
  [/\bhaven['’]t\b/gi, "have not"], [/\bhasn['’]t\b/gi, "has not"], [/\bit['’]s\b/gi, "it is"], [/\bthat['’]s\b/gi, "that is"],
  [/\bwe['’]re\b/gi, "we are"], [/\bthey['’]re\b/gi, "they are"], [/\byou['’]re\b/gi, "you are"], [/\bI['’]m\b/g, "I am"],
  [/\bwe['’]ll\b/gi, "we will"], [/\bI['’]ll\b/g, "I will"], [/\bthere['’]s\b/gi, "there is"],
];

const PLAIN_WORDS: [RegExp, string][] = [
  [/\butiliz(?:e|es)\b/gi, "use"], [/\butilized\b/gi, "used"], [/\butilizing\b/gi, "using"],
  [/\bleverag(?:e|es)\b/gi, "use"], [/\bleveraged\b/gi, "used"], [/\bleveraging\b/gi, "using"],
  [/\bdelve into\b/gi, "look at"], [/\bdelves into\b/gi, "looks at"], [/\bdelving into\b/gi, "looking at"],
  [/\bin order to\b/gi, "to"], [/\bdue to the fact that\b/gi, "because"], [/\bat this point in time\b/gi, "now"],
  [/\ba (?:large|significant) number of\b/gi, "many"], [/\bprior to\b/gi, "before"], [/\bin the event that\b/gi, "if"],
  [/\bseamlessly\b/gi, "smoothly"], [/\bseamless\b/gi, "smooth"], [/\bfacilitat(?:e|es)\b/gi, "help"],
  [/\bcommence(?:s)?\b/gi, "start"], [/\bendeavou?r to\b/gi, "try to"],
];

const FILLER_ADVERBS: [RegExp, string][] = [[/\b(?:very|really|basically|essentially|actually|truly|quite) (?=\w)/gi, ""]];

export const DEMO_RULES: Rule[] = [
  {
    id: "announcements",
    note: "Removed phrases that announce a point instead of making it",
    applies: () => true,
    apply: (t) =>
      capitalizeAfter(
        t
          .replace(/\b(?:it['’]s|it is) (?:worth noting|important to note|important to remember|worth mentioning) that\s+/gi, "")
          .replace(/\bin today['’]s (?:fast-paced |ever-changing |rapidly evolving |digital |modern )?(?:world|landscape|environment|age|society),\s*/gi, ""),
      ),
  },
  {
    id: "summary-openers",
    note: "Dropped stock summary openers such as “In conclusion,”",
    applies: () => true,
    apply: (t) => capitalizeAfter(t.replace(/(^|[.!?]\s+|\n\s*)(?:In conclusion|In summary|To sum up|To summarize|Overall|Ultimately),\s+/g, "$1")),
  },
  {
    id: "additive-openers",
    note: "Replaced a chain of “Furthermore / Moreover / Additionally” openers",
    applies: () => true,
    apply: (t) => {
      // One "Also," reads naturally; a chain of them is its own tic, so later ones are dropped.
      let n = 0;
      return capitalizeAfter(t.replace(/(^|[.!?]\s+|\n\s*)(?:Furthermore|Moreover|Additionally),\s+/g, (_, pre: string) => (n++ === 0 ? `${pre}Also, ` : pre)));
    },
  },
  {
    id: "plain-words",
    note: "Swapped inflated wording for plain equivalents",
    applies: () => true,
    apply: keepCase(PLAIN_WORDS),
  },
  {
    id: "casual-connectives",
    note: "Used plainer connectives (But, So)",
    applies: (p) => p.register !== "formal",
    apply: (t) => t.replace(/(^|[.!?]\s+|\n\s*)However,\s+/g, "$1But ").replace(/(^|[.!?]\s+|\n\s*)(?:Therefore|Consequently|Thus),\s+/g, "$1So "),
  },
  {
    id: "formal-connectives",
    note: "Used formal connectives",
    applies: (p) => p.register === "formal",
    apply: (t) => t.replace(/(^|[.!?]\s+|\n\s*)But\s+/g, "$1However, ").replace(/(^|[.!?]\s+|\n\s*)So\s+(?=[a-z])/g, "$1Therefore, "),
  },
  {
    id: "contractions",
    note: "Used contractions",
    applies: (p) => p.contractions === "prefer",
    apply: keepCase(CONTRACT),
  },
  {
    id: "expand-contractions",
    note: "Wrote out contractions",
    applies: (p) => p.contractions === "avoid",
    apply: keepCase(EXPAND),
  },
  {
    id: "filler-adverbs",
    note: "Cut intensifiers that add length but not meaning",
    applies: (p) => p.lengthRatio.max <= 0.9,
    apply: replaceAll(FILLER_ADVERBS),
  },
  {
    id: "split-semicolons",
    note: "Split long sentences at semicolons",
    applies: (p) => p.sentenceLengthMean <= 17 && p.register !== "formal",
    apply: (t) => capitalizeAfter(t.replace(/;\s+(?=[a-z])/g, ". ")),
  },
];

export function applyDemoRules(text: string, profile: StyleProfile, refinement?: Refinement): { text: string; applied: string[] } {
  const keepMore = profile.wordingRetention === "high" || refinement?.directives.includes("keep_wording");
  const applied: string[] = [];
  let out = text;
  for (const rule of DEMO_RULES) {
    if (!rule.applies(profile)) continue;
    if (keepMore && !["announcements", "summary-openers", "contractions", "expand-contractions"].includes(rule.id)) continue;
    const next = rule.apply(out);
    if (next !== out) {
      applied.push(rule.note);
      out = next;
    }
  }
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1");
  return { text: out, applied };
}
