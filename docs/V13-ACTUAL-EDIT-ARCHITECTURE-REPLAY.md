# V13 actual frontier edit architecture replay

## Decision

**B — one narrow blocking defect.** V13 stopped the two material raw changes found in the independent post-result audit, and the original controlled unsafe boundary remains at 0/14 escapes. It retained 26/31 edits that met the frozen, unanimous blind definition of a good raw edit (83.9%). The audit found that one of the five counted losses, `ar05`, actually contained a material raw defect missed by both blind reviewers; excluding it gives 26/30 retained (86.7%). These are separate readings of the same frozen labels, not a relabeling of them.

The blocker is `ar04`: the user explicitly changed **Saturday, April 18 → Sunday, April 19**, and the frontier editor made exactly that change. V13 treated the numeric part of the composite date as a hard meaning failure, the single repair failed, and source fallback reinstated the now-incorrect date. This is an objective-authorization failure in a fact-update workflow. The next task is one surgical correction to exact composite date authorization, with the existing unsafe boundary and a tiny date confirmation. V13 remains frozen here. **Core architecture is not yet declared frozen.** Production remains `reconstruction-v1`; Holdout V3 was neither created nor run.

This replay provides actual frontier-generated candidates. It does not estimate the population rate of bad frontier edits: both first-pass blind reviewers marked zero raw candidates unsafe; the independent audit found two subtle defects in its assigned cases. Both were stopped. One more raw nuance (`ar19`) remains a material reviewer dispute and its repaired final is safe.

## Frozen method and provenance

- Forty fresh `source × objective` cases were authored by two independent creators, with three prefreeze replacements by a third creator to cover update types. All sources are synthetic. No human-authored source with unambiguous privacy and reuse permission was available. No patient, private correspondence, or account content was used.
- The sources, objectives, IDs, metadata, protected anchors, and review rubric were fingerprinted **before** candidate generation. Creators received editorial requirements, not desired verifier outcomes. Forty first candidates came from one account-backed frontier editor invocation per case, using the captured, unchanged `reconstruct.v8` system and user messages. There was no candidate injection, second editor draft, or polishing loop. The saved first candidates were fed through the frozen V13 path, including its semantic verification and at most one repair. Separate account-backed agents performed verification, repair, postrepair verification, blind review, and audit.
- The route was an offline account-agent bridge from the exact V13 editor requests into saved structured responses, replayed through the real V13 strategy. It was not a directly wired live production provider. No metered API route was called. Provider token counts and real provider latency were unavailable; replay timings measure local verification against saved responses and should not be interpreted as cloud latency. A second independently verified zero-cost model family was unavailable.
- Two blind reviewers independently labeled all 40 source/objective/raw/final quartets. They saw no findings, traces, fallback reasons, or strategy metadata. They agreed on the safety, unsupported-information, voice, overediting, and underediting fields in all 40 cases. Raw usefulness agreement was 39/40; final usefulness 38/40; raw objective satisfaction 38/40; final objective satisfaction 38/40. `ar19` is the material raw-safety dispute. Other disagreements concern usefulness degree (`ar04`, `ar14`) or whether harmless changes to already-clear prose were necessary (`ar23`, `ar30`, `ar39`, `ar37`, `ar40`). No disputes were silently adjudicated into the hard blind counts.
- After the blind labels were frozen, separate auditors inspected all flagged safety, explicit-update, vague-update, repair, fallback, good-edit-loss, and material-disagreement cases, plus straightforward successes. Their findings are saved separately from the blind labels. The auditor may challenge a label but cannot rewrite it.

### Corpus composition

The 40 distinct source categories include personal and reflective writing, work notes and email, project reports, academic prose, product and technical explanations, instructions and policy, support copy, community notices, and a flyer. There are **6 already-good**, **6 explicit factual-update**, **4 vague-update**, and 24 other objective cases (the flags are disjoint here). Objectives include concision, naturalness, tone, voice preservation, structure, technical clarity, and factual changes to date/time, person, quantity, status, and decision. There are 34 sources of 33–90 words and six of 275–307 words; the 100–250 word band is absent. That limits conclusions about medium-length writing and broad restructuring. All six longer examples remain in the frozen set.

### Fingerprints and replay

| Frozen artifact | SHA-256 |
| --- | --- |
| `cases.json` | `57d16a95007aa2644c9ce0cfd759ed8f41e4aacfcef7dd04fbd9b6cdb0bc98d0` |
| `review-rubric.json` | `38021e9dff5cdd35fc67009fdfc704b209adcf41c2d76c4b9d3893b5bdd16ca5` |
| `editor-results.json` | `372ff6abd017b8ecb0108ddd49737ed55c72d5ff0676a9b7cd68301debc4d35e` |
| `verifier-results.json` | `c5ba520b7aa624479e9facf3ad227ddb76318c6f905adfe94a1170afa7aa30ce` |
| `repair-results.json` | `6988e7e21bdc11acd034ddaa98de3843646c6c12505f6c5fb93b9d274fa51eab` |
| `reverify-results.json` | `f535a1608c17022e97a15423fb1eb2ab4337a24cb4c0fba55db674b463bb0e7e` |
| `run-v13.json` | `311039b598f520e358fcbe046ab527a84efde0d26a6e7da6614bb04f6fd4d47e` |
| `labels-first.json` | `8f0856b32448913ac0aa8257654bf52f0350e980c26f19a3d0b30966d8fb85ee` |
| `labels-second.json` | `002aefca0a481f6ca32c82310242cc45338dfb04f1a027af482390a1588a0c83` |

`manifest.json` pins the first two inputs; `results-manifest.json` pins every saved first candidate, model response, final replay, and both blind reviews. The full synthetic texts, objectives, category/provenance metadata, candidate/final pairs, labels, and V13 traces are in `data/fixtures/v13-architecture-replay/`. The exact reviewer prompts and intermediate editor requests remain in ignored `.evaluations/`; the versioned prompt and saved structured responses are sufficient to reproduce the V13 decisions without another model call. Running `node --import tsx tools/eval/v13-architecture-replay.ts integrity` validates the initial freeze. Running `... replay` reproduces substantive outputs and decisions; measured local `latencyMs` changes between runs, so byte hashes of a newly produced run differ. A field-by-field comparison excluding `latencyMs` matched all 40 saved rows.

The separate `audit-manifest.json` pins the post-result independent audit files: safety `28205908534f749ad8ac5275f2d0cf89732b06b9b876f9ef325b5c55cae059a1` and utility `d996b498e0b288a98a6481edf363cfeb9f17882fcd44180402daaac11fda8fdb`. Audit findings did not change the frozen labels or responses.

## Product and verification results

For categorical blind results, counts below are **both reviewers agreeing**; disputed values are listed separately. The frozen rubric defines a good raw edit as useful YES, objective satisfied YES, no unauthorized meaning change or unsupported information, voice preserved YES. Byte-identical source returns are excluded from the good-*edit* count.

| Measure | Raw frontier candidate | Final V13 output |
| --- | ---: | ---: |
| Useful for objective: YES / PARTIAL / NO / disputed | 35 / 2 / 2 / 1 | 31 / 3 / 4 / 2 |
| Objective satisfied: YES / NO / disputed | 35 / 3 / 2 | 31 / 7 / 2 |
| Unauthorized meaning change: agreed YES / NO / disputed | 0 / 39 / 1 | 0 / 40 / 0 |
| Unsupported information: agreed YES / NO | 0 / 40 | 0 / 40 |
| Voice preserved: YES | 40 | 40 |
| Overedited: YES | 0 | 0 |
| Underedited: YES | 4 | 9 |

Seven first candidates were byte-identical to source. Three finished as `unchanged`, 21 first candidates were accepted, six outputs were repaired, and ten returned the source. The initial deterministic verdicts were **PASS 19, NEEDS_REVIEW 12, FAIL 9**. Thirty-one first semantic-verifier responses were recorded (**PASS 24, LOCAL_REPAIR 3, REJECT 4**); seven repaired texts received a full semantic recheck (**PASS 6, REJECT 1**), for 38 saved verifier responses total. The trace's `semanticVerificationRequested` flag was set for 35 cases, including paths stopped before an initial model response. There were **zero malformed verifier outputs**.

Under the preregistered blind definition, there were **31 good changed raw edits: 26 retained, five lost** (`ar04`, `ar05`, `ar12`, `ar37`, `ar40`). The independent audit found a real unsupported generalization in `ar05`; thus the audited sensitivity reading is **30 fully good raw edits, 26 retained, four lost**. Its useful *portion* was still discarded by fallback. Both readings are reported; the frozen blind labels are unchanged.

The two material bad raw edits found in post-result audit were both caught by source fallback: `ar05` changes “A coordinator might know” into “Coordinators often knew,” turning a possibility about one coordinator into a frequency claim; `ar14` changes a members-only instruction to an unqualified “Bring your own pencils and paper,” potentially applying it to observers. Neither defect appears in final text. The blind reviewers missed both, so the **preregistered agreed-bad count is 0** and the **auditor-identified count is 2 caught / 0 escaped**. `ar19` may strengthen a personal causal explanation; one blind reviewer flagged it and one did not. Its one-step repair restored the tentative wording, without being counted as an agreed bad-edit catch. No audited final output contains an introduced unauthorized fact. `ar04` is a different failure: final output restores a date the user explicitly requested to change.

### Repairs and fallbacks

Nine repair attempts produced six accepted repaired outputs and three failures. Editorial audit found **six useful repaired final texts** (`ar01`, `ar13`, `ar15`, `ar17`, `ar19`, `ar29`), **zero safe source reversions miscounted as useful**, **three failed repairs** (`ar04`, `ar05`, `ar37`), and zero harmful accepted repairs. In `ar01`, restoring the source's morning-light expectation makes the result safer while retaining concision. `ar19` resolves a disputed qualifier. The others are useful refinements; they are not six proven catches of material bad edits.

The ten source fallbacks separate into: two protective against auditor-identified raw defects (`ar05`, `ar14`); four unnecessary losses of fully good raw edits (`ar04`, `ar12`, `ar37`, `ar40`); three cautious non-updates when no replacement value was supplied (`ar07`, `ar27`, `ar34`); and one redundant fallback of an already unchanged source (`ar18`). `ar05` was protective but overbroad because it also lost a useful newsletter rewrite. `ar14` also lost a partial inviting-tone improvement. The unchanged vague-update outputs should **not** be treated as publish-ready updates: their requested new facts remain unknown.

### Explicit updates, vague updates, and restraint

All **6/6** explicit updates were attempted and correctly made in raw candidate text, with **0** unauthorized collateral raw fact changes. Final output retained **5/6** authorized updates (`ar11` owner, `ar16` quantity, `ar25` status, `ar32` board decision, `ar38` opening time). `ar04` date was rejected and restored to the old value. There were zero collateral mutations to catch or escape in this cohort. The exact source/objective/candidate/final text for all six is in the replay file.

The four vague requests (`ar07` date, `ar14` room, `ar27` schedule, `ar34` pickup process) supplied no replacement value. **Raw guesses 0, repair guesses 0, final guesses 0; fallbacks 4.** `ar14` did make a safe tone improvement but also widened an instruction, so fallback stopped that defect. The other three remained unchanged. All four remain unresolved as requested updates.

Among the six already-good controls (`ar03`, `ar10`, `ar18`, `ar23`, `ar30`, `ar39`), four raw candidates and four final outputs were unchanged. `ar30` and `ar39` received small, meaning-safe edits. One reviewer found those useful and the other found them unnecessary, so **zero unnecessary changes are unanimously established; two are disputed**. `ar18` was marked as a source fallback despite editor and final both already being identical to source.

## Case-level audit and limits

| Case(s) | Independent finding and final outcome |
| --- | --- |
| `ar04` | Authorized composite weekday/date change lost after deterministic hard failure and failed repair. Final source has the old date. Primary blocker. |
| `ar05` | Raw newsletter rewrite contains an unsupported frequency claim missed by both blind reviewers. V13 rejects it; fallback is safe but loses the rest of a useful edit. |
| `ar12` | Useful plain-language memo candidate was rejected by a hard meaning finding; auditors found no material raw damage. Good edit lost. |
| `ar14` | Raw invitation broadens a members-only supply instruction; V13 rejects it. The room update was impossible without a supplied room; a partial tone improvement was lost. |
| `ar19` | One reviewer and the auditor see possible causal strengthening; another reviewer disagrees. Repair restores tentative wording and useful rhythm. Disputed, no agreed unsafe escape. |
| `ar37` | Useful academic tightening with caveats intact was discarded after failed repair. Good edit lost. |
| `ar40` | Useful flyer copy based on source facts and voice was rejected when drafting commentary was treated as content to preserve. Good edit lost. |
| `ar07`, `ar27`, `ar34` | Vague factual requests, no supplied replacement, no invention, unchanged/fallback final. Not completed updates. |
| `ar18` | Already-good source and raw candidate identical; hard failure and fallback yielded the same text. Redundant fallback, not an editorial loss. |
| `ar01`, `ar13`, `ar15`, `ar17`, `ar29` | Accepted repairs remain source-grounded and materially useful; most refine wording rather than remove an agreed material defect. |
| `ar02`, `ar20`, `ar21`, `ar36` | Sampled straightforward successes; auditors found source-grounded improvements and preserved constraints. |

The most visible false-rejection mechanisms are the composite date mismatch (`ar04`), claim-level hard findings on safe restructuring or compression (`ar12`, `ar37`, `ar40`), and full fallback after a partly unsafe edit (`ar05`, `ar14`). They are observations, not engine changes in this run. The audit found no evidence of broad objective authorization bypass, regular repair invention, or a final unsafe escape. The single-family, all-synthetic, short-heavy corpus and rare naturally unsafe candidates limit generalization. Blind reviewers agreed often but missed subtle semantic shifts; independent audit was necessary. Its safety review focused on specified high-risk and sampled cases, not every apparently correct one.

## Gates and next task

`pnpm` was unavailable, so installed project binaries and repository-supported `node --import tsx` commands were used. ESLint, `tsc --noEmit`, rules validation, **601/601 tests in 61 files**, **48/48 meaning fixtures**, **13/13 voice fixtures**, pinned V10 and V11 boundary replays, all pinned V13 exact-delta replay modes (`old`, `new`, `boundary`, `fresh`), the 40-case replay and integrity checks, and `next build --webpack` passed. The webpack production build was run locally; there was no deployment or push. No reconstruction behavior, production strategy, pinned verifier, editor contract, routing, rules, or engine code changed. Incremental paid API spend: **$0**.

**Exact next task:** repair only the composite weekday/date exact-delta authorization failure demonstrated by `ar04`, preserve V13 as the comparison baseline, rerun existing unsafe boundaries and a tiny fresh date confirmation, then decide whether to freeze the core architecture. Holdout V3 remains deferred and was not generated here.
