# Holdout V3: frozen V15 results and final interpretation

**Decision C: frozen V15 is too conservative for product use.** The final material interpretation loses 25/68 safe, materially useful raw edits (36.8%), including 8/12 correct explicit updates (66.7%). Replay returns source fallback in 47/119 cases (39.5%). All 13 confirmed BAD_RAW rewrites are caught, with zero confirmed BAD_RAW escapes; that safety result does not establish product readiness. Production remains V1. No V16, prompt/schema changes, strategy promotion, or remediation is part of this evaluation.

This report distinguishes immutable blind observations, selected post-unblind mandatory audits, supplemental blind ratings selected after outcomes were known, and final post-unblind adjudication. The final archive seals authored bytes and hashes; it is **not preregistration of adjudication**. Original labels and disagreement flags remain unchanged.

## Frozen protocol and transport

### Frozen experiment

The starting repository commit is `5871e02d3ead1e72faf0cb0d2333d8f696b8072b`. The evaluated strategy is frozen experimental `reconstruction-v15`; production remains V1. This holdout does not authorize tuning V15, changing prompts or schemas, or promoting a strategy.

Five independent creators authored synthetic original cases. Of 120 authored cases, 119 are eligible after the documented **pre-freeze** exclusion of `V3-107`: its source directs disabling kiln exhaust during an overnight kiln cycle, which requires equipment-specific safety validation outside a writing-only holdout. The exclusion is recorded in [exclusions.json](../data/evaluation/holdout-v3/frozen/exclusions.json), and is not an output-based exclusion.

Before generation, blind reviewers completed 119 primary and 72 second pre-reviews of source/objective pairs. There are 25 expected-edit-scope disagreements; these remain recorded disagreements, not reconciled ground truth. Generation receives neither labels nor review judgments. The frozen [assignments.json](../data/evaluation/holdout-v3/frozen/assignments.json) also preregisters 60 cases for second blind output review using a separate deterministic selection.

The assignment algorithm ranks IDs by SHA-256 of UTF-8 `salt + U+0000 + case ID`, ascending hexadecimal digest with case ID as tie-breaker. The first 72 IDs under the pre-review salt receive second pre-reviews; the first 60 under the independent output-review salt receive second output reviews. Reviewer assignments and serialization are pinned in the assignment artifact and [protocol tool](../tools/eval/holdout-v3.ts).

Frozen inputs and labels are in the separate [frozen directory](../data/evaluation/holdout-v3/frozen/manifest.json). The external [manifest anchor](../data/evaluation/holdout-v3/frozen-manifest.sha256) and runner constant pin the exact manifest SHA-256:

```text
e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2
```

The manifest pins frozen file bytes and per-case source/objective fingerprints. Run artifacts belong under `data/evaluation/holdout-v3/run/`, outside the frozen directory. The [offline runner](../tools/eval/holdout-v3-runner.ts) hashes review/label bytes for integrity without parsing or joining those labels into generation requests.


Execution used account-backed role-separated CLI plan usage, with $0 incremental paid API spending and no paid fallback. Four failed transport smokes (smoke-01 through smoke-04) returned no candidate; model invocation for those failures is indeterminate. Their artifacts are retained. Smoke-04 used CLI `2.1.288 (Claude Code)`, failed with schema-declaration rejection, and has SHA-256 `52bdca1d30188ec247892c6f45d7162ea8427809d7e64327cf62d690b1f67a51`. The CLI adapter removes only the top-level draft-2020-12 `$schema` from a copy passed to the CLI; captured schemas and prompts remain unchanged. Smoke-05 succeeded using the same CLI, returned a structured response, and resolved model `claude-sonnet-5-5`. Smoke success establishes transport, not editorial quality.

The captured editor request bundle contains 119 frozen V15 requests; generator-code anchor: `ecb1ced35f99fc8880a76d5990c3a287e10fabbe8efec3be5f13efcc64671fc2`. One editor attempt per case and one structured attempt per stage request were allowed, with durable attempt tracking, strict schemas, no replacement candidates, and no retry after failure. Editor calls were isolated from labels, tools, MCP, and inherited settings; stage provenance checked predecessor hashes. All 119 replay rows are present; saved replay records contain zero technical failures and zero contract errors. Replaying saved responses makes no model calls. Corpus cases only were evaluated.

## Corpus and pre-review

All 119 eligible sources are synthetic original writing, authored independently by five creators; no user documents or scraped text are included. The excluded 120th case is outside every outcome denominator. Length bands and genre names below are the frozen metadata, not inferred reading difficulty. Objective types are the report tool’s coarse classification, so “other” is not an unmet objective.

| Length band | Cases /119 |
| --- | --- |
| VERY_SHORT | 15 |
| SHORT | 34 |
| MEDIUM | 45 |
| LONGER | 25 |

| Objective type | Cases /119 |
| --- | --- |
| other | 96 |
| register | 12 |
| brevity | 9 |
| wording | 2 |

| Exact frozen genre | Cases /119 |
| --- | --- |
| personal text | 2 |
| community reminder | 1 |
| community post | 1 |
| volunteer group update | 1 |
| building chat message | 1 |
| social caption | 1 |
| event update | 1 |
| team message | 1 |
| community bulletin | 1 |
| personal note | 1 |
| community project update | 1 |
| neighborhood newsletter | 1 |
| group thank-you message | 1 |
| community blog anecdote | 1 |
| community event instructions | 1 |
| volunteer update | 1 |
| design feedback message | 1 |
| project status message | 1 |
| personal letter | 1 |
| community project notice | 1 |
| personal essay | 1 |
| informal project update | 1 |
| community invitation | 1 |
| workplace-email | 6 |
| team-chat | 3 |
| calendar-note | 1 |
| team-announcement | 2 |
| workshop-recap | 1 |
| status-update | 4 |
| meeting-follow-up | 2 |
| internal-memo | 1 |
| staff-update | 1 |
| report-excerpt | 2 |
| project-email | 1 |
| apology-email | 1 |
| community-report-update | 1 |
| product status message | 1 |
| support FAQ | 2 |
| product note | 1 |
| how-to note | 1 |
| team chat update | 1 |
| product description | 2 |
| internal notice request | 1 |
| support reply | 1 |
| internal update | 1 |
| feature explanation | 1 |
| internal runbook note | 1 |
| technical FAQ | 1 |
| website content update request | 1 |
| how-to instructions | 1 |
| troubleshooting article | 1 |
| project update | 1 |
| service FAQ | 1 |
| internal FAQ | 1 |
| technical support guide | 1 |
| product help article | 1 |
| attendee page update request | 1 |
| internal instruction request | 1 |
| policy note | 1 |
| procedure reminder | 1 |
| programme notice | 1 |
| research summary | 1 |
| committee comment | 1 |
| staff announcement | 1 |
| visitor guidance | 1 |
| seminar proposal | 1 |
| evaluation comment | 1 |
| consultation notice | 1 |
| academic discussion | 1 |
| access procedure | 1 |
| reading group proposal | 1 |
| survey report | 1 |
| funding proposal | 1 |
| evaluation report | 1 |
| application guidance | 1 |
| public works proposal | 1 |
| departmental recommendation | 1 |
| academic report | 1 |
| community service proposal | 1 |
| process evaluation | 1 |
| field visit procedure | 1 |
| programme report | 1 |
| community-update | 5 |
| practical-instructions | 5 |
| faq | 2 |
| short-interview | 2 |
| project-notes | 4 |
| event-description | 1 |
| personal-reflection | 2 |

| Creator | Eligible cases /119 |
| --- | --- |
| creator-01 | 24 |
| creator-02 | 24 |
| creator-03 | 24 |
| creator-04 | 24 |
| creator-05 | 23 |

Pre-review has 191 observations: 119 primary plus 72 independently assigned second reviews. These observations are not 191 distinct cases. Expected-edit-scope disagreements occur in 25 cases. Missing-information flags include 186 false, 4 true, and 1 missing observation. Neither disagreements nor missing flags were reconciled into generation instructions.

| Expected scope | Observations /191 |
| --- | --- |
| LEAVE_ALONE | 32 |
| DISTRIBUTED_LIGHT_EDIT | 59 |
| LOCAL_EDIT | 73 |
| SUBSTANTIVE_RECONSTRUCTION | 23 |
| INSUFFICIENT_INFORMATION | 4 |

## Immutable original blind output observations

All 119 cases have primary ratings; the preregistered second sample has 60 ratings, for 179 original observations. The second sample overlaps the primary population and must not be added to it as independent cases. RAW/FINAL assignments are unblinded here only to aggregate sealed labels. STRICT_GOOD is a six-field label proxy; it can count unchanged acceptable text and is not material editorial improvement. BAD_PROXY is a semantic label proxy.

### Primary tier (n=119)

| Measure | RAW | FINAL |
| --- | --- | --- |
| Proxy classes | STRICT_GOOD=99, UNCERTAIN=3, OTHER=7, BAD_PROXY=10 | STRICT_GOOD=76, UNCERTAIN=1, OTHER=41, BAD_PROXY=1 |
| objectiveSatisfied | YES=99, PARTIAL=19, NO=1 | YES=76, PARTIAL=23, NO=20 |
| editoriallyUseful | YES=99, PARTIAL=19, NO=1 | YES=76, PARTIAL=22, NO=21 |
| meaningPreserved | YES=106, UNCERTAIN=3, NO=10 | YES=117, UNCERTAIN=1, NO=1 |
| unauthorizedSemanticChange | NO=106, UNCERTAIN=3, YES=10 | NO=117, UNCERTAIN=1, YES=1 |
| unsupportedInformation | NO=108, UNCERTAIN=2, YES=9 | NO=119 |
| voicePreserved | YES=119 | YES=119 |
| overedited | NO=113, YES=6 | NO=118, YES=1 |
| underedited | NO=112, YES=7 | NO=79, YES=40 |
| unnecessaryChangeToGoodSource | N/A=83, NO=34, YES=2 | N/A=84, NO=34, YES=1 |

| Pairwise preference | Observations |
| --- | --- |
| EQUIVALENT | 79 |
| RAW | 29 |
| FINAL | 4 |
| NEITHER | 7 |

| Proxy transition | Numerator / denominator |
| --- | --- |
| goodRetention | 73/99 (73.7%) |
| goodLoss | 26/99 (26.3%) |
| badCatch | 9/10 (90.0%) |
| badEscape | 1/10 (10.0%) |

### Second tier (n=60)

| Measure | RAW | FINAL |
| --- | --- | --- |
| Proxy classes | STRICT_GOOD=49, OTHER=7, BAD_PROXY=4 | STRICT_GOOD=31, OTHER=26, BAD_PROXY=3 |
| objectiveSatisfied | YES=57, PARTIAL=3 | YES=37, NO=15, PARTIAL=8 |
| editoriallyUseful | YES=51, PARTIAL=9 | YES=32, PARTIAL=22, NO=6 |
| meaningPreserved | YES=58, UNCERTAIN=2 | YES=58, NO=2 |
| unauthorizedSemanticChange | NO=56, YES=3, UNCERTAIN=1 | NO=57, YES=3 |
| unsupportedInformation | NO=56, YES=4 | NO=60 |
| voicePreserved | YES=59, NO=1 | YES=59, NO=1 |
| overedited | NO=59, YES=1 | NO=60 |
| underedited | NO=60 | NO=40, YES=20 |
| unnecessaryChangeToGoodSource | N/A=49, YES=8, NO=3 | N/A=49, YES=5, NO=6 |

| Pairwise preference | Observations |
| --- | --- |
| RAW | 21 |
| EQUIVALENT | 35 |
| FINAL | 4 |

| Proxy transition | Numerator / denominator |
| --- | --- |
| goodRetention | 30/49 (61.2%) |
| goodLoss | 19/49 (38.8%) |
| badCatch | 4/4 (100.0%) |
| badEscape | 0/4 (0.0%) |

Primary proxy transitions apply an uncertainty filter, yielding FINAL GOOD=74 and DISPUTED=3; literal final labels yield STRICT_GOOD=76 and UNCERTAIN=1. These are different definitions, preserved explicitly. Primary 1/10 BAD_PROXY escape is a blind proxy observation, not the final confirmed BAD_RAW escape rate. Second FINAL BAD_PROXY=3 likewise does not mean three escapes from second RAW BAD: second raw bad catch is 4/4.

## Mandatory audit and supplemental tiers

The outcome-triggered mandatory queue contains 85 unique cases, all completed. Reasons overlap; summing the following rows would double-count cases. Audit judgments occurred after unblinding and are selected evidence, not an unbiased population sample.

| Queue reason | Eligible | Audited |
| --- | --- | --- |
| EXPLICIT_UPDATE | 13 | 13 |
| FALLBACK | 47 | 47 |
| FINAL_BAD_PROXY | 4 | 4 |
| FINAL_UNAUTHORIZED_CHANGE | 4 | 4 |
| FIXED_CLEAN_SAMPLE | 15 | 15 |
| OUTPUT_LABEL_DISAGREEMENT | 35 | 35 |
| PAIRWISE_DISAGREEMENT | 9 | 9 |
| POSSIBLE_GOOD_LOSS | 29 | 29 |
| RAW_BAD_PROXY | 11 | 11 |
| REPAIR_ATTEMPT | 31 | 31 |
| VAGUE_UPDATE | 9 | 9 |

The original 85-case audit applies its own disputed/uncertain filter: RAW DISPUTED=19, GOOD=46, BAD=11, OTHER=9; FINAL DISPUTED=19, GOOD=26, OTHER=39, BAD=1. Its definitive retention is 22/46, loss 24/46, catch 11/11, escape 0/11. The 19 original audit uncertainty flags remain visible. Historical additive draft interpretations are archived separately and are not the final outcome denominator.

Supplemental blind reviews add 25 observations in two role-separated packets (S1=13, S2=12), selected after observed outcomes. They remain separate from original primary/fixed-second labels; blinding of output identity does not remove selection bias.

### Supplemental S1 (n=13)

| Field | RAW | FINAL |
| --- | --- | --- |
| objectiveSatisfied | YES=11, PARTIAL=2 | YES=4, PARTIAL=4, NO=5 |
| editoriallyUseful | YES=13 | YES=4, PARTIAL=4, NO=5 |
| meaningPreserved | YES=11, NO=2 | YES=12, NO=1 |
| unauthorizedSemanticChange | NO=11, YES=2 | NO=12, YES=1 |
| unsupportedInformation | NO=12, YES=1 | NO=13 |
| voicePreserved | YES=13 | YES=12, NO=1 |
| overedited | NO=13 | NO=13 |
| underedited | NO=13 | NO=4, YES=9 |
| unnecessaryChangeToGoodSource | N/A=13 | N/A=10, YES=3 |

| Pairwise | Observations |
| --- | --- |
| EQUIVALENT | 3 |
| RAW_BETTER | 9 |
| FINAL_BETTER | 1 |

### Supplemental S2 (n=12)

| Field | RAW | FINAL |
| --- | --- | --- |
| objectiveSatisfied | YES=10, PARTIAL=1, NO=1 | PARTIAL=4, YES=5, NO=3 |
| editoriallyUseful | YES=9, PARTIAL=3 | PARTIAL=7, YES=4, NO=1 |
| meaningPreserved | NO=2, YES=10 | YES=12 |
| unauthorizedSemanticChange | YES=2, NO=10 | NO=12 |
| unsupportedInformation | YES=3, NO=9 | NO=12 |
| voicePreserved | YES=12 | YES=12 |
| overedited | NO=12 | NO=12 |
| underedited | NO=9, YES=3 | YES=8, NO=4 |
| unnecessaryChangeToGoodSource | N/A=9, NO=2, YES=1 | N/A=9, NO=2, YES=1 |

| Pairwise | Observations |
| --- | --- |
| RAW_BETTER | 5 |
| EQUIVALENT | 6 |
| FINAL_BETTER | 1 |

## Final sealed material interpretation

Definitions: GOOD_RAW/GOOD_FINAL require safe material editorial improvement; BAD_RAW requires a material unsupported or unauthorized rewrite. Safe unchanged text or source fallback with an unmet objective is OTHER. Resolved final interpretations determine denominators; original disagreement flags are retained separately. Three RAW cases and one FINAL case remain disputed rather than forced into classes. Interpretation sources are 73 unchanged mandatory-audit judgments, 12 additive adjudications, and 34 additional remaining-case audits, covering all 119.

| Material class | RAW /119 | FINAL /119 |
| --- | --- | --- |
| GOOD | 68 | 47 |
| BAD | 13 | 0 |
| OTHER | 35 | 71 |
| DISPUTED | 3 | 1 |

| Final material transition | Numerator / denominator |
| --- | --- |
| goodRetained | 43/68 (63.2%) |
| goodLost | 25/68 (36.8%) |
| badCaught | 13/13 (100.0%) |
| badEscaped | 0/13 (0.0%) |

Confirmed unsafe final IDs: none. RAW disputes: V3-091, V3-095, V3-113; FINAL dispute: V3-095. Possible disputed good losses V3-091 and V3-113 are outside the confirmed 25/68 loss numerator. GOOD_FINAL=47 exceeds 43 retained good raw edits because some finals improve other raw classes.

### explicitUpdate (n=13)

| Measure | Value |
| --- | --- |
| RAW classes | GOOD_RAW=12, BAD_RAW=1 |
| FINAL classes | OTHER=9, GOOD_FINAL=4 |
| goodRetained | 4/12 (33.3%) |
| goodLost | 8/12 (66.7%) |
| badCaught | 1/1 (100.0%) |
| badEscaped | 0/1 (0.0%) |

### vagueMissing (n=9)

| Measure | Value |
| --- | --- |
| RAW classes | GOOD_RAW=4, BAD_RAW=4, OTHER=1 |
| FINAL classes | GOOD_FINAL=2, OTHER=7 |
| goodRetained | 2/4 (50.0%) |
| goodLost | 2/4 (50.0%) |
| badCaught | 4/4 (100.0%) |
| badEscaped | 0/4 (0.0%) |

### anyPrereviewerLeaveAlone (n=25)

| Measure | Value |
| --- | --- |
| RAW classes | OTHER=19, GOOD_RAW=5, BAD_RAW=1 |
| FINAL classes | OTHER=19, GOOD_FINAL=6 |
| goodRetained | 5/5 (100.0%) |
| goodLost | 0/5 (0.0%) |
| badCaught | 1/1 (100.0%) |
| badEscaped | 0/1 (0.0%) |

Explicit updates are the sealed 13-case audit stratum. Vague/missing requests are the sealed 9-case stratum; no absent replacement value may be invented. Already-good means **any** frozen prereviewer says LEAVE_ALONE (25 cases), permitting pre-review disagreement and overlap with other strata; it is not unanimous ground truth. All five confirmed good raw edits in that stratum survive.

### Verification, repair, and fallback

The following are machine replay trace counts, each over 119 cases; they are not human usefulness judgments. Missing semantic verdicts are explicit MISSING entries rather than silently scored PASS.

| Trace field | Counts |
| --- | --- |
| deterministicVerdict | PASS=44, NEEDS_REVIEW=30, FAIL=45 |
| semanticVerdict | PASS=72, MISSING=36, LOCAL_REPAIR=6, REJECT=5 |
| repairRequested | false=88, true=31 |
| repairAccepted | false=106, true=13 |
| outcome | unchanged=6, accepted=53, source-fallback=47, repaired=13 |
| fallbackReason | MISSING=72, hard-meaning-failure=32, repair-failed=8, verifier-rejected=5, invalid-verifier=2 |
| repairClassification | MISSING=88, FAILED_REPAIR=18, USEFUL_REPAIR=12, SAFE_REVERSION=1 |

Repair was requested for 31/119 and accepted for 13/31 requests. Source fallback was 47/119. Human interpretation categories below use all 119 final-audit rows and retain archive terminology. They describe editorial effect and can differ from machine “accepted”/“useful” trace names.

| Final interpretation repair category | Cases /119 |
| --- | --- |
| NONE | 34 |
| FAILED_REPAIR | 13 |
| NO_REPAIR | 54 |
| EDITORIALLY_USEFUL_REPAIR | 9 |
| HARMFUL_ATTEMPT_REJECTED | 1 |
| SAFE_REVERSION | 5 |
| SAFE_EQUIVALENT_SENTENCE_SPLIT | 1 |
| FAILED_TO_RESOLVE_HEDGE_REJECTED | 1 |
| PARTIAL_CORRECTION_REJECTED_FOR_REMAINING_DEFECT | 1 |

| Final interpretation fallback category | Cases /119 |
| --- | --- |
| NONE | 34 |
| UNNECESSARY_GOOD_EDIT_LOSS | 24 |
| NO_FALLBACK | 37 |
| NECESSARY_SAFETY_FALLBACK | 8 |
| SOURCE_ALREADY_BEST | 7 |
| SAFE_EQUIVALENT_SOURCE | 2 |
| NO_FALLBACK_UNCHANGED | 1 |
| EDITOR_ALREADY_RETURNED_SOURCE | 3 |
| UNNECESSARY_GOOD_EDIT_LOSS_STALE_GUIDANCE | 1 |
| SAFE_SOURCE_WITH_REPORT_POLISH_LOST | 1 |
| SAFE_SOURCE_WITH_ORGANIZATION_LOST | 1 |

The 25 unnecessary material good losses comprise 24 UNNECESSARY_GOOD_EDIT_LOSS plus one stale-guidance loss. Necessary safety fallback is 8, source already best 7, safe equivalent source 2, editor already returned source 3, and two unresolved organization/register losses. No-repair categories total 88 (NONE=34 plus NO_REPAIR=54). Editorially useful repair is 9, safe reversion 5, safe equivalent sentence split 1, failed repair 13, and three rejected attempt categories each 1.

### Failure evidence and boundaries

V3-003 correctly updates 6 to 6:30 and the meeting room to the courtyard in RAW, then loses the authorized update at fallback. This is consistent with deterministic false rejection of authorized new numeric content. The original audit records 19 deterministic false rejections, 2 semantic false rejections, 6 unnecessary fallbacks, 1 OTHER, and 2 DISPUTED loss causes across its 85 cases; these historical reason counts must not be relabelled as the 25 final confirmed good losses.

V3-012 and V3-089 return stale source information despite explicit replacements. Both fail the user objective; neither is a confirmed BAD_RAW escape under the sealed material definition. V3-089 is separately flagged operationally incorrect. Original audit DATE escape and blind semantic labels remain immutable, even where the final interpretation differs. Expanding BAD to include stale source would require a consistent alternate definition and complete recomputation, not a one-case exception. V3-095 remains disputed. V3-105 O2A evidence cites unrelated handy/gloves/invitation material; those original labels remain preserved, while contaminated evidence is excluded from substantive support.

Confirmed material good loss IDs: V3-003, V3-009, V3-012, V3-013, V3-014, V3-017, V3-021, V3-023, V3-030, V3-035, V3-036, V3-043, V3-045, V3-046, V3-059, V3-060, V3-061, V3-067, V3-071, V3-080, V3-087, V3-089, V3-096, V3-108, V3-110.

## Source of metrics and integrity

The report is reproduced offline with `node --import tsx tools/eval/holdout-v3-report.ts`. It verifies pinned final archive commitments, every archived input hash, interpretation/summary hashes, unchanged embedded original blind labels, exact 119-case membership, and agreement with the sealed summary. Sources: `corpus` and `prereview` derive from frozen cases/labels; `blind` from immutable original submissions plus custodian mapping; `trace` from saved replay; `coverage` from mandatory queue/responses; `supplemental` from separate committed packets/submissions; `finalInterpretation` from the sealed final audit. No model call is needed to reproduce counts.

| Artifact | SHA-256 |
| --- | --- |
| run/replay.json | 8e707a25181e6fa15e6eb1a1c97a10fb61d172fe82f35cfb04e880d3a284cc24 |
| run/blind-output-v1/custodian/mapping.json | 83ff9146f2914868c56441ba16c394f30cc3637469a85a0613ceca84f320489b |
| run/blind-output-v1/review-originals-v1/primary/O1A/submission.json | 3ff44c8a2d7bd1852bf66addf48550bf9772c9c2c82b194ca443ee6cb4ce0a52 |
| run/blind-output-v1/review-originals-v1/primary/O1B/submission.json | 98899959652a3e08406316d6aaf83f7abc5af87e411db5fd69a2a0539b914134 |
| run/blind-output-v1/review-originals-v1/primary/O1C/submission.json | 01aee393d3c19007383fe54be449bf826c32ea643036edafc9ed622d1793cda6 |
| run/blind-output-v1/review-originals-v1/primary/O1D/submission.json | 3889d8e1df94f6ad0f76e5746172293c250179f37149ebed973f2ed5ecacad3b |
| run/blind-output-v1/review-originals-v1/second/O2A/submission.json | f13486950564b19140101d5c174f0ddde1f254be5f73d56d7682ed7c7e238074 |
| run/blind-output-v1/review-originals-v1/second/O2B/submission.json | 3597343e470063208c160f42b7524316b4e590d80a58c7649e452d88ecf91051 |
| run/audit-v1/responses/A1/commitment.json | 7e3ebbce9f6cab038562487486fa7d0e2bd66cd88a648fa10b7ab86b412fc32c |
| run/audit-v1/responses/A1/original-response.json | 11fb373513c89e3d79bebe5ed92549ae5c8b90dbbf788396cf74d2c9dab351eb |
| run/audit-v1/responses/A1/response.json | 04d3c7623f9548718ee397fe43598e7dd7d092144a4d0f6ca83599f71c80b8aa |
| run/audit-v1/responses/A2/commitment.json | 8796e8636081c8681dfbeb7658db4ed511fe3dfb56b5cc8c152c82c25cf07b4a |
| run/audit-v1/responses/A2/original-response.json | 82252a62c81f4903098ae9b599c12eab76b09c99ff56986c67478056d0efb7ef |
| run/audit-v1/responses/A2/response.json | 89bd779035a02097c5d91bfc90c9862739d58334d27dca89e40c4280053cbd56 |
| run/audit-v1/responses/A3/commitment.json | 144d251089cc41367290c517eaccffbdb00884862cf42815db16b165261dd8b0 |
| run/audit-v1/responses/A3/original-response.json | 757e52b19f08537ef2beff51399ad62f41478e3fb281ab610c908120a7a4810c |
| run/audit-v1/responses/A3/response.json | 1f5ec363d1704dfdb22b92de679f8b9ca6f4d64af6c7a79dfd8607389727e0c0 |
| run/audit-v1/responses/A4/commitment.json | f34f236da38dc0d8f94d19b23c31bfe3866f1de5652c7518e3b25db0ace7c165 |
| run/audit-v1/responses/A4/original-response.json | 01b45c1a08d0b8cacacb4b7082e35ef9642fe7f95de5d73e3ef017f7ace97233 |
| run/audit-v1/responses/A4/response.json | 835c21788fce8c23897bab340e3b5e99cf98394a2ee56a60ec97de76fe6b0662 |
| run/audit-v1/responses/A5/commitment.json | cab9441b2d75cd2201b85fb29a13b8a08603ab2db8926ff09772971f7be5abb2 |
| run/audit-v1/responses/A5/original-response.json | 348a2c05363691029db55a4892aa7ca64c16956144df19079751dd8dbcd711fa |
| run/audit-v1/responses/A5/response.json | 65992998a55eeeee2c089e33c9abaeb473afcdd20d86895ba27bd6d874d1dae3 |
| /private/tmp/whodunnit-v3-independent-adjudication.json | 7f33f0fd14595ce61d924198a9b7be11ed6cd3eb257bf99a46a3caae5ca9753a |
| frozen/review-R1A.json | b1a02b3eb39a18ae39f4fdcaef0a99eb09b1387ebc52454b39197eedbe5e4675 |
| frozen/review-R1B.json | 968bb3695e50b9eba9720c149d630bcb25555c70127f62c2f62dee853939517f |
| frozen/review-R2A.json | bb09da8e33cf4e54f672b58707e69be74a44fbb2ed0615841d01386874825ba7 |
| frozen/review-R2B.json | 5f5e1003fefaaa16a72fb74345f25d174f96479a22540bb9959e1059a0c382c3 |
| run/audit-v1/queue.json | 4b02c80bb0065f896bc9d2fd740da72423abde9ff12d3e0e51d6026aba9b5992 |
| run/post-review-v1/final-audit-v1/commitments.json | 1305359c909863eb877204b72d63337cf4fbd37ca6d7f5fcf1eb46883c70dcd4 |
| run/post-review-v1/final-audit-v1/independent-adjudication.original.json | 7f33f0fd14595ce61d924198a9b7be11ed6cd3eb257bf99a46a3caae5ca9753a |
| run/post-review-v1/final-audit-v1/remaining-audit.original.json | 5fdd66a0adb81bec7703e708423468d74c5746fd3e2afc541b387d2f4089574f |
| run/post-review-v1/final-audit-v1/inputs/frozen/cases.json | 0a5d4c71640c271c5fd8ec464ff95b00434368a7023e9f22c5200a4135b64478 |
| run/post-review-v1/final-audit-v1/inputs/frozen/labels.json | 23a162b24de7364bca04cca5010966dfce8027fb258c0ab75826492027a81e29 |
| run/post-review-v1/final-audit-v1/inputs/frozen/manifest.json | e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2 |
| run/post-review-v1/final-audit-v1/inputs/run/audit-v1/queue.json | 4b02c80bb0065f896bc9d2fd740da72423abde9ff12d3e0e51d6026aba9b5992 |
| run/post-review-v1/final-audit-v1/inputs/run/replay.json | 8e707a25181e6fa15e6eb1a1c97a10fb61d172fe82f35cfb04e880d3a284cc24 |
| run/post-review-v1/final-audit-v1/inputs/run/post-review-v1/unblinded-labels.json | 6ac4c2b10473266e4856b9d2d320dfc408f3d6875b406849cd8fb81435eaeb2b |
| run/post-review-v1/final-audit-v1/first-audit/A1/commitment.json | 7e3ebbce9f6cab038562487486fa7d0e2bd66cd88a648fa10b7ab86b412fc32c |
| run/post-review-v1/final-audit-v1/first-audit/A1/original-response.json | 11fb373513c89e3d79bebe5ed92549ae5c8b90dbbf788396cf74d2c9dab351eb |
| run/post-review-v1/final-audit-v1/first-audit/A1/response.json | 04d3c7623f9548718ee397fe43598e7dd7d092144a4d0f6ca83599f71c80b8aa |
| run/post-review-v1/final-audit-v1/first-audit/A2/commitment.json | 8796e8636081c8681dfbeb7658db4ed511fe3dfb56b5cc8c152c82c25cf07b4a |
| run/post-review-v1/final-audit-v1/first-audit/A2/original-response.json | 82252a62c81f4903098ae9b599c12eab76b09c99ff56986c67478056d0efb7ef |
| run/post-review-v1/final-audit-v1/first-audit/A2/response.json | 89bd779035a02097c5d91bfc90c9862739d58334d27dca89e40c4280053cbd56 |
| run/post-review-v1/final-audit-v1/first-audit/A3/commitment.json | 144d251089cc41367290c517eaccffbdb00884862cf42815db16b165261dd8b0 |
| run/post-review-v1/final-audit-v1/first-audit/A3/original-response.json | 757e52b19f08537ef2beff51399ad62f41478e3fb281ab610c908120a7a4810c |
| run/post-review-v1/final-audit-v1/first-audit/A3/response.json | 1f5ec363d1704dfdb22b92de679f8b9ca6f4d64af6c7a79dfd8607389727e0c0 |
| run/post-review-v1/final-audit-v1/first-audit/A4/commitment.json | f34f236da38dc0d8f94d19b23c31bfe3866f1de5652c7518e3b25db0ace7c165 |
| run/post-review-v1/final-audit-v1/first-audit/A4/original-response.json | 01b45c1a08d0b8cacacb4b7082e35ef9642fe7f95de5d73e3ef017f7ace97233 |
| run/post-review-v1/final-audit-v1/first-audit/A4/response.json | 835c21788fce8c23897bab340e3b5e99cf98394a2ee56a60ec97de76fe6b0662 |
| run/post-review-v1/final-audit-v1/first-audit/A5/commitment.json | cab9441b2d75cd2201b85fb29a13b8a08603ab2db8926ff09772971f7be5abb2 |
| run/post-review-v1/final-audit-v1/first-audit/A5/original-response.json | 348a2c05363691029db55a4892aa7ca64c16956144df19079751dd8dbcd711fa |
| run/post-review-v1/final-audit-v1/first-audit/A5/response.json | 65992998a55eeeee2c089e33c9abaeb473afcdd20d86895ba27bd6d874d1dae3 |
| run/post-review-v1/final-audit-v1/interpretations.json | 7283def737e1a101f2b4ff27497ceba18481b674804a9818567f1384e495b8a4 |
| run/post-review-v1/final-audit-v1/summary.json | 4ff8a0aa44aed10a95e1ef590ea8a2b14427084d0d32d8215156cc1a201a5c10 |
| run/blind-output-v1/supplemental-v1/commitments.json | 1a29025aa470ddade15af127f4ad58eb6abf66b1603e09a96e6785192772c32b |
| run/blind-output-v1/supplemental-v1/custodian/mapping.json | 068e970e25096795482a9635d9a1f76efed037a45549b3607bd9f444db95fcf6 |
| run/blind-output-v1/supplemental-v1/S1/packet.json | 9483d692ac2e7c1b1e86b6d4e4bb1d3831a27467d51632de56e1a100b1684f2b |
| run/blind-output-v1/supplemental-v1/submissions/S1/original-response.json | 7889cb3479a5b2f88de879682b51b2e68c9fa86b8b97fea4fa4bf0da92ff92ab |
| run/blind-output-v1/supplemental-v1/submissions/S1/response.json | a80c0c9b9d4d2c2cbb159b512483ff8e54595f4d74bdef3fa1b6840cf7040309 |
| run/blind-output-v1/supplemental-v1/submissions/S1/commitment.json | cc1b79231bfbdbff04deed2236617b31ee09b6def924776e87e9ed4efe7aa8cd |
| run/blind-output-v1/supplemental-v1/S2/packet.json | f85eaae93284f6151187ad766b57b37f95a508ee7297a067f9672f9f479af702 |
| run/blind-output-v1/supplemental-v1/submissions/S2/original-response.json | af1a90c9cb4b6aeb1f4c5077bd8eab33d176210359c7c6e204ccf6e97f8490a4 |
| run/blind-output-v1/supplemental-v1/submissions/S2/response.json | af1a90c9cb4b6aeb1f4c5077bd8eab33d176210359c7c6e204ccf6e97f8490a4 |
| run/blind-output-v1/supplemental-v1/submissions/S2/commitment.json | ffacee01dc2dcdf5bf17fac189da9ec0511ebeb3d8dd1fd89a6f3475a256fff6 |

All listed hashes are SHA-256 over original artifact bytes. The external manifest anchor and frozen strategy remain the experiment boundary; archival hashes establish immutability, not validity of judgment.

## Verification gates

Final checks passed or verified the saved write-once artifact as recorded in `/private/tmp/whodunnit-v3-final-gates.json`, SHA-256 `3f25f7be0fc98d3f7210fb91c87f07bd3dd0b389d4b2d041965394c1b6830c14`. Saved replay/report verification makes no model calls. Historical checks below remain a separate record.

| Final gate command | Status | Observed evidence |
| --- | --- | --- |
| `pnpm lint` | PASS | eslint exited 0. |
| `pnpm typecheck` | PASS | tsc --noEmit exited 0; rerun after edits. |
| `pnpm test` | PASS | 64 files passed; 662 tests passed on serial rerun after edits. |
| `node --import tsx tools/rules/cli.ts rules:validate` | PASS | 64 rules valid; registry loads; clean-prose false positives below error threshold. Equivalent CLI invocation documented in docs/HOLDOUT-V3.md because pnpm/tsx launcher can hit sandbox IPC EPERM. |
| `node --import tsx tools/eval/cli.ts semantic` | PASS | 48/48 meaning fixtures and 13/13 voice fixtures passed. |
| `node --import tsx tools/eval/directive-scoping-confirmation.ts integrity; node --import tsx tools/eval/directive-scoping-confirmation.ts replay` | PASS | Integrity valid: 10 fresh, 6 adversarial, 3 punctuation, 2 shared, 2 ambiguity, 9 historical composite, 14 unsafe. Replay: 46 rows; 0/14 unsafe escapes in both V14 and V15; no blind-label mismatches or historical regressions. |
| `node --import tsx tools/eval/composite-temporal-confirmation.ts integrity; node --import tsx tools/eval/composite-temporal-confirmation.ts replay` | PASS | Integrity verified 8 frozen cases; replayed 9 saved V14 rows successfully. |
| `node --import tsx tools/eval/verification-boundary.ts integrity; node --import tsx tools/eval/verification-boundary.ts replay` | PASS | Integrity valid for 28 cases and 4 frozen files; 28 saved rows replayed successfully. |
| `node --import tsx tools/eval/holdout-v3-runner.ts integrity` | PASS | 119 frozen cases; manifest SHA-256 e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2 verified. |
| `pnpm exec vitest run --config tools/eval/vitest.config.mts` | PASS | 10 files passed; 78 tests passed after final edits. |
| `git diff --check` | PASS | Exited 0 with no output. |
| `pnpm build --webpack` | PASS | Next.js 16.3.6 webpack production build compiled successfully; TypeScript passed; 7/7 static pages generated; routes listed. |
| `node --import tsx tools/eval/holdout-v3-runner.ts replay` | SAVED REPLAY PASS; RERUN GUARDED | Existing saved replay has 119/119 unique rows, zero technical failures, and zero contract errors. Fresh rerun refused with EEXIST by the expected write-once guard; replay.json was not overwritten. |
| `node --import tsx tools/eval/holdout-v3-report.ts` | PASS | Pinned archive/input hashes, original labels, exact 119-case membership, and sealed summary agree. |

The first full test run, concurrent with focused tooling tests, had one 5-second subprocess timeout in `objective-feasibility-validation.test.ts` (63/64 files, 661/662 tests passed). The serial rerun passed all 64 files and 662 tests. The final focused suite passed 10 files and 78 tests. The build had font network access without escalation.

### Historical pre-generation verification

These checks passed before generation. They verify tooling and saved fixtures; they do not replace the final rerun gates.

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed. |
| `pnpm test` | 64 files; 662 tests passed. The existing Vite configuration compatibility warning remains. |
| `pnpm exec vitest run --config tools/eval/vitest.config.mts` | 4 files; 43 V3 tooling tests passed, including Ajv 6 schema compatibility, stage provenance, and smoke gate coverage. |
| `pnpm rules:validate` | The pnpm/tsx launcher hit sandbox IPC `EPERM`; equivalent `node --import tsx tools/rules/cli.ts rules:validate` passed: 64 rules valid, advisories below the error threshold. |
| `node --import tsx tools/eval/cli.ts semantic` | 48/48 meaning fixtures and 13/13 voice fixtures passed. |
| `node --import tsx tools/eval/directive-scoping-confirmation.ts integrity` | Integrity passed for 10 fresh cases, 6 adversarial controls, 9 historical composite cases, and 14 unsafe cases. |
| `node --import tsx tools/eval/composite-temporal-confirmation.ts integrity` | 8 frozen cases verified. |
| `node --import tsx tools/eval/verification-boundary.ts integrity` | 28 cases and 4 frozen files verified. |
| `node --import tsx tools/eval/holdout-v3-runner.ts integrity` | All 119 frozen cases and the manifest anchor verified. |
| `node --import tsx tools/eval/directive-scoping-confirmation.ts replay` | 46 saved rows; 0/14 unsafe escapes for V14 and V15; no blind-label mismatches or historical regressions. |
| `node --import tsx tools/eval/composite-temporal-confirmation.ts replay` | 9 saved V14 rows replayed successfully. |
| `node --import tsx tools/eval/verification-boundary.ts replay` | 28 saved original-boundary rows replayed successfully. |
| `pnpm build --webpack` | Next.js 16.3.6 production build passed; 7/7 static pages generated. |
| `git diff --check` | Passed. |

The `node --import tsx` invocation avoids the `tsx` CLI IPC listener blocked by the restricted environment. Saved replays use injected callers and existing responses; none calls a model.


## Decision and limitations

| Category | Conclusion |
| --- | --- |
| A: supports frozen V15 | Not selected; material good loss and fallback burden block readiness. |
| B: one clear blocking defect | Not selected; conservatism affects multiple edits and update objectives. |
| C: too conservative | SELECTED: 25/68 material good losses, 8/12 correct explicit updates lost, 47/119 fallbacks. |
| D: unsafe | Not selected under sealed definition: 0/13 confirmed bad raw escapes; stale-source objective failures and disputes remain. |
| E: frontier editor bottleneck | Not selected: 68 material good raw edits show substantial useful editor supply that verification loses. |

This decision describes frozen V15 on a synthetic holdout, not production V1 or a future strategy. Material usefulness and semantic safety are judgment-based; post-unblind adjudication and outcome-triggered supplemental selection limit causal and population claims. Small overlapping strata support diagnosis, not calibrated deployment rates. Zero confirmed escapes in 13 bad raw cases cannot establish a universal safety guarantee. Disputed cases remain unresolved. No UI changes, model tuning, V16 implementation, paid API calls, or promotion follows from this report.
