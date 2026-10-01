# Objective-conditioned editing feasibility development experiment

This is a **development** experiment, not a holdout or a reconstruction benchmark. Production remains `reconstruction-v1`. Frozen Holdouts V1 and V2 were not opened or run; Holdout V3 was not created. No metered API, local model, deployment, or push was used.

## Question and separation

Can the same source be safe for one explicit editing objective, partly safe for another, and blocked for a third? The prior source-only experiment could not isolate that question because some labeled jobs were hypothetical future work rather than requests to edit the supplied text.

Three account-backed creator sessions authored 60 synthetic sources in separate genre cohorts. Different sessions wrote the objective requests from source text alone. Blind first labelers saw only `sourceText` and `objective`; second labelers saw the same pair without first labels, creator intent, engine output, or implementation. None used a metered API or local model. The corpus is wholly synthetic.

The initial objective mix had too few single-purpose blocked requests. **Before freeze and before any semantic-model review**, a separate objective author wrote 24 combined requests and 36 factual requests from source text alone. The factual requests replaced one initial objective for 36 sources; their discarded first labels are not part of the frozen corpus. This is a pre-freeze development design correction, not a change made after seeing v3 results. An editorial audit warned that some requests read like missing-fact exercises. This limits ecological validity and is recorded rather than hidden.

Nine source pairs differ by one declared factual sentence. One isolated second review replaced an initial review for T087 because its source citation came from the paired version and did not exist in T087's source. That pre-freeze evidence failure and correction are recorded here; the first label was unchanged.

## Frozen input

The immutable input is in [objective-feasibility](../data/fixtures/objective-feasibility/manifest.json). The manifest is pinned by a test at SHA-256 `624a127be8dcf70ab46082edcc735bacc5b9d6ef2dfa9d8020fe4906443ae058`.

| Input | SHA-256 |
| --- | --- |
| sources.json | `397076ef6e73ab96ca198d86928e73ac94e8aa0d39fe21563075378682445a6f` |
| tasks.json | `3769e7b87a44ba29abbdb01030d0161f6bad3d58eae7be1f11583d4686e20d56` |
| labels.json | `e1bf522b80cc74e8e479314b39a0f07d3ac0b14b06ce0ac5733b878cc237bee3` |
| second-reviews.json | `d40031b6d0dca258fc2a785e969dd79f683a61ac4c5684e4f9420bf817bb5f5b` |
| disputes.json | `487044611b830a35b01e9af70cd6c4b922d0a45bcbad86af33a3669de959b447` |

There are **60 unique sources** and **168 source × objective tasks**. Forty-eight sources have three objectives and twelve have two. First blind labels: **91 FULLY_SAFE, 42 PARTIALLY_SAFE, 35 BLOCKED**. Second reviews cover all 42 partial and 35 blocked tasks plus 20 safe tasks: **97 tasks** in all. Feasibility agreed on **91/97** (partial **37/42**, blocked **34/35**, safe **20/20**); scope agreed on **77/97**. Disputes remain in the frozen input. Hard rates should exclude the six feasibility disputes, and scope results need caution because some editors used `LEAVE_ALONE` to mean execution blocked while others labeled the breadth of requested work.

The requested-job source evidence is validated as an exact source substring. Exact citations establish that text exists, not that a claimed fact is semantically entailed. Missing propositions were independently reviewed; deterministic code cannot prove semantic absence.

## Pinned v3 baseline, saved before v4

`semantic-review.v3` and `reconstruction-v7` were not modified. The evaluation harness transported the exact objective in the existing `plannerRationale` field as an `Author's note` and supplied a supported refinement note when it fit the 280-character product limit. Three longer objectives used a short refinement note pointing to the full objective in rationale. V3's system prompt and JSON schema were unchanged. The exact request bundle and raw output fingerprints are in [review-execution.json](../data/fixtures/objective-feasibility/review-execution.json). The one-shot replay is [v3-baseline.json](../data/fixtures/objective-feasibility/v3-baseline.json), SHA-256 `5362b422b358fe399b1c92d592225293b8dc1cefc9584f0f3b7db1357bd9cd84`.

| Blind feasibility | Valid v3 match | Other v3 outcomes |
| --- | ---: | --- |
| FULLY_SAFE (91) | 67 `SAFE_WITH_SOURCE` | 23 no-edit diagnoses; 1 `PARTIAL_ONLY` |
| PARTIALLY_SAFE (42) | 15 `PARTIAL_ONLY` | 16 `SAFE_WITH_SOURCE`; 11 no-edit diagnoses |
| BLOCKED (35) | 7 `NEEDS_INFORMATION` | 17 no-edit diagnoses; 11 invalid neutral-diagnosis/needs-information contradictions |

V3 named missing information in **all 42 partial tasks**, but did not reliably attach the gap to the requested operation. It named a gap in 24/35 blocked tasks and falsely named one in a fully safe task. All 24 valid blocked-task reviews led v7 to an `EDIT` execution decision because a user refinement creates deterministic local edit pressure; the 11 invalid raw reviews are counted separately. No text was actually rewritten.

On valid same-source task pairs, v3 changed its feasibility answer correctly for **66/96** gold-changing pairs, missed 30, stayed stable for **25/40** gold-stable pairs, and changed spuriously for 15. On 15 exact-objective source pairs differing by one fact, it got **8/8** expected changes and **5/7** expected stable pairs. This shows real source reading, while exposing the limits of a document-level feasibility value. Pair counts are correlated, not independent observations.

The baseline demonstrates a contract conflict: `LEAVE_ALONE` source diagnosis cannot coexist with `NEEDS_INFORMATION` in v3's validator. It does **not** prove that changing the JSON shape alone will fix objective interpretation. V3 already has `PARTIAL_ONLY`; sixteen partial tasks were still called fully safe. The versioned v4 comparison tests the job-level hypothesis rather than presuming it true.

## Versioned v4 comparison

`semantic-review.v4` and experimental `reconstruction-v8` add an exact objective field and source-bound requested jobs. Overall feasibility is derived from validated job states. Safe additive factual operations are rejected; a job coupled to blocked work is withheld. Authorization here is provisional planning only: no reconstruction model receives these jobs in this experiment, and future generation still requires independent meaning verification. V3, v7, and production v1 remain pinned.

The v4 prompt inherits some legacy v2 wording about document-level fields that v4's strict output schema does not contain. The one-shot comparison was run with that pinned prompt. Its effect is a limitation of this experiment; it was not edited after review execution began.

## One-shot v4 result

After the frozen input and v3 baseline were saved, fourteen account-backed reviewer batches processed the same 168 tasks once with the versioned v4 prompt. The request bundle SHA-256 is `104ba4fd5825ecb5147e608e60db949119391d4a26384864052aabcf9466f969`; the saved raw-review SHA-256 is `c5ea394eaf38ec6c139052c2c008ccec1790f9d92ab2158a423b92355fa2d0a8`. [v4-review-execution.json](../data/fixtures/objective-feasibility/v4-review-execution.json) records both. The deterministic [v4-audit.json](../data/fixtures/objective-feasibility/v4-audit.json) has SHA-256 `f8328f47f79b71a1a007f01995860e695ccb1a6a221d336e8533dcd38ed382a0`. No prompt, threshold, or review was revised after the run.

| First blind feasibility | Valid v4 match | Invalid review |
| --- | ---: | ---: |
| FULLY_SAFE (91) | 84 | 7 |
| PARTIALLY_SAFE (42) | 38 | 4 |
| BLOCKED (35) | 31 | 4 |

All **153 schema-accepted reviews** matched their first blind *aggregate feasibility* label. This is a constructed development result, **not 153 safe or complete plans**. Fifteen reviews failed validation and were blocked pending review. Eleven of those failures came from one reviewer batch; many combined `noEditReason` with jobs, reflecting ambiguity about whether the field means the source prose needs no edit or the user's requested objective is already satisfied. The source diagnosis may be `LEAVE_ALONE` while a requested operation is valid; the output field did not consistently express that distinction. Invalid reviews were not repaired or rerun.

Excluding the six tasks where the two blind reviewers disagreed on feasibility leaves **162 unambiguous tasks**: v4 matches **84/91 fully safe**, **33/37 partial**, and **30/34 blocked**, with the other 15 invalid. Among these 162, v3 matches **67/91 fully safe**, **15/37 partial**, and **7/34 blocked** under the v3 comparison mapping; neutral no-edit diagnoses and invalid reviews are shown separately in the saved baseline. The disputed six are retained in the raw tables for reproducibility, not counted as hard successes.

Accepted plans contain **217 SAFE and 71 BLOCKED jobs**. Among accepted partial tasks, 60 jobs were SAFE and 38 BLOCKED; each of those 38 tasks retained at least one provisionally authorized safe job. Accepted blocked tasks authorized zero jobs. Six accepted safe tasks returned `UNCHANGED`. The first blind labels contained 277 SAFE and 79 BLOCKED jobs, but these counts cannot be divided into job recall: reviewers split and merge requested operations differently, and exact requirement matching is not semantic requirement coverage. An independent audit below is the safer measure of plan quality. Additive factual operations cannot validate as SAFE, but a non-additive job can still imply a fact that the source does not support.

For comparable valid same-source pairs, v4 changed feasibility correctly in **99/99** gold-changing pairs and remained stable in **35/35** gold-stable pairs; 22 pairs were incomparable because at least one review was invalid. In the one-sentence source fact pairs, it made **7/7** expected changes and **6/6** expected stable decisions; two pairs were incomparable. These repeated pairs share documents and are not independent observations. This demonstrates objective and source sensitivity on this development design, subject to the job-quality limits below.

The v4 result has **zero substantive requested-scope or final-scope decisions**. Eleven first labels called for substantive scope; four were invalid and seven valid v4 reviews selected distributed light. Only two of the eleven had a second scope review, and both second reviewers chose distributed light. The scope gold is therefore weak. The run neither demonstrates reliable substantive discrimination nor proves that v4's substantive gate is impossible. The prompt's `COUPLED` job relation combines dependence on blocked work with global restructuring, which makes the scope signal ambiguous; blocked-dependent safe jobs are correctly withheld. This is a contract limitation to test on new material.

## Independent plan audit and adjudication

Nine separate account-backed auditor batches reviewed every source, objective, blind label, and v4 plan. Their [raw findings](../data/fixtures/objective-feasibility/independent-audit-raw.json) have SHA-256 `87b0eb670a8e6ffbfcc3f4bc722c56a9a062290048d19711a8514fe50809740c`. The raw verdicts were 110 supported, 55 issue, and 3 ambiguous. The main agent checked all 58 flagged tasks against the source and objective, recording 31 accepted, 22 rejected, and 5 ambiguous in [adjudication](../data/fixtures/objective-feasibility/independent-audit-adjudication.json), SHA-256 `dedf5eedff08503fbe40ccb7c9ab50fe9a6572d36d4e44db475754f970e7730e`. **Twenty of the accepted defects occur in schema-valid plans; eleven occur in invalid plans that safely withheld useful work.**

The accepted defects include omitted objective constraints or source qualifications, unsupported source entailment, and safe work lost to schema invalidity. T019 risks presenting a permit-timeline agenda topic as an existing decision. T142/T143 describe a planned museum correction that the source only discusses conditionally; these are direct unsafe-authorization candidates. Other accepted risks include losing a retention exception (T065/T066/T068), treating lack of recorded outreach as proof of no outreach (T094), and overstating a preliminary improvement (T101). Exact source spans prove quotation, not that a proposed edit follows from the quote. No reconstruction was run, so these are plan risks rather than observed changes to output text.

Nine accepted `UNNECESSARY_BLOCK` findings came from schema-invalid reviews withholding source-backed jobs. The blocked-job schema requires both a named missing proposition and prohibited inference; all 71 accepted blocked jobs met that structural requirement. The audit did not establish a reliable semantic recall denominator for either SAFE or BLOCKED jobs, nor a complete count of false missing-fact claims. One missing-fact dispute (T064) remained ambiguous. These are unmeasured outcomes, not zero-error claims.

The largest rejected audit class treated the objective's request to *ask the writer for a missing fact* as another text-editing job. V4 generally named the missing proposition and blocked its insertion, so the omission does not change the editing-job feasibility finding. The critique remains valid for a future full product flow: such a request needs a user-facing question, separate from rewriting. T026 was correctly blocked because the approver was absent. Five tasks remain genuinely ambiguous. No disputed label or audit finding was silently converted into agreement.

A separate independent methodology and code reviewer checked the diff and result interpretation. It confirmed the arithmetic, warned that valid aggregate labels are not planning accuracy, identified the `noEditReason` conflict and missing semantic requirement coverage, and questioned the ambiguous coupling field. These findings are accepted. Its claim that substantive scope is *structurally unreachable* is too broad: an eligible globally coupled SAFE job can reach the gate, as the unit test shows; the **observed zero** and unclear coupling semantics are the supported conclusion. It also warned that the replay's no-provider guarantee does not cover future callers of the exported structured adapter. That warning is accepted. Audit artifacts are fingerprinted here but, unlike the five frozen inputs, are not pinned by the corpus manifest.

## Safety and architecture decision

The experiment supports **versioning the job-level contract as an experimental planning hypothesis**: source × objective feasibility is representable as separately validated SAFE and BLOCKED requested jobs, with the aggregate derived from them. It does **not** establish that v4 can safely authorize all such jobs. The schema checks exact objective substrings and source quotes; it cannot prove that every requested requirement was captured, that quoted evidence entails an edit, or that a missing proposition is truly absent. These semantic limits caused accepted audit defects. The `authorizedJobIndices` field is provisional evaluation output and is not connected to a reconstruction call. A future rewrite must still obey protected-content and independent meaning verification. Invalid, timed-out, or unavailable review blocks this experimental job plan. Production `reconstruction-v1`, pinned v3/v7, and deterministic strategies remain unchanged.

The existing evaluation cost guard denies known metered frontier, worker, and judge routes by default in tests. The new request/replay commands construct **no model provider**; account-backed agents produced the saved reviews. Incremental metered API spend for this experiment was **$0**. No second model family was positively verified as zero incremental cost, so this is a single-family validation. The account route did not expose comparable token, model-setting, or wall-latency metadata; none is estimated. Production telemetry contains job counts, disposition, model identifier, token fields when provided, and latency; no raw source or objective text. Saved synthetic development artifacts intentionally contain their synthetic text.

**Holdout V3 decision: NO-GO.** Aggregate feasibility is promising, but plan completeness and evidence support failed independent review; substantive scope was never selected and its gold labels were not stable. The exact next experiment is a **fresh, independently labeled development set of globally coupled source × objective tasks**, with explicit preservation constraints and fact qualifications. Evaluate whether a new versioned contract can enumerate every material request and require independent source support for each proposed action, including a separately testable global-coupling signal. Compare against the pinned v4 on that new material before considering Holdout V3. No additional run on this initial set is planned.

## Verification

The frozen-input integrity command, pinned v3 and v4 deterministic replays, existing discourse and semantic development replays, editing-job and scope-validation replays, **48/48 meaning** fixtures, and **13/13 voice** fixtures passed. `pnpm lint`, `pnpm typecheck`, `pnpm test` (**541/541 tests in 47 files**), `pnpm rules:validate` (**64 valid rules**), and the documented `pnpm build --webpack` production build passed. An initial *parallel* typecheck overlapped with webpack's `.next/types` regeneration and failed with missing generated files; rerunning typecheck sequentially after the build passed. No product behavior was changed to hide that environment race. This backend and evaluation-only change does not need browser verification.
