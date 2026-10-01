# Explicit factual objectives: editor-contract development experiment

Production remains reconstruction-v1. The **V11 verifier, deterministic checks, repair, fallback, meaning, voice, and planning behavior are unchanged**. Experimental reconstruction-v12 changes only the editor prompt from `reconstruct.v7` to `reconstruct.v8`; it invokes exactly the V11 verifier contract `verify.v3` through the same runner. It does not introduce V12 verification.

## Why this was tested

In the preceding 32-case actual-edit replay, the editor returned the source unchanged for all five explicit factual-update requests. The V11 editor prompt says to use only source information and preserve dates, names, and numbers, and the editor payload presents old values in a `protected` inventory. The objective is nevertheless present in the same request, and response handling does not force a no-change result. Those instructions plausibly contributed to refusal, but the earlier five cases did **not** prove prompt wording was the sole cause.

`reconstruct.v8` explicitly treats a replacement supplied in the user objective as user-provided information. It tells the editor to change that dimension and preserve all unrelated facts, including nearby protected values. A vague factual request without a replacement remains non-executable. The old v7 text is pinned unchanged. The protected inventory and RewritePlan are unchanged; the new prompt clarifies how the editor interprets them when an objective supersedes one value.

## Frozen inputs and blind process

Two independent creators authored seven synthetic source/objective tasks each without reading the implementation. Two blind annotators saw only source and objective. They agreed on all ten explicit-update authorizations, two vague requests, and the already-satisfied request. They differed only on whether a style-only objective should be called `executable`; that case is excluded from factual-update denominators. The 14 tasks contain ten executable explicit updates, one style-only control, two vague missing-target requests, and one already-satisfied request. All ten explicit cases have at least two separately protected facts. Three pairs reuse identical source text with different objectives: `ea01/ea02`, `ea08/ea09`, and `ea10/ea11`.

Cases, both labels, and pair mapping were frozen before editor generation. Cases SHA-256: `06d50584e15e378e2e72199fe13b49f8ced688cde41308e198ca8e74f9bf8da9`. Manifest SHA-256: `8c53a31c44ef817f713f0afd0f03822f5a55ba972b08574773585f47dc5c374e`. Each editor agent saw only the system and user requests for its assigned contract. A separate blind reviewer judged the raw candidates with old/new identities hidden and alternated across A/B positions. Semantic verifier, repair, and full re-verification agents did not see gold labels. The harness uses saved account-backed agent responses through fake callers; it makes **no paid API call**.

## Raw editor result

| Measure | Old editor v7 | Revised editor v8 |
| --- | ---: | ---: |
| Explicit executable update tasks | 10 | 10 |
| Update attempted and correctly executed | **10/10** | **10/10** |
| Update ignored / partially executed | 0 / 0 | 0 / 0 |
| Collateral fact changes | 0 | 0 |
| Unsupported additions | 0 | 0 |
| Vague requests causing an invented replacement | 0/2 | 0/2 |
| Already-satisfied request left unchanged | 1/1 | 1/1 |

Both contracts handled all three same-source pairs appropriately. `ea06` performed three authorized changes while retaining unrelated bin location and workshop facts. `ea12` changed the workshop day, registration state, and apron provision while retaining unrelated garden, clock, and café facts. For the vague `ea07`, v7 left the whole notice unchanged and v8 edited presentation while retaining the listed recording date; neither invented a replacement. The raw editor evidence **does not show an obedience advantage for v8**. It also does not reproduce the earlier 0/5 refusal. This is one candidate per contract from separate account-backed agent calls, without controlled sampling settings; model variability remains a plausible explanation for the discrepancy.

## Same pinned V11 verifier after generation

| Final-system outcome | Old editor + V11 | Revised editor + V11 |
| --- | ---: | ---: |
| Explicit updates retained in final output | **3/10** | **4/10** |
| Legitimate raw update lost | 7/10 | 6/10 |
| First candidate accepted, all cases | 3 | 4 |
| Deterministic PASS / REVIEW / FAIL, all cases | 5 / 2 / 7 | 5 / 3 / 6 |
| Initial semantic PASS / LOCAL_REPAIR / REJECT | 4 / 1 / 2 | 4 / 1 / 3 |
| Repaired, all cases | 1 | 1 |
| Repair attempts / failed repairs | 6 / 5 | 5 / 4 |
| Source fallbacks, all cases | 9 | 9 |
| Raw collateral mutations to catch / final escapes | 0 / 0 | 0 / 0 |

The two contracts produced no unsafe raw collateral changes, so this corpus cannot measure V11's collateral catch rate. V11 hard-failed several legitimate updates before semantic review: `ea01` has another May 14 that must remain, `ea03` changes the coordinator/contact, `ea04` changes a quantity, and `ea10`–`ea12` involve status, negation, or multiple facts. These are observations about the **pinned verifier**, not changes made in this pass. The revised candidate for `ea09` happened to reach semantic review and pass, while the old candidate hard-failed. This is one more retained update, not evidence that v8 improves factual obedience.

The old-contract repair retained a style-only edit in `ea02`; the revised-contract repair changed vague `ea07` from “is listed” to “is tentatively listed.” Neither invented a replacement date, but the independent auditor flagged the latter qualifier as unsupported by the source. The objective's “may have shifted” supplies some uncertainty, so its acceptability is disputed; it is **not counted as a clearly safe repair**. Other attempted repairs failed or fell back. The already-satisfied `ea13` produced the source under both contracts; v8's verifier trace calls it a fallback after a semantic reject, but the final text remains correct. No model-family comparison was available beyond these account-backed agents; token and live-provider latency measurements are unavailable. Incremental API spend was **$0**.

The independent post-result audit inspected all 20 explicit-update raw candidates and found no unauthorized collateral change. It confirmed that `ea01`, `ea03`, `ea04`, and `ea10`–`ea12` lost otherwise valid requested updates downstream. In those cases, the source fallback retains a **superseded fact** and should not be presented as a completed update. In `ea09`, the old raw candidate was valid, but its wording hard-failed while the revised candidate reached review and passed. The audit also cautioned that telemetry `authorizedChangeCount` and `changeCount` do not measure factual-update success: several accepted updates have zero counts. The figures above were derived from case-level source/objective/candidate inspection, not those trace counters.

## Decision

The editor can execute explicit user-provided factual updates and contain them on this fresh set, but the old contract did so equally well. Keep v8 experimental; do **not** promote it or claim it solved the previous refusal. The end-to-end system is **not ready for a broader 30–50-case replay or Holdout V3** while six or seven of ten otherwise sound raw updates are discarded by the frozen verification path. This pass does not alter that path. The next decision should be whether to authorize a separate, narrowly scoped verifier investigation of the newly observed multi-fact and status-change failures; it must use fresh development material and preserve the V11 baseline. The current focused set is evidence, not a target for further tuning.
