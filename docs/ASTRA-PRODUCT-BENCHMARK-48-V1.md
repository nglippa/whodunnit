# Astra product benchmark 48 v1 — final results

**Decision: D — neither Whodunnit architecture is good enough.** Candidate C should not replace V15. V15 remains the existing implementation, but this benchmark does not clear it as a safe editing architecture: both V15 and C left superseded current facts in final text. Astra was the stronger editor on this corpus.

This is an internal descriptive product benchmark over the frozen 48-case corpus. The four frozen arms supplied 192 outputs: SOURCE, V15, Candidate C, and GPT-6 Astra, with 48 outputs each. The original output matrix is commit `d9d98302bd1e8a89a65bc76ec1eccda26df79cb6`. Candidate C received the exact saved V15 RAW bytes in all 48 cases. No editor output changed during judging.

## Blind measurement

Two independent sessions requested `gpt-6.1-sol` with High reasoning. Each saw a separate deterministic randomization of anonymous item and pair packets containing SOURCE, OBJECTIVE, and output text. They saw no arm identities, traces, RAW provenance, prelabels, peer judgments, or expected winner. Runtime model and effort metadata were not exposed by the judge system, so the requested settings are recorded without claiming a separate returned-model proof. SOURCE equality and identical output texts made some identity inference possible.

Judge J1 and J2 each rated 192 items on meaning preservation, objective satisfaction, writing quality, voice, restraint, factual integrity, collateral damage, and preference over SOURCE. Each also rated 240 anonymous pairs, including the five comparisons in the existing design. Both original judgment sets were hashed and frozen before the arm mapping was decoded. Their material and preference disagreements went to one fresh blind adjudicator, who reviewed only the 62 affected items and 53 affected pairs across 29 cases. Original ratings remain intact. The adjudications were frozen before their mapping was decoded. One case, `AC48V2-009`, retains an unresolved stale-fact label for SOURCE, V15, and C.

Original judge agreement: **159/192 items** matched on all eight required dimensions; meaning matched on 190/192 and objective completion on 183/192. Pairwise preference matched on **190/240**, and paired safety on **226/240**. The disagreement and adjudication records remain available with the per-case evidence.

Text safety requires preserved meaning and authorized facts, no confirmed harmful edit, and no confirmed zero-tolerance class 1–4 event. A minor collateral quality concern without material factual or meaning harm is reported separately; it is not converted into a safety failure. The blind judgments assess the output text. They do not establish what a separate product status or disclosure interface would communicate.

## Primary paired results

| C versus V15, all 48 | Cases |
|---|---:|
| Both text-safe | 32 |
| C safe, V15 unsafe | 0 |
| V15 safe, C unsafe | 3 |
| Both unsafe | 12 |
| Both unresolved | 1 |

Among the 32 jointly safe cases, **C was preferred 0, V15 was preferred 1, and 31 tied**. C's three safety losses were `AC48V2-022`, `AC48V2-030`, and `AC48V2-032`: V15 completed supplied factual replacements while C returned the superseded SOURCE. C also missed the localized edit in `AC48V2-036`, which V15 completed safely. There was no corresponding case in which C was safe and V15 unsafe.

| C versus Astra, all 48 | Cases |
|---|---:|
| Both text-safe | 32 |
| C safe, Astra unsafe | 0 |
| Astra safe, C unsafe | 15 |
| Both unsafe | 0 |
| C unresolved, Astra safe | 1 |

Among the 32 jointly safe cases, **Astra was preferred 18, C was preferred 3, and 11 tied**. C's three wins were `AC48V2-002`, `AC48V2-020`, and `AC48V2-039`; they concern a restrained guide edit, a voice-sensitive personal account, and a sound-recording policy memo. Astra's clearest advantages were supplied updates, broad reconstruction, and ambiguous or contested information.

## Objective, restraint, and safety

| Measure | SOURCE | V15 | C | Astra |
|---|---:|---:|---:|---:|
| Objective YES | 10/48 | 22/48 | 18/48 | 39/48 |
| Supplied updates completed | 0/8 | 2/8 | 0/8 | 8/8 |
| Text-safe | 31/48 | 35/48 | 32/48 | 48/48 |
| Superseded current facts left as completed text | 16 | 12 | 15 | 0 |
| Final identical to SOURCE | 48 | 27 | 30 | 11 |
| Already-good cases left unchanged | 8/8 | 3/8 | 2/8 | 8/8 |

The one unresolved safety case is additional to each of SOURCE, V15, and C's safe and unsafe counts. Among eight already-good cases, both original judges agreed Astra made no unnecessary edit. They disagreed on whether two V15 and two C edits were unnecessary; those style disagreements remain visible. C fell back to SOURCE in 20 cases for which another editor produced an independently judged safe, objective-complete edit; V15 did so in 16, and Astra in one. This is an opportunity count, not proof that either architecture could have produced the other editor's exact text.

Confirmed zero-tolerance counts were: stale current facts as completed text, **V15 12 / C 15 / Astra 0**; invented missing replacements, **0** for all arms; collateral factual mutation, **0**; material unauthorized meaning change, **0**; confirmed harmful edits, **0**; and harmful accepted repairs, **0**. V15 and C each accepted two repairs, all four of whose final texts were judged safe. Minor collateral quality concerns occurred in one shared V15/C case and one Astra case; they were not material safety events. `AC48V2-009` remains unresolved on the stale-fact label.

## RAW retention and secondary comparisons

V15 generated RAW for all 48 cases; RAW differed from SOURCE in 41. V15 returned RAW verbatim in 27 cases, C in 23. Restricting to changed RAW that was both text-safe and objective-complete, the verbatim count was **18 for V15 and 14 for C**. No case showed C preserving a verbatim, safe, objective-complete RAW edit that V15 discarded to SOURCE. C's only non-SOURCE final where V15 returned SOURCE was the already-good `AC48V2-028`, so it does not establish recovery of a needed edit. V15 returned SOURCE in 24 trace outcomes; C in 28.

Among jointly safe V15/Astra cases, Astra was preferred **17**, V15 **3**, and **15** tied. For C/SOURCE, C was preferred **10**, SOURCE **2**, and **19** tied; for Astra/SOURCE, Astra was preferred **20** and **11** tied. V15/SOURCE was measured by blind item ratings rather than a dedicated pair: among 31 jointly safe cases, 10 favored V15, 17 tied, and the two judges disagreed on four.

## Product decision

**Candidate C does not materially outperform V15 and did not preserve the hoped-for safety advantage.** It completed four fewer objectives, made three additional unsafe text outcomes, and lost two supplied updates that V15 completed. Among jointly safe C/V15 cases, it earned no preference win. Astra was safe on all 48 texts and substantially ahead on completion and preference. C can match or occasionally beat Astra on restrained or voice-sensitive cases, but those wins do not offset the update and fallback failures.

**Neither V15 nor C meets a zero-tolerance text-safety bar on this corpus.** The practical decision is to **not advance C**. Keeping the current V15 implementation is an interim state, not a claim that V15 passed the benchmark. These 48 internal cases do not estimate rare-event safety or establish a universal model ranking. The text-only design also does not evaluate whether a visible fallback disclosure changes the product user's interpretation of an unchanged source.

Machine-readable evidence is under `data/evaluation/astra-product-benchmark-48-v1/blind/`: packet and mapping manifests, locked original judgments, locked adjudications, per-case decoded results, aggregate results, safety and preference results, RAW retention, product conclusion, and integrity hashes.
