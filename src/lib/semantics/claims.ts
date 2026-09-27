import { MODALITY_LEVELS, type ModalityLevel, type ScaleMarker, type SemanticClaim } from "@/domain/semantics";
import { STOPWORDS } from "../analysis/lexicon";
import { stem } from "../analysis/stem";
import { paragraphSpans, sentenceSpans, words } from "../analysis/tokenize";
import { blankDates, extractDates } from "./dates";
import {
  CAUSAL_MARKERS,
  COMPARATIVE_MARKERS,
  CONDITIONAL_MARKERS,
  IMPLICIT_NEGATORS,
  MODALITY_MARKERS,
  NEGATORS,
  SCALES,
  TEMPORAL_MARKERS,
  findMarkers,
} from "./lexicon";
import { extractQuantities, type LocatedQuantity } from "./quantities";

/**
 * Deterministic claim extraction: one claim per sentence, with the features
 * that decide whether a rewrite still asserts the same thing. Shallow by
 * design: markers and spans, no parse tree.
 */

export interface ExtractedClaim extends SemanticClaim {
  located: LocatedQuantity[];
  /** Capitalised tokens that are not sentence-initial: likely entities. */
  entities: string[];
}

const MARKER_WORDS = new Set(
  [
    ...NEGATORS,
    ...IMPLICIT_NEGATORS,
    ...MODALITY_MARKERS.flatMap(([, l]) => l),
    ...Object.values(SCALES).flatMap((s) => s.flatMap(([, l]) => l)),
    ...CAUSAL_MARKERS,
    ...TEMPORAL_MARKERS,
    ...CONDITIONAL_MARKERS,
  ]
    .filter((m) => !m.includes(" "))
    .map((m) => m.toLowerCase()),
);

const NOT_NEGATION = /\bnot\s+only\b|\bno\s+doubt\b|\bnothing\s+but\b|\bno\s+sooner\b/gi;

/** Content stems of a text span, excluding stopwords and marker words. */
export function contentStems(text: string): string[] {
  const out: string[] = [];
  for (const w of words(blankDates(text))) {
    const l = w.toLowerCase().replace(/['’]/g, "'");
    if (l.length < 3 || /^\d/.test(l)) continue;
    if (STOPWORDS.has(l.replace(/'/g, "")) || MARKER_WORDS.has(l)) continue;
    out.push(stem(l));
  }
  return out;
}

export function modalityOf(text: string): { level: ModalityLevel; markers: string[] } {
  let level: ModalityLevel = "asserted";
  const markers: string[] = [];
  for (const [lvl, list] of MODALITY_MARKERS) {
    const found = findMarkers(text, list)
      // "may" the month is handled by date extraction; a capitalised "May" mid-sentence is not a modal.
      .filter((f) => !(f.marker === "may" && /^May\b/.test(text.slice(f.index))));
    if (!found.length) continue;
    markers.push(...found.map((f) => f.marker));
    // Hedges win over emphasis: a hedged sentence is hedged.
    if (lvl !== "emphatic" && MODALITY_LEVELS.indexOf(lvl) < MODALITY_LEVELS.indexOf(level)) level = lvl;
    if (lvl === "emphatic" && level === "asserted") level = "emphatic";
  }
  return { level, markers };
}

export function scaleMarkers(text: string): ScaleMarker[] {
  const out: ScaleMarker[] = [];
  for (const [scale, ranks] of Object.entries(SCALES) as [ScaleMarker["scale"], [number, string[]][]][]) {
    const all = ranks.flatMap(([rank, list]) => list.map((m) => ({ rank, m })));
    for (const f of findMarkers(text, all.map((x) => x.m))) {
      const rank = all.find((x) => x.m === f.marker)!.rank;
      out.push({ scale, rank, marker: f.marker });
    }
  }
  return out;
}

export function negatorsOf(text: string): string[] {
  const cleaned = text.replace(NOT_NEGATION, (m) => " ".repeat(m.length));
  const explicit = findMarkers(cleaned, NEGATORS).map((f) => f.marker);
  const contracted = [...cleaned.matchAll(/\b\p{L}+n['’]t\b/giu)].map((m) => m[0].toLowerCase());
  const implicit = findMarkers(cleaned, IMPLICIT_NEGATORS).map((f) => f.marker);
  return [...explicit, ...contracted, ...implicit];
}

function entitiesOf(sentence: string): string[] {
  const toks = [...sentence.matchAll(/[\p{L}][\p{L}'’-]*/gu)];
  return toks
    .filter((t, i) => i > 0 && /^\p{Lu}\p{Ll}/u.test(t[0]) && !/^(?:I|I'm|I've|I'll|I'd)$/.test(t[0]))
    .map((t) => t[0]);
}

export function extractClaims(text: string): ExtractedClaim[] {
  const quantities = extractQuantities(text);
  const dates = extractDates(text);
  const claims: ExtractedClaim[] = [];
  for (const p of paragraphSpans(text)) {
    for (const s of sentenceSpans(text, p.start, p.end)) {
      const t = s.text;
      const n = words(t).length;
      const located = quantities.filter((q) => q.index >= s.start && q.index < s.end);
      const content = contentStems(t);
      for (const q of located) content.push(`#${q.value}${q.unit ? `:${q.unit}` : ""}`);
      for (const d of dates.filter((d) => d.start >= s.start && d.start < s.end)) content.push(`@${d.canonical}`);
      const negators = negatorsOf(t);
      // "maybe more" / "possibly longer" bound a quantity; they are not a hedge on the claim.
      const { level } = modalityOf(t.replace(/\b(?:maybe|perhaps|possibly|probably)\s+(?:a\s+(?:bit|little)\s+|even\s+)?(?:more|longer|less|fewer|shorter|over|under|higher|lower)\b/gi, (m) => " ".repeat(m.length)));
      claims.push({
        id: `c${claims.length + 1}`,
        text: t,
        type: /\?\s*["'”’)]*\s*$/.test(t) ? "question" : n <= 3 ? "fragment" : "assertion",
        polarity: negators.length ? "negative" : "affirmative",
        negators,
        modality: level,
        // Quantity qualifiers ("most of an hour") belong to the quantity, not the quantifier scale.
        strength: scaleMarkers(t.replace(/\b(?:most|all|some|nearly all|almost all|the better part)\s+of\s+(?=(?:an?|the|one|\d)\b)/gi, (m) => " ".repeat(m.length))),
        quantities: located.map(({ value, unit, bound, qualifiers, text: qt }) => ({ value, unit, bound, qualifiers, text: qt })),
        causal: findMarkers(t, CAUSAL_MARKERS).map((f) => f.marker).concat(/,\s+so\s+\p{L}/iu.test(t) ? ["so"] : []),
        comparative: findMarkers(t, COMPARATIVE_MARKERS).map((f) => f.marker),
        temporal: findMarkers(t, [...TEMPORAL_MARKERS, ...CONDITIONAL_MARKERS]).map((f) => f.marker),
        content,
        span: { start: s.start, end: s.end },
        located,
        entities: entitiesOf(t),
      });
    }
  }
  // A bare hedge standing alone ("Probably.") qualifies the claim before it.
  for (let i = 1; i < claims.length; i++) {
    const c = claims[i];
    if (!c.content.length && /^(?:probably|maybe|perhaps|possibly|likely)[.!?]?$/i.test(c.text.trim())) {
      const prev = claims[i - 1];
      if (MODALITY_LEVELS.indexOf(c.modality) < MODALITY_LEVELS.indexOf(prev.modality)) prev.modality = c.modality;
    }
  }
  return claims;
}

/** A claim carries hard-to-recover meaning: a number, a negation, a hedge, a cause, a name. */
export function isHighInformation(c: ExtractedClaim): boolean {
  return c.polarity === "negative" || c.quantities.length > 0 || c.causal.length > 0 || c.modality !== "asserted" || c.entities.length > 0 || c.strength.length > 0 || c.content.some((x) => x.startsWith("@"));
}
