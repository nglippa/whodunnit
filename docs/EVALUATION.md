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

Prompts have explicit identities, `{ id, version }`, registered in `src/lib/prompts/index.ts`:

- `reconstruct.v2` and `reconstruct.v3`
- `analyze.v1`, `verify.v1`, `voiceprint.v1`
- `compile.v1`, in the source compiler

A test pins a fingerprint of each prompt's text, so an edit without a version bump fails. `reconstruct.v2`'s fingerprint matches the prompt that shipped before strategies existed.

Every record stores the strategy key, the prompt key and fingerprint, the provider and model, the rule-pack versions, and the Voiceprint hash.

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
pnpm eval:run --smoke                            # real model: needs ANTHROPIC_API_KEY in the environment
pnpm eval:run --all --strategy reconstruction-v2 --model claude-sonnet-5 --concurrency 2
pnpm eval:run --all --demo                       # deterministic demo engine, by request only
pnpm eval:run --case anchors --dry-run           # plans and contracts only
```

A real-model run without `ANTHROPIC_API_KEY` stops with an error. It never falls back to the demo engine. Demo runs are recorded as `mode: demo, realModel: false` and their reports carry a banner. The key is read from the environment and never printed or stored.

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
