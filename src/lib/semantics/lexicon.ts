import type { ModalityLevel, ScaleMarker } from "@/domain/semantics";

/**
 * Marker lexicons for claim analysis. Every list is small, explicit and
 * ordered, so a reported change can always be traced to two words on the
 * same scale. Ambiguous words are left out on purpose ("should", "must",
 * "since", "as", "makes"): a marker that is sometimes something else would
 * turn this layer into a guesser.
 */

/** Epistemic modality. Unmarked assertions are "asserted". */
export const MODALITY_MARKERS: [ModalityLevel, string[]][] = [
  ["possible", ["may", "might", "could", "possibly", "perhaps", "maybe", "conceivably", "potentially", "i guess", "i suspect", "it is possible that"]],
  ["probable", ["likely", "probably", "presumably", "apparently", "seems", "seem", "seemed", "appears to", "appear to", "tends to", "tend to", "i think", "i believe", "arguably", "in all likelihood"]],
  ["emphatic", ["certainly", "definitely", "undoubtedly", "unquestionably", "clearly", "surely", "without doubt", "without a doubt", "guaranteed", "guarantees", "inevitably", "always will", "no doubt"]],
];

type Scale = ScaleMarker["scale"];

/** Ordered scales: [rank, markers]. Higher rank = stronger claim. */
export const SCALES: Record<Exclude<Scale, "modality">, [number, string[]][]> = {
  // How strongly evidence or opinion is presented.
  evidence: [
    [1, ["suggest", "suggests", "suggested", "hint", "hints", "imply", "implies", "indicate", "indicates", "highlight", "highlights", "highlighting", "underscore", "underscores", "point to", "points to", "agree", "agrees", "believe", "believes", "argue", "argues", "claim", "claims", "say", "says", "think", "thinks"]],
    [2, ["show", "shows", "showed", "shown", "demonstrate", "demonstrates", "demonstrated", "found that"]],
    [3, ["prove", "proves", "proved", "proven", "proving", "confirm", "confirms", "confirmed", "establish", "establishes", "established", "verify", "verifies", "verified", "settle", "settles"]],
  ],
  // How strongly one thing is said to bring about another.
  // How strongly one thing is said to bring about another. Five concepts on four ranks:
  //   1 association / contribution / importance   "linked to", "helps", "plays a crucial role"
  //   2 enablement / necessity                    "enables", "lets", "is essential to", "the key to"
  //   3 causation                                 "causes", "leads to", "drives growth", "makes X stick"
  //   4 determination                             "determines", "ensures", "is what makes X succeed"
  // Ambiguous verbs ("makes", "drives") only count inside CAUSAL_CONSTRUCTIONS, never as bare words.
  causation: [
    [1, ["associated with", "linked to", "correlated with", "correlates with", "coincided with", "went along with", "help", "helps", "helped", "helping", "contribute", "contributes", "contributed", "contributing", "plays a role", "play a role", "plays a part", "plays a crucial role", "plays a vital role", "plays a key role", "plays an important role", "plays a major role", "plays a central role", "influences", "influenced", "can improve", "can help"]],
    [2, ["enable", "enables", "enabled", "enabling", "allows", "allowed", "makes it possible", "made it possible", "the key to", "key to"]],
    [3, ["cause", "causes", "caused", "lead to", "leads to", "led to", "produces", "result in", "results in", "resulted in", "brings about", "brought about", "triggers", "triggered", "driven by", "responsible for"]],
    [4, ["determine", "determines", "determined", "ensure", "ensures", "ensured", "guarantee", "guarantees", "guaranteed", "decide", "decides", "dictate", "dictates"]],
  ],
  // How much of a set a claim covers.
  quantifier: [
    [1, ["a few", "few", "some", "several", "a handful of", "a number of", "a minority of"]],
    [2, ["many", "much", "a lot of", "lots of", "numerous", "plenty of"]],
    [3, ["most", "the majority of", "nearly all", "almost all", "the vast majority of"]],
    [4, ["all", "every", "each", "everyone", "everybody", "everything", "universally"]],
  ],
  // How often.
  frequency: [
    [1, ["rarely", "seldom", "occasionally", "once in a while"]],
    [2, ["sometimes", "at times", "now and then"]],
    [3, ["often", "frequently", "usually", "typically", "generally", "normally", "regularly", "commonly", "mostly"]],
    [4, ["always", "invariably", "constantly", "every time", "without exception"]],
  ],
};

/** Explicit negators. "not only" is handled separately (it is not a negation). */
export const NEGATORS = ["not", "never", "no", "none", "nothing", "nobody", "nowhere", "neither", "nor", "without", "cannot", "no longer", "no one", "hardly", "barely"];
/** Words whose meaning carries the negation ("postpone" = not do now). Used so a paraphrase is not read as a flip. */
export const IMPLICIT_NEGATORS = [
  "postpone", "postpones", "postponed", "delay", "delays", "delayed", "defer", "defers", "deferred", "pause", "pauses", "paused",
  "halt", "halts", "halted", "stop", "stops", "stopped", "avoid", "avoids", "avoided", "refuse", "refuses", "refused", "decline", "declines",
  "declined", "lack", "lacks", "lacked", "fail to", "fails to", "failed to", "absent", "hold off", "holding off", "rule out", "ruled out",
  "prevent", "prevents", "prevented", "forbid", "forbids", "prohibit", "prohibits", "withhold", "withholds", "cancel", "cancels", "cancelled",
  "canceled", "reject", "rejects", "rejected", "deny", "denies", "denied", "exclude", "excludes", "excluded", "insufficient", "unable", "unwilling",
  "instead of", "rather than",
];

/**
 * Causal and determinative constructions built on verbs that are ambiguous on
 * their own ("makes", "drives", "is ... to"). Each is anchored to a frame that
 * only reads causally: "is what makes", "drives [the] growth", "makes X stick",
 * "is essential to". [rank, pattern, label]
 */
export const CAUSAL_CONSTRUCTIONS: [number, RegExp, string][] = [
  [4, /\b(?:is|are|was|were)\s+what\s+(?:makes?|made|drives?|drove|determines?|keeps?|gets?|creates?|causes?|decides?)\b/gi, "is what makes/drives"],
  [4, /\b(?:is|are|was|were)\s+the\s+(?:sole|only|single|real|true)\s+(?:reason|cause|driver)\b/gi, "is the sole reason"],
  [3, /\b(?:is|are|was|were)\s+the\s+(?:main\s+|primary\s+|biggest\s+)?(?:reason|cause|driver)\s+(?:for|of|behind|why)\b/gi, "is the reason for"],
  [3, /\bmakes?\s+(?:[\p{L}'’-]+\s+){0,3}?(?:stick|last|work|happen|succeed|pay\s+off)\b/giu, "makes X stick/work/succeed"],
  [3, /\b(?:drives?|drove|driving)\s+(?:the\s+|our\s+|their\s+|its\s+|an?\s+)?(?:[\p{L}-]+\s+)?(?:success|growth|results?|improvements?|adoption|performance|outcomes?|change|engagement|sales|revenue|progress|gains?|rise|fall|drop|increase|decrease|decline|shift|recovery|turnaround)\b/giu, "drives success/growth"],
  [2, /\b(?:is|are|was|were)\s+(?:essential|necessary|required|critical|vital|indispensable)\s+(?:to|for)\b/gi, "is essential to"],
  [2, /\blets?\s+(?:[\p{L}'’-]+\s+){1,3}?(?:own|do|make|work|ship|focus|reach|achieve|get)\b/giu, "lets X do"],
  [1, /\b(?:is|are|was|were)\s+(?:important|crucial|useful|helpful|valuable|beneficial)\s+(?:to|for|in)\b/gi, "is important to"],
];

/** Unambiguous causal markers ("since" and "as" are temporal too often to count). */
export const CAUSAL_MARKERS = [
  "because", "because of", "due to", "owing to", "caused by", "as a result", "as a result of", "therefore", "thus", "hence", "consequently",
  "which is why", "that is why", "thanks to", "so that", "results in", "resulted in", "leads to", "led to", "on account of",
];

export const TEMPORAL_MARKERS = ["while", "when", "whenever", "after", "before", "until", "once", "during", "as soon as", "meanwhile"];
export const CONDITIONAL_MARKERS = ["if", "unless", "provided that", "as long as", "only if", "in case"];
export const COMPARATIVE_MARKERS = ["more than", "less than", "fewer than", "better than", "worse than", "faster than", "slower than", "earlier than", "later than", "higher than", "lower than", "rather than", "instead of", "compared with", "compared to"];

/**
 * Words that mark a quantity's bound. Order matters: longer phrases first.
 * "never more than" style negated comparatives are handled in quantities.ts.
 */
export const PRE_QUALIFIERS: [RegExp, "approximate" | "below" | "at-most" | "above" | "at-least"][] = [
  [/\b(?:the better part of|most of|almost|nearly|just under|just shy of|a little under|slightly under|not quite)\s+$/i, "below"],
  [/\b(?:less than|fewer than|under|below|short of)\s+$/i, "below"],
  [/\b(?:up to|at most|no more than|not more than|never more than|a maximum of|maximum of|max(?:imum)?)\s+$/i, "at-most"],
  [/\b(?:more than|over|above|upwards of|in excess of|just over|a little over|slightly over|beyond)\s+$/i, "above"],
  [/\b(?:at least|no less than|no fewer than|not less than|a minimum of|minimum of|a good)\s+$/i, "at-least"],
  [/(?:\b(?:about|around|roughly|approximately|approx\.?|circa|some|close to|closer to|nearer to|near|in the region of|on the order of|or so)\s+|~\s*)$/i, "approximate"],
];

export const POST_QUALIFIERS: [RegExp, "approximate" | "at-most" | "at-least"][] = [
  [/^[\s,.;:—–-]*(?:(?:and\s+)?maybe|perhaps|possibly|probably|or|if not|and|plus|even)\s+(?:a\s+(?:bit|little)\s+|slightly\s+|even\s+)?(?:more|longer|over|higher|further|beyond)\b/i, "at-least"],
  [/^\s*(?:\+|plus\b)/i, "at-least"],
  [/^[\s,.;:—–-]*(?:(?:and\s+)?maybe|perhaps|possibly|or)\s+(?:a\s+(?:bit|little)\s+)?(?:less|fewer|shorter|under)\b/i, "at-most"],
  [/^[\s,]*(?:or so|give or take|more or less|or thereabouts|ish)\b/i, "approximate"],
];

export const UNIT_WORDS: Record<string, string> = {
  second: "second", seconds: "second", sec: "second", secs: "second",
  minute: "minute", minutes: "minute", min: "minute", mins: "minute",
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour",
  day: "day", days: "day", week: "week", weeks: "week", fortnight: "fortnight", month: "month", months: "month", year: "year", years: "year", decade: "decade", decades: "decade",
  percent: "percent", "%": "percent", time: "time", times: "time",
  centimetre: "centimetre", centimetres: "centimetre", centimeter: "centimetre", centimeters: "centimetre", cm: "centimetre",
  metre: "metre", metres: "metre", meter: "metre", meters: "metre", m: "metre", kilometre: "kilometre", kilometres: "kilometre", km: "kilometre",
  mile: "mile", miles: "mile", inch: "inch", inches: "inch", foot: "foot", feet: "foot",
  million: "million", billion: "billion", thousand: "thousand",
  people: "person", person: "person", plant: "plant", plants: "plant", board: "board", boards: "board",
};

/**
 * Contrast groups: tokens in different sense-classes of the same group mean
 * different things in the same frame ("across the grain" vs "against the
 * grain"). Tokens in the same class are near-synonyms and are not flagged.
 */
export const CONTRAST_GROUPS: string[][][] = [
  [["across", "crosswise"], ["along", "with"], ["against"]],
  [["over", "above"], ["under", "below", "beneath", "underneath"]],
  [["before", "prior"], ["after", "following"]],
  [["in", "inside", "into", "within"], ["out", "outside"]],
  [["on", "onto"], ["off"]],
  [["up"], ["down"]],
  [["with"], ["without"]],
  [["increase", "increased", "increases", "rise", "rose", "risen", "rises", "grow", "grew", "grows", "gain", "gained", "climb", "climbed"], ["decrease", "decreased", "decreases", "fall", "fell", "fallen", "falls", "drop", "dropped", "drops", "decline", "declined", "shrink", "shrank", "reduce", "reduced", "cut"]],
  [["more", "greater", "higher", "larger", "bigger"], ["less", "fewer", "lower", "smaller"]],
  [["earlier", "sooner"], ["later"]],
  [["first"], ["last"]],
  [["minimum", "min"], ["maximum", "max"]],
  [["include", "includes", "included"], ["exclude", "excludes", "excluded"]],
  [["accept", "accepted", "approve", "approved"], ["reject", "rejected", "deny", "denied"]],
  [["open", "opened"], ["close", "closed", "shut"]],
  [["left"], ["right"]],
  [["north"], ["south"], ["east"], ["west"]],
  [["hot", "warm"], ["cold", "cool"]],
  [["wet", "damp"], ["dry"]],
  [["inner", "internal"], ["outer", "external"]],
];

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Phrase-boundary regex for a lexicon entry (handles multiword entries and curly apostrophes). */
export function markerRe(entry: string): RegExp {
  return new RegExp(`(?<![\\p{L}'’])${escapeRe(entry).replace(/\s+/g, "\\s+").replace(/'/g, "['’]")}(?![\\p{L}'’])`, "giu");
}

/** All entries of `list` found in `text` (lowercased), longest first, without double-counting overlapping shorter entries. */
export function findMarkers(text: string, list: string[]): { marker: string; index: number }[] {
  const lower = text.toLowerCase();
  const taken: [number, number][] = [];
  const out: { marker: string; index: number }[] = [];
  for (const entry of [...list].sort((a, b) => b.length - a.length)) {
    for (const m of lower.matchAll(markerRe(entry))) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      taken.push([s, e]);
      out.push({ marker: entry, index: s });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
