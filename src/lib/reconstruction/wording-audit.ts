import { indexText } from "../rules/text-index";
import { words } from "../analysis/tokenize";
import type { RewritePlan } from "./rewrite-plan";

/**
 * Descriptive post-rewrite signals. These do not certify meaning and never
 * trigger a retry. They help spot gratuitous edits and register drift in
 * evaluation without making a synonym list an editor.
 */
export interface WordingAudit {
  untargetedChangedSentences: number;
  unretainedDomainPhrases: number;
  plainToCorporate: number;
  verbToNoun: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const sentenceKey = (s: string) => words(s).map((w) => w.toLowerCase().replace(/’/g, "'")).join(" ");
const containsWord = (s: string, word: string) => new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])`, "iu").test(s);
const SHIFT_PAIRS = [
  { plain: "use", inflated: "leverage" },
  { plain: "help", inflated: "facilitate" },
  { plain: "start", inflated: "commence" },
  { plain: "change", inflated: "modification" },
] as const;
const NOMINAL_PAIRS = [
  { verb: "decide", noun: "decision" },
  { verb: "approve", noun: "approval" },
  { verb: "investigate", noun: "investigation" },
] as const;

export function auditWording(source: string, candidate: string, plan: RewritePlan): WordingAudit {
  const sourceSentences = indexText(source).sentences;
  const candidateNorm = norm(candidate);
  const candidateSentences = new Set(indexText(candidate).sentences.map((s) => sentenceKey(s.text)));
  const localMatches = plan.analysis.findings
    .filter((f) => !f.suppressedBy && f.rule.severity !== "info" && plan.avoid.some((a) => a.ruleId === f.rule.id))
    .flatMap((f) => f.matches)
    .filter((m) => m.end - m.start < source.length / 2);
  // A style range is permission to move a measured trait, not a reason to
  // rewrite every unrelated sentence.
  const broadRequest = Boolean(plan.refinement);
  const untargetedChangedSentences = broadRequest ? 0 : sourceSentences.filter((s) =>
    !localMatches.some((m) => m.start < s.end && m.end > s.start) && !candidateSentences.has(sentenceKey(s.text)),
  ).length;
  const unretainedDomainPhrases = plan.protectedPhrases
    .filter((p) => p.reason === "domain-phrase" && !candidateNorm.includes(norm(p.text))).length;
  const sourceNorm = norm(source);
  const plainToCorporate = SHIFT_PAIRS.filter(({ plain, inflated }) =>
    containsWord(sourceNorm, plain) && !containsWord(sourceNorm, inflated) &&
    !containsWord(candidateNorm, plain) && containsWord(candidateNorm, inflated),
  ).length;
  const verbToNoun = NOMINAL_PAIRS.filter(({ verb, noun }) =>
    containsWord(sourceNorm, verb) && !containsWord(sourceNorm, noun) &&
    !containsWord(candidateNorm, verb) && containsWord(candidateNorm, noun),
  ).length;
  return { untargetedChangedSentences, unretainedDomainPhrases, plainToCorporate, verbToNoun };
}
