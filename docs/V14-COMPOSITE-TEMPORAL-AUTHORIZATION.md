# Exact composite temporal authorization: V14 confirmation

## Decision

**A — fix confirmed; core reconstruction architecture frozen.** `reconstruction-v14` is V13 with one expression-local verifier correction. Production remains `reconstruction-v1`; pinned V13 is unchanged. The saved `ar04` candidate is accepted after the unchanged semantic-verifier step. The original 14 unsafe boundary cases still have **0 escapes**, and every boundary outcome is identical to V13. In eight fresh candidate-injection cases, two independent blind reviewers agreed on all eight dispositions: five authorized temporal replacements survived; one authorized replacement with a collateral date change, one vague update, and one style-only date mutation were blocked. No repair was attempted in the fresh confirmation. No Holdout V3 was created or run.

This is a mechanism confirmation, not another writing-quality benchmark. The next task is independent Holdout V3. The four other clearly good edits lost in the earlier V13 actual-edit replay remain documented product limitations; this task did not change them.

## Frozen failure trace: `ar04`

| Stage | Observed value |
| --- | --- |
| Source expression | `Saturday, April 18` in the cleanup date; a separate Friday rain notice remains elsewhere in the source |
| Objective | Change the cleanup date **from Saturday, April 18 to Sunday, April 19**, keeping start time, location, noon pickup, and Friday notice |
| Raw candidate | Exact requested `Sunday, April 19`, with all unrelated text unchanged |
| Blind reviewers | Both: raw useful YES, objective satisfied YES, no unauthorized meaning change or unsupported information; final objective not satisfied |
| Independent audit | Correct date edit lost; source fallback restores the old date |
| V13 extraction | One `April 18` date mention and a separate `saturday` date word; candidate has `April 19` and `sunday` |
| V13 findings | Four blocking `altered_date` findings initially: old/new calendar date plus old/new weekday. V13 grants the weekday pair, leaving `April 18` and `April 19` blocking. |
| V13 authorization | Two `AuthorizedChange` records, both weekday findings. No calendar-date authorization. |
| V13 execution | Initial deterministic **FAIL**, semantic verifier not reached. One repair was requested; saved repair returned `April 19`, the existing affected span, so no change occurred. `repair-failed` led to source fallback with `Saturday, April 18`. |
| V14 execution | Initial deterministic **NEEDS_REVIEW**, four exact-date findings marked `AUTHORIZED_CHANGE`, no hard finding. Independent account-backed semantic verifier returned PASS. Candidate accepted unchanged as final; no repair or fallback. |

The responsible code is the date-word and date-mention extraction in `src/lib/verification/protected.ts` and `src/lib/semantics/dates.ts`, V11 protected-content comparison, the claim-local pairing in `src/lib/reconstruction/exact-delta-verification.ts`, and the hard-failure order in `src/lib/reconstruction/verified-reconstruction.ts`. The calendar date and weekday were **four separate findings** for one logical expression. V13 correctly selected the affected source claim and represented the full objective; its `clauses()` split at the comma between weekday and month. The isolated `April 18` and `April 19` clauses share only the month, below the pairing threshold of two content stems. The weekday clauses retain cleanup context and pass. Same-type set comparison produced the findings, but choosing the wrong source claim did not cause this failure. Authorization ran before hard-failure enforcement; ordering did not cause it. The semantic verifier could not review the valid change until the remaining hard findings were neutralized.

## Surgical correction and safety boundary

`verifyCompositeTemporalDelta` calls the **unchanged V13** exact-delta verifier first. It then considers one additional grant only when all of the following hold:

1. Existing date extraction finds a source temporal expression and a candidate expression. An immediately adjacent weekday and calendar date are grouped for this check; no calendar inference is performed.
2. The candidate is **exactly** the source with that one expression replaced. Any other text change, including another date, time, person, or status, prevents this V14-specific grant. Ordinary V13 checks still run.
3. The objective contains an explicit update verb and the **complete candidate expression** as the requested target. A vague update or partial replacement component cannot authorize a guessed weekday, date, or year.
4. The source expression occurs once. Where the source has multiple temporal expressions, objective terms must uniquely identify the changed claim or its local `and`/semicolon segment. Even with only one expression, a named objective subject must appear in the source; “move the audit” cannot authorize a date on a source that only mentions a review. Ambiguity fails closed.
5. Only blocking findings for the old/new date or weekday components of that expression, plus a `missing_claim` finding proved to be the same exact claim with that expression replaced, are downgraded to authorized warnings. All other findings remain untouched. The unchanged semantic verifier must still PASS.

This strict whole-source substitution is intentionally narrow. It accepts the frozen candidate and explicit date-only or weekday-only replacements when they are the sole textual change; it does not license a general rewrite that happens to contain a requested date. It cannot infer a weekday from a date without a supplied weekday, or a year from context. V14 reuses V13 editor prompt `reconstruct.v8`, V11 semantic verifier prompt/schema, repair limit, fallback, meaning engine, voice checks, and planning. No production route selects V14.

An independent read-only code audit found a real precommit bypass in the first V14 implementation: “Move the audit to Wednesday, October 7. Keep the meeting unchanged” could use *meeting* from the preservation sentence to authorize a changed meeting date. The candidate still required a separate semantic PASS, but the deterministic grant was invalid. The fix now takes subject evidence only from the update directive ending at the requested target expression. Focused tests cover the preservation sentence both before and after the update directive. The auditor's exact counterexample now returns deterministic `rejected`, with zero new authorizations and five remaining blocking findings. The saved nine-row confirmation replay was re-executed after this guard; its substantive results were identical after removing measured local timings. The 28-case boundary also remained identical to V13, including 0/14 unsafe escapes. No frozen cases or labels were altered.

## Regressions and fresh confirmation

Pinned V10 and V11 boundary replays passed. All V13 exact-delta replay modes (`old`, `new`, `boundary`, `fresh`) passed. The frozen 40-case V13 source/objective and saved-response fingerprints validated; a replay matched all 40 saved substantive rows after excluding measured local `latencyMs`. No frontier text was regenerated and the 40-case corpus was not rerun under V14.

The original 28-case boundary replay was run through both V13 and V14 with the same saved candidates and saved model responses. **All 28 final texts and outcomes were identical.** For the 14 deliberately unsafe candidates, V13 escapes **0/14**, V14 escapes **0/14**, and changed unsafe verdicts **none**. No unauthorized mutation formerly stopped by V13 reached a V14 final output.

The eight fresh cases were frozen at `d71bc1c859231ead0007cceae3b4a2936171bfe625c708cb59751e4ff61f18d1` before blind labels or verifier execution. Two independent reviewers saw only source, objective, and candidate; both agreed on **8/8 authorization classes and 8/8 accept/reject/repairable decisions**. Their files were separately fingerprinted before V14 execution. A separate account-backed agent, without blind labels, answered the six unchanged semantic-verifier requests reached by the known case and five authorized fresh cases. All six responses were schema-valid PASS. The three unauthorized fresh candidates hit deterministic hard failures before semantic review.

| Case | Blind label | V14 final | Finding |
| --- | --- | --- | --- |
| `ct01` | Authorized | Candidate accepted | Weekday + month/day update; unrelated volunteer-arrival day unchanged |
| `ct02` | Authorized | Candidate accepted | Weekday + month/day + **explicitly supplied year** update |
| `ct03` | Authorized | Candidate accepted | Review date changed; audit date in same sentence preserved |
| `ct04` | Mixed; repairable in principle | Source fallback | Authorized inspection date plus unauthorized bridge-test date; collateral change blocked |
| `ct05` | Authorized | Candidate accepted | Date-only exact replacement |
| `ct06` | Authorized | Candidate accepted | Weekday-only exact replacement; another weekday protected |
| `ct07` | Mixed/request lacks replacement; reject | Source fallback | Vague date request did not authorize a guessed replacement |
| `ct08` | Mixed; repairable in principle | Source fallback | Concision request did not authorize a date change |

For the fresh set: **5/5 clearly authorized candidates accepted, 0 legitimate candidates rejected, 1/1 collateral-date candidate blocked, 1/1 vague guess blocked, 1/1 style-objective mutation blocked.** No ambiguous label disagreements occurred. No repairer was supplied in this injection-only confirmation; the three hard failures safely fell back with reason `repair-unavailable`. **Repair attempts: 0**, so there is no repaired text to grade as useful, reversion, failed, harmful, or disputed. A focused unit test also confirms that when one repair is attempted, the repaired whole document is rechecked and collateral temporal changes remain blocked.

Input, label, verifier-response, and result manifests and the full synthetic case-level trace are in `data/fixtures/composite-temporal-confirmation/`. The saved `ar04` source/objective/candidate is read from the frozen V13 replay. The confirmation harness has no network provider selection and uses saved account-backed responses. A future replay can reproduce the V14 decision without another model call; only measured local timing can vary.

## Gates, cost, and limits

`pnpm` was unavailable. Installed project binaries and repository-supported `node --import tsx` commands were used. ESLint, `tsc --noEmit`, **621/621 tests in 63 files**, rules validation, **48/48 meaning fixtures**, **13/13 voice fixtures**, frozen V10/V11/V13 replays, the 40-case V13 integrity replay, V14 unsafe boundary, frozen known-case replay, eight-case confirmation, fixture integrity tests, and `next build --webpack` passed. An initial full-test run exposed only the registry test's old “v14 is unknown” expectation; updating that expectation to v15 and rerunning yielded a fully passing suite. A simultaneous typecheck/build briefly raced over Next's generated `.next/types` files; typecheck passed when rerun after the successful build. Production was not deployed or pushed. Incremental paid API spend: **$0**. No local model ran.

The confirmation uses eight injected candidates, five semantic PASS responses from one account-backed model family plus the known-case response, and strict text substitution. It does not measure live frontier generation, broader rewriting quality, provider diversity, or the value of repairs on composite-date cases. The earlier four clearly good edits lost remain limitations to assess through product evaluation, not reasons to expand this authorization fix. Ambiguous temporal objectives and cases requiring unrelated editorial changes may still fall back; this is the intended conservative boundary for this small correction.

**CORE RECONSTRUCTION ARCHITECTURE FROZEN.** Next: have an independent team create and run blind Holdout V3. Afterward, shift work toward editor/model quality, writing quality, latency, cost, provider integration, UX, productionization, and shipping. No V15 verifier experiment is recommended.
