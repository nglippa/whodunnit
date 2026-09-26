import { paragraphSpans, sentenceSpans, words, type Span } from "../analysis/tokenize";

/**
 * A text prepared once for every detector: paragraph and sentence spans with
 * absolute offsets, plus a "masked" copy in which exclusion zones are blanked
 * out (same length, so offsets still line up).
 *
 * Exclusion zones are text the author is quoting or showing rather than
 * writing: quotations, inline code, fenced code blocks and URLs. Lexical rules
 * must not flag words inside them.
 */

export interface SentenceSpan extends Span {
  paragraph: number;
  /** Index of the sentence within its paragraph. */
  indexInParagraph: number;
  wordCount: number;
}

export interface ParagraphSpan extends Span {
  sentences: SentenceSpan[];
  wordCount: number;
  /** Markdown heading line (e.g. "## Title"). Headings are not prose. */
  isHeading: boolean;
  /** Markdown list or table block. Uniform by design, excluded from rhythm checks. */
  isList: boolean;
}

export interface TextIndex {
  text: string;
  masked: string;
  paragraphs: ParagraphSpan[];
  /** Sentences of prose paragraphs only (headings and lists excluded). */
  sentences: SentenceSpan[];
  wordCount: number;
}

const EXCLUSIONS: RegExp[] = [
  /```[\s\S]*?```/g, // fenced code
  /`[^`\n]+`/g, // inline code
  /https?:\/\/[^\s)>\]]+/g, // URLs
  /"[^"\n]{1,600}"/g, // straight double quotes
  /“[^”\n]{1,600}”/g, // curly double quotes
];

export function maskExclusions(text: string): string {
  let masked = text;
  for (const re of EXCLUSIONS) {
    masked = masked.replace(new RegExp(re.source, re.flags), (m) => m.replace(/[^\n]/g, " "));
  }
  return masked;
}

const HEADING_RE = /^#{1,6}\s+\S/;
const LIST_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|\|)/;

export function indexText(text: string): TextIndex {
  const masked = maskExclusions(text);
  const paragraphs: ParagraphSpan[] = paragraphSpans(text).map((p, pi) => {
    const lines = p.text.split("\n");
    const isHeading = lines.length === 1 && HEADING_RE.test(p.text);
    const isList = !isHeading && lines.filter((l) => LIST_RE.test(l)).length >= Math.max(1, Math.ceil(lines.length / 2));
    const sentences = isHeading
      ? []
      : sentenceSpans(text, p.start, p.end).map((s, si) => ({ ...s, paragraph: pi, indexInParagraph: si, wordCount: words(s.text).length }));
    return { ...p, sentences, wordCount: words(p.text).length, isHeading, isList };
  });
  const sentences = paragraphs.filter((p) => !p.isHeading && !p.isList).flatMap((p) => p.sentences);
  return { text, masked, paragraphs, sentences, wordCount: words(text).length };
}

/** Prose paragraphs: not headings, not lists. */
export function proseParagraphs(ix: TextIndex): ParagraphSpan[] {
  return ix.paragraphs.filter((p) => !p.isHeading && !p.isList && p.sentences.length > 0);
}

export function excerptAround(text: string, start: number, end: number, max = 140): string {
  const raw = text.slice(start, end).replace(/\s+/g, " ").trim();
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}
