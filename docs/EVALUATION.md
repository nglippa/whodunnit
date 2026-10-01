# Evaluating reconstruction

The question this system answers is narrow: **does a given reconstruction setup produce better writing while preserving the author's meaning and voice?** A setup is a strategy, a provider and model, a prompt version and a set of rule packs.

It is the development loop for rewrite quality. A prompt or strategy change should come with an evaluation run and a comparison against a baseline, not an impression.

## What it does not do

- **No detector scores.** Whodunnit does not call AI detectors or report an "AI probability" or a "human percentage", and it does not optimise against GPTZero, Turnitin, Originality or similar tools. Detectors guess at authorship. This harness measures things a person can check: facts kept, patterns removed or introduced, wording retained, habits kept.
- **No composite quality score.** Every record keeps its dimensions separate. A comparison shows them side by side and flags possible regressions, but it never declares a winner. Whether higher sentence variation or lower retention is good depends on the case.
- **No model judging meaning on its own.** Deterministic checks are the gate. A model meaning check, when it runs, is reported separately and can only add failures.

## Pipeline

```
corpus case → original analysis → RewritePlan (strategy) → provider/model → reconstruction
  → semantic verification (deterministic, then model) → rule analysis → voice comparison
  → EvaluationRecord → optional human review
```

- The runner (`src/lib/evaluation/runner.ts`) calls the same `runReconstructionDetailed` the web app uses, with the strategy under test. Nothing is reimplemented for evaluation.
- Refinement chains run the way the editor runs them: each stage revises the previous output, and the effective profile is carried forward.
- Every stage is verified and measured against the **original** source.

## Strategies and prompts

A `RewriteStrategy` (`src/domain/strategy.ts`, defined in `src/lib/reconstruction/strategies.ts`) is an immutable, versioned policy. It contains:

- the prompt reference;
- the planning mode (a full contract or a prioritised one);
- how intensity is handled;
- constraint budgets;
- the retry policy (maximum attempts, and what triggers a retry);
- the post-check policy (model meaning check, claim-extraction threshold).

Strategies are deep-frozen: to change one, add a version.

| Strategy | Status | Prompt | Behaviour |
|---|---|---|---|
| `reconstruction-v1` | production | `reconstruct.v2` | Exactly the pre-strategy behaviour: full contract; retries on blocking meaning findings or newly introduced deterministic patterns; model meaning check when the deterministic checks pass. |
| `reconstruction-v2` | experimental | `reconstruct.v3` | Same pipeline with a prioritised contract and explicit rewrite intensity (see below). Not promoted: it has not yet been measured against a real model. |
| `reconstruction-v3` | experimental | `reconstruct.v4` | Anchored refinements, source voice and an unchanged-text planner bypass. |
| `reconstruction-v4` | experimental | `reconstruct.v4` | v3 planning with a separately injected frontier decision, optional local wording tasks, draft and one localized repair. |

Prompts have explicit identities, `{ id, version }`, registered in `src/lib/prompts/index.ts`:

- `reconstruct.v2`, `reconstruct.v3` and `reconstruct.v4`
- `analyze.v1`, `verify.v1`, `voiceprint.v1`
- `orchestrate.v1`, `local-alternative.v1` and `repair.v1` for the experimental v4 adapter
- `compile.v1`, in the source compiler

A test pins a fingerprint of each prompt's text, so an edit without a version bump fails. `reconstruct.v2`'s fingerprint matches the prompt that shipped before strategies existed.

Every record stores the strategy key, the prompt key and fingerprint, the provider and model, the rule-pack versions, and the Voiceprint hash.

### v4 evaluation injection and provenance

`evaluateCase` accepts optional `RunContext.orchestration: { agent, config }`. For strategy `reconstruction-v4`, it requires this explicit injection and calls `runOrchestratedReconstruction` for each corpus stage. A missing injection fails the case; it does not silently use the ordinary provider or demo engine. Other strategies still use `runReconstructionDetailed`. The CLI constructs the v4 frontier adapter from the explicitly selected live provider. `--worker-model` enables one bounded worker route; omit it for a single-frontier v4 run. `--worker-provider`, `--worker-tier` and `--worker-base-url` configure that route. `--frontier-input-usd-per-mtok`, `--frontier-output-usd-per-mtok` and the matching worker price flags supply optional cost estimates; no model price is hardcoded. The web route does not supply orchestration and remains on v1.

The v4 stage record adds delegation count, task types, worker route IDs and tiers with outcomes/use flags, accepted and rejected worker output counts, repair count, total reported tokens, total elapsed time, estimated USD cost and final decision (`unchanged`, `candidate`, `repaired` or `source-fallback`). The underlying `OrchestrationTrace` also separates frontier decision/draft/repair, worker and optional semantic-review calls, with per-call token, latency and cost metadata. A missing price or token count makes the aggregate cost `null`; a zero token total does not prove a free call. Route IDs record which configured worker was called; the reliability threshold is a routing input, not a measured outcome. The stage still records deterministic semantic findings, rule diffs, voice devices and refinement effect separately. Evaluation artifacts contain only repository corpus fixtures and outputs under gitignored `.evaluations/`; the trace itself carries no text.

The next comparison is **one frontier model alone versus the same frontier with v4 orchestration**, using the same corpus, model, prompt contract, generation settings and independent judge. First establish the single-frontier baseline; run v4 only after explicit provider wiring and predeclared cost/latency limits exist. Compare semantic FAIL and NEEDS_REVIEW, voice damage, refinement effect, retention, delegation acceptance, repairs, source fallbacks, token cost and latency per stage. Keep normal and forced-model tracks separate. No v4 cloud result or advantage is claimed here. Local model benchmarking is **PAUSED UNTIL 64 GB M5 PRO ENVIRONMENT**; see [BENCHMARK-PLAN.md](BENCHMARK-PLAN.md).

## Minimal change and contract budgeting

Already-good writing should not be rewritten just because a model is available. Every plan carries a `rewriteIntensity`:

- **minimal:** no catalogued patterns, and nothing the author asked for is out of range.
- **normal:** some patterns, an explicit request, or text that is off a confident Voiceprint.
- **substantial:** 6 or more patterns, 10 or more occurrences, or 3 or more warnings.

v1 records the intensity but does not send it. v2 sends it: `reconstruct.v3` says that returning the text unchanged is a correct answer at minimal intensity. The demo engine also skips register edits at minimal intensity under v2.

v1 sends every constraint. On clean prose that means around 40 "do not introduce" items, advisory principles, and a push toward style ranges the text does not need to meet. v2 budgets the contract by priority and relevance:

- **Always kept:** semantic anchors and permitted habits.
- **Detected patterns:** ranked by severity, then determinism, then frequency, and capped at 8.
- **Prohibitions:** measures of text shape (rhythm, density, repetition) are left to the target ranges and the post-check. Constructions a rewrite tends to introduce are ranked discourse → specificity → sentence → lexical, and capped at 12.
- **Style ranges:** not restated when already met, and not pursued at minimal intensity.
- **Advisory guidance:** dropped at minimal intensity; otherwise capped at 2.

Everything left out is recorded in `plan.budget.omitted` with a reason. The post-check still enforces every rule.

Use `pnpm eval:run --all --dry-run --strategy <s>` to see contract sizes per case, and `pnpm eval:contract <case> --strategy <s>` to read one contract.

## Corpus

`data/evaluation/corpus.json` (version 1) holds 22 cases. All texts are synthetic and written for this repository; six are the existing `data/fixtures/prose` texts.

| Category | Case(s) |
|---|---|
| A. Formulaic | `formulaic` |
| B. Ordinary | `ordinary` |
| C. Casual | `casual` |
| D. Professional | `professional` |
| E. Academic | `academic` |
| F. Stylised | `stylized` |
| G. Terse | `terse` |
| H. Long-form | `long-form` |
| I. Figures, dates, quotes, names, URL | `anchors` |
| J. Legitimate repetition | `repetition` |
| K. Strong Voiceprint | `voiceprint` |
| L. Already good | `already-good` |
| M. Appropriate formality | `formal-appropriate` |
| N. Intentional dashes | `dashes` |
| O. Literal lists of three | `triads` |
| P. Negations | `negations` |
| Q. Nuance under shortening | `nuance` |
| R. Messy casual voice | `messy` |
| Repeated refinement | `chain-status`, `chain-dashes` |
| Constraint load | `load-heavy`, `load-light` |

- **Case settings:** each case has a style target and, optionally, a Voiceprint and a refinement chain.
- **Case expectations:**
  - `anchors`: meaning-critical literal text, with alternatives separated by `|`. Losing one fails the semantic gate.
  - `keep`: stylistic features that should survive. These are reported, not gated.
  - `minTokenRetention` and `lengthRatio`.
- **The Voiceprint fixture (`mara`):** measured at load time from six synthetic samples (1,327 words, confidence 0.77), using the product's own aggregation.
- **Smoke set** (`--smoke`): formulaic, anchors, voiceprint, already-good and chain-status.

### Gold rewrites

`data/evaluation/gold.json` holds optional reference rewrites. A gold rewrite is one valid editorial answer, not the answer. It is never scored by string similarity.

The comparison shows:

- which patterns the reference removed and which the output removed;
- the retention of each;
- the direction of the sentence-CV change;
- paragraph counts;
- whether the reference itself passes the meaning checks.

The three current references were written by Claude during development and are labelled as not expert-labelled. Replace or supplement them with human editors' rewrites when available.

## What each record measures

- **Semantic gate (hard):**
  - PASS or FAIL.
  - Deterministic failures (figures, dates, quotations, links, strong names), a changed negation count, and lost case anchors all fail the gate. In evaluation, a changed negation count fails; in the app it is only a warning.
  - Model findings are listed separately, with status `pass`, `fail` or `not-run`.
  - Deterministic failures are never overridden by a model.
- **Rules:** catalogued patterns before and after; which were resolved, which remain, which were introduced, and which introduced ones are deterministic.
- **Metric deltas:** 20 raw before/after values (sentence mean, median and CV; paragraph CV; transitions per 100 words; stock and repeated openers; hedges; intensifiers; contractions; first person; dashes; semicolons; questions; fragments; passives; lexical variety). Nothing is labelled better or worse.
- **Wording retention:** a descriptive measure, not a meaning check. It covers:
  - token retention;
  - bigram and trigram retention;
  - word-level edit distance;
  - novel-token share;
  - length ratio.

  Refinement stages also report retention against the previous stage.
- **Voice comparison:** per dimension, the expected range, the source value, the output value, the confidence, and whether each is in range. The ranges come from the Voiceprint when the case has one (the same ranges the model was given). Otherwise they are built around the source's own values and widen for short texts. `movedOut` lists the dimensions the rewrite pushed out of range. There is no overall percentage.
- **Attempts:** per attempt, the trigger and retry reasons, semantic failure kinds, introduced deterministic rules, model-check status, output hash and word count, latency, token usage, stop reason, request id and HTTP status. The pipeline produces these logs as metadata only, so the web app could use them without logging text.
- **Expectations:** case-specific checks, with pass/fail and detail.
- **Review:** optional human judgement, described below.

## Running it

```bash
pnpm eval:help                                   # the full command guide
pnpm eval:list                                   # cases, categories, gold, strategies
pnpm eval:run --smoke                            # denies potentially metered routes by default
pnpm eval:run --smoke --provider gemini --model gemini-3.8-flash
pnpm eval:run --smoke --provider local --model bonsai-2-27b --concurrency 2   # local server, no quota
pnpm eval:run --all --strategy reconstruction-v2 --model claude-sonnet-5 --concurrency 2
pnpm eval:run --all --demo                       # deterministic demo engine, by request only
pnpm eval:run --case anchors --dry-run           # plans and contracts only
```

Providers are `anthropic` (Messages API with structured outputs), `gemini` (REST `generateContent` with a response schema) and `local` / `openai-compatible` (any OpenAI chat-completions server with `response_format: json_schema`: a local llama.cpp server such as Bonsai 2 27B, Ollama, LM Studio, Groq; `--base-url`, default `http://127.0.0.1:8080/v1`).

**Cost preflight:** evaluation runs now deny every potentially metered route before constructing a frontier provider, worker, or judge. A configured API key does not prove a free quota. Demo and loopback transports pass. `--allow-paid-provider` is an explicit override for a separately authorized paid experiment; do not use it under the current zero-spend instruction. `--confirm-free-groq` is an explicit assertion that the operator verified a zero-cost Groq quota for that account; it applies only to Groq. Dry-run and deterministic development commands make no provider call. Earlier approximately $2.73 of Claude consultation spend was a process failure; it must not recur or be treated as evaluation cost evidence. Local-model benchmarking remains paused until the 64 GB M5 Pro environment.

Free tiers are small: Gemini's free tier allowed 20 requests per day per model in testing, and one smoke run needs about 24 requests (three per stage: claim extraction, rewrite, meaning check). A local model has no quota, only time: Bonsai 2 27B on an M4 Pro took about 3–4 minutes per reasoning-heavy call. Its results say how the harness and prompts behave with that model; they are not a stand-in for a frontier model's quality. Both re-validate every response with the same Zod schemas and record tokens, stop reason and request id. The CLI reads keys from the shell or from the project's env files (`.env.development.local`, `.env.local`, `.env.development`, `.env`, loaded the way Next.js loads them, never overriding the shell). A real-model run without the provider's key stops with an error. It never falls back to the demo engine. Demo runs are recorded as `mode: demo, realModel: false` and their reports carry a banner. The key is read from the environment and never printed or stored.

- **Concurrency:** 1 by default, capped at 2.
- **Failures:** a failed case is recorded in `failures.json` with the attempts made so far, and the batch continues.
- **Sampling:** parameters are the provider's defaults, recorded as `sampling: provider-default`. The provider architecture exposes the model and nothing else.

### Comparing and baselines

```bash
pnpm eval:baseline <run> --name v1-sonnet
pnpm eval:compare --baseline v1-sonnet --run latest
pnpm eval:compare <runA> <runB>
```

A comparison lists what differs between the runs, then the summary dimensions and per-case dimensions side by side. It also flags possible regressions:

- more semantic failures;
- a case going from PASS to FAIL;
- median token retention down more than 0.05, or a single case down more than 0.10;
- more introduced rules, or new introduced deterministic rules;
- more Voice dimensions moved out of range;
- a higher retry rate;
- median latency up more than 25% and by at least 500 ms;
- more expectations missed.

What differs between runs includes mode, strategy, model, prompt fingerprint, rule packs, corpus version and changed case texts.

### Human review

```bash
pnpm eval:review <run> <case> --meaning yes|no|uncertain --voice yes|no|uncertain \
  --naturalness better|same|worse --unnecessary yes|no --notes "..."
```

You can also edit the `review` field in the record JSON; it is validated on load. Reviews are never combined into a score.

### Storage and privacy

Results live in `.evaluations/`, which is gitignored:

- `runs/<runId>/run.json`, `records/*.json`, `failures.json` and `report.md`
- `baselines.json`
- `comparisons/`

Records contain fixture texts and model outputs. This is developer storage, separate from the app's persistence. The runner only accepts corpus cases, so user documents cannot become analytics.

## Repeated refinement

`chain-status` and `chain-dashes` run Natural → Less polished → Shorter → Keep more of my wording. For each stage, the report shows:

- the semantic verdict against the original;
- retention against the original and against the previous stage;
- mean sentence length, sentence CV and contractions;
- introduced patterns;
- Voice dimensions moved out of range.

A tendency toward generic prose would show up as falling retention against the original, sentence metrics converging across the two chains, or more Voice dimensions moving out of range. A test asserts that every stage's provider call carries the original source, and that a fact dropped in a late stage is caught against the original.

## Limitations

- **Real models:** the automated measures describe outputs; they do not judge quality. The demo engine does not read the contract, so demo runs of v1 and v2 differ only in minimal-change handling. Strategy differences only show up with a real model.
- **Meaning checks** catch concrete changes, not every shift in meaning. Retention is not meaning preservation.
- **Voice measures:** the Voiceprint statistics (`lib/analysis`) and the rule metrics (`lib/rules/metrics`) define a few measures slightly differently. The comparison uses the same ranges the rewrite was given, applied to rule metrics, which is what the product does.
- **Corpus:** it is small and synthetic by design. Treat it as a regression harness, not a benchmark of writing quality in general.
- **Gold references:** the current ones are AI-written illustrations, not expert-labelled data.

## Semantic integrity (claim level)

The meaning checks answer one question: did the rewrite preserve what the author actually said? Comparing numbers and names alone is not enough. `src/lib/semantics` extracts one `SemanticClaim` per sentence and compares claims deterministically. It is shallow by design: it reads markers, not a parse tree.

### What each claim records

| Aspect | Example |
|---|---|
| Polarity | explicit ("not", "won't") or implicit ("postpone", "instead of"); "not only" does not count |
| Modality | possible < probable < asserted < emphatic |
| Ordered strength scales | evidence (suggests < shows < proves), causation (helps < causes < determines), quantifier (some < many < most < all), frequency (sometimes < usually < always) |
| Quantity bound | "almost three weeks" is *below* 3 weeks; "an hour. Maybe more." is *at least* 1 hour; "closer to nine" is *approximate*; "never got more than five" is *at most* 5 |
| Markers | causal, temporal, conditional and comparative |

### How claims are aligned and compared

Claims are aligned by shared content, so a split or merged sentence still lines up, and then compared. Bounds are compared as sets around the value: disjoint sets are a contradiction ("almost three weeks" → "three weeks", "maybe more" → "most of"); a subset or superset is a strengthening or weakening; a partial overlap ("closer to" → "up to") is flagged for review.

| Detected change | Severity |
|---|---|
| Polarity flip (1:1 claim) | blocking |
| Quantity bound contradicted, unit changed | blocking |
| Change on an ordered scale with both markers explicit ("helps" → "determines", "agree" → "confirm", "some" → "most") | blocking |
| Invented cause ("due to", "because", …) the source never states | blocking |
| Dropped claim carrying a number, negation, name, hedge, cause or date | blocking |
| Unbalanced quotation marks; a quote attributed to someone else | blocking |
| Contrast substitution in the same frame ("across the grain" → "against the grain", "rose" → "fell") | blocking |
| Author-protected phrase missing | blocking |
| Hedge dropped or added; stronger quantifier/evidence added; qualifier dropped | major |
| Quantity approximate ↔ exact, or partial bound change | major |
| Invented question; added temporal/conditional clause with new content; clause with mostly new content | major |
| New interpretation framed around a quotation | major |
| Dropped plain claim (low word overlap; could be a paraphrase) | major |
| Mechanical damage (capital after a dash, duplicated punctuation, spacing) | minor |

The verdict is FAIL if anything is blocking, NEEDS_REVIEW if anything is major, and PASS otherwise.

### Principled false-positive handling

- **Dates** are compared as dates: "12 March 2026" = "March 12, 2026" = "2026-03-12". A less specific date is a warning.
- **Figures** are compared as sets: repeating a source figure is not an added figure.
- **Negation** is judged per claim, so "will not be taking on" → "will pause" passes.
- **Name detection:** a sentence-initial word shaped like an ordinary word ("Better", "Five", "Securing") is not taken as a name.
- **Removable filler:** a sentence made only of a pattern from a *removable* rule family (negative listing, throat-clearing, fake-profound endings) may be deleted without counting as a dropped claim.
- **Licences:** a refinement note can license a change: "sound more confident" licenses strengthening, "tone it down" weakening, "cut the intro" removal. Licensed changes are recorded as minor, with the words that licensed them.

### What still needs judgement

The deterministic layer cannot see these. The independent judge is for them, and a person should still review:

- paraphrases that change meaning without changing markers;
- claims implied rather than stated;
- domain terms outside the contrast groups;
- sarcasm, and scope ("every team except one").

`pnpm eval:semantic` runs `data/evaluation/semantic-fixtures.json`: 37 synthetic fixtures, one positive case and one negative control for each failure class found in the September 2026 bake-off.

## Independent semantic judge

A model under test grading its own rewrite is weak evidence, so reconstruction and judging are separate:

```bash
pnpm eval:run --smoke --provider local --model qwen3:14b-q8_0 --base-url http://127.0.0.1:11434/v1 \
  --judge-provider gemini --judge-model gemini-3.8-flash
```

The judge receives the source, the output, both claim lists and the deterministic findings. judge.v2 (the default) also receives the engine's INTENDED REMOVALS (see "judge.v2 and the judge cache"); `--judge-prompt 1` selects judge.v1 for comparison with older runs. It is asked for specific kinds of change, not "is this basically the same?":

- added or dropped claims
- strengthened or weakened claims
- contradictions
- causal, temporal, comparative or modality changes
- domain-term substitutions
- quotation changes

Its output is Zod-validated. Every finding must quote exact evidence from the source and/or the output, and evidence that cannot be found in the texts caps the finding at minor.

- **How verdicts combine:** the record keeps the deterministic verdict, the self-check (the provider's own meaning check) and the judge side by side. The stricter verdict applies, a deterministic FAIL is never overridden, and every disagreement is recorded.
- **Failures and self-judging:** a judge that fails to run is recorded as NOT_RUN, never as a pass. The record also says when the judge is the same model as the rewrite (`selfJudged`).
- **Production:** the web app does not use a judge.

### Groq as the judge

GroqCloud (`--judge-provider groq`, key `GROQ_API_KEY`) runs the judge on a hosted model from a different family than the local writers. It reuses the OpenAI-compatible provider with Groq's strict structured-output rules: no streaming, a JSON Schema subset (the full Zod schema still validates), `include_reasoning: false`, a fixed `--judge-reasoning-effort`, and `max_tokens` 4096.

- **Model ID:** always explicit, because the catalogue changes. Check `GET https://api.groq.com/openai/v1/models`.
- **Tested:** `openai/gpt-oss-120b` (131K context, strict `json_schema`, `reasoning_effort` low/medium/high).
- **Free tier:** 30 requests per minute, 1K per day, 8K tokens per minute and 200K tokens per day. A judge call costs about 3–4K tokens at medium effort, so the daily token limit, not the request limit, bounds a run.
- **Unchanged output:** when a stage's output is byte-identical to the source (for example when v3 leaves good text alone), the judge is not called. The stage is recorded as `skipped`: identical text cannot have changed meaning. A skipped judge never counts as a pass.

## Reproducible generation settings

`--temperature`, `--top-p`, `--top-k`, `--seed`, `--max-tokens`, `--reasoning-budget` and `--reasoning-effort` are recorded in every record, together with what the provider actually sent, what it could not send, and what was declared as configured on the server.

- **Local servers:** a reasoning budget is sent per request as `thinking_budget_tokens` (llama-server), or under `--reasoning-param` (e.g. `thinking_budget` for the MLX server).
- **Server-side budgets:** `--reasoning-control server-declared` records a budget set on the server (e.g. `--reasoning-budget 4096` on llama-server) without sending it.
- **Run IDs and comparisons:** the budget is added to the run ID. Comparisons flag runs whose reasoning budget, generation settings, meaning-analysis version or judge differ as not like for like.
- **Unsupported settings:** Anthropic and Gemini thinking budgets and Anthropic's seed are not wired, and are reported as unsupported.

A Bonsai budget sweep looks like this:

```bash
for b in 512 1024 2048 4096; do
  pnpm eval:run --smoke --provider local --model bonsai-2-27b --strategy reconstruction-v3 --reasoning-budget $b
done
```

## Refinement as a delta (strategy reconstruction-v3)

`reconstruction-v3` (experimental, prompt `reconstruct.v4`) treats a refinement as a requested change, anchored to the original.

- **Roles:** the prompt gives ORIGINAL SOURCE (the authority on meaning and authorship) and CURRENT REVISION (the text being edited) distinct roles. Each directive is an objective with an explicit reference: the original or the current revision.
- **Keep more of my wording** moves toward the ORIGINAL. The plan lists original sentences that the current revision reworded without a catalogued pattern to justify it (RESTORE), and never lists a pattern for restoration. When a sentence contains a pattern, only the wording around it is offered back (the pattern cut out, pieces joined with "…", marked `partial`), so a revision whose every sentence held a pattern still gets a restoration list. The demo engine applies the RESTORE list to the current revision; it never restarts from the whole original, because that would bring back patterns the revision had dropped.
- **Shorter** carries a claim triage:
  - MUST KEEP: claims with numbers, negations, names, hedges, causes or dates.
  - MAY COMPRESS: other content claims.
  - MAY REMOVE: sentences made only of removable filler patterns.

  A shorter output that drops a MUST KEEP claim fails verification and is retried.
- **Minimal change is an invariant under v3.** When nothing catalogued is wrong, nothing was asked for, and the register already fits, the source comes back byte for byte without a model call. The record marks this `unchangedByPolicy`.

v1 remains the production default; v2 and v3 are experimental until a real-model comparison supports promoting one.

## Three independent questions: semantics, voice, instruction following

Every stage answers three questions separately. They are never merged into one verdict or score:

1. **SEMANTICS:** did the meaning survive? The semantic gate (deterministic claims, self-check, judge): PASS, NEEDS_REVIEW or FAIL.
2. **VOICE:** did the author's habits survive? `stage.voiceDevices`: PRESERVED, DEVIATION or DAMAGED. This is separate from the Voiceprint/source metric ranges in `stage.voice`.
3. **INSTRUCTION FOLLOWING:** did the requested refinement visibly happen? `stage.refinementEffect`: APPLIED, PARTIAL, NOT_APPLIED, ALREADY_SATISFIED or NOT_MEASURABLE (refinement stages only).

A stage can PASS semantics while its voice is DAMAGED (dashes erased) or its refinement NOT_APPLIED ("Shorter" returned the same text). Reports show the three side by side, and comparisons count each separately.

### Causal and assertion strength

Causal wording is ranked, not string-matched:

| rank | family | examples |
| --- | --- | --- |
| 1 | contribution / association / importance | helps, contributes to, is associated with, is linked to, plays a role, is important for |
| 2 | enablement | enables, allows, makes it possible, is essential for, lets the team do X |
| 3 | causation | causes, leads to, results in, drives growth, makes X stick, is the reason for |
| 4 | determination | determines, ensures, guarantees, is what makes X, is the only reason |

Constructions ("is what makes", "drives … success", "makes improvements stick") are matched before single words. How a move between ranks is graded:

- **A one-step move** (e.g. enables → causes) is NEEDS_REVIEW, because it is ambiguous.
- **A larger move** (e.g. contributes → determines, is associated with → caused) is FAIL.
- **A causal mechanism the source never stated** (rank ≥3 with no causal wording in the source, whether the claim is aligned or not) is FAIL.
- **Negative controls**, such as "makes sense", "helps" → "contributes to", and "because" kept as "drives", must PASS.

### Voice devices

`src/lib/semantics/voice-devices.ts` measures the following:

- em/en dashes, how many and whether they are spaced;
- fragments (≤4 words);
- lowercase sentence starts and lowercase "i";
- quote style (straight vs curly, double vs single);
- parentheses, semicolons and ellipses;
- repeated punctuation (?? !!);
- contractions.

A **source voice profile** decides which devices are deliberate habits. A device counts only when three things hold:

- it recurs;
- the text shows other signs of a personal style;
- the text is not slop-heavy (catalogued patterns per 100 words below 1.5, not counting the device rules themselves).

Dashes inside "In today's world — where speed matters —" are a pattern, not a habit.

**Deviations** are graded by confidence (how much source text there is: `1 − e^(−words/90)`) and by frequency. The main grades:

- **Major:** erasing a deliberate habit with confidence ≥0.5 (about 62 words); capitalising a deliberately lowercase text; lowercasing a normally capitalised one.
- **Minor:** a quote-style change, and dash spacing.

A quote-style change is a VOICE deviation, never a semantic failure. Quoted words are still checked by the meaning analysis.

**Planner priority.** The same profile feeds the planner as a `source-voice` constraint layer. The order is user instruction > Voiceprint (≥0.6 confidence) > source voice (≥0.5) > style preset > general rules. A deliberate dash habit therefore permits `slop.dash-density` even without a saved Voiceprint, while dash spam in slop keeps the rule active. The 0.5 threshold is shared with the voice check, so the plan never asks the model to remove what the evaluation would call damage.

Fixtures are in `data/evaluation/voice-fixtures.json`, with positive cases and negative controls, and run with `pnpm eval:semantic`.

### Refinement effect

The measures are coarse, text-supported signals. None is a quality score.

| directive | measure | APPLIED when |
| --- | --- | --- |
| Shorter | words vs the current revision | ≤92% of the words (PARTIAL ≤98%) |
| Keep more of my wording | token/bigram retention of the ORIGINAL, before → after | +0.02 or more; ALREADY_SATISFIED when the current revision already keeps ≥95% |
| More casual | contractions/100, mean sentence length | contractions +0.5/100, or sentences ≥10% shorter |
| More formal | contractions/100 | −0.5/100 (NOT_MEASURABLE if there were none) |
| Less polished | transition openers + colons + semicolons; sentence-length CV | polish markers −0.5, or CV +0.05 |
| note | none | NOT_MEASURABLE (NOT_APPLIED if nothing changed) |

Output byte-identical to the revision it was asked to change is NOT_APPLIED. The only exception is keep-wording when the revision was already saturated, which is ALREADY_SATISFIED.

## Forced-model diagnostic (`--force-model`)

Under v3, text the planner considers finished is returned without a model call. That is product behaviour, and normal runs measure it (**PRODUCT QUALITY**).

`--force-model` disables that bypass so the model is called anyway. This measures **BACKEND SAFETY**: what the model does with text that needed nothing. The rules:

- **Evaluation only.** It lives in `PipelineOptions.forceModel`. The web route cannot set it, and a test asserts that.
- **Refused where it cannot matter.** Strategies that never bypass the model (v1, v2) reject it.
- **Labelled everywhere.**
  - The run id ends in `-forced`.
  - Every record says `config.forcedModel: true`, and every stage records `plannerWouldBypass`.
  - The run report opens with a FORCED-MODEL DIAGNOSTIC banner.
- **Never mixed with normal runs.**
  - `eval:compare` marks a forced/normal pair as NOT EQUIVALENT and does not compute regressions between them.
  - `eval:series` refuses to mix them.
- **Normal behaviour is unchanged.** Without the flag, v3 bypasses exactly as before.

## judge.v2 and the judge cache

**judge.v2** adds an INTENDED REMOVALS section: source spans the engine classified as removable patterns, with the pattern's name.

- The prompt calls them "candidates, not guaranteed-safe deletions". If a listed span also carried a real claim (a fact, number, cause, condition, qualification or attribution), the judge must report it as dropped.
- The judge is never told to trust the rule engine.
- judge.v1 is unchanged and still pinned. Runs judged by different prompt versions are flagged as not like for like.

**The judge cache** lives in `.evaluations/judge-cache/<sha256>.json`, and is gitignored.

- **What is hashed:** the judge provider, model, generation settings, prompt version, and the full system and user messages. The user message already contains the source, the output, both claim lists, the deterministic findings and the intended removals.
- **What hits:** only an exactly equivalent judge input. The same output text with any other difference is a miss.
- **What is cached:** completed judgements only. Failures are retried, and corrupt entries are misses.
- **Provenance:** every judge result records `provenance.source` (`live` or `cached`), the key, the original run id and when it was cached. Reports count live vs reused calls.
- **Opting out:** `--no-judge-cache` always calls live.

## Series: variability across seeds

`pnpm eval:series <run> <run> <run>` takes runs of ONE configuration that differ only in `--seed`. It refuses mixed models, strategies, prompts, judges (or judge prompts), reasoning budgets, corpus versions, and forced vs normal.

Per case, it reports:

- the semantic verdict for each seed;
- whether semantic FAIL, voice DAMAGED and refinement NOT_APPLIED happen on every seed (systematic) or intermittently;
- median and range of retention and latency.

Per seed, it reports totals. Nothing is averaged into one number. See docs/BENCHMARK-PLAN.md for the planned three-seed tracks.

## Record schema version 2

New records are `schemaVersion: 2`:

- **Semantic gate:** `integrity`, `judge` and `disagreements`, plus the NEEDS_REVIEW verdict.
- **Stage:** `refinementDelta`, `originalWordingRetention`, `unchangedByPolicy`, `plannerWouldBypass`, `voiceDevices` and `refinementEffect`.
- **Rule diff:** `rules.families`, which shows a family that persisted through rewording.
- **Config:** `generation`, `judge`, `analysisVersion` and `forcedModel`.
- **Judge result:** `provenance` (live or cached).

Version 1 records and manifests still load; the new fields are optional.

## Bounded semantic-review development

`pnpm eval:semantic-development` runs the newly authored synthetic development corpus through deterministic v5 and experimental v6 preliminary planning. It does not call any model and never loads frozen holdouts. An optional path to a synthetic review artifact replays structured reviews through v6 schema, source-span validation, reconciliation, and fallback, then compares all-review with selective routing on the same artifacts. See [SEMANTIC-REVIEW.md](./SEMANTIC-REVIEW.md) for the contract, limitations, and future Holdout V3 protocol. Development corpus results are not independent generalization evidence.

The fresh 99-document [semantic scope validation](./SEMANTIC-SCOPE-VALIDATION.md) freezes synthetic documents and blind editorial labels before exporting pinned v3 requests. `node --import tsx tools/eval/scope-validation.ts integrity` checks input fingerprints; `requests` exports model input without labels; `audit data/fixtures/semantic-scope-validation/reviewer-output.json` replays saved account-backed reviews without calling a provider. The report records a **NO-GO** for creating Holdout V3 because partial rewrite feasibility and substantive scope remain inadequately validated. Never tune v3/v7 or ordinary rule development against frozen Holdouts V1/V2.

The subsequent [semantic scope calibration](./SEMANTIC-SCOPE.md) traces the 43 development cases, records blind gold-label reassessment, compares pinned v2 and v3 contracts on new adversarial controls, and defines experimental v7's blocked-pending-information execution state. The saved synthetic reviews are replay artifacts, not live provider benchmarks.
