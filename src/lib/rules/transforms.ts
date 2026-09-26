import type { RuleFinding, Transform } from "@/domain/writing-rules";
import type { RegisteredRule } from "./registry";

/**
 * Deterministic remediation. Only rules marked deterministic may carry a
 * transform (enforced by the schema), and every transform here is a narrow,
 * meaning-preserving edit: delete an announcement, map a wordy phrase to its
 * plain equivalent, collapse a chain of additive connectives. Nothing here
 * paraphrases.
 */

export interface AppliedTransform {
  ruleId: string;
  ruleName: string;
  count: number;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
  ruleId: string;
}

export const capitalizeSentenceStarts = (text: string) =>
  text.replace(/(^|[.!?]["'”’)]?\s+|\n\s*)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());

/** True when position i starts a sentence (text start, after a line break, or after terminal punctuation). */
const atSentenceStart = (text: string, i: number) => /(?:^|[.!?]["'”’)]?\s+|\n\s*)$/.test(text.slice(Math.max(0, i - 4), i)) || i === 0;

/** Capitalise only the letter at position i, and only if the original text there was capitalised. */
const capitalizeAt = (text: string, i: number, originalWasCapital: boolean) =>
  originalWasCapital && /[a-z]/.test(text[i] ?? "") ? text.slice(0, i) + text[i].toUpperCase() + text.slice(i + 1) : text;

const matchCase = (original: string, replacement: string) =>
  /^[A-Z]/.test(original) && replacement ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;

function editsFor(text: string, transform: Transform, finding: RuleFinding): Edit[] {
  const edits: Edit[] = [];
  for (const m of finding.matches) {
    const original = text.slice(m.start, m.end);
    if (transform.kind === "delete-match") {
      // Never drop an adverb that sits under a negation ("not very good").
      if (/\b(?:not|n['’]t|never|no)\s*$/i.test(text.slice(Math.max(0, m.start - 8), m.start))) continue;
      let end = m.end;
      while (end < text.length && /[ ,]/.test(text[end])) end++;
      edits.push({ start: m.start, end, replacement: "", ruleId: finding.rule.id });
    } else if (transform.kind === "replace-map") {
      const key = original.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
      const to = transform.map[key];
      if (to !== undefined) edits.push({ start: m.start, end: m.end, replacement: matchCase(original, to), ruleId: finding.rule.id });
    }
  }
  return edits;
}

/** Keep the first stock additive connective in a chain as "Also,", drop the rest. */
export function collapseAdditiveOpeners(text: string): { text: string; count: number } {
  let n = 0;
  // The removed connective was capitalised, so the word that now opens the sentence becomes capitalised too.
  const out = text.replace(/(^|[.!?]["'”’)]?\s+|\n\s*)(?:Furthermore|Moreover|Additionally|In addition),\s+([a-z])?/g, (_, pre: string, next: string | undefined) =>
    n++ === 0 ? `${pre}Also, ${next ?? ""}` : `${pre}${next ? next.toUpperCase() : ""}`,
  );
  return { text: out, count: Math.max(0, n - 1) };
}

export interface TransformOptions {
  /** Keep more of the author's wording: only remove announcements and stock openers. */
  keepWording?: boolean;
}

export function applyRuleTransforms(
  text: string,
  findings: RuleFinding[],
  rules: Map<string, RegisteredRule>,
  options: TransformOptions = {},
): { text: string; applied: AppliedTransform[] } {
  const applied = new Map<string, AppliedTransform>();
  const note = (rule: RegisteredRule, count: number) => {
    if (count <= 0) return;
    const prev = applied.get(rule.id);
    applied.set(rule.id, { ruleId: rule.id, ruleName: rule.name, count: (prev?.count ?? 0) + count });
  };

  const edits: Edit[] = [];
  let collapse: RegisteredRule | null = null;
  for (const f of findings) {
    if (f.suppressedBy) continue;
    const rule = rules.get(f.rule.id);
    const t = rule?.remediation.transform;
    if (!rule || !t || rule.determinism !== "deterministic") continue;
    if (options.keepWording && !(t.kind === "delete-match" && rule.category === "discourse") && t.kind !== "collapse-additive-openers") continue;
    if (t.kind === "collapse-additive-openers") collapse = rule;
    else edits.push(...editsFor(text, t, f));
  }

  // Apply span edits right to left; skip any that overlap an edit already taken.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) continue;
    const wasCapital = /^[A-Z]/.test(text.slice(e.start, e.end));
    const startsSentence = atSentenceStart(out, e.start);
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    // Only the word that now opens the sentence is capitalised, and only if the removed text was.
    if (startsSentence && e.replacement === "") out = capitalizeAt(out, e.start, wasCapital);
    floor = e.start;
    const rule = rules.get(e.ruleId);
    if (rule) note(rule, 1);
  }

  if (collapse && !options.keepWording) {
    const r = collapseAdditiveOpeners(out);
    out = r.text;
    note(collapse, r.count);
  }

  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/^\s+/, "");
  return { text: out, applied: [...applied.values()] };
}
