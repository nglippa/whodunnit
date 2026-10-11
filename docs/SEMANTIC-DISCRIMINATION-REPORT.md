# Semantic discrimination: frozen results and primary audit

**NO-GO for implementing claim-level semantic correspondence in Candidate D.** The selected responses agree with all twelve authored labels, and the primary audit finds the nine proposed repairs sound. Independent proposition/repair verification has not been established. No new model calls were made. This report is a primary-agent AI audit, not an independent human or model evaluation.

## Freeze and unblinding

Archive validation passed before unblinding. The twelve selected responses were frozen in `selected-responses.frozen.json` before the existing `report` command opened the private key. That command independently froze all first-attempt and retry records in `reviews.frozen.json`, verified the private key fingerprint, and then produced `discrimination-report.json`. The twelve selections are eleven valid first attempts plus the explicitly labeled SP-008 retry. Every selection is bound to request, prompt, SOURCE, OBJECTIVE, candidate, raw response, metadata and validation hashes.

SP-008's original response, metadata, offsets, fingerprints and INVALID archive status remain unchanged. Its original `[200,223)` span fails exact equality; the separately captured retry supplies valid `[201,224)` offsets. It is not counted as a successful first attempt.

## Aggregate results

| Measurement | Result |
| --- | --- |
| Selected legitimate paraphrases accepted | 3/3 |
| Selected meaning-changing controls withheld | 9/9 LOCAL_REPAIR; no REJECT verdicts |
| False acceptance / false rejection | 0 / 0 against authored labels |
| Confusion matrix, positive = legitimate candidate accepted | TP 3, TN 9, FP 0, FN 0 |
| Primary audit: relevant proposition identified | 12/12; actual control defect identified 9/9 |
| Primary audit: correct repair instructions | 9/9 apparent; independent correctness unassessed |
| Exact selected UTF-16 repair spans | 9/9 |
| Structured evidence / literal quote validation | 12/12 selected responses |
| First-attempt format reliability | 11/12 (91.7%); SP-008 INVALID |
| Valid first-attempt discrimination | 3 true acceptances, 8 true rejections, 0 errors; 1 unscored invalid control |
| Retry format reliability / dependence | 1/1; complete selected coverage depends on the SP-008 retry |
| Correct propositions/repairs independently verified | Unknown; no independent reviewer obtained |

LOCAL_REPAIR is a non-PASS disposition of the submitted candidate, not an accepted repaired output. All nine repairs are prose instructions in `issue.constraint`, not structured replacement outputs. The audit interprets the exact quoted replacement, checks its single-span hypothetical splice in memory, and inspects its meaning. No repair was executed by a repairer, persisted as a model output, or substituted into any frozen response. Four hypothetical splices reproduce the frozen direct output byte-for-byte; five use different but apparently equivalent wording.

## Twelve-request matrix

All semantic/proposition/repair assessments in this matrix are primary-agent findings; independent audit remains UNASSESSED. Bounds are mechanically verified. TA = true acceptance, TR = true rejection against the authored labels.

| Request | Case / control | Protected proposition | Verdict / outcome | Primary proposition audit | Proposed repair / offsets |
| --- | --- | --- | --- | --- | --- |
| SP-001 | EI-005 / CHANGE | Token returned on opening | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [216,270) exact |
| SP-002 | EI-004 / ATTRIBUTION | Steadier impression belongs to second run | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [201,235) exact |
| SP-003 | EI-003 / SCOPE | Umbrella use confined to grounds | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [88,136) exact |
| SP-004 | EI-003 / ORIGINAL | All umbrella instructions preserved | PASS / TA | Relevant, correct; representative quotes | N/A |
| SP-005 | EI-005 / ORIGINAL | Visitor token before swimming; other advice retained | PASS / TA | Relevant, correct; representative quotes | N/A |
| SP-006 | EI-003 / CHANGE | Borrowing is free | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [0,43) exact |
| SP-007 | EI-004 / CHANGE | No recording made | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [225,243) exact |
| SP-008 | EI-004 / DELETE | No-recording qualification retained | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [201,224) exact; RETRY |
| SP-009 | EI-005 / TIMING | Token obtained before swimming | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [199,204) exact |
| SP-010 | EI-004 / ORIGINAL | Runs, impression, no recording and tentative plan retained | PASS / TA | Relevant, correct; representative quotes | N/A |
| SP-011 | EI-005 / DELETE | Hooks usually full by seven | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [53,86) exact |
| SP-012 | EI-003 / DELETE | Free policy retained | LOCAL_REPAIR / TR | Actual defect identified | Apparent correct; [0,10) exact |

## Case-level supporting evidence

The following quotations and repair instructions are copied from the frozen responses. Literal quotations have been checked against the exact bound inputs. Null candidate quotations are omission assertions, not quotations; the primary audit checks absence against the entire candidate. This does not substitute for independent semantic authorization.

### SP-001 — EI-005 / CHANGE

SOURCE quotation: "You get the token back when you open the locker.".
Candidate quotation: "You don't get the token back when you open the locker.".
Verifier proposition: Opening the locker returns the token; the candidate reverses this fact.
Primary audit: The source promises token return when the locker opens; the control explicitly denies it. The quoted polarity conflict supports withholding. The proposed sentence restores that fact without changing the surrounding visitor condition, timing, or voice.
Repair instruction, verbatim: Replace with "You get the token back when you open the locker." to preserve the source's practical fact.
Exact target: "You don't get the token back when you open the locker." at [216,270). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-002 — EI-004 / ATTRIBUTION

SOURCE quotation: "The second run felt steadier to us".
Candidate quotation: "The first run felt steadier to us".
Verifier proposition: The steadier impression concerns the second run.
Primary audit: The source assigns the steadier impression to the second run; the control assigns it to the first. The repair changes only that attribution. The separate sentence about not recording the second run and the tentative repeat plan remain unchanged.
Repair instruction, verbatim: Replace with "The second run felt steadier to us." The source attributes the subjective impression to the second run.
Exact target: "The first run felt steadier to us." at [201,235). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-003 — EI-003 / SCOPE

SOURCE quotation: "The umbrellas should remain within the building grounds.".
Candidate quotation: "feel free to take it beyond the building grounds".
Verifier proposition: Umbrellas must remain within the building grounds.
Primary audit: Permission to go beyond the grounds contradicts the source restriction and explicit objective. The proposed phrase restores the original accepted wording. The proposition label uses 'must' where SOURCE uses 'should'; the objective explicitly calls this a restriction. This wording-strength caveat does not introduce a new fact into the proposed repair.
Repair instruction, verbatim: Replace this span with "keep it within the building grounds" to preserve the source restriction explicitly required by the objective.
Exact target: "feel free to take it beyond the building grounds" at [88,136). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-004 — EI-003 / ORIGINAL

SOURCE quotation: "No payment is required.".
Candidate quotation: "Umbrellas are free to borrow.".
Verifier proposition: All borrowing instructions, the WET label, drying purpose, free policy and grounds restriction are preserved in natural instructions.
Primary audit: Full-text comparison preserves stand location, grounds restriction, WET return, drying before subsequent borrowing, and free policy. The quotes demonstrate only the free policy; they are representative evidence, not an exhaustive proof of the proposition's 'all instructions' assertion.
No repair proposed. Full-text comparison supports PASS; cited excerpts alone do not prove every protected proposition.

### SP-005 — EI-005 / ORIGINAL

SOURCE quotation: "acquisition of a token from the counter".
Candidate quotation: "get a locker token from the counter before you swim".
Verifier proposition: Visitors must obtain a counter token before swimming; all other advice is unchanged.
Primary audit: The rewritten sentence preserves the visitor condition, counter token, and before-swimming requirement. The rest of the paragraph is exactly unchanged. The cited source fragment omits the visitor and timing qualifiers; full SOURCE supports them, but the quote alone does not substantiate the whole stated proposition.
No repair proposed. Full-text comparison supports PASS; cited excerpts alone do not prove every protected proposition.

### SP-006 — EI-003 / CHANGE

SOURCE quotation: "No payment is required.".
Candidate quotation: "There is a small fee to borrow an umbrella.".
Verifier proposition: Borrowing is free; the candidate contradicts this policy.
Primary audit: The fee assertion contradicts free borrowing. Replacing it with the quoted free-policy sentence restores the actual proposition. The sentence differs from the frozen original's wording, but introduces no new payment, actor, timing, or scope claim.
Repair instruction, verbatim: Replace this sentence with "Borrowing an umbrella is free." to preserve the source's explicitly required free borrowing policy.
Exact target: "There is a small fee to borrow an umbrella." at [0,43). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-007 — EI-004 / CHANGE

SOURCE quotation: "we did not make a recording".
Candidate quotation: "we recorded it".
Verifier proposition: Whether the group recorded the rehearsal
Primary audit: The control asserts a recording where SOURCE explicitly says none was made. The quoted repair restores the negative qualification while preserving 'felt steadier to us', avoiding conversion to a measured result. Its wording is more formal than the frozen direct output; that is a style difference, not a new meaning claim.
Repair instruction, verbatim: Replace this span with "although we did not make a recording" to preserve the explicitly required lack of a recording.
Exact target: "and we recorded it" at [225,243). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-008 — EI-004 / DELETE

SOURCE quotation: "although we did not make a recording".
Candidate quotation: null (claimed omission).
Verifier proposition: No recording was made
Primary audit: The complete candidate contains no recording qualification. Null candidateQuote is a truthful omission claim after full-text inspection, not independently provable from null alone. The retry's proposed sentence restores the lack of a recording and subjective impression. The permanently invalid first attempt proposed a plausible restoration but had offsets one UTF-16 unit too early.
Repair instruction, verbatim: Replace with "It felt steadier to us, although we didn't make a recording." to restore the explicitly required recording limitation.
Exact target: "It felt steadier to us." at [201,224). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-009 — EI-005 / TIMING

SOURCE quotation: "prior to commencing their swim".
Candidate quotation: "after you swim".
Verifier proposition: Visitors must obtain the locker token before swimming.
Primary audit: The source requires a token before swimming; the control says after. The one-word repair restores timing and leaves visitor scope, counter location, and other advice unchanged.
Repair instruction, verbatim: Replace "after" with "before" to preserve the source requirement to obtain the token before swimming.
Exact target: "after" at [199,204). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-010 — EI-004 / ORIGINAL

SOURCE quotation: "felt steadier to us, although we did not make a recording".
Candidate quotation: "felt steadier to us, though we didn't record it".
Verifier proposition: Events, subjective impression, missing recording, and tentative plan are preserved.
Primary audit: The paraphrase preserves both runs, the listening theme, subjective steadiness, no recording, and repeating the exercise without finalizing the arrangement. The quoted evidence covers steadiness and no recording, but not all events or the future plan.
No repair proposed. Full-text comparison supports PASS; cited excerpts alone do not prove every protected proposition.

### SP-011 — EI-005 / DELETE

SOURCE quotation: "the hooks are usually full by seven".
Candidate quotation: null (claimed omission).
Verifier proposition: Hooks are usually full by seven; this practical fact was omitted.
Primary audit: The source's usual hook occupancy by seven is absent; the floor-wet statement is retained. The sentence replacement restores the usual-frequency hedge and time while preserving every other sentence and factual claim.
Repair instruction, verbatim: Replace with "The changing-room floor gets wet, and the hooks are usually full by seven." The objective requires keeping practical facts.
Exact target: "The changing-room floor gets wet." at [53,86). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

### SP-012 — EI-003 / DELETE

SOURCE quotation: "No payment is required.".
Candidate quotation: null (claimed omission).
Verifier proposition: The candidate omits the explicitly required free borrowing policy; the remaining instructions are preserved.
Primary audit: The source and objective explicitly require a free policy that is absent. 'Borrow an umbrella for free' restores it and keeps the rest unchanged, including the stand, grounds, WET tray and drying purpose. It replaces 'Choose one' with a singular borrowing instruction, judged equivalent in this context; this is a semantic interpretation requiring independent confirmation, not byte-identical restoration.
Repair instruction, verbatim: Replace this span with "Borrow an umbrella for free" to identify the item and restore the source's free borrowing policy.
Exact target: "Choose one" at [0,10). The hypothetical single-span replacement preserves the prefix and suffix byte-for-byte; primary review finds no introduced meaning change.

## Evidence quality and independence

No material hallucinated or misattributed claim was confirmed in the selected responses by the primary audit. However, the SP-003 proposition label says “must” where SOURCE says “should”; the objective explicitly specifies a grounds restriction, and the proposed repair restores the original accepted directive. This wording-strength nuance is retained for independent scrutiny.

The three PASS reasons assert broad preservation while quoting only representative evidence. SP-004 quotes the free policy but not the stand, tray, drying sequence or grounds. SP-005's source quote omits visitors and before-swimming timing; those are present in the full SOURCE. SP-010 quotes subjective steadiness and no recording but not both runs or the tentative plan. These are incomplete correspondence receipts even though the full-text primary audit supports the decisions. All uncertainty fields are null; the probe contains no dedicated ambiguous-equivalence control and therefore does not establish reliable uncertainty calibration.

The primary assistant participated in preparing the controls and harness and audited these results after unblinding. Its findings cannot establish an independent evaluation. An independent human review or separately permitted independent model review was not obtained. Independent proposition-identification and repair-accuracy rates remain unknown rather than being inferred from label agreement or schema validity.

## Model provenance and limits

Requested verifier: `gpt-6.1-sol`, requested reasoning `high`, user-operated Codex CLI `0.162.1`, profile label `codex3`. All thirteen response records (twelve first attempts plus retry) have no reported model identity. Actual responding identity, generator/verifier runtime independence, enforced provider configuration, output limits and internal retry behavior are unverified. Cost and provider inference latency are unknown, not zero. The supplemental evidence-format instruction is separately fingerprinted; the effective input is the original frozen prompt plus that unchanged supplement. No model was substituted by this audit.

This is twelve matched candidates over three existing sources, with nine author-created single-proposition controls. It establishes observed agreement on these cases, not general semantic-verifier reliability or statistical significance. Successful repair here does not show that existing early deterministic failures can be safely overridden. Candidate D and production behavior remain unchanged.

## Smallest justified next step

Have an independent human audit the already frozen twelve-row packet, prioritizing PASS evidence coverage, the three omission assertions, SP-003's obligation wording, and SP-012's selection-to-borrowing equivalence. The detailed frozen audit JSON contains the complete SOURCE, OBJECTIVE, candidate, citations, original repair instructions and bindings for every row. Record that reviewer's provenance and judgments separately; do not rewrite these artifacts. Keep Candidate D unchanged until independent semantic and repair correctness is established.

## Frozen artifacts and fingerprints

Artifacts live under `.evaluations/semantic-discrimination-probe-v1/`.

| Artifact | SHA-256 |
| --- | --- |
| Selected response set (`selected-responses.frozen.json`) | `d2dba988051e6cf96bc293dbee03efef1e4e9c090ca225fd42d77985b7f99c18` |
| Complete first/retry freeze (`reviews.frozen.json`) | `175b4046c117cc7c73699890865246f1e7a3cf1e762144c0589096200caa960e` |
| Primary evidence/repair audit (`proposition-audit.frozen.json`) | `7b24da74b436d73a3e56df33b0aafdd209faba1940a550d41355e31edc54554d` |
| Mechanical unblinded report (`discrimination-report.json`) | `3175e8a1d0ebb820f51496126ce7242d1a493c4e490a53a1f24ef4ac4208d6ed` |

The companion `frozen-report-fingerprints.json` records this document's own SHA-256 and the artifact/input snapshot hashes. All pre-existing request, capture, import, retry, control and supplement bytes are checked against `audit-input-snapshot.json` after the audit. No application tests, model calls, source edits, push or deployment were performed for this report.
