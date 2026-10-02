# Directive-scoped temporal authorization: V15 confirmation

## Decision and scope

`reconstruction-v15` is an experimental verifier variant. It preserves V14's editor prompt, semantic review, repair flow, and fallback, while allowing an exact requested temporal expression replacement when a separate preservation directive uniquely protects another source fact. Production remains `reconstruction-v1`; V14 and its published behavior remain available.

The motivating counterexample is: “Do not change the audit. Move the review to Wednesday, October 7.” Given separate review and audit dates, changing only the review's complete weekday/date expression is authorized. V14 rejects that candidate because it treats the unrelated negative directive as a global prohibition. V15 reaches the unchanged semantic verifier and accepts the candidate when that verifier returns PASS.

## Boundary

V15 first runs V14 verification. Its additional grant requires one exact whole-document substitution of an extracted temporal expression, an affirmative directive containing the complete replacement, and a unique source target. It cannot infer a weekday or year or authorize collateral text. Preservation directives are split at sentence, semicolon, contrast, and explicit directive conjunction boundaries. A global date prohibition, a same-target protection, an unidentified protected fact, or a protected event sharing the changed expression blocks the candidate. A contradictory protection also revokes an earlier V13/V14 date grant. Non-temporal exact-delta verification is unchanged.

The verifier uses deterministic source, objective, and candidate text only. Source text and model output remain untrusted. The independent semantic verifier still decides whether an otherwise permitted candidate is acceptable; an injected synthetic PASS is used only to probe the deterministic boundary in the new saved-candidate cohorts.

## Frozen confirmation and replay

`node --import tsx tools/eval/directive-scoping-confirmation.ts integrity` verifies SHA-256 manifests for the ten initial cases, two blind-label files, and five later adversarial cohorts. The two initial blind reviewers agreed on all ten authorization and disposition labels before verifier execution. Each adversarial cohort was frozen before its replay. No frozen case or label was changed during the final pass.

`node --import tsx tools/eval/directive-scoping-confirmation.ts replay` injects saved candidates into V14 and V15 runners. It uses saved semantic responses for the nine historical composite cases and fourteen original unsafe boundary cases. The 23 new cases use synthetic semantic PASS responses so that a deterministic authorization error is visible; this is not independent semantic approval or a live model benchmark.

| Cohort | Cases | V15 result |
| --- | ---: | --- |
| Initial blind-labeled | 10 | 4 authorized candidates accepted; 0 label mismatches |
| Adversarial | 6 | 1 authorized candidate accepted; 0 label mismatches |
| Punctuation, shared expression, ambiguity | 7 | 0 label mismatches |
| Historical V14 composite, including `ar04` | 9 | 0 accepted-candidate regressions |
| Original unsafe boundary | 14 | 0 V15 escapes; V14 also had 0 |

The ambiguity cohort exposed one real V15 miss before completion: `du02` (“Keep the event unchanged” with only one source event) was accepted because V14 had already granted the date change. V15 now treats an unidentified protection in a one-claim source as potentially naming that claim, regardless of an earlier grant. The pinned historical composite cohort still has zero accepted-candidate regressions. A focused test covers the prior miss. The final replay has no label mismatches across all 23 new cases.

The replay records the full per-case V14/V15 findings, outcome, call counts, and local timings. Timings vary between runs. No model or network call is made, no user documents are loaded, and no frozen holdout is run.

## Validation and limits

The final pass completed ESLint, TypeScript typecheck, and 662 tests across 64 files. Fixture integrity and replay passed. The production build reached Next's font fetch but failed because the sandbox could not reach Google Fonts for the three configured font families. The build was not confirmed in that environment.

This is a narrow deterministic authorization confirmation, not evidence of live editor quality, independent semantic judgment for the new cohorts, provider diversity, latency, or repairs on newly authorized cases. The conservative behavior can still return the source for ambiguous objectives. V15 is not promoted to the production route.
