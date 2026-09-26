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
- **Honest notes.** The margin shows only numbers computed from the text (sentence length, rhythm, stock phrases, stock openers, contractions) before and after. There are no scores.

## Running it

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

With no environment variables the app runs in **demo mode**: reconstruction uses a small set of meaning-preserving rules (stock-phrase removal, contractions, plain-word substitutions). The UI says so. Add `ANTHROPIC_API_KEY` for full reconstruction.

```bash
cp .env.example .env.local   # then fill in what you need
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the model-backed provider. Server-side only. |
| `WHODUNNIT_MODEL` | Model id (default `claude-sonnet-5`). |
| `WHODUNNIT_AI_PROVIDER` | `auto` (default), `anthropic`, or `demo`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reserved for accounts; not used by the V1 UI. |

Scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Architecture

```
INPUT → ANALYSIS → STYLE TARGET → PLAN → CANDIDATE → MEANING CHECK → (retry) → OUTPUT
```

```
src/
  app/                    routes; api/ handlers are thin (validate → pipeline → respond)
  domain/                 types + Zod schemas: StyleProfile, Refinement, Document, Revision,
                          Voiceprint, WritingSample, ReconstructionRequest, VerificationResult
  lib/
    analysis/             deterministic text measurement and the formulaic-pattern catalogue
    verification/         protected-span extraction and meaning checks
    voiceprints/          sample aggregation, confidence model, Voiceprint → StyleProfile
    reconstruction/       planner and pipeline (the only orchestration code)
    ai/                   AIProvider interface, Anthropic and demo providers, output schemas
    prompts/              versioned prompts (the version is stored on every revision)
    persistence/          repository interfaces; browser, memory and Supabase implementations
    privacy/              the metadata-only server logger
  features/               editor, reconstruction, comparison, voiceprints (client UI)
  components/             brand mark, header, small primitives
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

## Deployment

Built for Vercel: import the repository, set `ANTHROPIC_API_KEY` (and optionally `WHODUNNIT_MODEL`), deploy. The reconstruction route runs on the Node.js runtime with a 120-second limit. With no key, the deployment runs in demo mode.

Engine configuration is read per request, so the interface always reflects the mode the server is actually in.

## Current limitations

- The demo engine only makes rule-based edits; it cannot vary rhythm or rewrite sentences. Real reconstruction needs a model.
- Deterministic checks catch concrete changes (figures, names, quotes, negations) but not every shift in meaning. The model check covers more, and it is still a check, not a proof. Read the result before you use it.
- Name detection is heuristic. Lowercase names and names that only appear at the start of a sentence are weaker evidence and produce warnings rather than blocks.
- Analysis is tuned for English.
- Voiceprints need real volume. Below a few hundred words most habits stay unmeasured, by design.
- Supabase repositories and the schema exist, but accounts and sync are not wired into the UI yet.
