/**
 * Deterministic segmentation. Deliberately simple and predictable: the same
 * input always yields the same segments, which the tests pin down.
 */

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co", "no", "fig", "approx", "dept", "est",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "u.s", "u.k",
]);

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Split a paragraph into sentences on terminal punctuation followed by space
 * and an uppercase letter, digit or opening quote, skipping known abbreviations,
 * initials and decimals. Line breaks inside a paragraph (lists) also split.
 */
export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  for (const line of paragraph.split(/\n+/)) {
    const text = line.trim();
    if (!text) continue;
    let start = 0;
    const re = /([.!?]+|…)(["'”’)\]]*)\s+(?=["'“‘(\[]?[A-Z0-9])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const end = m.index + m[1].length + m[2].length;
      const before = text.slice(start, m.index);
      const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] ?? "").toLowerCase().replace(/\.$/, "");
      const isAbbrev = m[1] === "." && (ABBREVIATIONS.has(lastWord) || /^[A-Za-z]$/.test(lastWord));
      if (isAbbrev) continue;
      out.push(text.slice(start, end).trim());
      start = end;
    }
    const rest = text.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
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
