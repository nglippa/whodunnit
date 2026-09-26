/**
 * Deterministic segmentation. Deliberately simple and predictable: the same
 * input always yields the same segments, which the tests pin down.
 */

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co", "no", "fig", "approx", "dept", "est",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "u.s", "u.k",
]);

/** A slice of the original text with absolute offsets. */
export interface Span {
  start: number;
  end: number;
  text: string;
}

/** Trim a [start, end) range to its non-whitespace content. */
function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return end > start ? { start, end, text: text.slice(start, end) } : null;
}

/** Paragraphs are separated by blank lines. Offsets refer to the original text. */
export function paragraphSpans(text: string): Span[] {
  const out: Span[] = [];
  const re = /\r?\n[ \t]*\r?\n\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = trimSpan(text, last, m.index);
    if (s) out.push(s);
    last = m.index + m[0].length;
  }
  const tail = trimSpan(text, last, text.length);
  if (tail) out.push(tail);
  return out;
}

/**
 * Sentences inside [from, to): split on terminal punctuation followed by space
 * and an uppercase letter, digit or opening quote, skipping known abbreviations,
 * initials and decimals. Line breaks inside a paragraph (lists) also split.
 */
export function sentenceSpans(text: string, from = 0, to = text.length): Span[] {
  const out: Span[] = [];
  const lineRe = /[^\n]+/g;
  lineRe.lastIndex = from;
  let line: RegExpExecArray | null;
  while ((line = lineRe.exec(text)) && line.index < to) {
    const lineStart = line.index;
    const lineText = line[0].slice(0, to - lineStart);
    let start = 0;
    const re = /([.!?]+|…)(["'”’)\]]*)\s+(?=["'“‘(\[]?[A-Z0-9])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lineText))) {
      const end = m.index + m[1].length + m[2].length;
      const before = lineText.slice(start, m.index);
      const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] ?? "").toLowerCase().replace(/\.$/, "");
      const isAbbrev = m[1] === "." && (ABBREVIATIONS.has(lastWord) || /^[A-Za-z]$/.test(lastWord));
      if (isAbbrev) continue;
      const s = trimSpan(text, lineStart + start, lineStart + end);
      if (s) out.push(s);
      start = end;
    }
    const rest = trimSpan(text, lineStart + start, lineStart + lineText.length);
    if (rest) out.push(rest);
  }
  return out;
}

export function splitParagraphs(text: string): string[] {
  return paragraphSpans(text.replace(/\r\n?/g, "\n")).map((p) => p.text);
}

export function splitSentences(paragraph: string): string[] {
  return sentenceSpans(paragraph).map((s) => s.text);
}

/** Word tokens: letters (incl. accented), digits, internal apostrophes and hyphens. */
export function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*(?:-[\p{L}\p{N}]+)*/gu) ?? [];
}

export function countWords(text: string): number {
  return words(text).length;
}

export interface Segmented {
  paragraphs: string[][]; // paragraphs -> sentences
  sentences: string[];
  words: string[];
}

export function segment(text: string): Segmented {
  const paragraphs = splitParagraphs(text).map(splitSentences);
  const sentences = paragraphs.flat();
  return { paragraphs, sentences, words: words(text) };
}
