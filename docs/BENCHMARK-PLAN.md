# Benchmark plan: reconstruction-v3 on local models (prepared, not yet run)

**LOCAL BENCHMARKING: PAUSED UNTIL 64 GB M5 PRO ENVIRONMENT.** The commands below are a prepared protocol, not a report of completed runs. Do not run the local model tracks on the current machine or treat the historical timing estimates below as measurements of this plan.

## Next experiment: single frontier, then reconstruction-v4

The next cloud comparison asks whether bounded orchestration improves a rewrite enough to justify its extra calls. The order is fixed:

1. Establish a **single-frontier baseline** with `reconstruction-v4` and no `--worker-model`, using the same corpus and independent judge. The frontier handles the decision and draft alone under v3 planning and the `reconstruct.v4` contract. Keep normal planner bypass enabled.
2. After explicit cost and latency limits have been set, run `reconstruction-v4` again with the same frontier model, corpus, prompt contract, generation settings, semantic analysis and judge, adding only `--worker-model` and its capability tier. Use only the optional `local-alternative` worker class in `src/lib/reconstruction/orchestrator.ts`; record whether it was routed, accepted or rejected. Do not assume a worker must be used on every case.
3. Compare matched cases and seeds by semantic FAIL/NEEDS_REVIEW, voice damage, refinement effect, retention, introduced deterministic patterns, source fallbacks, accepted suggestions, repairs, tokens, estimated USD cost and elapsed time. Report each dimension separately. Keep a forced-model diagnostic, if used, separate from normal product behaviour.

This is a protocol, **not a cloud benchmark result**. `StructuredFrontierAgent` is provider-neutral; the production route still uses `reconstruction-v1`. The evaluation CLI can run v4 with an explicitly selected frontier provider and optional `--worker-model`; no such run is authorized by this plan. The local v3 tracks below remain paused until the specified hardware is available. A single-frontier baseline should be measured before interpreting any v4 run; do not infer a win from fewer calls or a better draft alone.

This plan re-measures `reconstruction-v3` after the hardening pass. That pass added:

- the causal-strength scale;
- voice devices and source-local voice;
- the keep-wording fallback and alignment fix;
- refinement-effect checks;
- judge.v2 and the judge cache;
- the forced-model diagnostic.

It is written before any run, so the questions and the decision rules cannot be tuned to the results.

The two tracks answer different questions. **Never aggregate Track A and Track B into one number.**

| | Track A: normal | Track B: forced model |
| --- | --- | --- |
| Question | What does a user get? (**PRODUCT QUALITY**) | What does the model do when called on text the planner would leave alone? (**BACKEND SAFETY**) |
| Planner bypass | on (product behaviour) | off (`--force-model`) |
| Run ids | `…-s<seed>-<label>` | `…-s<seed>-forced-<label>` |

Held fixed for every run:

- Corpus version 1: all 22 cases, 28 stages (two four-stage refinement chains).
- Strategy `reconstruction-v3` (prompt `reconstruct.v4`) and meaning analysis `semantics.v2` (the causal-strength scale; earlier runs used semantics.v1).
- Judge: Groq `openai/gpt-oss-120b`, reasoning effort medium, prompt **judge.v2** (the default), with the judge cache on.
- Seeds: **7, 42 and 137**.
- Concurrency 1. Sampling is otherwise the server default, and each record says what was sent.
- Bonsai (`bonsai-2-27b-pq2_0`) on llama-server at `http://127.0.0.1:8080/v1`, reasoning budget **1024**, sent per request as `thinking_budget_tokens`.
- Qwen3 14B Q8 (`qwen3:14b-q8_0`) on Ollama at `http://127.0.0.1:11434/v1`. Ollama is started with `OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1`.
- Only one model server is loaded at a time. Stop llama-server before the Qwen runs, and unload Ollama's models before the Bonsai runs.

Earlier runs (2026-09-27) were judged with judge.v1 and the pre-hardening analysis, so they are **not** like for like with these runs. `eval:compare` says so.

## Pre-flight (free: no model or judge calls)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm rules:validate && pnpm eval:semantic
pnpm eval:run --all --provider local --model qwen3:14b-q8_0 --base-url http://127.0.0.1:11434/v1 \
  --strategy reconstruction-v3 --seed 7 --judge-provider groq --judge-model openai/gpt-oss-120b \
  --judge-reasoning-effort medium --dry-run        # plans only; confirms GROQ_API_KEY is visible
```

## Track A: normal v3 (PRODUCT QUALITY)

```bash
J="--judge-provider groq --judge-model openai/gpt-oss-120b --judge-reasoning-effort medium"

# Bonsai (llama-server running on :8080, Ollama models unloaded)
for s in 7 42 137; do
  pnpm eval:run --all --provider local --model bonsai-2-27b-pq2_0 --base-url http://127.0.0.1:8080/v1 \
    --strategy reconstruction-v3 --reasoning-budget 1024 --seed $s $J --label bonsai-a
done

# Qwen3 14B Q8 (llama-server stopped; Ollama started with the settings above)
for s in 7 42 137; do
  pnpm eval:run --all --provider local --model qwen3:14b-q8_0 --base-url http://127.0.0.1:11434/v1 \
    --strategy reconstruction-v3 --seed $s $J --label qwen-a
done
```

## Track B: forced-model v3 (BACKEND SAFETY)

Use the same commands with `--force-model`, and the labels `bonsai-b` and `qwen-b`.

```bash
for s in 7 42 137; do
  pnpm eval:run --all --provider local --model bonsai-2-27b-pq2_0 --base-url http://127.0.0.1:8080/v1 \
    --strategy reconstruction-v3 --reasoning-budget 1024 --seed $s $J --force-model --label bonsai-b
done
for s in 7 42 137; do
  pnpm eval:run --all --provider local --model qwen3:14b-q8_0 --base-url http://127.0.0.1:11434/v1 \
    --strategy reconstruction-v3 --seed $s $J --force-model --label qwen-b
done
```

## Reporting

Run one series per model per track, which gives four series. Each takes the three seeds of one configuration.

```bash
pnpm eval:series <bonsai-a s7> <bonsai-a s42> <bonsai-a s137>
pnpm eval:series <qwen-a s7>   <qwen-a s42>   <qwen-a s137>
pnpm eval:series <bonsai-b s7> <bonsai-b s42> <bonsai-b s137>
pnpm eval:series <qwen-b s7>   <qwen-b s42>   <qwen-b s137>
```

Bonsai and Qwen are compared within a track, seed by seed:

```bash
pnpm eval:compare <bonsai-a s7> <qwen-a s7>
```

`eval:series` refuses to mix tracks, and `eval:compare` marks a cross-track pair as NOT EQUIVALENT.

For each model and track, report these separately:

1. **SEMANTICS.** Semantic FAIL and NEEDS_REVIEW, split into failures on every seed (systematic) and intermittent ones. Also report judge/deterministic disagreements.
2. **VOICE.** Stages with voice devices DAMAGED or DEVIATION, by device.
3. **INSTRUCTION FOLLOWING.** Refinements APPLIED, PARTIAL, NOT_APPLIED or ALREADY_SATISFIED, by directive.
4. **Cost.** Latency median and range, retries, and live vs cached judge calls.

## Call and time estimates

These are estimates from the 2026-09-27 runs: about 100 s per Qwen attempt, about 125 s per Bonsai attempt at budget 1024, and about 2.2–2.5K Groq tokens per judge call.

Under the hardened planner, the demo check bypasses 17 of 28 stages, which leaves about 11 model stages per normal run.

| | model attempts / run | judge calls / run | wall clock / run | runs | Groq tokens |
| --- | --- | --- | --- | --- | --- |
| Track A Bonsai | ~11–14 | ≤ 11 | ~25–30 min | 3 | ≤ ~85K |
| Track A Qwen | ~11–14 | ≤ 11 | ~20–25 min | 3 | ≤ ~85K |
| Track B Bonsai | ~28–32 | ≤ 28 | ~60–70 min | 3 | ≤ ~210K |
| Track B Qwen | ~28–32 | ≤ 28 | ~50–55 min | 3 | ≤ ~210K |

The judge is skipped on byte-identical output. It is reused from the cache only for an exactly identical judge input, for example a Track B stage whose output matches the same-seed Track A output.

The Groq free tier allows **200K tokens per day** and 8K per minute. So:

- **Day 1:** Track A (about 170K tokens).
- **Days 2–3:** Track B Bonsai.
- **Days 3–4:** Track B Qwen.

If a day's quota runs out mid-run, the judge fails and records NOT_RUN, never a pass. Re-run that seed the next day; completed judgements come back from the cache and are labelled as reused.

## Future experiment: Qwen3 14B Q8 vs Q4_K_M (not in this pass; nothing downloaded)

**Question:** does 4-bit quantisation change what Qwen does to meaning, voice or instructions, or only its speed and memory?

**Setup:**

- `ollama pull qwen3:14b-q4_K_M`. Check that the tag exists in the Ollama library first; it is about 9 GB.
- Run Track A with seeds 7, 42 and 137, the same judge (judge.v2) and the same Ollama settings. Nothing changes except the model tag.
- Optionally run Track B afterwards, as a separate diagnostic.

**Compare:**

- `eval:series` for each quantisation;
- `eval:compare` Q8 vs Q4 at the **same seed**.

**Pre-declared reading:** Q4_K_M is "no worse" only if all of the following hold:

- no new systematic semantic FAIL (failing on every seed);
- no increase in systematic voice DAMAGED;
- no increase in systematic refinement NOT_APPLIED.

Intermittent differences are reported, not treated as decisive with three seeds.

Latency and peak memory are recorded alongside, but they do not offset a meaning regression.

**Not a production decision.** This measures a backend option; choosing a production model is out of scope.
