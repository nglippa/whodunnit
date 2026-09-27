# Whodunnit

**Your thoughts. Your voice.**

Whodunnit takes prose that reads as if nobody wrote it (sterile, formulaic, over-polished) and reconstructs how it is said while keeping what it says. It shows you what changed, and it checks whether any fact moved.

It is an editor, not a paraphraser. It separates two things:

1. **What the text means**: claims, figures, dates, names, quotations, links, negations. These are fixed.
2. **How the text says it**: rhythm, word choice, transitions, punctuation, directness. This is what gets rebuilt.

Whodunnit improves naturalness and authorship consistency. It makes no promises about third-party "AI detectors" and is not built to game them.

## What works today

- **Workspace.** Paste text, choose a style target (Natural, Casual, Professional, Academic, Concise, Personal, or your own Voiceprint), and reconstruct with **⌘/Ctrl + Enter**. The result is editable. Compare it with the original side by side or in a word-level **Changes** view. Copy it, stop a run with **Esc**, and move through revisions.
- **Refinement.** Ask for *more casual*, *more formal*, *less polished*, *shorter* or *keep more of my wording*, or write a note. Each refinement transforms the current result, but every pass is verified against **your original**, so a chain of refinements cannot drift further from your meaning than a single pass can.
- **Meaning checks.** Every candidate goes through deterministic checks: figures (with `3` = `three`), dates, names, quotations, links, negation count, length, and key-word coverage. With a model configured, a claim-by-claim meaning comparison runs as well. Candidates that fail a blocking check are retried with the findings as feedback. If every attempt fails, you still see the best one, with its problems listed rather than hidden.
- **Your own edits are checked too.** Change a figure by hand and the notes immediately say so. Hand edits are kept as their own revision.
- **Voiceprints.** Add samples of your own writing. Whodunnit measures sentence rhythm, contractions, punctuation, hedging, first-person use and phrases you repeat across samples. Each measurement carries a confidence. Past 300 words, the voiceprint appears as a style target.
- **Writing patterns.** A deterministic rule engine finds catalogued patterns (announcements, stacked connectives, puffery, uniform rhythm and so on), each with its excerpt, evidence, guidance and source. After a reconstruction, the notes show counts before → after: resolved, remaining and introduced. Habits your Voiceprint shows you really have are kept and labelled.
- **Honest notes.** The margin shows only numbers computed from the text (sentence length, rhythm, stock openers, contractions) before and after. There are no scores and no "AI probability".

## Running it

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

With no environment variables the app runs in **demo mode**: reconstruction applies only the deterministic rule transforms (announcement and stock-opener removal, wordy-phrase mapping, connective-chain collapsing) plus register edits gated on what the analysis found. The UI says so. Add `ANTHROPIC_API_KEY` for full reconstruction.

```bash
cp .env.example .env.local   # then fill in what you need
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the Anthropic provider. Server-side only. |
| `GEMINI_API_KEY` | Enables the Google Gemini provider (`GOOGLE_API_KEY` also works). Server-side only. |
| `WHODUNNIT_MODEL` | Model id (default `claude-sonnet-5`, or `gemini-3.8-flash` for Gemini). |
| `WHODUNNIT_AI_PROVIDER` | `auto` (default: Anthropic if its key is set, else Gemini, else demo), `anthropic`, `gemini`, `local`, or `demo`. |
| `WHODUNNIT_OPENAI_BASE_URL`, `WHODUNNIT_OPENAI_API_KEY` | For `local`: any OpenAI-format server (a local llama.cpp/Bonsai server, Ollama, Groq). Default `http://127.0.0.1:8080/v1`; the token is optional. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reserved for accounts; not used by the V1 UI. |

Scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. The rule tooling is described below.

## Architecture

```
INPUT → RULE ANALYSIS → CONSTRAINTS (style, Voiceprint, request) → REWRITE PLAN → CANDIDATE
      → MEANING CHECK + PATTERN POST-CHECK → (retry on blocking findings only) → OUTPUT
```

```
src/
  app/                    routes; api/ handlers are thin (validate → pipeline → respond)
  domain/                 types + Zod schemas: StyleProfile, Refinement, Document, Revision,
                          Voiceprint, WritingSample, ReconstructionRequest, VerificationResult,
                          WritingRule, RulePack, RuleMatch, SourceDocument, RuleCandidate
  lib/
    analysis/             deterministic text measurement and the formulaic-pattern catalogue
    verification/         protected-span extraction and meaning checks
    voiceprints/          sample aggregation, confidence model, Voiceprint → StyleProfile
    rules/                rule registry, detectors, metrics, constraints/precedence, transforms
    sources/              source library, normalisation, candidate compilers, validation, activation
    reconstruction/       RewritePlan, pattern post-check, pipeline (the only orchestration code)
    ai/                   AIProvider interface, Anthropic and demo providers, output schemas
    prompts/              versioned prompts (the version is stored on every revision)
    persistence/          repository interfaces; browser, memory and Supabase implementations
    privacy/              the metadata-only server logger
  features/               editor, reconstruction, comparison, voiceprints (client UI)
  components/             brand mark, header, small primitives
data/rules/packs/         rule data (JSON, schema-validated): core, anti-slop, styles, semantic-safety, imported
data/sources/library.json source metadata (licence, usage, hash, status); extracted text is gitignored
data/fixtures/prose/      fixture corpus: one formulaic text and five clean texts in different registers
tools/rules/cli.ts        developer CLI (pnpm rules:* / source:*)
tools/source-ingestion/   isolated Python (uv) project: Scrapling fetch + normalisation
supabase/migrations/      schema with row-level security, ready for accounts
```

Domain and library code has no React dependency and is covered by unit tests. UI components render state and call hooks; they do not contain business rules.

### Style targets

Presets and Voiceprints resolve to one typed `StyleProfile`: register, contraction and first-person policy, sentence-length mean and variation, paragraphing, hedging, a length budget relative to the source, how much original wording to retain, and short notes. Refinements are pure functions on that profile (`applyRefinement`), so they are testable and cannot produce an invalid profile.

### AI providers

```ts
interface AIProvider {
  analyzeText(text, analysis)        // claims to preserve (model) or null
  reconstructText(input)             // one candidate
  verifyMeaning(source, candidate)   // model findings, or null = "not checked"
  analyzeVoiceprint(samples)         // optional model observations
}
```

- `AnthropicProvider` uses structured outputs (`messages.parse` with Zod formats) and re-validates every response. Model output is treated as untrusted input.
- `DemoProvider` is deterministic and says what it cannot do: it returns `null` for meaning checks rather than pretending one ran.
- Adding a provider means implementing the interface and one case in `src/lib/ai/index.ts`.

The author's text is wrapped in tags in every prompt and declared data, not instructions. Request bodies are strict Zod objects, so unknown fields such as a smuggled prompt are rejected.

### Meaning checks

Deterministic checks run on every candidate and report which checks ran (`VerificationResult.checks`), so the UI never implies a check that did not happen.

- **Blocking:** changed or added figures (incl. currency and percentages), dates, quotations, links, and names seen mid-sentence or as multi-word names.
- **Warning:** different negation counts, a lone sentence-initial name missing, possible added names, length outside the target's range, low key-word coverage.

A model check, when configured, adds claim-level findings (missing or added claims, changed assertions). A failed model call is reported as "not checked", never as "passed".

### Voiceprints

A Voiceprint is not a prompt. It stores measurements (`value` plus `confidence`) for sentence length and spread, question and fragment rates, word length, lexical variety (moving-average type/token ratio), contraction, first-person and hedge rates, punctuation per 100 words, paragraph length and stock-opener rate. It also stores openers and phrases that recur across samples.

Confidence is volume (it rises with total words, never reaching 1) multiplied by consistency across samples. Observations are generated only when a measurement clears a threshold and a minimum confidence. When a voiceprint becomes a style target, measurements below 35% confidence fall back to neutral defaults instead of pushing the rewrite toward an unproven habit.

Model observations are optional and explicit: they are requested only when you press the button, and are labelled as model-derived.

## Writing knowledge engine

The full design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

- **Rules are data.** A `WritingRule` is typed and versioned. It records where it came from (source, author, licence, relation) and how certain it is: `deterministic`, `heuristic`, `model-assisted` or `advisory`. Rules can be disabled. They live in `data/rules/packs/*.json` and load through `WritingRuleRegistry`, which rejects duplicates and unsafe regexes.
- **The catalogue** has 59 rules across 8 packs: 27 deterministic, 28 heuristic, 2 model-assisted and 2 advisory. That includes 8 semantic-safety comparisons. Only deterministic rules can carry an automatic fix, and each fix is narrow and meaning-preserving.
- **Precedence**, highest first: semantic safety, then your request, then a confident Voiceprint, then the style preset, then general rules. A general rule never overrides a habit your Voiceprint measured with confidence. Weak Voiceprint evidence (confidence below 0.6) ranks below the general rules, and below 0.35 it is ignored.
- **The model gets a contract, not the rulebook.** The contract lists facts to preserve, target ranges, patterns found (with excerpts and guidance) and patterns not to introduce. The output is analysed again: a new deterministic pattern or a blocking meaning finding triggers one retry with feedback. Patterns that remain do not trigger a retry.

### What it does not do

- It does not estimate whether a text was written by AI, and it does not show an AI-probability score.
- It does not call or optimise against third-party detectors.
- It does not make text "human" by adding typos, errors, random fragments, slang or vagueness.
- A detected pattern is evidence you can check, not a verdict. Some patterns are fine in context, and several rules document their known false positives.

### Rule tooling

```bash
pnpm rules:list                     # the catalogue, by pack and determinism
pnpm rules:validate                 # schema, regex safety, registry load, false positives on the clean corpus
pnpm rules:analyze <file>           # metrics and findings for a text file
```

**Adding knowledge from a source.** Scraping needs [uv](https://docs.astral.sh/uv/):

```bash
uv sync --project tools/source-ingestion        # one-time: isolated venv with scrapling[fetchers]==0.4.15
pnpm source:scrape <url> --license "MIT" --usage adapt-with-attribution [--author "Name"] [--refresh]
pnpm source:add notes.md --title "..." --license "..." --usage derived-rules-only
pnpm source:list
pnpm source:compile <sourceId> [--model]        # candidates, always disabled
pnpm rules:review <sourceId>                    # each candidate with its anchor and clean-corpus matches
pnpm rules:activate <candidateId> --name "..." --description "..." --guidance "..."
pnpm rules:reject <candidateId>
```

The scraper checks robots.txt and fetches one URL per run with an identifying User-Agent. It uses plain HTTP, with no stealth mode. Scraped HTML is parsed and never executed.

Source text is treated as untrusted data. It can suggest a candidate. It cannot change code or configuration, reach secrets, run commands, or activate a rule. A rule becomes active only when a developer runs `rules:activate`, which re-validates the rule and proves the registry still loads. `reference-only` sources, such as unlicensed ones, cannot be compiled at all.

Cached and normalised extractions and candidates are gitignored. The repository stores source metadata and the rules written from it, not the articles. Attribution for adapted material is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Evaluating reconstruction

Rewrite behaviour is versioned as a `RewriteStrategy` (prompt, contract policy, retries, post-checks). Changes to it are measured with the evaluation harness, not judged by eye.

```bash
pnpm eval:help                               # command guide
pnpm eval:run --smoke                        # 5 cases against the real model (Anthropic or Gemini key)
pnpm eval:run --smoke --provider local --model bonsai-2-27b   # a local model: free, no quota
pnpm eval:run --all --demo                   # the demo engine, explicitly; never a silent fallback
pnpm eval:baseline latest --name current
pnpm eval:compare --baseline current --run latest
```

The corpus has 22 synthetic cases in `data/evaluation`. They cover formulaic, ordinary, casual, professional, academic, stylised, terse and long-form prose, plus several adversarial cases:

- dense facts
- legitimate repetition
- a strong Voiceprint
- already-good text
- appropriate formality
- intentional dashes
- literal lists of three
- negations
- nuance under shortening
- messy casual voice

Two of the cases are refinement chains, and two test constraint load.

Each record keeps its dimensions separate:

- the semantic hard gate (deterministic, then model)
- rules resolved and introduced
- raw metric deltas
- wording retention
- the voice comparison
- retries, latency and tokens
- optional human review

There is no composite score and no detector score. Details: [docs/EVALUATION.md](docs/EVALUATION.md).

## Privacy

- Drafts, revisions and voiceprints live in your browser's local storage. There are no accounts and no server database in V1.
- Text leaves the browser only while it is being reconstructed, to this app's API route and from there to the configured model provider. It is not stored on the server.
- Server logs are metadata only (mode, lengths, attempts, status, timing) via `logEvent`, which drops any string that is not an identifier.
- `next dev`'s browser-to-terminal log forwarding is turned off, because React warnings can contain component state, which here means your writing.
- There is no telemetry. Whodunnit does not use your writing for training. Check your model provider's data terms for their side.

## Testing

```bash
pnpm test
```

Unit tests cover:
- deterministic analysis: segmentation, sentence statistics, rates, passive heuristic, formulaic patterns
- protected-span extraction and the meaning checks
- style-profile validation and refinement transformations
- Voiceprint aggregation and the confidence model
- model-response schema validation
- repositories, including corrupted local data
- the pipeline's retry, refinement-anchoring and "not checked" behaviour, with scripted providers
- the rule schema, registry, regex safety, detectors and metric arithmetic
- the fixture corpus: the formulaic fixture fires, the five clean fixtures do not (dashes and fragments in the stylised fixture are suppressed by a matching Voiceprint), and demo transforms leave each clean voice intact
- constraints and precedence, the RewritePlan contract, the pattern post-check and the retry policy
- source normalisation, the library, candidate compilation, model-output validation and activation
- rewrite strategies and prompt identity (pinned fingerprints), contract prioritisation and intensity, attempt logging
- evaluation: retention and delta maths, voice comparison, the semantic hard gate, refinement anchoring, batch failure isolation, storage, reviews, baselines, comparison reports, and the no-fallback rule for real-model runs

## Deployment

Built for Vercel: import the repository, set `ANTHROPIC_API_KEY` (and optionally `WHODUNNIT_MODEL`), deploy. The reconstruction route runs on the Node.js runtime with a 120-second limit. With no key, the deployment runs in demo mode.

Engine configuration is read per request, so the interface always reflects the mode the server is actually in.

## Current limitations

- The demo engine only makes rule-based edits; it cannot vary rhythm or rewrite sentences. Real reconstruction needs a model. Patterns such as puffery are detected but left for the model.
- Rule thresholds were tuned on a small fixture corpus. Heuristic rules will have false positives on some real prose, and some lexical rules need two occurrences before they fire, so a single "leverage" passes.
- Model-assisted candidate compilation and the live reconstruction contract have unit tests with scripted models, but have not been exercised against a live model in this repository. The evaluation harness is ready for that (`pnpm eval:run --smoke`); no real-model run has been recorded yet.
- `reconstruction-v2` (prioritised contract, minimal-change intensity) is experimental and not the production default until a real-model comparison supports it.
- Deterministic checks catch concrete changes (figures, names, quotes, negations) but not every shift in meaning. The model check covers more, and it is still a check, not a proof. Read the result before you use it.
- Name detection is heuristic. Lowercase names and names that only appear at the start of a sentence are weaker evidence and produce warnings rather than blocks.
- Analysis is tuned for English.
- Voiceprints need real volume. Below a few hundred words most habits stay unmeasured, by design.
- Supabase repositories and the schema exist, but accounts and sync are not wired into the UI yet.
