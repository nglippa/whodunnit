import type { ClaimChange } from "@/domain/semantics";
import { stem } from "../analysis/stem";
import { sentenceSpans, words } from "../analysis/tokenize";
import { extractNameSpans } from "../verification/protected";
import { contentStems } from "./claims";

/**
 * Quotation integrity: balanced marks, the same speaker, and no new
 * interpretation wrapped around a quote. Only double quotes are checked for
 * balance: a single curly quote is also an apostrophe, and guessing which is
 * which would produce false alarms. Word-for-word content is checked by the
 * protected-span check.
 */

export interface QuoteReport {
  sourceBalanced: boolean;
  outputBalanced: boolean;
  sourceQuotes: number;
  outputQuotes: number;
  issues: ClaimChange[];
}

/** Are double quotation marks balanced? Straight quotes pair up; curly quotes nest correctly. Inch marks (12") are ignored. */
export function quotesBalanced(text: string): boolean {
  let straight = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (/\d/.test(text[i - 1] ?? "") && !/\p{L}/u.test(text[i + 1] ?? "")) continue; // 12" = inches
      straight++;
    } else if (ch === "“") depth++;
    else if (ch === "”") {
      if (depth === 0) return false;
      depth--;
    }
  }
  return straight % 2 === 0 && depth === 0;
}

interface Quote {
  text: string;
  start: number;
  end: number;
}

function quotesIn(text: string): Quote[] {
  return [...text.matchAll(/"([^"\n]{2,400})"|“([^”\n]{2,400})”/g)].map((m) => ({ text: (m[1] ?? m[2]).replace(/\s+/g, " ").trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/** The sentence around a quote with the quoted words removed: "As Priya put it," / "she said". */
function frameOf(text: string, q: Quote): string {
  const sentences = sentenceSpans(text);
  const around = sentences.filter((s) => s.end > q.start - 1 && s.start < q.end + 1);
  const from = Math.min(q.start, ...around.map((s) => s.start));
  const to = Math.max(q.end, ...around.map((s) => s.end));
  const inside = quotesIn(text).filter((x) => x.start >= from && x.end <= to);
  let frame = text.slice(from, to);
  for (const x of inside.sort((a, b) => b.start - a.start)) frame = frame.slice(0, x.start - from) + " " + frame.slice(x.end - from);
  return frame;
}

const speakers = (frame: string) => extractNameSpans(frame).map((n) => n.name.split(" ")[0]);

export function checkQuotations(source: string, output: string): QuoteReport {
  const issues: ClaimChange[] = [];
  const sourceBalanced = quotesBalanced(source);
  const outputBalanced = quotesBalanced(output);
  const sq = quotesIn(source);
  const oq = quotesIn(output);
  const base = { sourceClaimId: null, outputClaimId: null, licensedBy: null };

  if (sourceBalanced && !outputBalanced)
    issues.push({ ...base, relation: "contradicted", aspect: "quotation", severity: "blocking", source: null, output: null, detail: "A quotation mark was dropped or added: the rewrite's quotation marks no longer pair up." });

  const srcStems = new Set(words(source).map((w) => stem(w.toLowerCase())));
  for (const s of sq) {
    const match = oq.find((o) => norm(o.text) === norm(s.text)) ?? oq.find((o) => norm(o.text).includes(norm(s.text)) || norm(s.text).includes(norm(o.text)));
    if (!match) continue;
    const sFrame = frameOf(source, s);
    const oFrame = frameOf(output, match);
    const sSpeakers = speakers(sFrame);
    const oSpeakers = speakers(oFrame);
    if (sSpeakers.length && oSpeakers.length && !sSpeakers.some((n) => oSpeakers.includes(n)))
      issues.push({ ...base, relation: "contradicted", aspect: "quotation", severity: "blocking", source: sFrame.trim().slice(0, 300), output: oFrame.trim().slice(0, 300), detail: `The quotation is attributed to ${oSpeakers.join(", ")} instead of ${sSpeakers.join(", ")}.` });
    // New interpretation wrapped around a quote: "Priya highlights the improved efficiency:".
    const novel = contentStems(oFrame).filter((x) => !srcStems.has(x));
    if (novel.length >= 2)
      issues.push({ ...base, relation: "added", aspect: "quotation", severity: "major", source: sFrame.trim().slice(0, 300), output: oFrame.trim().slice(0, 300), detail: `New framing around a quotation (${novel.join(", ")}): the rewrite may be interpreting what the speaker meant.` });
  }
  return { sourceBalanced, outputBalanced, sourceQuotes: sq.length, outputQuotes: oq.length, issues };
}
