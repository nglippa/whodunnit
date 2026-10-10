# Editorial intelligence experiment v1

**C — EXPERIMENT INCOMPLETE.** Starting checkpoint: `250459c`. The isolated implementation and fresh holdout are prepared and validated; live generation and independent judging are blocked. There is no evidence yet for accepting or rejecting the specialization hypothesis.

Follow-up: a [manual export/import workflow](EDITORIAL-MANUAL-WORKFLOW.md) now prepares this same Astra experiment for user-operated authenticated sessions, preserves response bytes and available provenance, and exports blinded comparisons. The historical results below remain unchanged; exporting prompts is not model execution.

## Actual execution and model identity

| Role | Planned exact model | Actual model / outputs |
|---|---|---|
| Direct editor A | `gpt-6-astra` | none / 0 |
| Diagnosis and reconstruction B | `gpt-6-astra` for both calls | none / 0 |
| Independent blind judge | `gpt-6.1-sol` | none / 0 |
| Direct Astra reference | A itself, if runtime identity verified | absent |
| Direct Claude Opus 5.5 reference | only if exact runtime availability verified | absent |

GPT-6 Astra is visible in the authenticated Codex catalog. Claude's MCP readiness check reports authenticated/ready, but its static model catalog is advisory and does not establish Opus 5.5 availability. Neither observation proves a successful exact-model invocation. No OpenAI or Anthropic API credential is configured in this workspace/session. Existing manual Astra imports lack runtime identity; the Claude MCP is a critique-envelope interface rather than a neutral editor transport. They were not used as substitutes.

The local PreToolUse stack guard blocked `codex exec --help` with: “use the two native worker slots; do not launch additional CLI model sessions.” It was not bypassed. No generation, diagnosis, judging, reference, or paid readiness model call was attempted. Free readiness/catalog checks used the [Claude collaboration skill](/Users/nicholaslippa/.codex-account-2/plugins/cache/claude-in-codex/claude-in-codex/0.10.0/skills/collaborating-with-claude/SKILL.md) and its MCP; the skill's catalog is explicitly advisory. The guard restricts this transport; it does not establish that the listed models are globally unavailable.

Actual naturalness, voice, objective, factual-integrity, restraint and preference results are **unmeasured**. Costs, token usage and inference latency are **null**, not zero-priced inference. No model outputs or blind evaluations exist. Unit-test fixtures are synthetic software controls, never experimental results.

## Small isolated implementation

[experiment.ts](../tools/editorial-intelligence/experiment.ts) contains a transport-neutral three-call pair and a separate blind judging call. It has no production consumer, login extraction, automatic model choice, CLI launcher, retry, memory, tools, repair loop, or demo fallback. A transport must provide exact runtime model identity, request ID, usage and latency receipts; missing/substituted identities are rejected. Caller integrations must retain raw receipts, including failed-call spend, and provide fresh requests. Such a permitted, audited live transport is the missing integration in this run.

- **A:** SOURCE + OBJECTIVE → direct editor → FINAL. A receives a strong preservation, naturalness, voice and restraint prompt; it is not deliberately handicapped.
- **B:** SOURCE + OBJECTIVE → evidence-bound diagnosis → the same editor using SOURCE, OBJECTIVE and diagnosis → FINAL. Diagnosis assesses existing naturalness, change necessity, concrete defects, voice, untouched spans and KEEP/LOCAL/SUBSTANTIAL/ABSTAIN scope. Every diagnostic quotation must occur verbatim in SOURCE. Required objectives cannot receive KEEP. Reconstruction treats diagnosis as guidance, not factual authority.
- Both may make substantial justified revisions, preserve already-good writing or explicitly abstain. Unchanged SOURCE is not accepted merely because it is text-safe. Objective completion and safety are evaluated separately; PARTIAL is not full success.

The fresh [holdout](../data/experiments/editorial-intelligence-v1/holdout.json) has **12 newly authored cases**, two each of already-good, synthetic, mixed-quality, supplied-update, voice-sensitive and professional writing. It includes authorized updates with neighboring protected values, uncertain evidence, awkward local prose, and distinctive personal voice. Inputs were written before any generation. A scan of 735 prior evaluation JSON/JSONL files and 2,774 SOURCE fields finds zero exact or whitespace-normalized source collisions; the prior inventory hash is pinned in the manifest. This is a lexical collision check, not a semantic novelty claim. This is a small authored pilot, not an estimate of population performance.

Candidate D remains the experimental safety foundation; this experiment isolates editorial quality upstream and does not change or promote its controller. V15, Candidate C, Candidate D and frozen Astra artifacts are untouched. Blind judging cannot confer production safety authority.

## Locked comparison before generation

The protocol, prompt/schema hashes and holdout hash are recorded in [results.json](../data/experiments/editorial-intelligence-v1/results.json). A and B request the same exact editor model and `high` effort. A has one call capped at **6,144 output tokens**. B has a **2,048-token diagnosis** and **4,096-token reconstruction**, the same aggregate output cap. Judge calls have a separate 4,096-token cap. There is one attempt per stage, with no repair or output selection. A-first/B-first order alternates across cases.

These caps do not equalize input or hidden reasoning costs. B has additional context and another call. Actual input/output/reasoning tokens, provider-reported cost (null when unavailable), call latency and measured wall duration must be retained. The comparison reports A and B separately and does not infer superiority from call count. Even a successful pilot would show the advantage of this two-stage procedure at its recorded cost, not isolate diagnosis from all effects of extra computation.

After generation, the harness shuffles cases using a seed selected before calls and counterbalances X/Y arm positions, six each. The seed is fixed in the pre-generation protocol and its hash is in the manifest; it cannot be selected after seeing outputs. The judge receives only case ID, SOURCE, OBJECTIVE and candidate finals. It receives no arm/model identity, diagnosis, usage, execution order, mapping or hypothesis. The private mapping is retained separately from blind packets. The independent exact judge must be available before any case generation. A null final is non-completion; only SAFE/YES candidates may win overall safe preference.

Measure naturalness, voice fidelity and restraint on 1–5 scales; factual integrity as SAFE/UNSAFE/UNCERTAIN; objective completion as YES/PARTIAL/NO; and overall safe preference, ties or neither-safe. Judge evidence must quote the bound SOURCE/candidate. Report every case, including failures and abstentions.

The preselected success rule requires B's net wins to be at least **25% of all 12 cases**, a **two-sided exact sign-test p ≤ .05** among non-ties, and **no paired loss** in ordinal factual integrity (SAFE > UNCERTAIN > UNSAFE) or objective completion (YES > PARTIAL > NO) relative to A. Otherwise a completed run returns **B — NO MEANINGFUL IMPROVEMENT** and rejects this specialization configuration. Incomplete capacity/data returns C. For orientation, 10–2 preferences pass the sign-test threshold; 9–3 do not. Statistical significance in twelve cases is still a pilot result with a single model judge, not proof of superiority over frontier models generally or unavailable Opus 5.5.

## Validation and recommendation

- `npx vitest run --config tools/editorial-intelligence/vitest.config.ts`: **11 targeted tests passed**.
- `npx eslint tools/editorial-intelligence`: passed.
- `npm run typecheck`: passed.
- `node --import tsx tools/editorial-intelligence/validate.ts`: validates the 12-case inventory, six balanced strata, normalized-whitespace SOURCE freshness against all prior data/evaluation JSON/JSONL source fields, hashes and explicit blocked/null results. No unrelated application tests or browser checks were run.

Prepared artifacts: [availability.json](../data/experiments/editorial-intelligence-v1/availability.json), [holdout.json](../data/experiments/editorial-intelligence-v1/holdout.json), [results.json](../data/experiments/editorial-intelligence-v1/results.json). Blinded outputs, judged results and cost/latency comparisons are intentionally absent because no live run occurred.

**Recommendation:** retain C and make no editorial superiority claim. The next necessary step is a permitted, audited exact-model editor and independent-judge transport. Then run this locked experiment once, retain all receipts and blinded judgments, and accept or reject the configuration from its actual preference and integrity results. Do not redesign Candidate D or add a production orchestration framework.
