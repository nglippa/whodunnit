import type { StyleProfile } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { VOICEPRINT_MIN_WORDS } from "@/domain/voiceprint";

/**
 * Translate a Voiceprint's measurements into the same StyleProfile shape the
 * presets use. Low-confidence measurements fall back to neutral defaults rather
 * than pushing the rewrite toward a habit we have not really observed.
 */

const TRUST = 0.35;

export function isVoiceprintUsable(vp: Voiceprint): boolean {
  return vp.stats !== null && vp.totalWords >= VOICEPRINT_MIN_WORDS;
}

export function voiceprintToProfile(vp: Voiceprint): StyleProfile {
  const s = vp.stats;
  const trusted = (m: { value: number; confidence: number } | undefined) => (m && m.confidence >= TRUST ? m.value : null);

  const meanLen = trusted(s?.sentences.meanLength) ?? 17;
  const sd = trusted(s?.sentences.lengthStdDev);
  const contractions = trusted(s?.vocabulary.contractionRate);
  const firstPerson = trusted(s?.vocabulary.firstPersonRate);
  const questions = trusted(s?.sentences.questionRate);
  const fragments = trusted(s?.sentences.fragmentRate);
  const hedges = trusted(s?.vocabulary.hedgeRate);
  const paraSentences = trusted(s?.structure.meanParagraphSentences);
  const longWords = trusted(s?.vocabulary.longWordRate);

  const variationRatio = sd !== null && meanLen > 0 ? sd / meanLen : null;

  return {
    id: `voiceprint:${vp.id}`,
    kind: "voiceprint",
    label: vp.name,
    description: vp.description || `Matches the measured habits of ${vp.name}.`,
    register: longWords !== null && longWords >= 0.3 ? "formal" : contractions !== null && contractions >= 2 ? "casual" : "neutral",
    contractions: contractions === null ? "allow" : contractions >= 2 ? "prefer" : contractions < 0.3 ? "avoid" : "allow",
    firstPerson: firstPerson === null ? "allow" : firstPerson >= 3 ? "prefer" : firstPerson < 0.3 ? "avoid" : "allow",
    rhetoricalQuestions: questions === null ? "allow" : questions >= 0.08 ? "prefer" : questions === 0 ? "avoid" : "allow",
    fragments: fragments === null ? "allow" : fragments >= 0.08 ? "prefer" : fragments === 0 ? "avoid" : "allow",
    sentenceLengthMean: Math.min(40, Math.max(6, Math.round(meanLen))),
    sentenceLengthVariation: variationRatio === null ? "medium" : variationRatio >= 0.6 ? "high" : variationRatio <= 0.3 ? "low" : "medium",
    paragraphLength: paraSentences === null ? "medium" : paraSentences <= 2.5 ? "short" : paraSentences >= 5 ? "long" : "medium",
    hedging: hedges === null ? "natural" : hedges >= 2 ? "natural" : hedges < 0.4 ? "minimal" : "moderate",
    lengthRatio: { min: 0.75, max: 1.2 },
    wordingRetention: "medium",
    notes: vp.observations
      .filter((o) => o.confidence >= TRUST)
      .slice(0, 8)
      .map((o) => o.text)
      .concat(s && s.recurringPhrases.length ? [`Phrases this author actually repeats: ${s.recurringPhrases.slice(0, 4).map((p) => `“${p}”`).join(", ")}`.slice(0, 200)] : [])
      .slice(0, 12),
  };
}
