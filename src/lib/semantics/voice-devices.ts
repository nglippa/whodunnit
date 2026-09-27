import { CONTRACTION_RE } from "../analysis/lexicon";
import { paragraphSpans, sentenceSpans, words } from "../analysis/tokenize";

/**
 * Mechanical authorship devices: the habits that make prose sound like one
 * person and that a rewrite can erase without touching a single fact. Dashes
 * (and whether they are spaced), deliberate fragments, quote style, a
 * lowercase style, parentheses, semicolons, ellipses, repeated punctuation.
 *
 * This is not a grammar checker. It answers one question: did the
 * reconstruction erase (or impose) a writing habit the source shows?
 * Deviations are graded by how strongly the source demonstrates the habit
 * and how much text there is to judge from.
 */

export interface DeviceMeasures {
  words: number;
  sentences: number;
  dashes: number;
  dashesPer100: number;
  spacedDashes: number;
  pairedDashes: number;
  fragments: number;
  fragmentShare: number;
  lowercaseStarts: number;
  lowercaseShare: number;
  lowercaseI: number;
  quotes: { straightDouble: number; curlyDouble: number; straightSingle: number; curlySingle: number };
  parentheses: number;
  semicolons: number;
  ellipses: number;
  repeatedPunctuation: number;
  contractionsPer100: number;
}

/**
 * Source-voice confidence at which a habit is strong evidence: the planner
 * lets it outrank the style preset, and erasing it counts as major damage.
 * 0.5 ≈ 62 words of source.
 */
export const STRONG_SOURCE_VOICE = 0.5;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * Sentences for device measurement. Unlike the analysis segmenter, this does
 * not require a capital letter after terminal punctuation: an author who
 * writes in lowercase still ends sentences.
 */
export function deviceSentences(text: string): string[] {
  return paragraphSpans(text)
    .flatMap((p) => sentenceSpans(text, p.start, p.end))
    .flatMap((s) => s.text.split(/(?<=[.!?…]["'”’)]*)\s+(?=["'“‘(]?\p{Ll})/u))
    .map((x) => x.trim())
    .filter(Boolean);
}

export function measureDevices(text: string): DeviceMeasures {
  const sentences = deviceSentences(text);
  const w = words(text).length || 1;
  const dashes = count(text, /—|–|\s--\s/g);
  const fragments = sentences.filter((s) => words(s).length > 0 && words(s).length <= 4).length;
  const lowercaseStarts = sentences.filter((s) => /^["'“‘(]?\p{Ll}/u.test(s.trim())).length;
  return {
    words: words(text).length,
    sentences: sentences.length,
    dashes,
    dashesPer100: (dashes / w) * 100,
    spacedDashes: count(text, /\s(?:—|–|--)\s/g),
    pairedDashes: sentences.filter((s) => count(s, /—|–/g) >= 2).length,
    fragments,
    fragmentShare: sentences.length ? fragments / sentences.length : 0,
    lowercaseStarts,
    lowercaseShare: sentences.length ? lowercaseStarts / sentences.length : 0,
    lowercaseI: count(text, /(?<![\p{L}])i(?:['’](?:m|ve|ll|d))?(?![\p{L}'’])/gu),
    quotes: {
      straightDouble: Math.floor(count(text, /"/g) / 2),
      curlyDouble: count(text, /“/g),
      straightSingle: count(text, /(?:^|[\s(])'[^'\n]{2,200}'(?=[\s.,;:!?)]|$)/g),
      curlySingle: count(text, /‘[^’\n]{2,200}’/g),
    },
    parentheses: count(text, /\(/g),
    semicolons: count(text, /;/g),
    ellipses: count(text, /\.\.\.|…/g),
    repeatedPunctuation: count(text, /[!?]{2,}/g),
    contractionsPer100: (count(text, CONTRACTION_RE) / w) * 100,
  };
}

export interface SourceVoiceProfile {
  devices: DeviceMeasures;
  /** 0–1: how much text there is to judge a habit from. */
  confidence: number;
  /** Habits the source demonstrates deliberately (repeated, and not in slop-heavy text). */
  deliberate: { dashes: boolean; fragments: boolean; lowercase: boolean; semicolons: boolean; parentheses: boolean };
  /** Why each deliberate flag was set or not (for the record). */
  notes: string[];
}

/**
 * A lightweight profile of how THIS source is written, independent of any
 * saved Voiceprint. `slopDensity` is catalogued patterns per 100 words other
 * than the device rules themselves: a device repeated inside templated slop
 * ("The result? Better outcomes. — and that matters —") is not a habit.
 */
export function sourceVoiceProfile(text: string, slopDensity: number): SourceVoiceProfile {
  const d = measureDevices(text);
  const confidence = Math.min(1, Math.round((1 - Math.exp(-d.words / 90)) * 100) / 100);
  const clean = slopDensity < 1.5;
  const notes: string[] = [];
  const otherVoice = d.fragmentShare >= 0.1 || d.contractionsPer100 >= 1 || d.lowercaseShare >= 0.5 || d.pairedDashes >= 1;
  const dashes = d.dashes >= 2 && d.dashesPer100 >= 0.8 && clean && otherVoice;
  const fragments = d.fragments >= 2 && d.fragmentShare >= 0.15 && clean;
  const lowercase = d.sentences >= 3 && d.lowercaseShare >= 0.6;
  const semicolons = d.semicolons >= 2 && clean;
  const parentheses = d.parentheses >= 2 && clean;
  if (d.dashes >= 2 && !dashes) notes.push(clean ? "dashes present but without other signs of a personal style" : "dashes appear in slop-heavy text: treated as a pattern, not a habit");
  if (d.fragments >= 2 && !fragments) notes.push(clean ? "fragments too rare to be a habit" : "fragments appear in slop-heavy text");
  return { devices: d, confidence, deliberate: { dashes, fragments, lowercase, semicolons, parentheses }, notes };
}

export interface VoiceDeviation {
  device: "dashes" | "dash-spacing" | "fragments" | "capitalization" | "quote-style" | "parentheses" | "semicolons" | "ellipses" | "repeated-punctuation";
  change: "erased" | "reduced" | "introduced" | "normalized" | "restyled";
  severity: "minor" | "major";
  source: number;
  output: number;
  detail: string;
}

export interface VoiceDeviceReport {
  source: DeviceMeasures;
  output: DeviceMeasures;
  confidence: number;
  deliberate: SourceVoiceProfile["deliberate"];
  deviations: VoiceDeviation[];
  verdict: "PRESERVED" | "DEVIATION" | "DAMAGED";
}

const dominantQuote = (q: DeviceMeasures["quotes"]) => {
  const entries = Object.entries(q).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : null;
};

/** Compare device use; `slopDensity` of the source decides which devices count as deliberate. */
export function compareVoiceDevices(source: string, output: string, slopDensity: number): VoiceDeviceReport {
  const profile = sourceVoiceProfile(source, slopDensity);
  const s = profile.devices;
  const o = measureDevices(output);
  const conf = profile.confidence;
  // Major only when there is enough text to be sure; a tiny sample caps at minor.
  const grade = (strong: boolean) => (strong && conf >= STRONG_SOURCE_VOICE ? "major" : "minor") as VoiceDeviation["severity"];
  const dev: VoiceDeviation[] = [];

  if (profile.deliberate.dashes && o.dashes <= s.dashes * 0.4)
    dev.push({ device: "dashes", change: o.dashes === 0 ? "erased" : "reduced", severity: grade(true), source: s.dashes, output: o.dashes, detail: `The source uses dashes deliberately (${s.dashes}); the rewrite keeps ${o.dashes}.` });
  if (s.dashes >= 2 && o.dashes >= 2 && s.spacedDashes / s.dashes >= 0.8 && o.spacedDashes / o.dashes <= 0.2)
    dev.push({ device: "dash-spacing", change: "restyled", severity: "minor", source: s.spacedDashes, output: o.spacedDashes, detail: "Spaced dashes ( — ) became unspaced (—)." });
  if (s.dashes === 0 && o.dashes >= 2)
    dev.push({ device: "dashes", change: "introduced", severity: grade(o.dashesPer100 >= 1.5), source: 0, output: o.dashes, detail: `The rewrite adds ${o.dashes} dashes to a text that used none.` });

  if (profile.deliberate.fragments && o.fragmentShare < s.fragmentShare * 0.4)
    dev.push({ device: "fragments", change: o.fragments === 0 ? "erased" : "reduced", severity: grade(true), source: s.fragments, output: o.fragments, detail: `The source uses short fragments deliberately (${s.fragments} of ${s.sentences} sentences); the rewrite keeps ${o.fragments}.` });
  if (s.fragmentShare < 0.05 && o.fragments >= 2 && o.fragmentShare >= 0.15)
    dev.push({ device: "fragments", change: "introduced", severity: "minor", source: s.fragments, output: o.fragments, detail: `The rewrite adds ${o.fragments} fragments to prose that did not use them.` });

  if (profile.deliberate.lowercase && o.sentences >= 1 && o.lowercaseShare <= 0.2)
    dev.push({ device: "capitalization", change: "normalized", severity: grade(true), source: s.lowercaseStarts, output: o.lowercaseStarts, detail: "The source is written in lowercase on purpose; the rewrite capitalises it." });
  else if (s.lowercaseI > 0 && o.lowercaseI === 0 && profile.deliberate.lowercase)
    dev.push({ device: "capitalization", change: "normalized", severity: "minor", source: s.lowercaseI, output: 0, detail: "The source's lowercase “i” was capitalised." });
  if (s.lowercaseShare <= 0.1 && o.sentences >= 3 && o.lowercaseShare >= 0.6)
    dev.push({ device: "capitalization", change: "introduced", severity: grade(true), source: s.lowercaseStarts, output: o.lowercaseStarts, detail: `The rewrite lowercases ${o.lowercaseStarts} of ${o.sentences} sentence starts in a normally capitalised text.` });

  const sq = dominantQuote(s.quotes);
  const oq = dominantQuote(o.quotes);
  if (sq && oq && sq !== oq) dev.push({ device: "quote-style", change: "restyled", severity: "minor", source: 1, output: 1, detail: `Quote style changed from ${sq} to ${oq}.` });

  const erased = (device: VoiceDeviation["device"], sv: number, ov: number, label: string) => {
    if (sv >= 2 && ov === 0) dev.push({ device, change: "erased", severity: "minor", source: sv, output: ov, detail: `The source's ${label} (${sv}) are gone.` });
  };
  erased("parentheses", s.parentheses, o.parentheses, "parentheses");
  erased("semicolons", s.semicolons, o.semicolons, "semicolons");
  erased("ellipses", s.ellipses, o.ellipses, "ellipses");
  erased("repeated-punctuation", s.repeatedPunctuation, o.repeatedPunctuation, "repeated punctuation (?? / !!)");
  if (s.semicolons === 0 && o.semicolons >= 3) dev.push({ device: "semicolons", change: "introduced", severity: "minor", source: 0, output: o.semicolons, detail: `The rewrite adds ${o.semicolons} semicolons.` });

  return {
    source: s,
    output: o,
    confidence: conf,
    deliberate: profile.deliberate,
    deviations: dev,
    verdict: dev.some((d) => d.severity === "major") ? "DAMAGED" : dev.length ? "DEVIATION" : "PRESERVED",
  };
}
