# Holdout V3 loss analysis

Forensic analysis of the sealed 119-case holdout. The per-case exact transcription is in [HOLDOUT-V3-LOSS-CASE-RECORDS.md](HOLDOUT-V3-LOSS-CASE-RECORDS.md). The classifications in the sealed artifacts remain unchanged; severity and product requirements below are a separate analytical layer.

## Method and immutability

The source set is the frozen V3 manifest, cases, labels, replay, and the final-audit `interpretations.json`. The manifest marks the set frozen before generation. Its SHA256 is `e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2`. Source/objective text was hash-checked against the manifest; RAW/FINAL against replay. The exact case appendix includes the per-case hashes and keeps original mandatory-audit judgment, any separate adjudication, and the final locked interpretation in separate sections.

Counts use all 119 frozen cases. `GOOD_RAW` means the final interpretation records that class; `GOOD_LOST` means its `materialGoodEditLost` flag is exactly true; `BAD_RAW` and `DISPUTED` use the recorded raw class. These columns overlap: `GOOD_LOST` is a subset of `GOOD_RAW`. The dataset contains 68 GOOD_RAW, including 43 retained and 25 lost; 13 BAD_RAW; and 3 DISPUTED. The remaining 35 have raw class OTHER.

Primary scope is the single frozen R1A/R1B pre-generation label per case. Secondary scope disagreement compares each available R2A/R2B label against that primary scope; it does not reconcile labels. No V3 artifact was modified, no model call was used, and these results do not tune or rewrite the holdout.

## Diagnosis: multiple interacting causes

All 25 confirmed losses share the same material outcome: RAW was classified good, the final selected output is the source fallback, and the useful RAW contribution is absent from FINAL. Three audit-primary causes describe why fallback happened: 18 `DETERMINISTIC_FALSE_REJECTION`, 5 `UNNECESSARY_FALLBACK`, and 2 `SEMANTIC_FALSE_REJECTION`. First trigger stage was deterministic verification for 23 and semantic verification for 2. There were 9 repair attempts and 0 accepted repairs. Fallback reasons were 21 `hard-meaning-failure`, 2 `repair-failed`, and 2 `verifier-rejected`.

These are interacting failure paths, not three disjoint product defects. Deterministic checks can mistake authorized facts or structural edits for changed meaning, or treat paraphrase/formatting as missing content. A semantic verifier can reject a materially helpful but incomplete response when the task is impossible without supplied facts. Repair may be rejected for reproducing the same false positive, reintroducing stale source values, or producing an unsafe/incomplete result. The final source fallback prevents BAD_RAW escapes, but it can silently erase a correct update and appear complete because source-preservation verification passes.

V3-012 is the concrete harmful-repair example: the repair returned `12`, undoing the authorized update from 12 to 14 stops; reverify rejected the repair, then source fallback restored 12 and November. The repair was not accepted, yet its attempt shows that repair can move in the wrong direction when the validator has not represented superseded facts correctly.

## Audit taxonomy and separate severity layer

### Sealed primary causes

| Original audit primary cause | Count | IDs |
|---|---:|---|
| `DETERMINISTIC_FALSE_REJECTION` | 18 | V3-003, V3-009, V3-012, V3-013, V3-014, V3-017, V3-021, V3-045, V3-046, V3-059, V3-061, V3-067, V3-071, V3-080, V3-087, V3-089, V3-108, V3-110 |
| `SEMANTIC_FALSE_REJECTION` | 2 | V3-060, V3-096 |
| `UNNECESSARY_FALLBACK` | 5 | V3-023, V3-030, V3-035, V3-036, V3-043 |

### New analytical severity assignment

These P0–P3 levels are assigned for this report only. They do not replace or revise sealed audit classes or causes.

| Severity | IDs | Rationale |
|---|---|---|
| P0 | V3-003 | FINAL reverts the authorized 6:30/courtyard update to 6/library meeting room after a false number rejection. |
| P0 | V3-012 | FINAL restores 12 stops and November; the rejected repair itself tried to restore 12, compounding the stale-value path. |
| P0 | V3-021 | FINAL restores 80 meters and Friday despite authorized updates to 95 meters and Monday, while the notice is about current public access. |
| P0 | V3-036 | FINAL restores June 16 after the authorized reopening date moved to June 18, making the delivered schedule factually stale. |
| P0 | V3-045 | FINAL restores both old orientation times, 8:30 and 9:15, after explicit changes to 8:45 and 9:30. |
| P0 | V3-071 | FINAL does not deliver the explicit 45-minute check-in update and leaves the attendee page’s old guidance in place. |
| P0 | V3-080 | FINAL says three speakers and department-led final session after the objective confirmed four guests leading every session. |
| P0 | V3-089 | FINAL restores the obsolete April/October cadence and four-week decision period instead of February/June/October and three weeks. |
| P1 | V3-009 | Fallback preserves bureaucratic language although RAW makes the scheduling request courteous and natural without changing Wednesday availability. |
| P1 | V3-013 | Fallback removes clear, friendly numbered requests that RAW added without losing the forecast-dependent painting condition. |
| P1 | V3-014 | Fallback discards the requested conversational reconstruction even though RAW preserves Lee’s specific credit and event details. |
| P1 | V3-023 | Fallback restores promotional phrasing instead of the requested natural excitement while the 120-copy and conditional delivery facts were preserved. |
| P1 | V3-030 | Fallback restores promotional phrasing and loses a direct team update despite preserved deadlines and operational details. |
| P1 | V3-043 | Fallback removes useful sequencing that distinguishes draft circulation from later public posting without changing the conditions. |
| P1 | V3-046 | Fallback restores inflated report language though RAW preserves all counts, caveats, and next step while removing filler. |
| P1 | V3-059 | Fallback restores dense FAQ prose instead of numbered exceptions that preserve opt-out and owner-copy qualifications. |
| P1 | V3-060 | Semantic rejection of insufficient concision sends a meaning-preserving, action-ordered runbook back to source. |
| P1 | V3-087 | Fallback restores dense funding-proposal language after a material simplification that preserves the program claims and qualifications. |
| P1 | V3-110 | Fallback loses FAQ separation and the leading childcare safety instruction after deterministic false hits on “No You” and moved negation. |
| P2 | V3-017, V3-035, V3-061, V3-067, V3-108 | Material losses in clarity, ordering, or scanability; no stale explicit factual update among these five. |
| P3 | V3-096 | Useful missing-date transparency was lost, but the requested confirmed dates were unavailable and no stale value was restored. |

### Failure-path taxonomy

- **Authorized-fact rejection:** the final verifier path treats some objective-supplied values as conflicting protected source facts; fallback then restores values explicitly superseded by the objective. Eight losses are in this category (listed below).
- **Structure/paraphrase rejection:** numbered steps, headings, question/answer line breaks, wording simplification, or equivalent paraphrases trip number/name/coverage checks despite preserved facts (for example V3-013, V3-043, V3-059, V3-108).
- **Unnecessary fallback:** a candidate or repaired candidate contains useful objective fulfillment, but a blocked/review condition still selects unchanged source (five audit-primary cases).
- **Semantic objective rejection:** semantic review rejects useful partial fulfillment rather than recognizing a safe limitation when requested data are unavailable (V3-060, V3-096).
- **Repair non-acceptance:** nine attempts, none accepted for the 25 losses; V3-012’s replacement `12` would undo a requested change. A repair result cannot establish safety or objective fulfillment until the resulting whole output is checked.
- **Source-preservation/fallback:** fallback returns a source that may be safe relative to original claims but stale relative to the user’s authorized update. “Preserved source meaning” is not equivalent to “fulfilled objective.”

### Nonexclusive secondary mechanisms

These narrower cross-case tags are supported by recorded evidence and may overlap; they are not the sealed primary-cause taxonomy and do not reclassify cases.

| Secondary mechanism | Count / IDs | Narrow evidence rule |
|---|---|---|
| `AUTHORIZED_UPDATE_LOST` | 8 — V3-003, 012, 021, 036, 045, 071, 080, 089 | RAW applies explicit source-conflicting values; FINAL restores old values. |
| `STALE_SOURCE_RESTORATION` | 8 — same IDs | Source fallback itself restores the superseded values listed above. |
| `OVER_SCOPED_PRESERVATION` | 8 — same IDs | Recorded verifier path blocks explicit replacement values as conflicts with protected source facts. |
| `CLAIM_IDENTITY_OR_ALIGNMENT_FAILURE` | 4 — V3-061, 067, 108, 110 | Audit identifies false phrase/entity or claim-alignment interpretation (for example “No The” / “No You”). |
| `VOICE_OR_EDITORIAL_FALSE_POSITIVE` | 8 — V3-009, 014, 023, 030, 043, 046, 059, 087 | RAW’s requested register, simplification, or structure is materially useful; recorded rejection protects source wording/structure. |
| `REPAIR_DEGRADATION/attempt` | 9 attempts — V3-003, 012, 013, 014, 017, 036, 045, 059, 110 | A repair was requested in a confirmed loss. Zero accepted. V3-012’s `12` replacement would undo the update, but was rejected; it is an attempted harmful repair, not an accepted degradation. |
| `LEGITIMATE_SAFETY_TRADEOFF` | 9 — BAD_RAW fallback cases V3-018, 031, 040, 054, 063, 081, 093, 106, 114 | Source fallback catches a recorded unsafe RAW defect after repair was absent or rejected. These are safety catches, not GOOD_RAW loss cases. |
| `DISPUTED` | 3 — V3-091, 095, 113 | The locked record retains uncertainty about authorization, certainty, or antecedent; not counted as confirmed GOOD/BAD. |

The primary cause totals remain 18 deterministic false rejections, 5 unnecessary fallbacks, and 2 semantic false rejections.

## The 25 loss cases

This table records the sealed cause, trace stage, and locked audit evidence in brief. New severity is shown separately. Exact text and full findings are in the linked transcription appendix.

| ID | Severity | Primary audit cause | First trigger | Scope / length | Locked evidence summary |
|---|---|---|---|---|---|
| V3-003 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / VERY_SHORT | RAW applies authorized 6:30 and library courtyard while retaining Thursday. Both blind reviewers prefer RAW. Deterministic rejection treats the authorized “30” as an altered number; repair replacement “thirty” is rejected, and source fallback loses both updates. |
| V3-009 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / SHORT | RAW replaces bureaucratic padding with a courteous Tuesday question and normal availability request; Wednesday before 11 remains. Both reviewers prefer RAW. Blocking missing-claim/coverage checks mistake paraphrase for lost content; no semantic review or repair occurs, and fallback restores the overformal source. |
| V3-012 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW updates 12 stops→14 and November→December. FINAL restores 12 and November. Repair replacement “12” would undo the authorized count; reverify rejects it, then source fallback loses both updates. |
| V3-013 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW uses two friendly numbered headings to surface the book-placement and rainy-day closure requests while retaining surrounding facts and forecast-dependent painting plans. Both blind reviewers agree. Number checks treat enumeration as new quantity; repair “First” leaves a blocker and is rejected, so fallback loses the conspicuous requests. |
| V3-014 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | SUBSTANTIVE_RECONSTRUCTION / MEDIUM | RAW replaces ceremonial gratitude with conversational thanks while retaining Lee’s folding table, forgotten space check, jokes, two pieces, and cleanup thanks. Both reviewers prefer RAW. “Special thanks to” is gratitude rather than a new cause; expected low lexical overlap for voice reconstruction is blocked, and a safe but unnecessary repair is rejected before fallback. |
| V3-017 | P2 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW states the weekend work decision is unresolved and retains the hold, building-manager consultation, childcare acknowledgment, and no promised deadline. A blind reviewer favors RAW. Blocking findings target equivalent paraphrases (“tell you”/“say something,” “for now”/“for the moment,” “thank you”/“appreciate”); repair restores a source sentence but leaves blockers, and fallback loses the clarity gain. |
| V3-021 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / LONGER | RAW applies 95 meters and Monday, and adds skimmable headings/bullets while preserving closure, inspection-not-repair, safety rationale, upper-path guidance, six volunteers, and June. Both blind reviewers prefer RAW. A temporal-protection check blocks the explicitly requested Monday; no repair is attempted, and fallback loses current facts and structure. |
| V3-023 | P1 | `UNNECESSARY_FALLBACK` | Deterministic verifier | SUBSTANTIVE_RECONSTRUCTION / LONGER | RAW replaces promotional “journey” wording with natural excitement and preserves the 120-copy limit, conditional delivery, and folding request. A missing-claim rejection sends the unchanged source back, restoring the promotional wording and losing the requested improvement. |
| V3-030 | P1 | `UNNECESSARY_FALLBACK` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / SHORT | RAW makes the team update direct while retaining completed cleanout, labeled shelves, pickup equipment, and Wednesday’s question deadline. Source fallback restores promotional phrasing and loses the objective benefit. |
| V3-035 | P2 | `UNNECESSARY_FALLBACK` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW clarifies that six signs await mounts, preserves Wednesday as a supplier estimate, the Thursday condition, and limited impact. Source fallback loses the crisp status edit; the apostrophe normalization is immaterial. |
| V3-036 | P0 | `UNNECESSARY_FALLBACK` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW applies authorized reopening June 18 and preserves the two-week closure, classes returning that week rather than automatically on reopening day, hallway work, and date uncertainty. Repair returns a date phrase that still conflicts with preservation checks; fallback restores June 16 and defeats the update. |
| V3-043 | P1 | `UNNECESSARY_FALLBACK` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW labels draft circulation as the first step and public posting as the second, preserving Legal’s deadline and later wording/accessibility conditions. A deterministic check treats the helpful numbered structure as unsupported content; fallback removes that clarification. |
| V3-045 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / LONGER | RAW applies authorized 8:45 welcome-table and 9:30 first-tour times, retaining three greeters, assignments, and route contingency. FINAL restores old times. Deterministic number protection rejects the update; replacement “45” fails repair acceptance, then fallback loses both times. |
| V3-046 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / LONGER | RAW removes inflated framing and preserves 62/54/eight, the absence of a baseline comparison, and the building/room next step. A missing-claim block protects the filler the objective asked to remove; no repair occurs and fallback loses plain-language benefit. Blind reviewers differ on source partial usefulness and edit scope but do not identify a substantive RAW defect. |
| V3-059 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | SUBSTANTIVE_RECONSTRUCTION / MEDIUM | RAW headings and numbered exceptions make grouping, email opt-out, and owner-copy rules findable with qualifications intact. The number-2 finding mistakes structure for a factual addition; “Second” is not accepted as a repair and fallback restores dense source prose. |
| V3-060 | P1 | `SEMANTIC_FALSE_REJECTION` | Semantic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW orders identification, status-based incident decisions, and reporting details as actions while preserving one file/workspace, local 2 a.m., and no assumed failure at 3 a.m. Semantic REJECT cites insufficient shortening despite preserving meaning and action order; source fallback loses the actionable sequence. |
| V3-061 | P2 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW clarifies the antecedent of “that mark” and smooths copy while retaining the playful phrase, target-versus-alarm distinction, dashboard history, and both pieces. A missing-figure-2 check falsely rejects it; no repair occurs and source fallback loses clarity. |
| V3-067 | P2 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW places the outage form first while preserving usual response timing, acknowledgment versus resolution, and non-guarantee. Reordering fulfills the “do not bury” intent; missing-claim and “Someone” name findings misread the change, no repair occurs, and fallback loses urgent-path visibility. |
| V3-071 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | SUBSTANTIVE_RECONSTRUCTION / LONGER | RAW distinguishes 45-minute desk availability from 15-minute room access, separates badge groups, keeps session starts unchanged, and avoids promising early opening. FINAL returns the old source and omits the attendee-page explanation; trace rejects the authorized 45-minute update as conflicting with preservation. |
| V3-080 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / SHORT | RAW applies the confirmed four-speaker budget and a guest lead for every session while preserving other proposal details. FINAL restores three speakers and a department-led last session; the verifier blocks the authorized count/status change, then fallback loses the update. |
| V3-087 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | SUBSTANTIVE_RECONSTRUCTION / MEDIUM | RAW materially simplifies the dense opening while preserving induction success, volunteer engagement, distributed information, uncertainty, guide contents, and coordinator conversation. FINAL restores the dense wording; the rejection relies on over-literal claim matching. |
| V3-089 | P0 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | LOCAL_EDIT / MEDIUM | RAW applies February/June/October meetings and decisions within three weeks while retaining criteria and revision caveats. FINAL restores April/October and four weeks; deterministic date/number protection rejects the authorized changes, with no repair or semantic call. |
| V3-096 | P3 | `SEMANTIC_FALSE_REJECTION` | Semantic verifier | INSUFFICIENT_INFORMATION / LONGER | No confirmed dates were supplied. RAW keeps the report and explicitly marks the missing opening date, deadline, and residency dates without guessing. Semantic REJECT acknowledges the impossible missing-data constraint but penalizes non-fulfillment; fallback removes useful transparency. Both blind reviewers say the result remains incomplete, and the locked audit classifies the loss as semantic false rejection. |
| V3-108 | P2 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW inserts a line break after each bold question, separating each answer and making the clinic non-stop limitation easier to find; all schedule, cart, and walking details remain. The “No The” altered-name finding is a false entity hit; FINAL restores run-in answers and loses scanability. |
| V3-110 | P1 | `DETERMINISTIC_FALSE_REJECTION` | Deterministic verifier | DISTRIBUTED_LIGHT_EDIT / MEDIUM | RAW separates FAQ entries and leads with the no-supervised-childcare rule while retaining parent responsibility, 30-person capacity, and no early-entry guarantee. “No You” and moved-negation findings are false; repair restores equivalent childcare wording but does not remove the false name blocker, so fallback loses useful structure. |

### Eight stale source-restoration paths

These eight are a nonexclusive subset of the 25 losses. Each RAW applied explicitly supplied conflicting current facts; each source fallback restored old values.

| ID | Supplied current fact(s) | Stale value(s) in FINAL |
|---|---|---|
| V3-003 | Potluck 6:30; library courtyard | 6; library meeting room |
| V3-012 | Map has 14 stops; print target December | 12 stops; November |
| V3-021 | Cleared 95 meters; parks collection Monday | 80 meters; Friday |
| V3-036 | Reopening Wednesday, June 18 | Monday, June 16 |
| V3-045 | Welcome table 8:45; first tour 9:30 | 8:30; 9:15 |
| V3-071 | Check-in desk opens 45 minutes before each session from 1 September | Old 30-minute desk window |
| V3-080 | Four guest speakers; a guest leads each of four sessions | Three speakers; department leads final session |
| V3-089 | February, June, October; decisions within three weeks | April/October; within four weeks |

The count is eight losses out of ten objective-supplied source-conflicting updates: V3-027 (Tuesday 2 p.m.→3 p.m.) and V3-075 (March 14→March 21) retained the requested values. V3-008 adds an objective-supplied “not yet confirmed” status, not an X→Y source conflict. V3-055 asks for a handbook notice but the source already contains the new weekday 6 p.m. time and unchanged weekend hours.

## Twelve RAW-correct explicit updates

The table distinguishes supplied information from verifier authorization markers. Marker count/finding is copied from replay; objective text being present in the request does not imply that the verifier recorded authorization. `Yes` in the RAW column reflects the sealed update classification/evidence. `Retained` means the final interpretation records `GOOD_FINAL`; `Lost` means the final falls back to stale source or otherwise drops the material update.

| ID | Exact requested fact/status | Prior → requested value | RAW | FINAL | Trace authorization marker |
|---|---|---|---|---|---|
| V3-003 | Time and location | 6; library meeting room → 6:30; library courtyard | Yes | Lost | 0; none |
| V3-008 | State new place/time unconfirmed; tell attendees what happens next | No confirmation status → not yet confirmed; details to follow | Yes | Retained | 0; none |
| V3-012 | Map stops and print target | 12; November → 14; December | Yes | Lost | 2; AUTHORIZED_CHANGE findings |
| V3-021 | Brush cleared and collection day | 80 meters; Friday → 95 meters; Monday | Yes | Lost | 4; AUTHORIZED_CHANGE findings |
| V3-027 | Tuesday review time | 2 p.m. → 3 p.m. | Yes | Retained | 2; AUTHORIZED_CHANGE findings |
| V3-036 | Community-room reopening | Monday, June 16 → Wednesday, June 18 | Yes | Lost | 4; AUTHORIZED_CHANGE findings |
| V3-045 | Welcome-table opening and first tour | 8:30; 9:15 → 8:45; 9:30 | Yes | Lost | 0; none |
| V3-055 | Staff handbook weekday help-desk notice | Source already says Monday 6 p.m. instead of 5 p.m.; weekends unchanged | Yes | Retained | 0; none |
| V3-071 | Attendee-page desk opening window | 30 minutes before → 45 minutes before sessions from 1 September | Yes | Lost | 0; none |
| V3-075 | Registration closing date | 14 March → 21 March | Yes | Retained | 2; AUTHORIZED_CHANGE findings |
| V3-080 | Guest-speaker budget and session leads | Three speakers; department leads final session → four guests; guest leads every session | Yes | Lost | 0; none |
| V3-089 | Panel months and decision timing | April/October; within four weeks → February/June/October; within three weeks | Yes | Lost | 0; none |

In the ten objective-supplied source-conflicting X→Y cases (003, 012, 021, 027, 036, 045, 071, 075, 080, 089), 2/10 were retained and 8/10 lost. Of the eight lost updates, explicit `AUTHORIZED_CHANGE` markers were recorded for 012, 021, and 036 only; no marker was recorded for 003, 045, 071, 080, or 089. Markers were recorded for retained updates 027 and 075. A zero marker count is a verifier trace fact, not evidence that the user failed to supply the update.

V3-012’s authorized changes were recorded (count 2) yet the candidate was rejected; repair returned `12` and was rejected; FINAL restored source. V3-055’s earlier extraction matrix incorrectly said collateral=yes because its substring rule matched “no collateral hours change.” The sealed audit explicitly says **no collateral hours change**, and final status is GOOD_RETAINED / NOT_BAD.

### Update-path diagnostics for all 12 RAW-correct cases

The following fields are audit/trace-derived. “Safety necessity” is reported from the audit’s BAD outcome field; `NOT_BAD` means no safety defect is recorded as requiring fallback. “RAW collateral” copies the audit’s statement; “no” does not mean the update itself was absent. Exact objectives and texts are in the case-record appendix.

| ID | Authorization | RAW collateral mutation per audit | V15 mechanism/path | Fallback? | Stale fact returned? | Objective violated in FINAL? | Safety necessity recorded? |
|---|---|---|---|---:|---:|---:|---:|
| V3-003 | Explicit 6:30 and courtyard | No; only requested changes | Deterministic rejection; attempted repair rejected on reverify; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-008 | Explicit status: place/time unconfirmed | No; supplied status and next-step guidance | Semantic PASS; accepted candidate | No | No | No | No (`NOT_BAD`) |
| V3-012 | Explicit 14 stops and December | No; audit says only authorized changes | Deterministic rejection; harmful `12` repair rejected; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-021 | Explicit 95 meters and Monday | No unsupported factual generalization per audit | Deterministic rejection; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-027 | Explicit Tuesday 2→3 p.m. | No collateral change recorded | Deterministic review; semantic PASS; accepted candidate | No | No | No | No (`NOT_BAD`) |
| V3-036 | Explicit June 16→June 18 | No collateral change recorded | Deterministic rejection; repair rejected; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-045 | Explicit 8:30→8:45 and 9:15→9:30 | No; only authorized times | Deterministic rejection; repair rejected; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-055 | Source already has Monday 6 p.m. weekdays; objective requests handbook notice | **No**; audit explicitly says no collateral hours change | Deterministic review warning; semantic PASS; accepted candidate | No | No | No | No (`NOT_BAD`) |
| V3-071 | Explicit 30→45 minutes from 1 September | No unauthorized hours/session-start change per audit | Deterministic rejection; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-075 | Explicit March 14→March 21 | No; eligibility condition retained | Deterministic review; semantic PASS; accepted candidate | No | No | No | No (`NOT_BAD`) |
| V3-080 | Explicit three→four guests; guest leads each session | No; audit says other proposal details preserved | Deterministic rejection; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |
| V3-089 | Explicit panel months and three-week decisions | No; audit says authorized cadence/timing only | Deterministic rejection; source fallback | Yes | Yes | Yes | No (`NOT_BAD`) |

`V3-008` is a supplied status clarification, not a conflicting old→new value. `V3-055` is a notice transformation where the source already states the new weekday hours. The other ten are objective-supplied, source-conflicting value updates; two are retained and eight are lost. `V3-063` remains a separate BAD_RAW update case.

V3-063 is an additional explicit update request among BAD_RAW, outside the 12 RAW-correct cases: `$40`→`$50` from June 15 and earlier-order protection were authorized, but RAW also claimed the page example had been updated to `$50` without evidence. That collateral claim was caught by fallback; collateral caught 1, escaped 0.

## Scope, length, genre, and frozen-tag breakdowns

The outcome columns overlap: GOOD_LOST is part of GOOD_RAW. The complete denominator-safe cell-by-cell IDs and secondary comparisons are available in the linked record appendix’s source data; this report summarizes exact frozen denominators.

### Primary pre-generation scope

| Frozen scope | N | GOOD_RAW | GOOD_LOST | BAD_RAW | DISPUTED |
|---|---:|---:|---:|---:|---:|
| LEAVE_ALONE | 19 | 4 | 0 | 1 | 0 |
| LOCAL_EDIT | 48 | 28 | 9 | 4 | 0 |
| DISTRIBUTED_LIGHT_EDIT | 36 | 26 | 10 | 4 | 3 |
| SUBSTANTIVE_RECONSTRUCTION | 14 | 9 | 5 | 4 | 0 |
| INSUFFICIENT_INFORMATION | 2 | 1 | 1 | 0 | 0 |
| AMBIGUOUS | 0 | 0 | 0 | 0 | 0 |

Primary scope loss IDs: LEAVE_ALONE 0; LOCAL_EDIT 9; DISTRIBUTED_LIGHT_EDIT 10; SUBSTANTIVE_RECONSTRUCTION 5; INSUFFICIENT_INFORMATION 1; AMBIGUOUS 0. R2 scope disagreement was nonexclusive: 25 of 72 second-scope records differed from the case’s primary R1 scope (R2A 13, R2B 12).

### Length band

| Band | N | GOOD_RAW | GOOD_LOST | BAD_RAW | DISPUTED |
|---|---:|---:|---:|---:|---:|
| VERY_SHORT | 15 | 9 | 1 | 0 | 0 |
| SHORT | 34 | 13 | 3 | 7 | 0 |
| MEDIUM | 45 | 27 | 15 | 5 | 2 |
| LONGER | 25 | 19 | 6 | 1 | 1 |

The loss rate among GOOD_RAW by band was VERY_SHORT 1/9, SHORT 3/13, MEDIUM 15/27, and LONGER 6/19.

### Frozen-tag cohorts

Cohorts use only frozen `categoryTags`. Voice-sensitive matches case-insensitively `voice|tone|register|style|idiom|formal|casual|conversational|hedg`; fact-sensitive matches `fact|update|date|time|number|quantit|attribution|approval|condition|uncertain|missing|schedule|deadline|status|amount|price|authorization|claim|decision|commitment`. One or more matching tags qualifies; cohorts overlap. Voice tags matched 27 cases, with 12 GOOD_RAW and 3 GOOD_LOST. Fact tags matched 65, with 40 GOOD_RAW and 18 GOOD_LOST. These tag counts are descriptive, not causal.

### Exact raw genres

The source contains 89 exact `genre` values. No genre families are invented or merged. Small cells make rates unstable, so no genre-level causal claim follows. Counts below are exact:

| Exact genre | N | GOOD_RAW | GOOD_LOST | BAD_RAW | DISPUTED |
|---|---:|---:|---:|---:|---:|
| academic discussion | 1 | 1 | 0 | 0 | 0 |
| academic report | 1 | 0 | 0 | 0 | 0 |
| access procedure | 1 | 1 | 0 | 0 | 0 |
| apology-email | 1 | 1 | 0 | 0 | 0 |
| application guidance | 1 | 1 | 1 | 0 | 0 |
| attendee page update request | 1 | 1 | 1 | 0 | 0 |
| building chat message | 1 | 0 | 0 | 0 | 0 |
| calendar-note | 1 | 1 | 0 | 0 | 0 |
| committee comment | 1 | 0 | 0 | 1 | 0 |
| community blog anecdote | 1 | 1 | 0 | 0 | 0 |
| community bulletin | 1 | 0 | 0 | 1 | 0 |
| community event instructions | 1 | 1 | 0 | 0 | 0 |
| community invitation | 1 | 1 | 0 | 0 | 0 |
| community post | 1 | 0 | 0 | 0 | 0 |
| community project notice | 1 | 1 | 1 | 0 | 0 |
| community project update | 1 | 1 | 1 | 0 | 0 |
| community reminder | 1 | 1 | 1 | 0 | 0 |
| community service proposal | 1 | 0 | 0 | 1 | 0 |
| community-report-update | 1 | 1 | 0 | 0 | 0 |
| community-update | 5 | 4 | 0 | 0 | 0 |
| consultation notice | 1 | 0 | 0 | 0 | 0 |
| departmental recommendation | 1 | 0 | 0 | 0 | 1 |
| design feedback message | 1 | 0 | 0 | 1 | 0 |
| evaluation comment | 1 | 0 | 0 | 1 | 0 |
| evaluation report | 1 | 1 | 0 | 0 | 0 |
| event update | 1 | 1 | 0 | 0 | 0 |
| event-description | 1 | 1 | 0 | 0 | 0 |
| faq | 2 | 2 | 2 | 0 | 0 |
| feature explanation | 1 | 1 | 1 | 0 | 0 |
| field visit procedure | 1 | 0 | 0 | 0 | 1 |
| funding proposal | 1 | 1 | 1 | 0 | 0 |
| group thank-you message | 1 | 1 | 1 | 0 | 0 |
| how-to instructions | 1 | 0 | 0 | 0 | 0 |
| how-to note | 1 | 0 | 0 | 0 | 0 |
| informal project update | 1 | 1 | 1 | 0 | 0 |
| internal FAQ | 1 | 1 | 0 | 0 | 0 |
| internal instruction request | 1 | 1 | 0 | 0 | 0 |
| internal notice request | 1 | 1 | 0 | 0 | 0 |
| internal runbook note | 1 | 1 | 1 | 0 | 0 |
| internal update | 1 | 0 | 0 | 0 | 0 |
| internal-memo | 1 | 0 | 0 | 1 | 0 |
| meeting-follow-up | 2 | 2 | 1 | 0 | 0 |
| neighborhood newsletter | 1 | 1 | 1 | 0 | 0 |
| personal essay | 1 | 0 | 0 | 0 | 0 |
| personal letter | 1 | 0 | 0 | 0 | 0 |
| personal note | 1 | 0 | 0 | 0 | 0 |
| personal text | 2 | 1 | 0 | 0 | 0 |
| personal-reflection | 2 | 0 | 0 | 0 | 0 |
| policy note | 1 | 1 | 0 | 0 | 0 |
| practical-instructions | 5 | 3 | 0 | 1 | 0 |
| procedure reminder | 1 | 1 | 0 | 0 | 0 |
| process evaluation | 1 | 1 | 0 | 0 | 0 |
| product description | 2 | 1 | 1 | 1 | 0 |
| product help article | 1 | 1 | 0 | 0 | 0 |
| product note | 1 | 0 | 0 | 0 | 0 |
| product status message | 1 | 0 | 0 | 0 | 0 |
| programme notice | 1 | 1 | 0 | 0 | 0 |
| programme report | 1 | 1 | 1 | 0 | 0 |
| project status message | 1 | 1 | 0 | 0 | 0 |
| project update | 1 | 1 | 0 | 0 | 0 |
| project-email | 1 | 1 | 1 | 0 | 0 |
| project-notes | 4 | 2 | 0 | 1 | 1 |
| public works proposal | 1 | 0 | 0 | 0 | 0 |
| reading group proposal | 1 | 1 | 0 | 0 | 0 |
| report-excerpt | 2 | 1 | 1 | 1 | 0 |
| research summary | 1 | 1 | 0 | 0 | 0 |
| seminar proposal | 1 | 1 | 1 | 0 | 0 |
| service FAQ | 1 | 1 | 1 | 0 | 0 |
| short-interview | 2 | 0 | 0 | 0 | 0 |
| social caption | 1 | 0 | 0 | 0 | 0 |
| staff announcement | 1 | 1 | 0 | 0 | 0 |
| staff-update | 1 | 0 | 0 | 1 | 0 |
| status-update | 4 | 3 | 1 | 0 | 0 |
| support FAQ | 2 | 0 | 0 | 0 | 0 |
| support reply | 1 | 1 | 0 | 0 | 0 |
| survey report | 1 | 0 | 0 | 0 | 0 |
| team chat update | 1 | 1 | 0 | 0 | 0 |
| team message | 1 | 1 | 1 | 0 | 0 |
| team-announcement | 2 | 2 | 2 | 0 | 0 |
| team-chat | 3 | 0 | 0 | 0 | 0 |
| technical FAQ | 1 | 1 | 0 | 0 | 0 |
| technical support guide | 1 | 1 | 0 | 0 | 0 |
| troubleshooting article | 1 | 1 | 0 | 0 | 0 |
| visitor guidance | 1 | 0 | 0 | 0 | 0 |
| volunteer group update | 1 | 1 | 0 | 0 | 0 |
| volunteer update | 1 | 1 | 1 | 0 | 0 |
| website content update request | 1 | 0 | 0 | 1 | 0 |
| workplace-email | 6 | 0 | 0 | 0 | 0 |
| workshop-recap | 1 | 0 | 0 | 1 | 0 |

## BAD_RAW safety margin

All 13 BAD_RAW outputs were caught; none escaped into FINAL. Six first catches were deterministic candidate verification and seven semantic verifier decisions. Four repairs were accepted; nine cases fell back to source. The safety result is valuable, but fallback can catch unsafe content while also erasing safe RAW edits or failing the objective. V3-063 illustrates that distinction: RAW contained authorized shipping changes plus one unsupported example-completion claim; fallback caught the collateral claim, with no escape.

| BAD_RAW ID | Recorded defect | First catch | Repair/final path |
|---|---|---|---|
| V3-010 | Turns ability (“can help”) into promise (“will help”); certainty upgrade. | Semantic verifier | requested=True; accepted=True; repaired/no fallback |
| V3-018 | Adds unsupported “The headline is my main concern” priority attribution. | Semantic verifier | requested=True; accepted=False; source-fallback/repair-failed |
| V3-031 | RAW adds “We’ll plan for that,” an unsupported commitment absent from source and objective. The original audit narrative mistakenly cited source facts as inventions; the locked interpretation identifies this actual addition. | Semantic verifier | requested=False; accepted=False; source-fallback/invalid-verifier |
| V3-038 | Changes opportunity to improve clarity into assertion that process is unclear. | Deterministic | requested=True; accepted=True; repaired/no fallback |
| V3-040 | Adds ungrounded promise to follow up once vendor confirms. | Deterministic | requested=True; accepted=False; source-fallback/hard-meaning-failure |
| V3-041 | Adds unsupported causal explanation that different mixes make comparison inexact. | Deterministic | requested=True; accepted=True; repaired/no fallback |
| V3-054 | “Only effect” asserts unsupported exclusivity about opening lid. | Semantic verifier | requested=True; accepted=False; source-fallback/repair-failed |
| V3-063 | Claims page example is already `$50` without supplied/observed updated example. | Deterministic | requested=True; accepted=False; source-fallback/hard-meaning-failure |
| V3-077 | Changes hypothetical “would not” stance into definite “won’t”. | Semantic verifier | requested=True; accepted=True; repaired/no fallback |
| V3-081 | Strengthens “sometimes” to “often” and tentative “seems worth fixing” to categorical “should”. | Deterministic | requested=True; accepted=False; source-fallback/hard-meaning-failure |
| V3-093 | Adds “keeps the service simple to run” and upgrades one risk to “the main risk”. | Semantic verifier | requested=True; accepted=False; source-fallback/repair-failed |
| V3-106 | Adds unsupported bin/list/disposal specificity from categories and outgoing materials. | Deterministic | requested=False; accepted=False; source-fallback/hard-meaning-failure |
| V3-114 | Infers first phase complete and current next-phase planning from weaker source statements. | Semantic verifier | requested=True; accepted=False; source-fallback/repair-failed |

Three RAW cases remain disputed rather than relabeled: V3-091, V3-095, V3-113. V3-095 also remains disputed in the final interpretation.

## Disputed RAW cases, kept outside definitive GOOD/BAD counts

These three retain the sealed `DISPUTED` raw class; they are not treated as confirmed losses or BAD_RAW. Full text and layered records are available from the sealed interpretation and replay paths linked in the exact-record appendix.

### V3-091

- **Objective:** Make the recommendation suitable for a departmental report while keeping the practical argument and author’s perspective.
- **RAW / FINAL:** RAW uses “I recommend,” “responsible for each evening,” and “would be a more proportionate response”; FINAL falls back to the source’s “seems a more proportionate response.”
- **Recorded disagreement:** A5 and the final adjudication say “responsible for” reasonably explains management rather than adding causation, but “seems”→“would be” may strengthen the author’s judgment. Both blind reviewers accept RAW; reverify objects to certainty. Since the hedge effect is unresolved, RAW remains disputed; final class OTHER is safe.

### V3-095

- **Objective:** Make the procedure clearer and more natural for volunteer leaders while preserving every obligation and exception.
- **RAW / FINAL:** RAW simplifies language and changes “should receive this information in writing” to the imperative “Give participants this information in writing”; FINAL remains disputed in the sealed interpretation.
- **Recorded disagreement:** O1A marks meaning/authorization uncertain because “should receive” may have become a stronger obligation. The sealed interpretation says the V15 PASS does not resolve this normative-force ambiguity and retains `DISPUTED` for both RAW and FINAL.

### V3-113

- **Objective:** Separate confirmed tasks, open questions, and dependencies while keeping uncertainty intact.
- **RAW / FINAL:** RAW adds task/question/dependency headings but resolves “those two details” as “room and chair count”; FINAL restores the original paragraph organization.
- **Recorded disagreement:** O1D prefers RAW’s structure; O2B prefers FINAL’s preservation of uncertainty. The audit says the nearby antecedent could mean chair count and copy count, while the broader dependency involves room. The authorization of that parenthetical is unresolved, so the final RAW class remains disputed and the case is excluded from definitive GOOD/BAD counts.

## Twelve implementation-independent product requirements

These requirements describe observable behavior, not a design or implementation. Cases map them to evidence and counterexamples.

| ID | Requirement | Case mapping |
|---|---|---|
| PR-01 | Apply user-authorized replacement facts even when they conflict with the source value; distinguish superseded facts from facts to preserve. | 003, 012, 021, 027, 036, 045, 063, 071, 075, 080, 089 |
| PR-02 | Preserve source facts, caveats, names, dates, quantities, conditions, and uncertainty that the objective did not authorize changing. | 017, 021, 035, 040, 041, 054, 063, 071, 093, 106, 114 |
| PR-03 | If a candidate cannot be safely accepted, do not present a stale source fallback as successful fulfillment of a conflicting update; expose unresolved work or abstain clearly. | 003, 012, 021, 036, 045, 071, 080, 089 |
| PR-04 | When required replacement information is absent, never invent it; explicitly identify the missing fact or say the objective remains incomplete, and do not present silent non-fulfillment as success. | 017, 031, 096, 114 |
| PR-05 | Do not add collateral causal claims, priorities, promises, completions, eligibility, or other specifics beyond supplied facts. | 018, 031, 038, 040, 041, 054, 063, 081, 093, 106, 114 |
| PR-06 | Reject unsafe meaning changes and ensure unsupported claims do not reach FINAL. | All 13 BAD_RAW cases; 0 escaped |
| PR-07 | Allow meaningful reconstruction, paraphrase, and structural editing when they preserve authorized meaning and satisfy the requested form. | 009, 013, 014, 023, 043, 046, 059, 061, 067, 087, 108, 110 |
| PR-08 | Keep uncertainty and disputed meaning explicit; avoid converting ambiguity into false certainty or silently resolving contested interpretations. | 017, 060, 091, 095, 113 |
| PR-09 | Preserve requested voice and natural register while keeping factual fidelity. | 009, 014, 017, 023, 060, 087 |
| PR-10 | Respect already-good restraint: do not introduce unnecessary edits when the source already meets a conditional or leave-alone objective. | Frozen LEAVE_ALONE scope cases; V3-073, V3-074, V3-099, V3-102 are the four GOOD_RAW cases in that scope |
| PR-11 | Accept a repair only after rechecking the whole resulting output for the original objective, authorized updates, source facts, and collateral changes. | 012 harmful rejected replacement; BAD_RAW repair paths 054, 081, 093, 114; accepted repair cases 010, 038, 041, 077 |
| PR-12 | Guarantee that the selected FINAL is both safe and objective-aware; source-preservation alone does not establish task fulfillment. | All 25 losses; eight stale restoration cases especially |

### Zero-tolerance product invariants

These are failure conditions, not averages to trade against quality elsewhere. They map to the requirements above:

- **No stale source value presented as fulfillment of an explicit update** — PR-01, PR-03, PR-12.
- **No invented unknown replacement value; explicitly disclose the missing fact or incomplete objective** — PR-04.
- **No collateral or materially unauthorized semantic change in a final output** — PR-02, PR-05, PR-06, PR-11.
- **No confirmed BAD_RAW escape into FINAL** — PR-06, PR-12.
- **No accepted harmful repair that reintroduces stale facts, changes unrelated meaning, or leaves a detected defect** — PR-02, PR-05, PR-11.

## Proposed future acceptance targets

Evaluate on a **new preregistered holdout**; do not tune to or reclassify V3. These are proposed product thresholds, not measured achievements. V3 denominators are small, especially for explicit updates.

| Metric | Proposed target | V3 baseline / caveat |
|---|---|---|
| BAD_RAW escape | 0 escapes | 0/13 escaped in V3; preserve this safety margin. |
| Stale successful finals after authorized update | 0 | 8 stale fallbacks in the ten conflicting X→Y update cases. |
| GOOD_RAW retention | ≥85% | 43/68 = 63.2%; new holdout needed. |
| Correct explicit-update retention | ≥90% | 4/12 = 33.3%; only 12 RAW-correct explicit updates. |
| Unnecessary good fallback | ≤15% | 25/68 = 36.8% if measured against GOOD_RAW; report exact denominator. |
| Guessed missing values | 0 | V3-096 placeholder and audit explicitly record no guessed dates. |
| Harmful accepted repair | 0 | V3-012 harmful repair was rejected; target prevents accepted undoing/collateral repairs. |
| Already-good restraint | Preserve | Measure on new leave-alone cases, including objective satisfaction and unnecessary edits. |

## Four architecture options for later evaluation

Options are intentionally implementation-neutral alternatives to compare after the product requirements. This report does not select a winner or specify a new strategy/version.

### 1. Objective-conditioned truth representation

Represent supplied replacements, preserved facts, unknown values, and uncertainty distinctly while interpreting the task. It primarily addresses PR-01, PR-02, PR-04, PR-05, PR-08, and PR-12. **Likely complexity:** high, because the representation must track provenance and scope through multiple clauses, paraphrases, and revisions. **Safety risk:** authority overreach if an update is treated as permission to mutate adjacent facts. **Conservatism impact:** less conservative about explicitly superseded values, while remaining conservative about unrelated values. **Existing safety machinery:** can be preserved as downstream verification, but would need access to the objective-conditioned distinctions. **Fundamental architecture change:** likely yes to the truth/provenance representation; this is an analysis option, not a chosen design.

### 2. Preserve authorized deltas across final selection

Carry validated requested changes as invariants into final selection, so fallback cannot silently restore a superseded value and be presented as successful fulfillment. It primarily addresses PR-01, PR-02, PR-03, and PR-12. **Likely complexity:** medium to high, depending on how replacement values are matched after rewriting. **Safety risk:** a wrongly recognized delta could force an unsafe fact into output; a final whole-output safety check remains necessary. **Conservatism impact:** reduces over-conservatism on authorized changes, but should not loosen protection on other claims. **Existing safety machinery:** yes; deterministic and semantic safety checks can remain and act before acceptance. **Fundamental architecture change:** not necessarily to reconstruction itself, but the fallback/selection contract must change to account for objective fulfillment.

### 3. Partial safe-edit acceptance

Keep independently safe parts of a candidate when another span fails, while clearly exposing unresolved work. It primarily addresses PR-02, PR-03, PR-05, PR-06, PR-07, PR-11, and PR-12. **Likely complexity:** high, because clauses can depend on one another and edits can change cross-sentence meaning. **Safety risk:** high unless the recomposed whole output is rechecked; a locally safe fragment can become misleading in context. **Conservatism impact:** less conservative about retaining safe editorial value, with a risk of accepting too much if fragment boundaries are wrong. **Existing safety machinery:** can be preserved, but must run over the recomposed whole output and its objective. **Fundamental architecture change:** not necessarily; this could be an added composition/selection capability, though the acceptance contract changes substantially.

### 4. Separate safety from objective fulfillment with explicit abstention

Track meaning safety and objective satisfaction separately, and let a safe but incomplete candidate be marked incomplete or held for clarification. It primarily addresses PR-03, PR-04, PR-06, PR-08, and PR-12. **Likely complexity:** medium; state separation is conceptually bounded, while clear abstention behavior and downstream handling need definition. **Safety risk:** low for claim acceptance if safety verification remains a hard gate; user confusion is possible if incomplete status is not visible. **Conservatism impact:** increases abstention when the task cannot be safely completed, while avoiding the pressure to silently call a fallback successful. **Existing safety machinery:** yes; existing verified safety checks can remain the acceptance gate. **Fundamental architecture change:** no fundamental rewrite is implied, but output disposition and product contract must represent incompleteness explicitly.

## Scope and integrity for the next task

This pass is analysis and documentation only. The sealed V3 data and interpretations remain unchanged; reconstruction-v15 remains frozen; production `reconstruction-v1` is unchanged. No V16, editor, or verifier modification was made. No paid spend, push, or deployment occurred. No code or tests were added.

The next task is to approve or amend the product contract and preregister an architecture comparison on fresh, non-V3 evidence. Implementation is not part of this pass.

## Next research question

**How can the system retain authorized current facts and safe editorial value under uncertainty without increasing bad escapes or collateral mutation?**
