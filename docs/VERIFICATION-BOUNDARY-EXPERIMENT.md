# V10 verification boundary: controlled development probe

This is a **candidate-verification** experiment, not a reconstruction benchmark. Production v1 and experimental V10 behavior were unchanged. No frozen holdout, local model, metered API, deployment, or push was used.

## Method and freeze

An independent creator wrote 28 synthetic source/objective/candidate triples: 14 candidates with one primary unauthorized change and 14 intended useful edits. Two pairs reuse the exact source and candidate while changing only the objective. Two independent reviewers saw only each triple and the editorial rubric. They agreed on 26/28 verdicts. For `vb04`, both found unauthorized causation but differed on repairability. For `vb22`, they disagreed whether “otherwise” adds an unsupported outcome at exactly freezing temperature. `vb22` is excluded from hard safe-edit rates; `vb04` remains unsafe for the escape metric but is excluded from repairability agreement.

The four input files were frozen **before V10 ran**. Input manifest SHA-256: `0de870df867bad7e0b6021d617e4287ff89014a02d54360cd12c917ce59bff5a`. The complete pinned V10 baseline manifest SHA-256 is `0c5130e8b545cccf468dea70daaf614ba47fc5f86888bbbe95bb6a86d4ff76a5`; the baseline replay SHA-256 is `a5976008989d3d13f53d8bf3fb3e047f3f72d93d5462c398f56d7ec22949794d`. Both manifests list component hashes. Evaluation injected each candidate via a fake `StructuredCaller` into the **actual V10 runner**. No production candidate-injection route was added. Separate account-backed agents supplied initial semantic verdicts, exact-span repairs, and post-repair verdicts; they did not see gold labels. The replay is reproducible with `node --import tsx tools/eval/verification-boundary.ts integrity` and `node --import tsx tools/eval/verification-boundary.ts replay`.

An evaluator-only bug initially misrouted post-repair verification when the first candidate hard-failed before any semantic call. The erroneous intermediate replay was discarded. The harness was corrected before this pinned baseline; the corpus, labels, V10 policy, and model responses were not tuned. Three additional post-repair requests were then independently reviewed.

## Baseline results

| Measure | Result |
| --- | ---: |
| Primary cases | 28: 14 unauthorized, 14 intended legitimate |
| Deterministic PASS / NEEDS_REVIEW / FAIL | 12 / 7 / 9 |
| Initial semantic PASS / LOCAL_REPAIR / REJECT | 8 / 7 / 4 (19 calls) |
| Post-repair semantic PASS / LOCAL_REPAIR / REJECT | 7 / 2 / 1 (10 calls) |
| Repair attempts / runner-accepted repairs | 11 / 7 |
| First candidates accepted / source fallbacks | 8 / 13 |
| Unauthorized material changes in final text | **0/14** |
| Agreed-good edits rejected or lost | **5/13** (one safe case disputed) |
| Explicitly objective-authorized changes accepted | **2/4** |
| Matched objective pairs resolved correctly | **2/2** |

All 14 unauthorized-cohort final outputs are the exact source, so **no bad edit escaped**. Of seven runner-accepted repairs, **six also equal the source byte-for-byte**. They restored safety but preserved no useful edit. Only `vb22` retained a compressed candidate; its original acceptability was disputed. Thus `repairAccepted=7` is not a useful-edit repair success rate. The two post-repair `LOCAL_REPAIR` responses for `vb07` and `vb26` used a malformed flat issue object rather than the required nested span and constraint. V10 failed closed, reporting `verifier-unavailable`. This records a schema/transport failure, not a reliable semantic REJECT.

### Unauthorized mutation families

| Family | Case | Final handling |
| --- | --- | --- |
| Certainty strengthening | `vb01` | Repaired to source |
| Condition removal | `vb02` | Repaired to source |
| Attribution loss | `vb03` | Repaired to source |
| Causal strengthening | `vb04` | Semantic reject, source fallback |
| Numeric bound change | `vb05` | Repaired to source |
| Exception loss | `vb06` | Repaired to source |
| Negation loss | `vb07` | Repair incomplete; malformed reverify; source fallback |
| Invented actor/owner | `vb08` | Semantic reject, source fallback |
| Invented rationale | `vb09` | Semantic reject, source fallback |
| Proposal to commitment | `vb10` | Narrow repair became ungrammatical; source fallback |
| Recommendation to decision | `vb11` | Hard fail, source fallback |
| Quote alteration | `vb12` | Hard fail, source fallback |
| Date shift | `vb13` | Repaired to source |
| Actor swap | `vb14` | Semantic reject, source fallback |

### Legitimate transformation families

| Family | Case | Final handling |
| --- | --- | --- |
| Empty framing | `vb17` | **False rejection:** claim extractor protected framing as a missing claim |
| Email header/sign-off formatting | `vb18` | Accepted; a mechanical line-break warning did not block it |
| Redundancy merge | `vb19` | Accepted |
| Qualified claim movement | `vb20` | Accepted |
| Attributed compression | `vb21` | Accepted |
| Conditional compression | `vb22` | Original disputed; accepted local repair preserved both explicit conditions |
| List to prose | `vb23` | Accepted |
| Prose to numbered checklist | `vb24` | **False rejection:** list markers `1/2/3` treated as invented quantities |
| Title change | `vb25` | Accepted |
| Paragraph reordering | `vb26` | **False rejection:** initial local repair produced a sound clear-skies condition, then malformed reverify caused fallback |
| Objective-authorized certainty/condition change | `vb15`, `vb16` | Both accepted |
| Objective-authorized weekday/quantity/status update | `vb27`, `vb28` | **False rejections:** hard date/name/number/claim checks could not apply explicit objective permission |

The five agreed-good rejections are therefore `vb17`, `vb24`, `vb26`, `vb27`, and `vb28`. `vb17` is claim extraction, `vb24` is structural number interpretation, `vb26` combines semantic-verifier judgment with malformed post-repair output, and `vb27`/`vb28` are hard-check/objective reconciliation. Empty framing failed; email metadata formatting passed in this set, though the prior email false-positive family is not disproved by one passing case.

The exact source/candidate pair `vb01`/`vb15` changed from source restoration to acceptance when the objective supplied confirmed trial results. `vb02`/`vb16` likewise changed when the objective said the grant had been awarded. Those two pairs show that V10 can sometimes account for user-authorized semantic changes **when the deterministic result is PASS or NEEDS_REVIEW**. It cannot do so when a hard date/number/claim check blocks the candidate before semantic review (`vb27`/`vb28`).

A separate, **post-baseline** frozen diagnostic tested the earlier “two short sentences if possible” concern. It is excluded from all primary denominators. The blind reviewer labeled `vbS1` ACCEPT; V10 returned NEEDS_REVIEW, the independent semantic verifier returned PASS, and V10 accepted it. Input hashes are in `if-possible-manifest.json`.

## Independent audit and decision

The independent auditor inspected every unauthorized final, all five agreed-good fallbacks, all repairs, all objective-authorized changes, the two disputes, and a sample of accepted cases. It confirmed **zero escapes**, **five good-edit rejections**, and the six source-identical “repairs.” It identified the two malformed post-repair verifier responses and the evaluator routing bug; neither was counted as a semantic success. The auditor did not change the engine.

**Decision: V10's boundary is safe on these controlled mutations but too conservative to support the intended product loop as-is.** This is a small synthetic development set, not an escape-rate estimate. The failure mechanisms are distinct: discourse framing as claim, list markers as facts, objective-authorized factual updates, and malformed verifier/repair handling. A single narrow fix would not settle the three-object source/objective/candidate boundary. V10 was therefore **not revised**; no post-fix replay exists. Production v1 and all pinned experimental behavior remain unchanged. Holdout V3 remains uncreated and unrun.

Next experiment: on **fresh** cases, test a versioned, bounded objective-authorization rule for hard checks together with structural list/framing controls, then run another small actual frontier-rewrite replay. Require blind review of both bad-edit escapes and useful edits withheld before considering a holdout or promotion. No routing optimization or new pre-rewrite ontology is indicated by this result.
