# Candidate D: objective-conditioned editing control

**Decision: A — Candidate D architecture ready for an isolated implementation.** This is an architecture derived from the frozen internal product benchmark, not a promotion decision or a new benchmark. Candidate C must not advance; V15 remains current only as the existing implementation, not because it met the safety bar. Neither published implementation changes in this pass.

## Evidence and interpretation boundary

The evidence is the 48 frozen cases and 192 frozen arm records at benchmark commit `0880515b59ea3d20ba8984e87818810eadb93ba1`: [`ASTRA-PRODUCT-BENCHMARK-48-V1.md`](ASTRA-PRODUCT-BENCHMARK-48-V1.md), [`corpus.json`](../data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json), [`outputs.jsonl`](../data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl), and the frozen [`decoded-case-results.json`](../data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json), [`safety-results.json`](../data/evaluation/astra-product-benchmark-48-v1/blind/safety-results.json), and [`preference-results.json`](../data/evaluation/astra-product-benchmark-48-v1/blind/preference-results.json). RAW is the V15 editor candidate before final selection. The blind judges rated **final arms**, not RAW. A claim that RAW was correct below is limited to comparing its exact changes with supplied objective facts and the independently judged Astra final; it is not a retrospective RAW safety judgment.

The measured control gap is between **candidate verification** and **terminal selection**. V15's [`runVerifiedCore`](../src/lib/reconstruction/verified-reconstruction.ts) verifies a candidate against SOURCE plus narrowly recognized objective exceptions. On a hard deterministic failure, semantic review is skipped; an unavailable, rejected, or unsuccessful local repair leads to `finish(source, "source-fallback", ...)`. `finish` computes a final verification but does not make objective satisfaction or current-fact validity a gate on returning SOURCE. C's [`runPostV3Candidate`](../src/lib/reconstruction/post-v3/index.ts) similarly has an `abstain` path that returns SOURCE, marked as reference and incomplete, while its `finish` recomputes verification without preventing this terminal text. That disclosure is important but does not make the returned text itself current. The benchmark judged output text, not a separate product disclosure interface.

The failure is therefore not simply excessive conservatism in generating prose. SOURCE is a legitimate preservation baseline, but when OBJECTIVE supersedes a SOURCE fact, SOURCE is no longer an intrinsically safe publishable answer. The reciprocal problem is that an optional edit of already-effective text is treated as an invitation to generate and accept a change. Both are errors in deciding **whether change is required** before evaluating the edit.

## Case-level failure topology

Notation: `S` means byte-identical to SOURCE; `R` means V15 RAW; `A=R` means Astra's final text is byte-identical to that RAW. `safe/yes`, `unsafe/no`, etc. are frozen final-arm safety/objective judgments. The comparison preference is the decoded blind pair judgment; `—` indicates that a jointly-safe preference is inapplicable. Every listed C RAW input was the saved V15 RAW.

### All eight supplied-update cases

| Case | SOURCE state and objective-authorized transition | RAW / Astra | V15 final and control point | C final and control point | Final judgment / preference |
|---|---|---|---|---|---|
| 005 | Appointment Wed Nov 4, 3:30 and Alder entrance → Thu Nov 5, 11:15 and Pine side door | R applies all; A=R | S; deterministic FAIL, repair failed | S; no review, unchanged repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 006 | Three invoices, $840, Mar 12 → two, $560, Apr 9 | R applies all; A=R | S; deterministic FAIL, repair failed | S; no review, unchanged repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 007 | Fri Feb 6, 7–9, 40 visitors, science entrance → Sat Feb 7, 6–8, 32, west gate | R applies all; A=R | S; deterministic FAIL, repair failed | S; no review, unchanged repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 008 | Recovery every two minutes, 14 days → five minutes, 21 days | R applies both; A=R | S; deterministic FAIL; no local repair | S; no review, no safe local repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 029 | £45/hour and £540 total → £48/hour and £576 | R applies both; A=R | S; deterministic FAIL, repair failed | S; no review, unchanged repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 030 | 44.1 kHz, AMBER → 48 kHz, CEDAR | R applies both; A=R | R; deterministic NEEDS_REVIEW, semantic PASS | S; one review, no safe local repair | V safe/yes; C unsafe/no; Astra safe/yes; V–A tie |
| 031 | Eight tools, 14 days → six tools, 21 days | R applies both; A=R | S; deterministic FAIL; no local repair | S; no review, no safe local repair | V/C unsafe/no; Astra safe/yes; Astra wins |
| 032 | Room Alder, grey wool → Room Willow, navy wool | R applies both; A=R | R; deterministic NEEDS_REVIEW, semantic PASS | S; one review, no safe local repair | V safe/yes; C unsafe/no; Astra safe/yes; V–A tie |

V15 completed **2/8** because it accepted 030 and 032; in the other **6/8**, deterministic preservation checks blocked the objectively specified RAW replacement and the source fallback restored obsolete facts. C completed **0/8**: it fell back in those six and also rejected the two V15-accepted RAW edits. The C trace proves the decision point (`deliver(raw)` failed, then no accepted local repair, then `abstain`); it does **not** persist the individual review or all `deliver` predicates for 030/032, so attributing those two to a specific review field would exceed the evidence. All eight Astra successes were localized replacements, not broad reconstructions: Astra final equals V15 RAW byte for byte in **8/8**.

### All eight already-good cases

Here SOURCE already met the objective. Astra returned S in **8/8**. All listed final texts were judged text-safe, but unnecessary change and objective completion remain separate dimensions.

| Case | SOURCE / OBJECTIVE state | V15 RAW → FINAL | C FINAL | Astra FINAL; C–A preference | Control lesson |
|---|---|---|---|---|---|
| 001 | Clear audio-walk introduction; retain if followable | S → S | S | S; tie | Keep works. |
| 002 | Usable internal guide; change only to prevent misunderstanding | Small clarification → R | R | S; **C preferred** | A localized, useful optional edit can beat KEEP. |
| 003 | Effective literary analysis; leave effective sentences | S → S | S | S; tie | Keep works. |
| 004 | Personal essay; minimal clarity edits, preserve heading | Several phrasing changes → R | R | S; **Astra preferred** | Accepted rewrite was not worth its cost. |
| 025 | Effective restrained opening scene; smooth only if useful | Pronoun substitution → R | R | S; tie; V/C objective PARTIAL, Astra YES | An accepted change can fail the restraint objective. |
| 026 | Warm, fluent personal note; punctuation/fluency check | Contraction → R | R | S; tie | No demonstrated need to rewrite. |
| 027 | Clear research-limit paragraph; preserve engagement/learning distinction | Two proposed changes → repaired single change | Same repaired text | S; tie | Repair can make an optional edit safe without making it necessary. |
| 028 | Playful family recollection; preserve exact quotation | Two proposed changes → S through repair | One repaired change | S; tie | C retained an optional edit that V15 removed. |

V15 returned S in **3/8** (001, 003, 028); C in **2/8** (001, 003). Their other edits are not all judged harmful, and 002 is a real C win. Candidate D therefore needs a **positive reason to edit**, not an unconditional KEEP rule: if SOURCE satisfies the objective and a defined quality gate finds no material problem, KEEP; if it identifies a concrete authorized improvement, an optional edit may proceed and must justify its added risk.

### Remaining confirmed stale-fact events and the other two C wins

The five missing-value rows contain a current/superseded SOURCE fact but no authorized replacement value. The objective cannot be fully completed. Astra changed the text to qualify the old value or state that the new value was unavailable; its finals were judged safe/partial. V15/C returned S. No replacement was invented.

| Case | SOURCE state / objective | RAW → V15 FINAL | C FINAL | Astra final; frozen judgment and control point |
|---|---|---|---|---|
| 010 | Biography gives old date; new date and piece title unsupplied | Adds missing-information sentence → S (`invalid-verifier`) | S (`repair-rejected`) | Removes/qualifies stale date; V/C unsafe/no, A safe/partial; A preferred. |
| 011 | Old dispatch deadline; new deadline unsupplied | S → S (`verifier-rejected`) | S (`no-safe-local-repair`) | Marks date changed and unknown; V/C unsafe/no, A safe/partial; A preferred. |
| 012 | Old key-safe code; new code unsupplied | S → S (`verifier-rejected`) | S (`inconsistent-review`) | Says code changed but unavailable; V/C unsafe/no, A safe/partial; A preferred. |
| 033 | Old edition size; revised figure unsupplied | S → S (`verifier-rejected`) | S (`inconsistent-review`) | Withholds old size, names missing figure; V/C unsafe/no, A safe/partial; A preferred. |
| 034 | Old nightly price and bus time; replacements unsupplied | S → S (`verifier-rejected`) | S (`no-safe-local-repair`) | Withholds old figures and names missing values; V/C unsafe/no, A safe/partial; A preferred. |
| 022 | Soren extension 218 → 241; Lila extension, receipt, exact phrase protected | Correct one-number R → R; semantic PASS | S; zero reviews, `no-safe-local-repair` | A=R; V safe/yes, C unsafe/no, A safe/yes; V–A tie. C's earlier deterministic path rejected the delta. |
| 046 | Route length 7 km → 8 km; duration and phrase protected | Correct one-number R → S (`hard-meaning-failure`) | S (`no-safe-local-repair`) | A=R; V/C unsafe/no, A safe/yes; A preferred. |
| 020 | Voice-sensitive personal account; lightly improve flow without strengthening uncertainty | Restrained R → R, accepted | R | Astra S; all safe; **C preferred** over Astra. |
| 039 | Inflated sound-recording policy memo; reconstruct without expanding scope | Structured R → R, accepted | R | Astra different reconstruction; all safe/yes; **C preferred** over Astra. |

Case 002 above is the third safe C-over-Astra win. The comparison does not imply that C's new retention policy caused those wins: in 002, 020, and 039 C returned the same RAW text V15 returned. In broad cases 015 and 017, V15/C rejected or fell back from reconstructed RAW, leaving safe but objective-incomplete SOURCE while Astra delivered safe, complete reconstructions. These are evidence that Candidate D must preserve a route for substantial editing, even though the first implementation slice should address the better-isolated state-control failures.

Case 009 is **unresolved**, not a confirmed stale event: SOURCE/V15/C returned a “$2,150 so far” statement and both original judges disagreed on whether it became a stale completed fact under an unsupplied-final-total objective. It must not be added to the confirmed counts. Case 045 is a useful positive control: all three editors and Astra made the exact “top drawer” → “middle drawer” substitution and were judged safe/yes; SOURCE was judged unsafe/no.

## Quantified mechanisms

The confirmed stale-fact events are **12 V15 arm-cases and 15 C arm-cases**. Every one of those final texts is byte-identical to SOURCE: **12/12 V15** and **15/15 C**. The mechanism is preserved/restored SOURCE, **zero confirmed stale events introduced by a generated final mutation**. V15's 12 comprise six supplied updates (005–008, 029, 031), five missing-value updates (010–012, 033–034), and the localized supplied change 046. C's 15 comprise all eight supplied updates, those five missing-value updates, and localized changes 022 and 046. These are 27 arm-case events across 15 unique cases, not 27 independent source cases. Case 009 is additional unresolved evidence.

V15 had **24** `source-fallback` trace outcomes. In **eight** of those (005–008, 029, 031, 044, 046), RAW made only the explicit, localized requested replacement(s), and Astra's independently generated final was byte-identical to RAW. Six are the supplied-update stratum; 044 and 046 are localized change traps. That is strong evidence of useful RAW being discarded, but it is **not** an eight-case blind RAW safety rating. The other fallback RAWs include unchanged drafts, missing-value disclaimers, and broad edits with unresolved verification; the benchmark does not establish that those RAWs should have been accepted. The overall benchmark also found no case where C rescued a *verbatim safe, objective-complete* RAW that V15 discarded.

C's partial-retention policy was applied **after** a V15 RAW had been generated. Its final-selection and objective-contract path is different from V15's, and its `abstain` terminal path returns SOURCE even when that fails the objective. The three C-only safety losses (022, 030, 032) all have V15/Astra final equal to the same correct RAW and C final equal to obsolete SOURCE. In 022 C stopped before semantic review; in 030/032 it made one review call but did not deliver. There was no accepted safe repair. Thus C added three safety regressions without any supplied-update completion or jointly-safe preference gain over V15; a promised “useful partial” option cannot compensate for discarding mandatory facts.

## Candidate D control architecture

Candidate D should be a **new versioned runner and strategy**, leaving V15 and C intact. The smallest change is to put an objective-state and terminal-validity controller around the existing editor/verification primitives. It must distinguish facts that SOURCE supplies, facts that OBJECTIVE supersedes, and facts OBJECTIVE says are unavailable. It must never infer a missing value from context or a model's suggestion.

| Pre-edit state | Evidence required | Permitted terminal behavior |
|---|---|---|
| `SOURCE_SATISFIES` | OBJECTIVE is already met and a concrete quality check finds no material defect | Return byte-identical SOURCE as KEEP, without an editor call. If the quality check is uncertain, do not call it “already good.” |
| `OPTIONAL_IMPROVEMENT` | SOURCE remains true/current; a localized or broader quality issue is identified and editing is permitted | Run editor only for the identified issue; accept a verified improvement or return valid SOURCE. A mere changed text is not improvement. |
| `REQUIRED_UPDATE` | OBJECTIVE supplies an authorized old→new fact transition that can be uniquely bound to SOURCE | Require every authorized delta in the final, protect unrelated facts, and verify objective completion. If editing/verification fails, use an independently verified minimal authorized update where possible; otherwise abstain. Never publish unchanged stale SOURCE. |
| `CANNOT_SAFELY_COMPLETE` | Required replacement is missing, conflicting, ambiguous, or cannot be verified | Return no publishable completed edit. Report the missing/contested requirement and, if showing SOURCE for reference, mark it explicitly as superseded/unverified so it cannot be mistaken for current final copy. A carefully qualified partial draft is a possible later capability, not an automatic fallback. |

An objective may mix states by claim: a document can need two required replacements, preserve several unrelated facts, and permit optional style edits. Classification must bind the full required delta set before generation, not select one convenient replacement. Every delta records SOURCE span/claim, old literal, supplied replacement, objective evidence, scope, and protected neighboring facts. A deterministic extractor should cover unique, explicit replacements first (including numbers spelled in words, dates/times, names/locations, codes and units). If two targets match, the replacement conflicts with a protection, or a needed value is absent, do not guess. The model may rewrite surrounding prose; it cannot create authority. If the final uses paraphrase, verification must still prove the authorized state transition and absence of the old current assertion.

### Objective-conditioned fallback invariant

Before *any* terminal return, evaluate `validTerminal(text, objectiveContract)`:

1. Is the output structurally valid and semantically safe under preservation constraints **after applying only authorized transformations**?
2. Are all mandatory, supplied transitions present in the right claim scope, with old current assertions absent?
3. Are missing or contested values withheld rather than invented or silently preserved as current?
4. Is SOURCE itself still valid under this OBJECTIVE? If not, SOURCE may appear only as clearly labeled reference material, never as a completed editable result.

`source === final` is neither a safety verdict nor an objective verdict. Verification failure is a reason to withhold a draft, not a license to return a newly invalid baseline. A safe textual reversion is available only when the objective leaves SOURCE valid.

### Verification and repair

Preserve V15's separate editor and verifier, schema validation, bounded calls, deterministic-first gate, claim-level checks, protected spans, voice guard, and localized repair followed by a **full recheck**. Keep deterministic protection of negation, numbers, certainty/modality, temporal meaning, comparisons, named entities, claim scope, and unauthorized factual mutation. Those checks should operate against a contract-aware baseline: SOURCE facts outside authorized deltas remain preservation constraints; an authorized old fact is not protected merely because it appeared in SOURCE, and its supplied replacement is not an unauthorized new fact. Disagreement or failed alignment remains blocking. Semantic review can add a rejection but cannot override a deterministic failure without a separately verified authorized exception.

Replace the unconditional `finish(source, source-fallback, ...)` and C `abstain(... return source ...)` **terminal semantics**. Do not broadly relax the preservation verifier, remove safety checks, or tune prompts as the sole fix. For a `REQUIRED_UPDATE` case, first verify editor output against the bound delta set; if a narrow formatting defect is repairable, attempt one scoped repair and fully recheck it. When the model draft is rejected but a byte-scoped, objective-authorized minimal replacement can be constructed, verify that replacement independently before delivery. If it fails, abstain. For missing values, ask for the replacement or offer an explicitly incomplete, safe reference; do not output old facts as a current completed update.

## Minimal implementation surface and first slice

The first slice is **deterministic objective-state classification plus an objective-conditioned final-return gate**, with no live model calls. Add a new Candidate D contract/controller module and versioned runner entry point; reuse existing claim extraction, deterministic semantic checks, and V15 editor/verifier adapters. Keep the new path isolated from published V15/C. The gate can initially support only uniquely bound supplied deltas and unambiguous KEEP/missing-value cases; unsupported objectives abstain. Add editor/repair integration only after these transitions pass tests. No prompt-only change can make the unsafe SOURCE terminal state safe.

## Exact deterministic acceptance tests for Candidate D

Use frozen cases as fixtures without changing them, plus small negative controls. These are implementation requirements, **not tests run in this documentation pass**.

1. For 005–008 and 029–032, extract every supplied old→new transition with unique claim scope. Assert SOURCE is not a valid completed terminal; an exact objective-authorized replacement with unrelated bytes preserved passes the contract; dropping any one required delta fails. In 005–008, 029, and 031, a fake editor returning the frozen RAW followed by an existing-style deterministic rejection must never cause a `completed` SOURCE return.
2. For 022, 030, 032, 044–046, assert the single or paired authorized replacement is accepted while adjacent numbers, entities, quotations, and protected phrases remain fixed. Wrong target (Lila's extension, receipt 2187, unchanged duration) must fail. A gate that reverts these correct replacements to old current facts must fail.
3. For 010–012 and 033–034, with no supplied replacement, assert no value is inferred and unchanged old-current SOURCE is never labeled completed or publishable. For 009, preserve an explicit uncertain state rather than asserting a confirmed stale-fact label.
4. For 001–004 and 025–028, when a stub quality assessment identifies no material defect and OBJECTIVE is already satisfied, assert exact KEEP and zero editor calls. A positive, scoped quality finding permits the narrow 002-style optional edit only if its final verification passes; otherwise valid SOURCE may be returned.
5. With a conflicting/duplicated old literal, mismatched units, protected opposite claim, partial delta, invented replacement, altered negation, altered certainty, missing date component, or out-of-scope named entity, assert rejection or abstention. Do not silently convert unknown authority into a semantic PASS.
6. For every terminal branch, assert `completed` implies objective-aware verification of the **final** text, and `source-reference`/`abstained` is distinguishable from a publishable final. After localized repair, assert the whole document is checked again, including untouched claims and all required deltas.

## Unproven hypotheses and limits

- The exact false-positive rate of a broader deterministic delta binder is unmeasured. The observed RAW/Astra byte matches show opportunity; they do not authorize accepting every rejected RAW.
- The quality threshold that should trigger optional editing, especially the useful 002 edit, is not established by eight already-good cases. A blanket KEEP would miss a real safe preference win.
- C's individual review or `deliver` predicate for 030/032 was not retained, so the precise subcondition causing those two rejections remains unknown even though their terminal failure is clear.
- A safe partial rewrite for missing-value cases, as Astra produced, is desirable but not yet specified or proved reliable for the smaller architecture. Abstention with explicit missing information is the conservative initial behavior.
- The 48-case internal benchmark does not estimate rare-event safety. Text-only judgments cannot establish what a separate UI disclosure would communicate.

**Flow:** SOURCE + OBJECTIVE → classify SOURCE validity and required/optional changes → KEEP if already sufficient → otherwise bind only authorized deltas → editor or verified minimal update → objective-aware deterministic and semantic verification → scoped repair only when justified → full recheck → completed valid final, valid SOURCE fallback, or explicit abstention/reference.
