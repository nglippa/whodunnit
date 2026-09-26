/**
 * Small, explicit word lists. Every metric that uses one of these is a count of
 * list membership, so what the numbers mean stays inspectable.
 */

export const CONTRACTION_RE =
  /\b(?:[a-z]+n['’]t|(?:i|you|we|they|he|she|it|that|there|here|what|who|where|how|let)['’](?:m|re|ve|ll|d|s)|let['’]s)\b/gi;

export const FIRST_PERSON = new Set(["i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves", "i'm", "i've", "i'll", "i'd", "we're", "we've", "we'll", "we'd"]);

export const HEDGES = [
  "perhaps", "maybe", "possibly", "probably", "likely", "arguably", "somewhat", "fairly", "rather",
  "seems", "seem", "seemed", "appears", "appear", "suggests", "suggest", "might", "may", "could",
  "i think", "i suspect", "i guess", "sort of", "kind of", "in a way", "to some extent", "generally", "typically", "often", "tends to",
];

/** Stock connectives that open a sentence. Counted only in sentence-initial position. */
export const TRANSITION_OPENERS = [
  "additionally", "furthermore", "moreover", "however", "therefore", "consequently", "thus", "hence", "nevertheless", "nonetheless",
  "in addition", "as a result", "on the other hand", "in contrast", "similarly", "likewise", "ultimately", "overall", "importantly",
  "notably", "in conclusion", "to summarize", "in summary", "to sum up", "firstly", "secondly", "thirdly", "finally", "lastly",
];

export const STOPWORDS = new Set(
  (
    "a an the and or but if then than so of to in on at by for from with without into onto over under about as is are was were be been being " +
    "it its it's this that these those there here i me my we us our you your he him his she her they them their what which who whom whose " +
    "do does did doing done have has had having not no nor can could should would will shall may might must just very really also too " +
    "more most much many some any each every all both few other such own same only up down out off again further once when where why how " +
    "am im ive id ill youre weve theyre dont doesnt didnt isnt arent wasnt werent cant couldnt wouldnt shouldnt wont"
  ).split(/\s+/),
);

/** Past participles for the passive heuristic: regular -ed plus common irregulars. */
export const IRREGULAR_PARTICIPLES = new Set(
  (
    "made done given taken seen known shown written built found held kept left lost meant paid put read run said sent set " +
    "told thought understood won brought bought caught chosen driven eaten fallen forgotten gotten grown hidden hit hurt laid led " +
    "met proven ridden risen shaken shot spoken spent stolen struck sworn thrown woken worn begun broken"
  ).split(/\s+/),
);
