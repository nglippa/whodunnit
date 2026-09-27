import type { ClaimChange, ProtectedPhrase } from "@/domain/semantics";
import { STOPWORDS } from "../analysis/lexicon";
import { stem } from "../analysis/stem";
import { CONTRAST_GROUPS } from "./lexicon";

/**
 * Source-sensitive phrases. Two mechanisms, neither a dictionary:
 *
 * 1. Protected phrases chosen for the plan: the author's own list (exact),
 *    quoted terms (exact), Voiceprint phrases (close), and "domain phrases":
 *    a direction/contrast word framing a noun the text keeps returning to
 *    ("across the grain" when "grain" recurs). Capped, never every n-gram.
 * 2. Contrast substitution, over the whole text: the same frame with one
 *    word swapped for a word of a different sense in the same contrast group
 *    ("across the grain" → "against the grain", "rose 3%" → "fell 3%").
 */

interface Tok {
  w: string;
  start: number;
  end: number;
}
const tokens = (text: string): Tok[] => [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)].map((m) => ({ w: m[0].toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
const isContent = (w: string) => w.length > 2 && !STOPWORDS.has(w);
const norm = (s: string) => s.toLowerCase().replace(/[“”"]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** For a word: the groups it is in, and its sense class in each. */
const SENSE = new Map<string, { group: number; cls: number }[]>();
CONTRAST_GROUPS.forEach((group, g) => group.forEach((cls, c) => cls.forEach((w) => SENSE.set(w, [...(SENSE.get(w) ?? []), { group: g, cls: c }]))));

function contrasts(a: string, b: string): boolean {
  if (a === b) return false;
  const sa = SENSE.get(a);
  const sb = SENSE.get(b);
  if (!sa || !sb) return false;
  return sa.some((x) => sb.some((y) => x.group === y.group && x.cls !== y.cls)) && !sa.some((x) => sb.some((y) => x.group === y.group && x.cls === y.cls));
}

export function protectedPhrasesFor(source: string, opts: { user?: string[]; voiceprintPhrases?: string[]; max?: number } = {}): ProtectedPhrase[] {
  const out: ProtectedPhrase[] = [];
  const push = (p: ProtectedPhrase) => {
    if (!out.some((x) => norm(x.text) === norm(p.text))) out.push(p);
  };
  for (const u of opts.user ?? []) if (u.trim()) push({ text: u.trim(), mode: "exact", reason: "user" });
  // Quoted terms of one to three words: 'the "cauls"', “dovetails”.
  for (const m of source.matchAll(/["“]([\p{L}][\p{L}\s'’-]{1,40})["”]/gu)) {
    const t = m[1].trim();
    if (t.split(/\s+/).length <= 3) push({ text: t, mode: "exact", reason: "quoted-term" });
  }
  const toks = tokens(source);
  const freq = new Map<string, number>();
  for (const t of toks) if (isContent(t.w)) freq.set(stem(t.w), (freq.get(stem(t.w)) ?? 0) + 1);
  for (let i = 0; i < toks.length; i++) {
    if (!SENSE.has(toks[i].w)) continue;
    let j = i + 1;
    if (toks[j] && ["the", "a", "an", "its", "their", "his", "her", "my", "our", "your"].includes(toks[j].w)) j++;
    const noun = toks[j];
    if (!noun || !isContent(noun.w) || (freq.get(stem(noun.w)) ?? 0) < 2) continue;
    push({ text: source.slice(toks[i].start, noun.end), mode: "close", reason: "domain-phrase" });
  }
  for (const v of opts.voiceprintPhrases ?? []) if (norm(source).includes(norm(v))) push({ text: v, mode: "close", reason: "voiceprint" });
  return out.slice(0, opts.max ?? 12);
}

const occurrences = (hay: string, needle: string) => (needle ? norm(hay).split(norm(needle)).length - 1 : 0);

export function checkPhrases(source: string, output: string, phrases: ProtectedPhrase[]): ClaimChange[] {
  const issues: ClaimChange[] = [];
  const base = { sourceClaimId: null, outputClaimId: null, licensedBy: null };
  for (const p of phrases.filter((x) => x.mode === "exact")) {
    if (occurrences(output, p.text) === 0)
      issues.push({ ...base, relation: "dropped", aspect: "phrase", severity: p.reason === "user" ? "blocking" : "major", source: p.text, output: null, detail: `The protected phrase “${p.text}” is not in the rewrite word for word.` });
  }

  // Contrast substitution across the whole text. Each substituted output word is reported once,
  // against the source phrase whose context it matches best.
  const s = tokens(source);
  const o = tokens(output);
  const best = new Map<number, { score: number; change: ClaimChange }>();
  for (let i = 0; i < s.length; i++) {
    if (!SENSE.has(s[i].w)) continue;
    for (let j = 0; j < o.length; j++) {
      if (!contrasts(s[i].w, o[j].w)) continue;
      const ctx = [-2, -1, 1, 2].filter((d) => s[i + d] && o[j + d] && s[i + d].w === o[j + d].w);
      const contentCtx = ctx.filter((d) => isContent(s[i + d].w));
      if (ctx.length < 2 || contentCtx.length < 1) continue;
      const lo = Math.min(...ctx, 0);
      const hi = Math.max(...ctx, 0);
      const srcPhrase = source.slice(s[i + lo].start, s[i + hi].end);
      const outPhrase = output.slice(o[j + lo].start, o[j + hi].end);
      // The original wording must be (partly) gone, and the substituted wording must be new.
      if (occurrences(output, srcPhrase) >= occurrences(source, srcPhrase)) continue;
      if (occurrences(source, outPhrase) >= occurrences(output, outPhrase)) continue;
      const score = ctx.length * 10 - Math.abs(i / s.length - j / o.length);
      if ((best.get(j)?.score ?? -Infinity) >= score) continue;
      best.set(j, { score, change: { ...base, relation: "contradicted", aspect: "phrase", severity: "blocking", source: srcPhrase, output: outPhrase, detail: `“${s[i].w}” became “${o[j].w}” in the same phrase: “${srcPhrase}” → “${outPhrase}”. These do not mean the same thing.` } });
    }
  }
  return [...issues, ...[...best.values()].map((b) => b.change)];
}
