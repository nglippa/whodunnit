/**
 * Rule patterns can come from reviewed data files or from compiled candidates
 * (which a model may have proposed), so every pattern is checked before it is
 * compiled: flag whitelist, length cap, a rejection of classic catastrophic
 * backtracking shapes, and a timed run against adversarial input.
 */

export interface RegexCheck {
  ok: boolean;
  problems: string[];
}

const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
const QUANTIFIED_ALTERNATION_OVERLAP = /\((?:\.\*|\.\+)\|/;

export function checkPattern(pattern: string, flags = "i"): RegexCheck {
  const problems: string[] = [];
  if (pattern.length > 400) problems.push("Pattern is longer than 400 characters.");
  if (!/^[imsu]*$/.test(flags)) problems.push(`Flags "${flags}" are not allowed (use i, m, s, u).`);
  if (NESTED_QUANTIFIER.test(pattern)) problems.push("Nested quantifiers (e.g. (a+)+) can backtrack catastrophically.");
  if (QUANTIFIED_ALTERNATION_OVERLAP.test(pattern)) problems.push("Alternation starting with .* or .+ can backtrack catastrophically.");
  if (/\\[1-9]/.test(pattern)) problems.push("Backreferences are not allowed.");
  let re: RegExp | null = null;
  try {
    re = new RegExp(pattern, `${flags.replace(/g/g, "")}g`);
  } catch (e) {
    problems.push(`Does not compile: ${e instanceof Error ? e.message : "invalid pattern"}`);
  }
  if (re && problems.length === 0) {
    const adversarial = ["a".repeat(5000) + "!", " ".repeat(5000) + "x", "ab ".repeat(2000), "It's not " + "x ".repeat(3000)];
    const started = performance.now();
    for (const input of adversarial) {
      re.lastIndex = 0;
      input.match(re);
    }
    if (performance.now() - started > 150) problems.push("Pattern is too slow on adversarial input.");
  }
  return { ok: problems.length === 0, problems };
}
