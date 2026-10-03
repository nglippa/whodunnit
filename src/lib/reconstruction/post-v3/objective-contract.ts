import { contentStems, extractClaims } from "@/lib/semantics/claims";
import { sentenceSpans } from "@/lib/analysis/tokenize";

export interface ExactDelta { sourceText: string; currentText: string; objectiveEvidence: string; sourceStart: number; sourceClaim: string }
export interface ObjectiveContract { deltas: ExactDelta[]; unresolved: boolean; ambiguous: boolean }

function conflictingProtection(source: string, objective: string, oldText: string): boolean {
  const protections = directives(objective).filter((directive) => /^(?:please\s+)?(?:keep|preserve|leave|do not|don't|never)\b/i.test(directive));
  return protections.some((directive) => {
    if (/^(?:keep|leave|preserve)\s+(?:everything|anything)\s+else\s+(?:unchanged|alone|as is)[.!?]?$/i.test(directive.trim())) return false;
    if (directive.includes(oldText) || /\b(?:everything|anything|all|any|every)\b/i.test(directive)) return true;
    const claim = extractClaims(source).find((item) => item.text.includes(oldText));
    const targetTerms = contentStems(claim?.text.split(oldText)[0] ?? "");
    const protectedTerms = new Set(contentStems(directive));
    if (targetTerms.some((term) => protectedTerms.has(term))) return true;
    const protectionTerms = contentStems(directive.replace(/^(?:please\s+)?(?:keep|preserve|leave)\s+(?:that\s+)?/i, "").replace(/\b(?:unchanged|alone|as is)\b/gi, ""));
    const separatelyGrounded = extractClaims(source).filter((item) => {
      const terms = new Set(contentStems(item.text));
      return protectionTerms.length > 0 && protectionTerms.every((term) => terms.has(term));
    });
    if (separatelyGrounded.length === 1 && !separatelyGrounded[0].text.includes(oldText)) return false;
    // A uniquely supplied different literal grounds a separate local protection.
    const literals = [...directive.matchAll(/\d+(?::\d+)?|["“]([^"”]+)["”]/g)].map((match) => match[1] ?? match[0]);
    if (literals.some((literal) => literal !== oldText && source.includes(literal) && source.indexOf(literal) === source.lastIndexOf(literal))) return false;
    return true;
  });
}

function directives(objective: string): string[] {
  return sentenceSpans(objective).flatMap((sentence) => sentence.text.split(/;|\s+and\s+(?=(?:please\s+)?(?:keep|leave|preserve|replace|change|update|revise|switch|move|make|improve|simplify|shorten|add)\b)/i)).map((part) => part.trim()).filter(Boolean);
}

function permitsScope(scope: string, sourceClause: string, oldText: string): boolean {
  const fieldTerms = new Set(contentStems("date time number value wording text"));
  const required = contentStems(scope).filter((term) => !fieldTerms.has(term));
  const actual = new Set(contentStems(sourceClause.replace(oldText, "")));
  return required.length > 0 && required.every((term) => actual.has(term));
}

/** Exact quoted literals or bounded numeric from/to instructions; ambiguity grants nothing. */
export function buildObjectiveContract(source: string, objective: string): ObjectiveContract {
  const deltas: ExactDelta[] = [];
  let ambiguous = false;
  const admitted = new Set<string>();
  const parts = directives(objective);
  const patterns = [ /\breplace\s+["“]([^"”\n]{1,120})["”]\s+with\s+["“]([^"”\n]{1,120})["”]/gi,
    /\b(?:change|move|update|switch|revise)\s+[^.!?;\n]{0,80}?\bfrom\s+(\d+(?:\.\d+)?(?:\s+(?:minutes?|hours?|days?|weeks?|months?|meters?|metres?|stops?|copies|guests?|speakers?))?)\s+to\s+(\d+(?:\.\d+)?(?:\s+(?:minutes?|hours?|days?|weeks?|months?|meters?|metres?|stops?|copies|guests?|speakers?))?)(?=[.!?;]|$)/gi ];
  for (const part of parts) for (const match of patterns.flatMap((pattern) => [...part.matchAll(pattern)])) {
    const [evidence, oldText, nextText] = match;
    const prefix = part.slice(0, match.index ?? 0).trim();
    const suffix = part.slice((match.index ?? 0) + evidence.length).trim().replace(/[.!]+$/, "").trim();
    // Authority must be an imperative directive. Unknown prefixes, questions, or
    // trailing qualifications are not silently discarded as unconditional facts.
    if (part.includes("?") || prefix && !/^please$/i.test(prefix) && !/^(?:for|in|at|on|of|about|regarding|concerning)\b/i.test(prefix) && !prefix.endsWith(":")) { ambiguous = true; continue; }
    const start = source.indexOf(oldText);
    if (start >= 0 && source.indexOf(oldText, start + oldText.length) >= 0) { ambiguous = true; continue; }
    if (start < 0 || oldText === nextText) continue;
    if (/[\p{L}\p{N}]/u.test(source[start - 1] ?? "") || /[\p{L}\p{N}]/u.test(source[start + oldText.length] ?? "")) continue;
    const scopedClaim = extractClaims(source).find((item) => start >= item.span.start && start + oldText.length <= item.span.end);
    if (!scopedClaim) continue;
    const localClauses = scopedClaim.text.split(/;|\s+and\s+/i).filter((clause) => clause.includes(oldText));
    if (localClauses.length !== 1) { ambiguous = true; continue; }
    const sourceClause = localClauses[0];
    const scopePrefix = prefix && !/^please$/i.test(prefix) ? prefix.replace(/^(?:for|in|at|on|of|about|regarding|concerning)\s+/i, "").replace(/[:,]$/, "").trim() : "";
    if (scopePrefix && !permitsScope(scopePrefix, sourceClause, oldText)) { ambiguous = true; continue; }
    if (/^["“]/.test(evidence.replace(/^replace\s+/i, ""))) {
      const scopeSuffix = suffix.replace(/^(?:(?:for|in|at|on|of|about|regarding|concerning)\s+|[—–,:-]\s*)/i, "");
      if (scopePrefix && !permitsScope(scopePrefix, sourceClause, oldText) || suffix && (scopeSuffix === suffix || !permitsScope(scopeSuffix, sourceClause, oldText))) { ambiguous = true; continue; }
    }
    if (!/^["“]/.test(evidence.replace(/^replace\s+/i, ""))) {
      const claim = extractClaims(source).find((item) => start >= item.span.start && start + oldText.length <= item.span.end);
      if (!claim) continue;
      const generic = new Set(contentStems("change move update switch revise from to this that please"));
      const subject = contentStems(evidence.split(/\bfrom\b/i)[0]).filter((term) => !generic.has(term));
      const claimTerms = new Set(contentStems(sourceClause.replace(oldText, "")));
      if (!subject.length || !subject.every((term) => claimTerms.has(term))) { ambiguous = true; continue; }
    }
    // Conflicting preservation or overlapping replacements never grant authority.
    if (conflictingProtection(source, objective, oldText)) { ambiguous = true; continue; }
    const overlapping = deltas.find((delta) => start < delta.sourceStart + delta.sourceText.length && start + oldText.length > delta.sourceStart);
    if (overlapping) {
      if (overlapping.sourceStart === start && overlapping.sourceText === oldText && overlapping.currentText === nextText) { admitted.add(part); continue; }
      ambiguous = true; continue;
    }
    deltas.push({ sourceText: oldText, currentText: nextText, objectiveEvidence: part, sourceStart: start, sourceClaim: sourceClause });
    admitted.add(part);
  }
  // Plain supplied declarations are admitted only when removing "now" yields
  // one uniquely aligned source claim with exactly one date/number token changed.
  for (const part of parts.filter((part) => /\bnow\b/i.test(part))) {
    if (part.includes("?")) { ambiguous = true; continue; }
    const statement = part.replace(/\bnow\s+/i, "");
    const nextWords = [...statement.matchAll(/[\p{L}\p{N}:]+/gu)];
    const possible = extractClaims(source).flatMap((claim) => {
      const oldWords = [...claim.text.matchAll(/[\p{L}\p{N}:]+/gu)];
      if (oldWords.length !== nextWords.length) return [];
      const differences = oldWords.flatMap((word, index) => word[0].toLowerCase() !== nextWords[index][0].toLowerCase() ? [index] : []);
      if (differences.length !== 1) return [];
      const at = differences[0];
      const literal = /^(?:\d+(?::\d+)?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
      if (!literal.test(oldWords[at][0]) || !literal.test(nextWords[at][0])) return [];
      const oldText = oldWords[at][0];
      const start = claim.span.start + (oldWords[at].index ?? 0);
      return [{ sourceText: oldText, currentText: nextWords[at][0], objectiveEvidence: part, sourceStart: start, sourceClaim: claim.text }];
    });
    if (possible.length !== 1 || conflictingProtection(source, objective, possible[0].sourceText)) continue;
    const delta = possible[0];
    const duplicate = deltas.find((item) => item.sourceStart === delta.sourceStart);
    if (duplicate && duplicate.currentText !== delta.currentText) { ambiguous = true; continue; }
    if (!duplicate) deltas.push(delta);
    admitted.add(part);
  }
  const updateWithoutValue = parts.some((part) => {
    if (admitted.has(part) || !/\b(?:update|replace|change|revise|switch|move)\b/i.test(part)) return false;
    if (/^(?:please\s+)?(?:update|replace|change|revise|switch|move)\s+(?:the\s+)?(?:wording|phrasing|tone|style|register|grammar|punctuation|format|formatting|structure|layout|clarity|readability)\b/i.test(part)) return false;
    if (deltas.length && /^(?:please\s+)?update\s+(?:the\s+)?(?:notice|document|text|copy|page)[.!]?$/i.test(part)) return false;
    return true;
  });
  const unparsedCurrentFact = parts.some((part) => /\bnow\b/i.test(part) && !admitted.has(part) && !/^(?:please\s+)?(?:keep|preserve|leave)\b/i.test(part));
  return { deltas, ambiguous, unresolved: updateWithoutValue || unparsedCurrentFact || /\b(?:not supplied|not provided|unprovided|unknown|unconfirmed|to be confirmed|missing|when available|latest|new confirmed)\b/i.test(objective) };
}

export function objectiveCurrentSource(source: string, contract: ObjectiveContract): string {
  let current = source;
  for (const delta of [...contract.deltas].sort((a, b) => b.sourceStart - a.sourceStart))
    current = current.slice(0, delta.sourceStart) + delta.currentText + current.slice(delta.sourceStart + delta.sourceText.length);
  return current;
}

export function preservesExactDeltas(text: string, deltas: readonly ExactDelta[]): boolean {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (claim: string, value: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`, "u").test(claim);
  return deltas.every((delta) => {
    const anchors = contentStems(delta.sourceClaim.replace(delta.sourceText, ""));
    const matches = extractClaims(text).filter((claim) => {
      const stems = new Set(contentStems(claim.text.replace(delta.currentText, "")));
      return has(claim.text, delta.currentText) && anchors.every((term) => stems.has(term));
    });
    return matches.length === 1 && !has(matches[0].text, delta.sourceText);
  });
}
