# Writing knowledge engine

Whodunnit splits writing work into two halves.

- **Deterministic analysis** measures the text and finds catalogued patterns. It is typed, versioned and testable, and it gives the same answer every time.
- **Model reconstruction** rewrites the text. The model receives a contract built from that analysis, and its output is analysed again afterwards.

The model never decides what counts as a pattern, and it never activates a rule.

```
source text
  → indexText (paragraphs, sentences, words; quotes/code/URLs masked)
  → computeMetrics                     src/lib/rules/metrics.ts
  → detectors × active rules           src/lib/rules/detectors.ts, builtins.ts
  → applyPrecedence (constraints)      src/lib/rules/constraints.ts
  → WritingAnalysis { metrics, findings, summary }
  → RewritePlan (preserve, target ranges, patterns found, prohibited, advisory)
  → model or demo engine
  → meaning checks + comparePatterns (resolved / remaining / introduced)
  → retry only on blocking meaning findings or newly introduced deterministic patterns
```

## Rules

`WritingRule` (`src/domain/writing-rules.ts`) is a Zod-validated record, so rules live as JSON in `data/rules/packs/*.json` and not in components. Every rule has:

- `id`, `version`, `name`, `description`, `category`, `severity` (info, suggestion or warning)
- `determinism`: `deterministic` (exact match, safe to auto-fix), `heuristic` (a measured signal with thresholds), `model-assisted`, or `advisory`. The last two are never auto-applied; they reach the model as guidance.
- `detection`: a serialisable union: `phrase`, `regex`, `density`, `metric`, `builtin`, `comparison` or `none`. There is no arbitrary code in data.
- `remediation`: guidance, plus an optional `transform` (`delete-match`, `replace-map` or `collapse-additive-openers`). The schema only allows a transform on deterministic rules.
- `source`: type, title, URL, author, licence, relation (`original`, `adapted` or `derived`) and, for imported rules, the `sourceDocumentId`.
- optional `dimension`, `layer`, `falsePositiveNotes`, `examples`, `tags`, `enabled`.

The schema rejects inconsistent rules, for example a `none` detector marked deterministic, or a transform on a heuristic rule. Regex patterns go through `checkPattern` (`src/lib/rules/regex-safety.ts`) at registration. It rejects nested quantifiers, backreferences and ambiguous alternations, then times a run against adversarial input.

### Packs

| Pack | Layer | Rules | Contents |
|---|---|---|---|
| `semantic-safety` | semantic-safety | 8 | Comparison checks (figures, dates, names, quotes, links, negation, length, key terms). These can never be suppressed. |
| `core` | general | 16 | Metric and density rules: sentence and paragraph uniformity, transition density, repeated openers, hedges, intensifiers, passive share, semicolons, triads, tool markup, wordy phrases. |
| `anti-slop` | general | 30 | Adapted from Peter Yang's no-ai-slop (MIT): announcements, throat-clearing, faux-insight, binary contrasts, colon reveals, puffery, superficial -ing analysis, weasel attribution, recap endings, dashes, dramatic fragments and more. |
| `style-*` | style | 4 | One per register (concise, academic, professional, casual). These only run for their own target. |
| `imported` | general | n | Rules activated from reviewed source candidates. |

`WritingRuleRegistry` (`src/lib/rules/registry.ts`) loads packs, rejects duplicate ids and bad regexes, and composes the active set for a style target (`packsForProfile`). `pnpm rules:list` prints the whole catalogue.

### Detection details

- **Masking:** quotations, inline and fenced code, and URLs are replaced with spaces before matching. Offsets therefore still point into the original text, but quoted speech is never "fixed".
- **Structure:** headings and list items are indexed but kept out of sentence statistics.
- **Phrase matching:** word-bounded, case-insensitive, and tolerant of curly apostrophes. It can be restricted to sentence starts.
- **Density and metric rules:** these need a minimum word count before they fire (for example, sentence-uniformity needs 120 words). Their confidence rises with distance from the threshold and is capped at 0.9.
- **Matches:** every `RuleMatch` carries `start`, `end`, `excerpt`, `confidence` and a human-readable `evidence` string ("CV 0.12 across 9 sentences; threshold 0.25").

## Metrics

`computeMetrics` (`src/lib/rules/metrics.ts`) computes, among other things:

- sentence length mean, median, sample standard deviation and coefficient of variation
- paragraph-length CV
- per-100-word rates for contractions, first person, hedges, intensifiers, dashes and semicolons
- shares of questions, fragments, stock openers and likely passives
- repeated sentence openers

The tests check the arithmetic against hand-computed values. The app shows no aggregate "AI score" and has no detector probability. The notes show counts of catalogued patterns and the raw metrics.

## Constraints and precedence

Style presets, Voiceprints and refinements each produce `TargetConstraint`s: `{dimension, min, max, layer, strength, origin}` over twelve dimensions (for example `voice.contractions` or `rhythm.sentence-variation`). Precedence, highest first:

1. **semantic-safety:** meaning checks. Nothing overrides them.
2. **user-instruction:** refinements such as "more casual", or a note.
3. **voiceprint:** measured habits, only when confidence is at least 0.6.
4. **style:** the chosen preset.
5. **general:** core and anti-slop rules.
6. **advisory**

`resolveConstraints` keeps the highest-ranked constraint per dimension and reports the rest as overridden. `applyPrecedence` marks a general-layer finding `suppressedBy` when a higher layer claims the same dimension and the text already sits inside that range. This is how a writer whose Voiceprint shows heavy dash use keeps their dashes. Suppressed findings appear in the notes as "Kept as your habit" and are not counted as patterns.

### Voiceprints

A Voiceprint measurement becomes a range around the measured value, not an exact target. The range widens as confidence falls:

- confidence 0.6 or above: a voiceprint-layer constraint.
- confidence from 0.35 to 0.6: the constraint ranks below the general rules, so weak evidence cannot override them.
- confidence below 0.35: no constraint.

Sentence-length variation is derived from the measured spread (`stdDev / mean`).

## RewritePlan

`buildRewritePlan` (`src/lib/reconstruction/rewrite-plan.ts`) produces:

- `preserve`: numbers, dates, names, quotations, links and the negation count, extracted from the source.
- `targetRanges`: the resolved constraints, each with a direction (`raise`, `lower` or `hold`).
- `avoid`: detected, unsuppressed patterns, with guidance and short excerpts of at most 90 characters.
- `prohibitedPatterns`: deterministic patterns *not* present, which the rewrite must not introduce.
- `permitted`: habits kept because a higher layer allows them.
- `advisory`: model-assisted and advisory principles.

`renderContract` turns the plan into sectioned text (PRESERVE / TARGET RANGES / PATTERNS FOUND / PERMITTED / DO NOT INTRODUCE / ADVISORY). This text goes into the prompt (`reconstruct.v2`) before the source. The model never sees rule packs or source documents.

After each attempt, `comparePatterns` re-analyses the candidate. The pipeline retries only when a blocking meaning finding occurs or a deterministic pattern is newly introduced. Remaining patterns never trigger a retry; there is no retry-until-perfect loop. The best attempt is ranked by blocking findings, then introduced deterministic patterns, then total findings.

## Demo engine

Without an API key, `applyDemoRules` (`src/lib/ai/demo-rules.ts`) runs the same analysis and applies only deterministic transforms:

- delete announcements and stock openers, but never an adverb under a negation
- map wordy phrases ("in order to" → "to")
- collapse additive-connective chains to a single "Also,"

It then applies style transforms gated by what actually fired. Semicolon splitting and plain connectives only run when the matching overuse rule fired, so one deliberate "However" or semicolon stays. Capitalisation is local: only the word that now opens a sentence changes, so a writer's lowercase style survives.

## Sources and rule candidates

```
pnpm source:scrape <url>  or  pnpm source:add <file>
  → SourceDocument (library.json: licence, usage, content hash, status)
  → normalized sections (gitignored)
pnpm source:compile <id> [--model]
  → RuleCandidate[] (gitignored, always disabled)
pnpm rules:review <id>
  → each candidate validated against the clean corpus
pnpm rules:activate <candidateId> [--name --description --guidance --severity]
  → written to data/rules/packs/imported.json after re-validation and a registry load
```

- **Usage:** `adapt-with-attribution`, `derived-rules-only` or `reference-only`. Compiling a reference-only source is refused.
- **Status:** `extracted` → `compiled` → `reviewed` (or `rejected`). Review decisions survive a recompile.
- **Heuristic compiler** (`src/lib/sources/compile.ts`): turns labelled word lists, clustered quoted phrases and bold principle leads into candidates. It ignores blockquotes and example sections, which quote AI text rather than describe patterns.
- **Model compiler** (`src/lib/sources/model-compile.ts`, prompt `compile.v1`): wraps the source in `<untrusted_source>` tags. The output must match a strict Zod schema, and every candidate's anchor must appear verbatim in its section. Provenance is set in code, not by the model.

### Security boundary

Scraped content is data:

- It is parsed, never executed. Scripts, styles, forms and iframes are dropped before conversion.
- Source text can *suggest* a candidate. It cannot modify code or configuration, reach secrets, run commands or activate a rule.
- Activation is a developer running `rules:activate`, and the rule is re-validated first.

## Scrapling ingestion

`tools/source-ingestion/` is an isolated uv project pinned to `scrapling[fetchers]==0.4.15`. It is developer tooling and never runs inside the web app.

```bash
# one-time: install uv (https://docs.astral.sh/uv/), then
uv sync --project tools/source-ingestion
pnpm source:scrape https://example.com/page --license "CC BY 4.0" --usage derived-rules-only
```

- **Fetching:** plain HTTP through Scrapling's `Fetcher`, with no stealth headers, no browser impersonation and an identifying User-Agent. It fetches one URL per run and checks robots.txt first.
- **Extraction:** finds the content root by selector, drops boilerplate, and converts to Markdown sections.
- **Cache:** raw and normalised extractions are cached in `data/sources/cache/` and `data/sources/normalized/`, keyed by URL hash, and both are gitignored. A re-scrape reports `hit`, `refreshed` or `unchanged`.
