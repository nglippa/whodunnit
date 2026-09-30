import type { StyleProfile } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { STOPWORDS } from "../analysis/lexicon";
import { words } from "../analysis/tokenize";
import type { SourceVoiceProfile } from "../semantics/voice-devices";
import { indexText, proseParagraphs } from "../rules/text-index";
import { classifyDocumentStructure, type DocumentStructure } from "./structure";

export type DiscoursePhenomenon = "GENERIC_REGISTER" | "POSSIBLE_RESTATEMENT" | "MECHANICAL_STRUCTURE";
export type DiscourseAction = "ADVISORY" | "DISTRIBUTED_LIGHT_EDIT" | "SUBSTANTIVE_RECONSTRUCTION";
export interface DiscourseObservation {
  kind: "abstract-framing" | "weak-predicate" | "nominalization" | "restatement-pair" | "regular-paragraph" | "concrete-anchor";
  count: number;
  total: number;
  explanation: string;
}
export interface DiscourseFinding {
  phenomenon: DiscoursePhenomenon;
  /** Evidence strength for an editing reason, never a probability of AI authorship. */
  confidence: number;
  scope: "distributed";
  paragraphIndices: number[];
  supporting: DiscourseObservation[];
  counterevidence: string[];
  action: DiscourseAction;
}
export interface DiscourseAnalysis {
  structure: DocumentStructure;
  words: number;
  uncertainty: "INSUFFICIENT_EVIDENCE" | null;
  observations: DiscourseObservation[];
  findings: DiscourseFinding[];
}

// Editorial roles, not forbidden words. A term only counts when other evidence
// appears in the same sentence and the habit recurs across paragraphs.
const ABSTRACT_NOUNS = new Set("approach process outcome impact opportunity challenge experience framework initiative strategy alignment success value quality improvement implementation development engagement collaboration transformation effectiveness efficiency capability capacity potential progress solution objective result decision situation issue importance significance performance delivery activity effort use utilization management communication consideration provision achievement contribution support commitment arrangement response benefit advantage change".split(" "));
const WEAK_PREDICATES = new Set("drive drives driving enable enables enabling support supports supporting enhance enhances enhancing promote promotes promoting facilitate facilitates facilitating foster fosters fostering deliver delivers delivering ensure ensures ensuring optimize optimizes optimizing leverage leverages leveraging empower empowers empowering strengthen strengthens strengthening advance advances advancing provide provides providing contribute contributes contributing demonstrate demonstrates demonstrating reflect reflects reflecting highlight highlights highlighting represent represents representing allow allows allowing involve involves involving constitute constitutes constituting".split(" "));
const EVALUATIVE = new Set("meaningful strategic robust innovative transformative holistic effective impactful important essential comprehensive seamless significant valuable powerful positive successful beneficial critical key broader overall vital useful better".split(" "));
const NOMINAL_ENDING = /(?:tion|sion|ment|ity|ness)$/;

const tokens = (s: string) => words(s).map((w) => w.toLowerCase().replace(/’/g, "'"));
const count = (ts: string[], set: Set<string>) => ts.filter((w) => set.has(w)).length;
const content = (ts: string[]) => new Set(ts.filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
const anchors = (s: string) => (s.match(/\b\d+(?:[.,]\d+)?\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/g) ?? []).length;
const observation = (kind: DiscourseObservation["kind"], count: number, total: number, explanation: string): DiscourseObservation => ({ kind, count, total, explanation });

interface SentenceEvidence {
  paragraph: number;
  framing: boolean;
  weak: boolean;
  nominal: number;
  concrete: number;
  content: Set<string>;
}

export function analyzeDiscourse(text: string, options: { profile?: StyleProfile; voiceprint?: Voiceprint; sourceVoice?: Pick<SourceVoiceProfile, "deliberate" | "repeatedOpening">; structure?: DocumentStructure } = {}): DiscourseAnalysis {
  const ix = indexText(text);
  const structure = options.structure ?? classifyDocumentStructure(text);
  const paras = proseParagraphs(ix);
  // Six sentences in at least two prose paragraphs are needed to infer a
  // distributed habit. Local rules remain available for shorter material.
  if (ix.wordCount < 100 || ix.sentences.length < 6 || paras.length < 2) {
    return { structure, words: ix.wordCount, uncertainty: "INSUFFICIENT_EVIDENCE", observations: [], findings: [] };
  }

  const rows: SentenceEvidence[] = ix.sentences.map((sentence) => {
    const masked = ix.masked.slice(sentence.start, sentence.end);
    const ts = tokens(masked);
    const abstract = count(ts, ABSTRACT_NOUNS);
    const weak = count(ts, WEAK_PREDICATES) > 0;
    const evaluative = count(ts, EVALUATIVE) > 0;
    const nominal = ts.filter((w) => w.length >= 8 && NOMINAL_ENDING.test(w)).length;
    // One formal term is normal. Framing requires two independent editorial
    // cues within the sentence; suffixes alone never make a finding.
    const framing = (abstract > 0 && (weak || evaluative)) || (weak && evaluative) || (abstract >= 2 && nominal > 0);
    return { paragraph: sentence.paragraph, framing, weak, nominal, concrete: anchors(masked), content: content(ts) };
  });
  const framed = rows.filter((r) => r.framing);
  const weakRows = rows.filter((r) => r.weak);
  const nominalCount = rows.reduce((n, r) => n + r.nominal, 0);
  const concreteCount = rows.reduce((n, r) => n + r.concrete, 0);
  const framedParagraphs = [...new Set(framed.map((r) => r.paragraph))];
  const restatementRows: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i - 1];
    const after = rows[i];
    if (before.paragraph !== after.paragraph || before.content.size < 3 || after.content.size < 3 || !after.framing) continue;
    const overlap = [...after.content].filter((w) => before.content.has(w)).length;
    const newContent = after.content.size - overlap;
    // Surface overlap is only possible restatement, never deletion authority.
    if (overlap >= 3 && overlap / Math.min(before.content.size, after.content.size) >= 0.55 && newContent <= 3 && after.concrete === 0) restatementRows.push(i);
  }
  const lengths = paras.map((p) => p.sentences.length);
  const regular = paras.length >= 4 && Math.max(...lengths) - Math.min(...lengths) <= 1;
  const observations = [
    observation("abstract-framing", framed.length, rows.length, `${framed.length} of ${rows.length} prose sentences combine broad framing cues`),
    observation("weak-predicate", weakRows.length, rows.length, `${weakRows.length} sentences contain broad support or evaluation predicates`),
    observation("nominalization", nominalCount, ix.wordCount, `${nominalCount} nominalized word forms; word form alone is not an editing reason`),
    observation("concrete-anchor", concreteCount, ix.wordCount, `${concreteCount} numeric or date anchors; their absence is not a defect`),
    observation("restatement-pair", restatementRows.length, Math.max(0, rows.length - 1), `${restatementRows.length} adjacent pairs have high content overlap and abstract follow-up`),
    observation("regular-paragraph", regular ? paras.length : 0, paras.length, regular ? `${paras.length} paragraphs have similar sentence counts` : "paragraph counts vary"),
  ];
  const structured = ["CHAT", "TRANSCRIPT", "INTERVIEW", "FAQ", "PROCEDURE", "LIST", "NOTES"].includes(structure.type) && structure.confidence >= 0.8;
  const formal = options.profile?.register === "formal" || (structure.type === "POLICY" && structure.confidence >= 0.8);
  const vpFormal = Boolean(options.voiceprint?.stats && options.voiceprint.confidence >= 0.7 && options.voiceprint.stats.vocabulary.longWordRate.value >= 0.3);
  const repeatedVoice = Boolean(options.sourceVoice?.deliberate.repetition || options.sourceVoice?.repeatedOpening);
  const counterevidence = [
    ...(structured ? [`${structure.type.toLowerCase()} format can explain repeated form`] : []),
    ...(formal ? ["formal style can require abstract terminology"] : []),
    ...(vpFormal ? ["confident Voiceprint uses formal vocabulary"] : []),
    ...(repeatedVoice ? ["source-local voice supports repetition"] : []),
    ...(concreteCount >= 3 ? ["concrete facts require preservation even where framing is weak"] : []),
  ];
  const get = (kind: DiscourseObservation["kind"]) => observations.find((o) => o.kind === kind)!;
  const findings: DiscourseFinding[] = [];
  // Repetition must be distributed and supported by a second kind of signal.
  // Numeric details protect claims but cannot excuse generic filler elsewhere.
  const registerEvidence = framed.length >= 3 && framedParagraphs.length >= 2 && framed.length / rows.length >= 0.1 && (weakRows.length >= 2 || framed.length >= 5);
  if (registerEvidence) {
    // Moderate lexical clusters can describe genuine methods or results.
    // Only a sustained pattern can authorize editing; lesser evidence stays advisory.
    const strong = framed.length >= 5 && framedParagraphs.length >= 3 && framed.length / rows.length >= 0.1;
    findings.push({ phenomenon: "GENERIC_REGISTER", confidence: strong ? 0.81 : 0.67, scope: "distributed", paragraphIndices: framedParagraphs,
      supporting: [get("abstract-framing"), get("weak-predicate"), get("nominalization")], counterevidence,
      action: !strong || structured || formal || vpFormal ? "ADVISORY" : "DISTRIBUTED_LIGHT_EDIT" });
  }
  if (restatementRows.length >= 2) {
    findings.push({ phenomenon: "POSSIBLE_RESTATEMENT", confidence: 0.6, scope: "distributed", paragraphIndices: [...new Set(restatementRows.map((i) => rows[i].paragraph))],
      supporting: [get("restatement-pair"), get("abstract-framing")], counterevidence, action: "ADVISORY" });
  }
  if (regular && framedParagraphs.length >= 2) {
    findings.push({ phenomenon: "MECHANICAL_STRUCTURE", confidence: 0.58, scope: "distributed", paragraphIndices: paras.map((p) => ix.paragraphs.indexOf(p)),
      supporting: [get("regular-paragraph"), get("abstract-framing")], counterevidence, action: "ADVISORY" });
  }
  // Paragraph regularity and lexical overlap are correlated with framing and
  // cannot be double-counted to justify document-wide reconstruction.
  return { structure, words: ix.wordCount, uncertainty: null, observations, findings };
}
