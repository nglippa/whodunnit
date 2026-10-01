# Objective-aware verification: V11 development experiment

Production remains `reconstruction-v1`. V10 and all earlier experimental versions remain pinned. V11 uses the V10 frontier editor and one-repair limit. Its new verifier path compares **source, explicit objective, and candidate**. No holdout, local model, paid API, deployment, or push was used.

## Change and boundary

`verifyObjectiveAware` starts with the existing deterministic source/candidate verification. It downgrades only a matched finding for which the objective explicitly names the new date, quantity, or actor, or where narrow structure/framing logic explains the finding. Each downgrade remains visible as `AUTHORIZED_CHANGE`, and the independent `verify.v3` prompt checks all remaining facts. Unmatched hard findings still fail. Sequential line-leading checklist markers can be layout; numbers within steps remain protected. A small non-propositional opening may be removed when its proposition survives; meaningful qualifiers are not stripped. The candidate is still verified after a single local repair. Schema-invalid verifier responses fail closed with `verifier-malformed`, separately from semantic rejection. Repair traces distinguish source restoration, accepted non-source repair, and failed repair. `USEFUL_REPAIR` is an automated proxy and needs editorial audit.

After the saved replays, a targeted security check showed that mentioning a candidate date in an unrelated objective clause could otherwise authorize changing a different event's date. The V11 match now requires an old date mentioned in the objective or nearby subject evidence shared with the source sentence. This was a safety correction, not a response to a scored replay case. The regression test covers the unrelated report-deadline/meeting example. Replaying both saved sets after the correction changed **no candidate, finding, review, final text, or decision field**; only timing fields varied. The original replay artifacts remain the reported baseline.

This is a surgical verifier change. It adds no planning ontology, rule pack, model routing, production route, or source text to telemetry. The evaluation harness uses saved account-backed agent responses through fake `StructuredCaller` implementations; it is **not a live API transport benchmark**. The editor and verifier agents were separate calls, but both belonged to the same model family. Tokens and provider latency are unavailable; incremental API cost was **$0**.

## Frozen 28-case V10 boundary regression

Inputs and original blind labels are unchanged, validated by the existing manifest. The original 14 deliberately unauthorized candidates are `vb01`–`vb14`. The other 14 include 13 agreed-good edits and one disputed conditional compression (`vb22`). Two source/candidate pairs vary only their objective. V10's stored baseline exactly matched the current V10 replay on final text, findings, reviews, and decision fields.

| Measure | Pinned V10 | V11 |
| --- | ---: | ---: |
| Unauthorized control changes reaching final output | 0/14 | 0/14 |
| Agreed-good edits lost | 5/13 | 1/13 (`vb26`) |
| Explicit objective-authorized updates accepted | 2/4 | 4/4 |
| Paired objective switches correct | 2/2 | 2/2 |
| Deterministic PASS / REVIEW / FAIL | 12 / 7 / 9 | 12 / 11 / 5 |
| Initial semantic PASS / LOCAL_REPAIR / REJECT | 8 / 7 / 4 | 12 / 9 / 2 |
| Repair attempts | 11 | 12 |
| First candidates accepted | 8 | 12 |
| Source fallbacks | 13 | 15 |

The 14 unsafe controls all remained safe, but V11 fell back on all 14; V10 retained six safe source-restoring repairs. V11's only accepted boundary repair was `vb22`. It preserves the two explicit temperature outcomes, but its usefulness is disputed and the automated `USEFUL_REPAIR` label should not be treated as editorial proof. V11 made 11 failed repair attempts and recorded two malformed post-repair verifier outputs. Eight failures involved a return to source that the verifier rejected for not meeting the editing objective. `vb26` remains the agreed-good rejection: a strict weather-phrase concern followed by a malformed post-repair response. Empty framing (`vb17`), checklist numbering (`vb24`), and hard-authorized factual changes (`vb27`–`vb28`) now pass. Email formatting (`vb18`) and the separate “if possible” diagnostic were already accepted in V10 and remain regression controls.

## Fresh actual editing replay

The fresh source/objective corpus was frozen **before editor execution** at SHA-256 `d322205c1b1d09cf205a2066b06a0d305c283ac16cacaf2b07877fba65480f3c`. It contains 32 newly authored synthetic cases: four already-good, six casual/personal, five professional/email, four academic/technical, four generic/sloppy, four voice-sensitive, and five explicitly authorized factual updates. Six cases are medium length; the others are short. No real/private/user/patient writing was used. Two independent account-backed editors each generated one candidate for 16 cases with the pinned V10 editor contract. Independent verifier calls and a separate local repair/reverification handled the resulting candidates. The saved replay hash is `ffd6b4b6a035c56e6da0f9588b0419c0aca51361257da530981db983b86e6aba`.

The verifier saw 29 initial requests and returned 19 PASS, 10 REJECT, and no LOCAL_REPAIR. Three candidates hard-failed deterministic checks; one received a local repair and passed full re-verification. The final V11 outcomes were six unchanged, 13 first candidates accepted, one repaired, and 12 source fallbacks. **Thirteen raw candidates were byte-identical to source**; seven of those still ended as source fallbacks after the verifier found the objective unmet. V11's deterministic verdicts were 23 PASS, six NEEDS_REVIEW, and three FAIL. No malformed verifier output occurred in this fresh replay.

Blind reviewers saw only source, objective, raw candidate, and final text. A second independent review of the first 16 cases agreed on every binary dimension. Review results:

| Editorial measure | Raw candidate | Final V11 output |
| --- | ---: | ---: |
| Useful for the objective | 27/32 | 22/32 |
| Objective satisfied | 27/32 | 22/32 |
| Unauthorized meaning preserved | 32/32 | 32/32 |
| Unsupported information | 0/32 | 0/32 |
| Voice preserved | 32/32 | 32/32 |
| Overedited | 0/32 | 0/32 |
| Underedited | 5/32 | 10/32 |

The first blind pass labeled **zero** naturally generated raw semantic errors. An independent post-result audit found real meaning drift in `oa11` (necessity weakened), `oa26` (a statement became a promise), and `oa18` (the recommendation weakened from “should” to “can”); it called `oa21`'s softened visibility claim debatable. V11 caught all three clear issues, repairing `oa18` while retaining a shorter research summary. Thus there were **no observed bad-edit escapes**, but the sample is too small and low in naturally unsafe edits to estimate an escape rate. The controlled boundary set supplies the deliberate safety probe.

The blind pass marked five useful raw edits lost: `oa11`, `oa15`, `oa21`, `oa22`, and `oa26`. The independent audit judged only `oa15` and `oa22` clear false rejections, `oa21` debatable, and `oa11`/`oa26` justified semantic rejections despite their stylistic improvements. `oa21` and `oa22` hard-failed on claim/number extraction; the other three were rejected by semantic review. The verifier also rejected byte-identical candidates in `oa24` and `oa25` even though the originals were already good; the resulting source fallback did not degrade the text. All four already-good cases were left byte-identical by the editor and final output.

The five explicit factual-update requests (`oa28`–`oa32`) are a separate limitation: the frontier editors returned the **source unchanged in every case**. The verifier rejected those unchanged candidates for not meeting the objective and fell back to source. Thus this replay contains **zero naturally attempted authorized semantic changes** and cannot validate natural-generation acceptance or collateral-change handling; the controlled objective pairs do validate the verification boundary. These five finals preserve the source's old facts, but they fail the user's newly authorized updates. This is an editor-contract limitation, not evidence that V11 rejected a generated authorized update.

## Interpretation and next step

The controlled regression supports narrow semantic authorization without an observed unsafe escape, and V11 retains four additional agreed-good edits. The fresh replay exposes two clear and one disputed useful-edit rejection, plus five explicit factual updates left undone by the editor. The current result therefore does **not** justify freezing the architecture or creating Holdout V3. The main next experiment should be a small, fresh actual-edit replay that clarifies the *editor* contract about explicit user-authorized factual updates and independently audits collateral changes; separately, investigate the `oa15`/`oa22` false positives. Preserve this replay as development evidence, and do not tune against frozen holdouts.
