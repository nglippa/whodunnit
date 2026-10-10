# Candidate D: remaining 13 previously SAFE finals

**Decision: B — REMAINING COVERAGE REQUIRES SEMANTIC UNDERSTANDING.** Diagnostic checkpoint: `0efbf9c`. No implementation, replay, model output or judgment changes were made.

**Categories: A=2, B=1, C=6, D=4.** Semantic verification is the largest recovery need (6/13), with four independently justified abstentions and three mechanical/verified-artifact opportunities. The ordinary EDIT adapter is already connected; adding another generic adapter branch is not the main solution.

## Safety is not completion

Of these 13 frozen V15 finals, only **022 and 036 are SAFE/YES** and equal accepted RAW. The other **11 equal SOURCE**: eight SAFE/NO and three SAFE/PARTIAL (023, 024, 043). Returning those eleven exact V15 finals would not recover eleven successful edits. The 13-case “safe-final coverage gap” therefore contains only two already verified full completions; additional useful coverage requires accepting or correcting RAW, not copying FINAL.

RAW has no independent rating simply because V15 FINAL is SAFE. In 044, RAW equals frozen Astra FINAL exactly, whose label is SAFE/YES; that is corroborating text-equality evidence, not permission to bypass D’s authorized-update gate. No SAFE/PARTIAL output is counted as full success here.

## Quantified findings

| Measure | Count / cases |
|---|---|
| A — existing verifier/evidence can support the exact final without new architecture | 2: 022, 036 |
| B — small deterministic objective-state/binding correction | 1: 044 |
| C — semantic interpretation beyond current deterministic support | 6: 015, 017, 023, 024, 037, 041 |
| D — legitimate abstention for the available candidate/constraints | 4: 040, 043, 047, 048 |
| SOURCE satisfies OBJECTIVE completely | 0/13 |
| SOURCE objective labels | 10 NO; 3 PARTIAL; 0 YES |
| SOURCE frozen text safety | 12 SAFE; 1 UNSAFE (022) |
| Confirmed stale SOURCE (frozen safety class 1) | 1: 022 |
| Additional explicitly superseded SOURCE requirement | 1: 044’s deadline; frozen SOURCE is SAFE/NO, class 1 ABSENT |
| RAW usable with existing verifier and captured PASS | 2: 022, 036 |
| Additional narrow RAW recovery candidate after deterministic binding | 1: 044; not currently accepted |
| V15 FINAL usable as full completion | 2: 022, 036 |
| V15 FINAL correctly withheld as a full completion | 11: all SOURCE fallbacks |
| Unsupported semantic recovery questions | 6 C cases; no captured PASS for their RAW |
| Intrinsically justified case-level abstentions (D) | 4: 040, 043, 047, 048 |

“SOURCE valid” here means a valid **completed terminal under OBJECTIVE**, not merely fact-preserved prose. If “stale” means any explicitly superseded instruction rather than the frozen harmful-stale label, there are **two** objective-obsolete sources (022, 044); only 022 is a confirmed frozen stale-safety event. The remaining safe sources can be reference text, but not objective-complete results.

Categories are exclusive by evidence precedence: **A** has an already accepted, exact-text, objective-satisfying V15 review, even though D’s classification still blocks delivery; **B** lacks that accepted review but its complete requested factual change can be proved from supplied literals and a bounded typed relation; **C** needs a semantic equivalence/entailment assessment after any mechanical blockers are fixed; **D** has an adverse candidate finding or an unsatisfiable/underdetermined request. Category A does not authorize blindly returning V15 FINAL or bypassing REQUIRED_UPDATE.

## Compact case audit

All IDs below are `AC48V2-…`. **R** = frozen V15 RAW; **S** = byte-identical SOURCE. **U** = D reason `AMBIGUOUS_REPLACEMENT` in `CANNOT_SAFELY_COMPLETE`; **E** = `EDIT_AND_SOURCE_NOT_VERIFIED` in `EDIT`. All E paths also lack an independent objective-satisfying SOURCE review. The current replay’s E raw failure is `hard-meaning-failure` except 043 (`verifier-rejected`). Evidence links at the end of each row identify the exact frozen corpus, V15 record and decoded labels.

| Case / category | D state; objective requirement | SOURCE under objective | RAW disposition → V15 FINAL; frozen FINAL label | D reason; exact rejecting component | Can existing verification accept FINAL? / New semantic understanding? |
|---|---|---|---|---|---|
| **015 / C** | EDIT; Clear, friendly volunteer instructions; preserve steps, responsibilities and illness rule. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | E: V15 `checkProtectedSpans` / `extractNameSpans` synthesizes “Volunteer Arrival Experience At”; identity SOURCE is rejected too. RAW also has lexical claim-loss warnings; no review. | No for FINAL (S/NO); RAW needs semantic equivalence review after name-span repair.<br>Yes; equivalence beyond lexical overlap. [Evidence][e015] |
| **017 / C** | EDIT; Concise archive proposals/next steps; preserve tentative status, privacy and absent commitments. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | E: V15 integrity causal check blocks “so”; content alignment blocks deleted opening (23% overlap). Possible→asserted warning also needs review. | No for FINAL (S/NO); RAW needs cross-sentence causal/modality and claim alignment.<br>Yes; causality, tentative facts and framing. [Evidence][e017] |
| **022 / A** | CANNOT; Replace only Soren’s extension 218→241; preserve Lila’s 281 and receipt 2187. | not complete; extension 218 is stale (NO) | review, PASS → R (accepted); **SAFE/YES** | U: D `bind` cannot bind name-scoped bare extension; unbound “Replace his extension” trips directive guard. Existing V15 authorized 218→241 and has PASS. | Yes for exact R: authorized-change warnings + captured PASS. D still needs scope binding; never deliver S.<br>No new review for this exact artifact; cross-sentence role meaning is already in captured PASS. General D binding remains unimplemented. [Evidence][e022] |
| **023 / C** | CANNOT; Clarify school-booking disagreement without choosing a side or inventing dates. | partial, not complete (PARTIAL) | rejected, no review → S (source-fallback); **SAFE/PARTIAL** | U: D treats noun “planning update” as a command. Secondary V15 causal checks reject both added “so” explanations; repair failed. | No for FINAL (S/PARTIAL); fixing noun classification alone leaves RAW causal blockers.<br>Yes; entailment of unresolved disagreement and explanation. [Evidence][e023] |
| **024 / C** | EDIT; Readable account of conflicting bridge dates/causes; retain uncertainty and no unsupported blame. | partial, not complete (PARTIAL) | rejected, no review → S (source-fallback); **SAFE/PARTIAL** | E: V15 protected-number check introduces 2; integrity checks block causal mechanism/“so” and missing summary; temporal guard reports preservation conflict. | No for FINAL (S/PARTIAL); RAW needs uncertainty/attribution interpretation, not a numeric waiver.<br>Yes; conflicting evidence, causal scope and uncertainty. [Evidence][e024] |
| **036 / A** | CANNOT; Replace only the cumbersome discussion sentence; retain the exercise’s limited purpose. | not complete (NO) | preserved, PASS → R (accepted); **SAFE/YES** | U: D treats “Replace the cumbersome sentence” as a factual command with no literal replacement. Existing V15 has preserved + PASS. | Yes for exact R: preserved + captured PASS. A sentence-intent routing correction can reuse it.<br>No new review for this exact artifact; existing PASS covers the localized paraphrase. [Evidence][e036] |
| **037 / C** | CANNOT; Make only the desk-space sentence conversational; preserve the exact tin-label quotation. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | U: D treats sentence “Change” as an unbound fact command. Secondary V15 name check searches comma-less “CABLES PROBABLY”; exact quoted label is intact, but claim warnings remain and review is absent. | No for FINAL (S/NO); state correction alone leaves name blocker and unreviewed paraphrase.<br>Yes; punctuation bug is mechanical, but remaining local paraphrase has no captured PASS. [Evidence][e037] |
| **040 / D** | EDIT; Natural first-person recording account; retain events, lessons and uncertainty. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | E: V15 missing-claim checks block two removed framing sentences (8%/11% overlap). Separate manual concern: RAW strengthens “helped” to “fixed”; not a frozen RAW safety judgment. | No for FINAL (S/NO); this RAW needs correction, not automatic acceptance of a broad rewrite.<br>Not a safe inference to accept; certainty drift needs correction and recheck. [Evidence][e040] |
| **041 / C** | EDIT; Direct puzzle-loan memo; preserve counts, approval status, limits and test scope. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | E: V15 missing-claim check blocks discarded “aligned understanding” framing (9% overlap); no semantic review. | No for FINAL (S/NO); semantic proof of authorized framing deletion is absent.<br>Yes; framing versus substantive content. [Evidence][e041] |
| **043 / D** | EDIT; Gently tighten the reflection without changing fragments, images or mixed feelings. | partial, not complete (PARTIAL) | preserved, REJECT → S (source-fallback); **SAFE/PARTIAL** | E: V15 semantic reviewer REJECTs the sole “when I cannot”→“if I can’t” edit: no tightening and actuality becomes hypothetical. | No for FINAL (S/PARTIAL); existing reviewer already rejects RAW.<br>No acceptance inference is licensed; existing REJECT is adverse evidence. [Evidence][e043] |
| **044 / B** | CANNOT; Change only summary deadline from “after the final reading” to 5 July; preserve the noticeboard phrase. | not complete; deadline superseded, not a frozen stale-safety event (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | U: D has no phrase-to-day/month deadline binding. Secondary V15 blocks added 5 July and a preservation conflict; local repair failed. | No for FINAL (S/NO); R is a narrowly supplied update, assessable after typed binding/strict byte gate.<br>No new factual inference; date is supplied. Needs an explicit typed deadline relation (including “by”), not a global date exception. [Evidence][e044] |
| **047 / D** | CANNOT; Sincere endorsement while preserving the negative evaluation and refusal to buy again. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | U: D’s negated-directive guard hits “Do not … change”. Secondary V15 blocks added negation/causes; repair failed. The endorsement requirement conflicts with preserved negative evaluation. | No: neither ironic S nor negative R can satisfy sincere endorsement while preserving evaluation.<br>No semantic interpretation can reconcile the conflicting constraints without changing the objective. [Evidence][e047] |
| **048 / D** | EDIT; Unambiguous eligibility yes/no without adding an absent residency-policy definition. | not complete (NO) | rejected, no review → S (source-fallback); **SAFE/NO** | E: V15 causal check rejects explanatory “so”; no review. More fundamentally the rule leaves which residence counts unspecified. | No: S is incomplete; R explains missing policy but cannot supply the demanded yes/no.<br>A policy decision is missing; semantic interpretation alone cannot manufacture it. [Evidence][e048] |

## Exact components and interpretation limits

- D’s [unbound-directive guard](../src/lib/reconstruction/candidate-d/control.ts#L153) and [classification branch](../src/lib/reconstruction/candidate-d/control.ts#L172) explain the U cases 022, 023, 036, 037 and 044. The [negated-command guard](../src/lib/reconstruction/candidate-d/control.ts#L167) explains U for 047. The [V2 dispatch](../src/lib/reconstruction/candidate-d/safe-edit-adapter.ts#L27) preserves those non-EDIT states rather than reviewing a candidate.
- V15’s [deterministic gate](../src/lib/reconstruction/verified-reconstruction.ts#L256) stops semantic review for rejected RAW. Its [semantic acceptance/rejection](../src/lib/reconstruction/verified-reconstruction.ts#L267) explains 043. D’s [independent SOURCE recheck](../src/lib/reconstruction/candidate-d/safe-edit-adapter.ts#L67) prevents a preservation-only SOURCE fallback becoming completion.
- For 015 and 037, [name extraction](../src/lib/verification/protected.ts#L119) removes punctuation and rejoins capitalized tokens, while the [protection check](../src/lib/verification/verify.ts#L79) searches literal substrings. The synthesized strings do not even occur contiguously in SOURCE. These are concrete mechanical defects, but fixing them does not create the missing RAW semantic PASS. In 037 the target rewrite still has missing/added-claim warnings; changing its objective state alone cannot deliver it. Hence C, not B.
- Causal and framing complaints in 017, 023, 024 and 041 arise from [claim alignment, causal-relation and content checks](../src/lib/semantics/compare.ts#L214). Several look like false positives on reading, but “so,” uncertainty about conflicting records, and removal of rhetorical carriers need scoped semantic evidence. No unreviewed RAW is relabeled SAFE in this diagnosis.
- 044 also hits the [V15 temporal preservation-conflict gate](../src/lib/reconstruction/directive-scoped-temporal-verification.ts#L214). Its R changes only `after the final reading` to `by 5 July`. A future typed contract must prove the one named deadline replacement and the grammatical deadline relation, preserving every other byte and the quoted noticeboard phrase. It must not release the old S deadline or globally authorize dates.
- 040 is a separate diagnostic concern: SOURCE says the crate “helped with that particular problem”; RAW says it “fixed that problem.” That strengthens the effect beyond the supplied claim. This is our reading of the saved text, not a new frozen judgment. Missing-frame false positives do not license accepting this certainty change. 043 already has adverse captured review evidence; 047’s constraints conflict; 048 needs a missing policy decision, not a cleverer yes/no inference.

Abstention is therefore correct for four D cases as they stand. The additional seven B/C cases also remain correctly withheld **pending proof**, although their objectives may be recoverable. By contrast, A’s two exact finals already have usable verification evidence; their barrier is controller integration. These counts distinguish justified current withholding from an inherently unrecoverable objective or defective candidate.

## Smallest next implementation slice

First address **036 only** with an explicit typed sentence-edit intent: a supplied request to replace prose is not an unbound factual replacement. Route that state through the already existing V15 EDIT verification and captured PASS, while preserving non-success for missing values, conflicting commands, and factual updates. This would recover one currently SAFE/YES final without changing the editor or adding a new verifier.

Then separately bind **022’s named extension** to its exact SOURCE claim, supplied 241 and protected neighboring values, reusing the existing scoped V15 evidence while retaining D’s strict final gate and stale-SOURCE rejection. No arbitrary CANNOT→EDIT fallback. **044** is the next small deterministic contract opportunity, but its correct R would be a new valid D completion, **not recovery of the old V15 FINAL**, which is S/NO.

Leave the six C cases behind the semantic gate until claim-level equivalence/entailment can be established, and keep the four D cases abstained unless the candidate or objective changes. Do not waive all low-overlap, causal-token, or protected-name failures to reach 13/13. No new benchmark, generation or routing behavior is proposed in this diagnostic commit.

## Evidence and count validation

The set was read directly from the existing V2 replay: `previousDisposition == ABSTAINED`, `v15FrozenJudgment.safety == SAFE`, and `recoveredSafeV15Final == false`. It yields exactly these 13 unique cases. Each is still ABSTAINED. Corpus/RAW/final identities, saved verification fields, and decoded safety/objective labels were cross-checked case-by-case; category totals sum to 13. Frozen input fingerprints match the V2 manifest; V1 and V2 replay files were not rewritten. No application tests, replay execution, live calls or new outputs were needed.

Frozen input fingerprints:

- `data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json`: `464eafef5b49cc5c6e9a80ff96ba2bed9661cdc3e7f5c1fa73ba00b2d0dc8f22`
- `data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl`: `08deccc8263f956fa0b69c7a6a768f50464565fbfce51af705fd698d2605e152`
- `data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json`: `092863cc9946722af3951e814e7094ae3603f2c70aea8ca12865ac61a0979d13`

Current replay: `.evaluations/candidate-d-frozen-48-v2/replay.json`; baseline report: [CANDIDATE-D-FROZEN-REPLAY.md](CANDIDATE-D-FROZEN-REPLAY.md). Each case reference below points to the SOURCE/objective, exact V15 RAW/result record, and frozen final-arm labels; evidence paths and line anchors were validated.

[e015]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L58

AC48V2-015: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L272), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L58), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L810).

[e017]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L66

AC48V2-017: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L310), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L66), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L924).

[e022]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L86

AC48V2-022: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L408), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L86), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L1209).

[e023]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L90

AC48V2-023: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L429), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L90), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L1266).

[e024]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L94

AC48V2-024: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L446), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L94), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L1323).

[e036]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L142

AC48V2-036: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L662), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L142), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2007).

[e037]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L146

AC48V2-037: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L681), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L146), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2064).

[e040]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L158

AC48V2-040: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L745), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L158), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2235).

[e041]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L162

AC48V2-041: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L767), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L162), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2292).

[e043]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L170

AC48V2-043: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L810), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L170), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2406).

[e044]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L174

AC48V2-044: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L828), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L174), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2463).

[e047]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L186

AC48V2-047: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L899), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L186), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2634).

[e048]: ../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L190

AC48V2-048: [corpus](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json#L920), [V15](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl#L190), [labels](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json#L2691).
