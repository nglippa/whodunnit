import type { NormalizedSource, RuleCandidate, SourceDocument, SourceSection } from "@/domain/sources";
import { ruleCandidateSchema } from "@/domain/sources";
import type { DeterminismLevel, RuleCategory, WritingRuleInput } from "@/domain/writing-rules";
import { STOPWORDS } from "../analysis/lexicon";
import type { WritingRuleRegistry } from "../rules/registry";
import { slugify } from "./normalize";

/**
 * Heuristic compilation: NormalizedSource → RuleCandidate[] without a model.
 *
 * It recognises three shapes that style guides commonly use:
 *   1. labelled lists       "Banned outright: delve, foster, leverage, …"
 *   2. bold-lead patterns   "**Binary contrasts.** "This is not X. It's Y." …"
 *   3. pattern sections     "### Negative parallelisms" followed by prose and quoted examples
 *
 * Every candidate is disabled, anchored to a short excerpt of its section, and
 * marked with an honest determinism level. Nothing here activates a rule.
 */

const SKIP_HEADINGS = /\b(instead|preferred|good examples?|do this|what to do|replacements?|references?|see also|further reading|notes|external links|sources|contents|workflow|install|license|what to ask)\b/i;
/** Short words that are too common to flag one by one; lists of them become density rules. */
const COMMON = new Set([...STOPWORDS, "just", "literally", "honestly", "simply", "actually", "truly", "fundamentally", "importantly", "crucially", "inherently", "inevitably", "really", "very", "basically"]);
const THRESHOLD_RE = /\b(more than|over|fewer than|less than|at least|no more than)\s+(\d+(?:\.\d+)?)\s*(%|percent|per\s+(?:1,?000|100)\s+words|words|sentences|paragraphs|times)/i;

const now = () => new Date().toISOString();
const firstSentence = (s: string, max = 300) => {
  const clean = s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
  const m = /^(.{20,}?[.!?])(\s|$)/.exec(clean);
  const out = (m ? m[1] : clean).trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
};
const anchorExcerpt = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 280 ? `${t.slice(0, 279)}…` : t || "(heading only)";
};

/** Clean a list item or quoted fragment into a literal phrase, or null if it is not one. */
export function toPhrase(raw: string): string | null {
  const p = raw
    .replace(/[*_`]/g, "")
    .replace(/^[\s"“'‘(]+|[\s"”'’),.;:!…]+$/g, "")
    .replace(/^(?:and|or)\s+/i, "")
    .trim()
    .toLowerCase();
  if (p.length < 2 || p.length > 50) return null;
  if (!/^[\p{L}][\p{L}'’\- ]*$/u.test(p)) return null;
  if (p.split(/\s+/).length > 5) return null;
  if (/\b(x|y|z)\b/.test(p)) return null; // templates like "not x, but y" are patterns, not phrases
  return p.replace(/’/g, "'");
}

function quotes(text: string): string[] {
  return [...text.matchAll(/[“"]([^”"\n]{2,160})[”"]/g)].map((m) => m[1]);
}

interface Draft {
  section: SourceSection;
  name: string;
  body: string;
  anchorText: string;
  phrases: string[];
  density: boolean;
  problematic: string[];
  preferred: string[];
  confidence: number;
  warnings: string[];
  origin: "list" | "bold-lead" | "section";
}

function draftFromLabelledLists(section: SourceSection): Draft[] {
  const out: Draft[] = [];
  for (const line of section.text.split("\n")) {
    // A real list has a colon label and starts lowercase or quoted ("Banned outright: delve, foster, …").
    // A principle sentence ("**Keep the meaning.** Don't invent claims, examples, …") does not.
    const m = /^\s*(?:[-*]\s*)?(?:\*\*)?([A-Z][^:*\n]{2,60}?)(?:\*\*)?:\s*(?:\*\*)?\s*([a-z"“'`].+)$/.exec(line);
    if (!m) continue;
    const rest = m[2].split(/\.\s+[A-Z]/)[0];
    if ((rest.match(/,/g) ?? []).length < 3) continue;
    const phrases = [...new Set(rest.split(/,\s*/).map(toPhrase).filter((x): x is string => Boolean(x)))];
    if (phrases.length < 4) continue;
    const singles = phrases.filter((p) => !p.includes(" "));
    const density = singles.filter((p) => COMMON.has(p)).length >= Math.ceil(phrases.length / 2);
    out.push({
      section,
      name: m[1].trim(),
      body: line,
      anchorText: line,
      phrases,
      density,
      problematic: [],
      preferred: [],
      confidence: density ? 0.55 : 0.8,
      warnings: density ? ["Most items are common words; proposed as a density rule rather than flagging each occurrence."] : [],
      origin: "list",
    });
  }
  return out;
}

/** Sentences that recommend something ("Keep …", "Prefer …") quote things to keep, not to flag. */
const POSITIVE_SENTENCE = /^(?:keep|prefer|use|preserve|write|say|let|favo(?:u)?r|try)\b/i;

/**
 * Split a pattern description into problematic and preferred quotes, and pick
 * out phrase lists. A phrase list is a sentence with three or more short quoted
 * phrases side by side (“Stands as a testament,” “marks a pivotal moment,” …);
 * isolated quotes are examples lifted from real text, not phrases to ban.
 */
function splitPolarity(body: string): { problem: string[]; preferred: string[]; listed: string[] } {
  const problem: string[] = [];
  const preferred: string[] = [];
  const listed: string[] = [];
  // Quoted example material (blockquotes, anything after an "Examples" marker) is never a phrase list.
  const own = body.split(/\n\s*(?:\*\*)?examples?:?(?:\*\*)?\s*\n/i)[0]
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
  for (const sentence of own.split(/(?<=[.!?])\s+(?=[A-Z"“])/)) {
    const [before, after = ""] = sentence.split(/\bbecomes\b|\binstead\b|\brewrite(?:s)? as\b/i);
    if (POSITIVE_SENTENCE.test(sentence.trim())) {
      preferred.push(...quotes(sentence));
      continue;
    }
    const q = quotes(before);
    problem.push(...q);
    preferred.push(...quotes(after));
    const short = q.map(toPhrase).filter((x): x is string => Boolean(x));
    if (short.length >= 3) listed.push(...short);
  }
  // Quote lists often span a line break or a closing quote+period, so also look at whole lines.
  for (const line of own.split("\n")) {
    if (POSITIVE_SENTENCE.test(line.trim())) continue;
    const [lineBefore] = line.split(/\bbecomes\b|\binstead\b|\brewrite(?:s)? as\b/i);
    const short = quotes(lineBefore).map(toPhrase).filter((x): x is string => Boolean(x));
    if (short.length >= 3) listed.push(...short);
  }
  return { problem, preferred, listed: [...new Set(listed)] };
}

function draftFromQuotedPattern(section: SourceSection, name: string, body: string, origin: Draft["origin"]): Draft {
  const { problem: problemQuotes, preferred: preferredQuotes, listed } = splitPolarity(body);
  const phrases = listed;
  const sentences = problemQuotes.filter((q) => !toPhrase(q) && q.split(/\s+/).length >= 3).slice(0, 2);
  const warnings: string[] = [];
  const threshold = THRESHOLD_RE.exec(body);
  if (threshold) warnings.push(`Mentions a numeric threshold (“${threshold[0]}”). A metric detector may fit; map it to an existing metric by hand.`);
  // A principle named as an instruction to keep something ("Preserve the writer's voice") is guidance, not a detector.
  const principle = /^(?:preserve|keep|make|lead|be|let|use|always|know|open|protect|untangle|front-load)\b/i.test(name);
  return {
    section,
    name,
    body,
    anchorText: body,
    phrases: phrases.length >= 2 && !principle ? phrases : [],
    density: false,
    problematic: sentences,
    preferred: preferredQuotes.filter((q) => q.split(/\s+/).length >= 2).slice(0, 2),
    confidence: phrases.length >= 2 ? 0.65 : problemQuotes.length ? 0.45 : 0.3,
    warnings,
    origin,
  };
}

function draftsForSection(section: SourceSection): Draft[] {
  if (SKIP_HEADINGS.test(section.heading) || section.text.length < 20) return [];
  const drafts = draftFromLabelledLists(section);
  const listLines = new Set(drafts.map((d) => d.body));
  let boldLeads = 0;
  // Bold-lead items can be separate paragraphs or consecutive bullets in one list.
  const items = section.text.split(/\n\s*\n/).flatMap((p) => p.split(/\n(?=\s*[-*]\s+\*\*)/));
  for (const para of items) {
    if ([...listLines].some((l) => para.includes(l))) continue;
    const m = /^\s*(?:[-*]\s*)?\*\*([^*\n]{3,60}?)\.?\*\*\.?\s*([\s\S]+)$/.exec(para);
    if (m) {
      boldLeads++;
      drafts.push(draftFromQuotedPattern(section, m[1].trim(), m[2].trim(), "bold-lead"));
    }
  }
  // A heading-level pattern section with no bold-lead sub-patterns becomes one candidate.
  if (boldLeads === 0 && drafts.length === 0 && section.level >= 2 && section.heading) {
    drafts.push(draftFromQuotedPattern(section, section.heading, section.text, "section"));
  }
  return drafts;
}

function guessCategory(name: string, body: string): RuleCategory {
  const t = `${name} ${body}`.toLowerCase();
  if (/dash|semicolon|colon|punctuation|exclamation/.test(t)) return "punctuation";
  if (/transition|connective|furthermore|moreover/.test(t)) return "transition";
  if (/rhythm|sentence length|burst/.test(t)) return "rhythm";
  if (/heading|bold|format|emoji|markdown/.test(t)) return "formatting";
  if (/word|vocabulary|verb|adjective|phrase/.test(t)) return "lexical";
  if (/repeat|repetit|synonym/.test(t)) return "repetition";
  if (/specific|vague|attribution|puffery|significance/.test(t)) return "specificity";
  if (/contrast|parallel/.test(t)) return "sentence";
  if (/voice|hedg|tone/.test(t)) return "voice";
  return "discourse";
}

export interface CompileOptions {
  registry?: WritingRuleRegistry;
  /** Cap the number of candidates per source (large guides produce many). */
  max?: number;
}

export function compileHeuristic(source: NormalizedSource, doc: SourceDocument, options: CompileOptions = {}): RuleCandidate[] {
  const existing = options.registry
    ? options.registry.query().flatMap((r) => (r.detection.kind === "phrase" || r.detection.kind === "density" ? (r.detection.kind === "phrase" ? r.detection.phrases : r.detection.lexicon).map((p) => [p.toLowerCase(), r.id] as const) : []))
    : [];
  const covered = new Map(existing);
  const used = new Set<string>();
  const candidates: RuleCandidate[] = [];

  for (const section of source.sections) {
    for (const d of draftsForSection(section)) {
      const slug = slugify(d.name, 40);
      let idSlug = slug;
      for (let n = 2; used.has(idSlug); n++) idSlug = `${slug}-${n}`;
      used.add(idSlug);

      // Bare single words lifted from a pattern description ("highlighting", "reflecting") need context
      // to mean anything, so they are heuristic, never deterministic.
      const bareWords = d.origin !== "list" && d.phrases.length > 0 && d.phrases.every((p) => !p.includes(" "));
      if (bareWords) d.warnings.push("Single words out of context: the source describes a construction around them. Consider a regex with context before activating.");
      const determinism: DeterminismLevel = d.phrases.length ? (d.density || bareWords ? "heuristic" : "deterministic") : "advisory";
      const detection: WritingRuleInput["detection"] = !d.phrases.length
        ? { kind: "none" }
        : d.density
          ? { kind: "density", lexicon: d.phrases.slice(0, 200), per100Words: 2, minOccurrences: 3, minWords: 80 }
          : { kind: "phrase", phrases: d.phrases.slice(0, 200) };
      const warnings = [...d.warnings, `Name and description come from the source (license: ${doc.license ?? "unknown"}). Restate them in your own words before activation.`];
      const overlaps = new Map<string, number>();
      for (const p of d.phrases) {
        const id = covered.get(p);
        if (id) overlaps.set(id, (overlaps.get(id) ?? 0) + 1);
      }
      let confidence = d.confidence;
      for (const [id, n] of overlaps) warnings.push(`${n} of ${d.phrases.length} phrases are already covered by ${id}.`);
      if (d.phrases.length && [...overlaps.values()].reduce((a, b) => a + b, 0) >= d.phrases.length) confidence = Math.min(confidence, 0.2);
      if (d.origin === "section" && d.body.length > 2000) warnings.push("Long section: consider splitting it into narrower rules.");
      if (d.origin === "section" && d.phrases.length) {
        warnings.push("Phrases come from a heading-level section; quoted terms there are often the guide's own discussion vocabulary, not patterns. Check each one.");
        confidence = Math.min(confidence, 0.4);
      }

      const proposedRule: WritingRuleInput = {
        id: `import.${slugify(doc.id, 28)}.${idSlug}`.slice(0, 80).replace(/[.-]$/, ""),
        version: 1,
        name: d.name.slice(0, 80),
        description: firstSentence(d.body, 400) || d.name,
        category: guessCategory(d.name, d.body),
        severity: determinism === "advisory" ? "info" : "suggestion",
        determinism,
        detection,
        remediation: { guidance: "Review the source section and write specific guidance before activating." },
        source: {
          type: doc.type,
          title: `${doc.title}: ${section.heading || "introduction"}`.slice(0, 200),
          url: doc.url,
          author: doc.author,
          license: doc.license,
          sourceDocumentId: doc.id,
          importedAt: now(),
          relation: "derived",
        },
        examples: { problematic: d.problematic.map((x) => x.slice(0, 400)), preferred: d.preferred.map((x) => x.slice(0, 400)) },
        tags: ["imported"],
        enabled: false,
      };
      const candidate = ruleCandidateSchema.parse({
        id: `${doc.id}.${idSlug}`.slice(0, 120),
        sourceDocumentId: doc.id,
        proposedRule,
        anchor: { sectionAnchor: section.anchor, sectionHeading: section.heading.slice(0, 300), excerpt: anchorExcerpt(d.anchorText) },
        detectionStrategy: d.phrases.length
          ? d.density
            ? `Density of ${d.phrases.length} common words (≥2 per 100 words and ≥3 occurrences).`
            : `Literal phrase match on ${d.phrases.length} phrase${d.phrases.length > 1 ? "s" : ""} (word boundaries, case-insensitive, quotations and code excluded).`
          : "No deterministic detector: the source describes a judgement a reader or model must make.",
        determinism,
        confidence: Math.round(confidence * 100) / 100,
        origin: "heuristic-extractor",
        warnings,
        status: "candidate",
      });
      candidates.push(candidate);
      if (options.max && candidates.length >= options.max) return candidates;
    }
  }
  return candidates;
}
