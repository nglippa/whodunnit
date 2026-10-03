# Holdout V3 loss case records

Transcription appendix for the 25 sealed `GOOD_RAW` cases whose interpretation records `materialGoodEditLost: true`. Text fields below are copied verbatim from the frozen case and replay records; labels, findings, traces, and audit layers retain their recorded values. This appendix adds no reclassification.

## Immutable sources

- [Frozen cases](../data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1/inputs/frozen/cases.json) — source and objective text.
- [Frozen labels](../data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1/inputs/frozen/labels.json) — preregistration edit scope and preserved/authorized facts.
- [Frozen manifest](../data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1/inputs/frozen/manifest.json) — SHA256 below.
- [Frozen replay](../data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1/inputs/run/replay.json) — RAW candidate, FINAL, deterministic checks, semantic calls, repair and fallback trace.
- [Sealed interpretations](../data/evaluation/holdout-v3/run/post-review-v1/final-audit-v1/interpretations.json) — original mandatory audit, separate adjudication where present, and locked interpretation.
- Blind outputs: `data/evaluation/holdout-v3/run/blind-output-v1/review-submissions-v1/{primary,second}/*/submission.json`; unblinded case mapping: `data/evaluation/holdout-v3/run/post-review-v1/unblinded-labels.json`.

Frozen manifest SHA256: `e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2`.

Per case, `sourceSha256` and `objectiveSha256` are copied from the frozen manifest; each is verified against the UTF-8 SHA256 of the exact transcribed text. RAW and FINAL are verified against the replay row. Prereview scope records are copied from frozen labels. Blind judgments below include each available primary/second label with original A/B side mapping and original pairwise value.

## Cases

### V3-003

Frozen text hashes: source `0e662f1a1e282aa95787662cafc5d93d60184cbd4b2ee59905264ac3f9598c60`; objective `162dc24177a5fbd0a461ce953ab59cc7aef129286cdb3e5e6d6919143985d3e2`.

**SOURCE**

````text
The potluck starts at 6 on Thursday in the library meeting room.
````

**OBJECTIVE**

````text
Update this reminder: the potluck now starts at 6:30, and the location is the library courtyard. Keep it brief.
````

**RAW**

````text
The potluck now starts at 6:30 on Thursday in the library courtyard.
````

**FINAL**

````text
The potluck starts at 6 on Thursday in the library meeting room.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: [
  "Potluck time: 6:30 Thursday.",
  "Location: library courtyard."
]. Preserved facts: [
  "Thursday schedule and reminder context."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""
- **R2B — `LOCAL_EDIT`.** Authorized factual changes: [
  "Start time: 6:30",
  "Location: library courtyard"
]. Preserved facts: [
  "Thursday potluck"
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Brief reminder; replace only the time and location."

#### Primary and available second blind labels

- **primary/O1C**; item `blind-83e3834c4c690e75be8e0e69388f9f5c`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-83e3834c4c690e75be8e0e69388f9f5c`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `altered_number` — The rewrite introduces 30, which is not in your text.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
thirty
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-003",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective supplies 6:30 and library courtyard; RAW applies both and FINAL reverts to 6 and meeting room.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "YES",
  "evidence": "RAW correctly applies 6:30 and courtyard while retaining Thursday. Both blind reviewers prefer RAW; their final usefulness YES/NO/PARTIAL distinctions remain preserved in the packet. Deterministic rejection of introduced 30 ignores authorization. Attempted replacement thirty does not resolve the numeric objection or improve the already-correct time; rejected repair ends in source fallback, losing both updates."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW correctly applies 6:30 and courtyard while retaining Thursday. Both blind reviewers prefer RAW; their final usefulness YES/NO/PARTIAL distinctions remain preserved in the packet. Deterministic rejection of introduced 30 ignores authorization. Attempted replacement thirty does not resolve the numeric objection or improve the already-correct time; rejected repair ends in source fallback, losing both updates."
}
```

### V3-009

Frozen text hashes: source `01d964564c9ce2d24eb5220718e31134ee8eb97383266400e2ea072fe74352ec`; objective `fa23ccdc864792bae3389c63b2fdfe736a0b227f554584ce8660d5f11b1652d2`.

**SOURCE**

````text
Hello all, I am reaching out with the purpose of determining whether Tuesday is a day on which we might possibly meet. If not, I can also do Wednesday morning before 11. Please advise regarding your availability.
````

**OBJECTIVE**

````text
Make this scheduling note sound like a normal, courteous message to a small team.
````

**RAW**

````text
Hi all, I'm trying to find a time for us to meet. Could we do Tuesday? If not, I can also do Wednesday morning before 11. Let me know what works for you.
````

**FINAL**

````text
Hello all, I am reaching out with the purpose of determining whether Tuesday is a day on which we might possibly meet. If not, I can also do Wednesday morning before 11. Please advise regarding your availability.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Tuesday proposed for meeting; Wednesday morning before 11 is an alternative."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Unnecessary formality occurs throughout the short note."
- **R2B — `LOCAL_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Tuesday is preferred for a possible meeting",
  "Wednesday morning is an alternative, before 11"
]. Intentional voice: [
  "Courteous team-facing tone"
]. Missing information prevents fulfillment: `False`. Notes: "Simplify the overformal phrasing without changing availability."

#### Primary and available second blind labels

- **primary/O1C**; item `blind-aae04a45faeac8c8f94927514cec0ed9`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-aae04a45faeac8c8f94927514cec0ed9`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 7.
- `added_claim` — “Let” appears in the rewrite but not in your text.
- `missing_claim` — This claim no longer appears in the rewrite (22% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (0% of its content words survive).
- `added_claim` — Likely added content: 3 of 4 content words are not in the source.
- `added_claim` — Likely added content: 3 of 3 content words are not in the source.
- `added_question` — The rewrite asks a question the source does not ask.
- `meaning_drift` — Only 31% of your key words survive. Read closely for anything dropped.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-009",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update requested.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW removes bureaucratic padding through courteous Tuesday question and normal availability request; Wednesday morning before 11 is unchanged. Both reviewers prefer RAW. Blocking missing-claim/coverage findings mistake paraphrase for lost content; no semantic review or repair. Source fallback loses the requested normal team tone."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW removes bureaucratic padding through courteous Tuesday question and normal availability request; Wednesday morning before 11 is unchanged. Both reviewers prefer RAW. Blocking missing-claim/coverage findings mistake paraphrase for lost content; no semantic review or repair. Source fallback loses the requested normal team tone."
}
```

### V3-012

Frozen text hashes: source `326bec875bc2240381382e9cccd90582ebd4c37aa2c76c1e93e90346b05669ad`; objective `71d8a3e9f0bd137a372e49a4320a9ba064a81e7975cbf40ff46cb21c57264046`.

**SOURCE**

````text
We have the first version of the walking map ready, with 12 stops and short notes for each one. It took longer than I expected to make the notes sound like they belonged together. Some people sent memories, some sent dates, and we are trying to make room for both without turning every stop into a wall of text. The copy at the community center is still a draft, so please write comments on the sheet beside it rather than directly on the map.

Marta checked the route on Saturday and said the crossing by the bakery is harder than it looks on paper. She had to wait through two light changes before she felt comfortable crossing. I will redraw that section this week, and we may need to move the stop marker a little farther up the street. We are still aiming to print a small batch in November, assuming the council approves the final map.

Thanks to everyone who sent in stories about the old bridge. I have not managed to fit all of them into the short note, but they helped us choose what to point out along the route.
````

**OBJECTIVE**

````text
Update the group accurately: the map now has 14 stops, and the print target has moved to December. Keep the crossing issue and the council approval condition clear.
````

**RAW**

````text
We have the first version of the walking map ready, with 14 stops and short notes for each one. It took longer than I expected to make the notes sound like they belonged together. Some people sent memories, some sent dates, and we are trying to make room for both without turning every stop into a wall of text. The copy at the community center is still a draft, so please write comments on the sheet beside it rather than directly on the map.

Marta checked the route on Saturday and said the crossing by the bakery is harder than it looks on paper. She had to wait through two light changes before she felt comfortable crossing. I will redraw that section this week, and we may need to move the stop marker a little farther up the street. We are still aiming to print a small batch in December, assuming the council approves the final map.

Thanks to everyone who sent in stories about the old bridge. I have not managed to fit all of them into the short note, but they helped us choose what to point out along the route.
````

**FINAL**

````text
We have the first version of the walking map ready, with 12 stops and short notes for each one. It took longer than I expected to make the notes sound like they belonged together. Some people sent memories, some sent dates, and we are trying to make room for both without turning every stop into a wall of text. The copy at the community center is still a draft, so please write comments on the sheet beside it rather than directly on the map.

Marta checked the route on Saturday and said the crossing by the bakery is harder than it looks on paper. She had to wait through two light changes before she felt comfortable crossing. I will redraw that section this week, and we may need to move the stop marker a little farther up the street. We are still aiming to print a small batch in November, assuming the council approves the final map.

Thanks to everyone who sent in stories about the old bridge. I have not managed to fit all of them into the short note, but they helped us choose what to point out along the route.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: [
  "Map has 14 stops.",
  "Print target is December."
]. Preserved facts: [
  "Crossing by bakery is difficult; Marta waited two light changes; possible marker adjustment; council approval is required before printing."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""
- **R2B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: [
  "Walking map now has 14 stops",
  "Print target is December"
]. Preserved facts: [
  "Map has short notes; comments belong on sheet beside draft at community center",
  "Bakery crossing is difficult; Marta waited through two light changes",
  "Crossing section will be redrawn; marker may move farther up the street",
  "Printing depends on council approval of final map",
  "Stories about old bridge informed what to highlight"
]. Intentional voice: [
  "Collaborative, appreciative community update"
]. Missing information prevents fulfillment: `False`. Notes: "Update only the stop count and target month; retain the crossing concern and approval condition."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-1deea245b1f37f8f1ab3ede76c386bf4`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 4.
- `altered_number` — The figure 12 from your text is missing or changed.
- `altered_number` — The rewrite introduces 14, which is not in your text.
- `altered_date` — AUTHORIZED_CHANGE: The date reference “november” is missing or changed.
- `altered_date` — AUTHORIZED_CHANGE: The rewrite adds a date reference “december”.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `LOCAL_REPAIR`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
12
````.
- Fallback reason: `repair-failed`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `ADDITIVE_ADJUDICATION_12`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-012",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "HARMFUL_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective specifies 14 stops and December print target; RAW applies both; FINAL restores obsolete 12 and November.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW changes only 12 to 14 stops and November to December, preserving Marta's Saturday crossing experience, two light changes, possible marker move and council condition. Blind reviewer agrees. Deterministic number rejection ignores authorization. Attempted repair replacement 12 would undo an authorized current fact; it was rejected. Fallback reverts both current facts and loses objective value."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
{
  "caseId": "V3-012",
  "raw": "GOOD_RAW",
  "final": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "HARMFUL_ATTEMPT_REJECTED",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "Objective: 'map now has 14 stops' and 'moved to December'; RAW applies both, FINAL restores '12 stops' and 'November'. Repair replacement '12' undoes authorized count; reverify identifies missing 14. Final is stale and objective-failing, with no escaped invented rewrite.",
  "auditorCorrection": null
}
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "HARMFUL_ATTEMPT_REJECTED",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "Objective: 'map now has 14 stops' and 'moved to December'; RAW applies both, FINAL restores '12 stops' and 'November'. Repair replacement '12' undoes authorized count; reverify identifies missing 14. Final is stale and objective-failing, with no escaped invented rewrite."
}
```

### V3-013

Frozen text hashes: source `6de310821577b47c4c6d1da7d0669f1fcb1670fd198a57e017a99af90dfebf1b`; objective `1c2fd3488ee22a895f03cfae0efcfc88ee3daff2ca67f62b80ddfc74143d2258`.

**SOURCE**

````text
The little free library has been busy since we moved it under the awning. Books are turning over much faster, and someone left a lovely stack of picture books last week. The lower shelf is mostly children's books now, which is nice to see, but it also means grown-up books are getting stacked on top. A few have been wedged in sideways and are hard to pull out without bringing the whole pile with them.

If you are dropping books off, please take a moment to stand them upright. You do not need to sort them carefully; a little space on the shelf is enough. On rainy days, close the door firmly, because it tends to catch on the frame. The books inside were dry after the last storm, but we would like to keep it that way.

We are planning a painting afternoon later this month to freshen up the outside. I'll share a date once the forecast looks sensible. If you have a small brush you do not mind lending, bring it along when the day comes.
````

**OBJECTIVE**

````text
Edit this for the neighborhood newsletter. Make the two requests easy to spot without sounding scolding.
````

**RAW**

````text
The little free library has been busy since we moved it under the awning. Books are turning over much faster, and someone left a lovely stack of picture books last week. The lower shelf is mostly children's books now, which is nice to see, but it also means grown-up books are getting stacked on top. A few have been wedged in sideways and are hard to pull out without bringing the whole pile with them.

Two small requests:

**1. Stand books upright when you drop them off.** You do not need to sort them carefully; a little space on the shelf is enough.

**2. On rainy days, close the door firmly.** It tends to catch on the frame. The books inside were dry after the last storm, but we would like to keep it that way.

We are planning a painting afternoon later this month to freshen up the outside. I'll share a date once the forecast looks sensible. If you have a small brush you do not mind lending, bring it along when the day comes.
````

**FINAL**

````text
The little free library has been busy since we moved it under the awning. Books are turning over much faster, and someone left a lovely stack of picture books last week. The lower shelf is mostly children's books now, which is nice to see, but it also means grown-up books are getting stacked on top. A few have been wedged in sideways and are hard to pull out without bringing the whole pile with them.

If you are dropping books off, please take a moment to stand them upright. You do not need to sort them carefully; a little space on the shelf is enough. On rainy days, close the door firmly, because it tends to catch on the frame. The books inside were dry after the last storm, but we would like to keep it that way.

We are planning a painting afternoon later this month to freshen up the outside. I'll share a date once the forecast looks sensible. If you have a small brush you do not mind lending, bring it along when the day comes.
````

#### Frozen pre-generation scope

- **R1B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Requests to stand donated books upright and close the door firmly in rain; painting date depends on forecast."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""
- **R2B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Library is under awning and busy; picture books were donated",
  "Children's books occupy lower shelf; adult books pile on top",
  "Request 1: stand donated books upright; careful sorting is unnecessary",
  "Request 2: close door firmly on rainy days",
  "Painting afternoon planned later this month; date depends on forecast",
  "Small brush loan welcome"
]. Intentional voice: [
  "Warm, neighborly, non-scolding tone"
]. Missing information prevents fulfillment: `False`. Notes: "Make the two practical requests conspicuous while retaining the other newsletter details."

#### Primary and available second blind labels

- **primary/O1B**; item `blind-7154f2b475c48c1845d76854c1e57cec`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-7154f2b475c48c1845d76854c1e57cec`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `altered_number` — The rewrite introduces 1, which is not in your text.
- `altered_number` — The rewrite introduces 2, which is not in your text.
- `added_claim` — Likely added content: 2 of 3 content words are not in the source.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
First
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-013",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update requested.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW surfaces book placement and rainy-day door closure in two friendly numbered headings, retaining all surrounding facts and forecast-dependent painting plans. Both blind reviewers agree. Blocking 1/2 findings treat enumeration as invented quantities. Repair First safely renames one marker but is rejected and leaves the other blocker unresolved; it adds no editorial benefit beyond RAW. Source fallback loses conspicuous requests."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW surfaces book placement and rainy-day door closure in two friendly numbered headings, retaining all surrounding facts and forecast-dependent painting plans. Both blind reviewers agree. Blocking 1/2 findings treat enumeration as invented quantities. Repair First safely renames one marker but is rejected and leaves the other blocker unresolved; it adds no editorial benefit beyond RAW. Source fallback loses conspicuous requests."
}
```

### V3-014

Frozen text hashes: source `7eb8276166f317d5488c03de257c344ae8e73ccaa6646987b464d199aae0d916`; objective `cb30743bfc515a82af0ce66be177d0f44c7cd2b848a6b9484766d31088b1cf70`.

**SOURCE**

````text
I wanted to take a moment to express my heartfelt appreciation for the incredible journey that was our board game night. The laughter, the snacks, and the spirit of friendly competition all came together to create an unforgettable evening. I especially enjoyed how seriously we took the rules for a game none of us had played before. At some point we were debating a cardboard bridge as though its future mattered to the city.

I am deeply grateful to each and every one of you for making this gathering such a success. Special recognition goes to Lee, who brought the folding table after I forgot to check whether we had enough space. Without that table we would have been balancing the board on our knees, which might have changed the results. I found two spare game pieces under the sofa this morning. If they belong to someone, I'll keep them in the box until next time. Thanks again for coming over, staying late, and helping clean up before you left.
````

**OBJECTIVE**

````text
Make this thank-you message sound more like me texting friends after a fun night. Keep the specific thanks to Lee.
````

**RAW**

````text
Thanks so much for coming to board game night. The laughter, the snacks, and the friendly competition made it a really fun evening. I loved how seriously we took the rules for a game none of us had played before. At some point we were debating a cardboard bridge as though its future mattered to the city.

Thank you all for making it such a good night. Special thanks to Lee, who brought the folding table after I forgot to check whether we had enough space. Without that table we'd have been balancing the board on our knees, which might have changed the results. I found two spare game pieces under the sofa this morning. If they belong to someone, I'll keep them in the box until next time. Thanks again for coming over, staying late, and helping clean up before you left.
````

**FINAL**

````text
I wanted to take a moment to express my heartfelt appreciation for the incredible journey that was our board game night. The laughter, the snacks, and the spirit of friendly competition all came together to create an unforgettable evening. I especially enjoyed how seriously we took the rules for a game none of us had played before. At some point we were debating a cardboard bridge as though its future mattered to the city.

I am deeply grateful to each and every one of you for making this gathering such a success. Special recognition goes to Lee, who brought the folding table after I forgot to check whether we had enough space. Without that table we would have been balancing the board on our knees, which might have changed the results. I found two spare game pieces under the sofa this morning. If they belong to someone, I'll keep them in the box until next time. Thanks again for coming over, staying late, and helping clean up before you left.
````

#### Frozen pre-generation scope

- **R1B — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: [
  "Lee brought the folding table; two spare game pieces were found; friends stayed late and helped clean up."
]. Intentional voice: [
  "Informal, amused thanks to friends."
]. Missing information prevents fulfillment: `False`. Notes: ""
- **R2B — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: [
  "Board game night with laughter, snacks, and friendly competition",
  "They took rules seriously for an unfamiliar game and debated a cardboard bridge",
  "Lee brought the folding table after the writer forgot to check space",
  "Two spare pieces were found under sofa and will stay in box until next time",
  "Guests stayed late and helped clean up"
]. Intentional voice: [
  "Personal, amused, affectionate text to friends"
]. Missing information prevents fulfillment: `False`. Notes: "Convert the formal long thank-you into a casual text while retaining specific thanks to Lee."

#### Primary and available second blind labels

- **primary/O1D**; item `blind-cf29b856f5f2c9edcda41054f5b84dc3`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-cf29b856f5f2c9edcda41054f5b84dc3`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "NO",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `added_claim` — The rewrite asserts a cause (“thanks to”) the source does not state.
- `missing_claim` — This claim no longer appears in the rewrite (27% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (17% of its content words survive).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
Special shout-out to Lee, who brought the folding table after I forgot to check whether we had enough space.
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-014",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update requested.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "Conversational thanks replace ceremonial opening/gratitude while preserving Lee's folding table, forgotten space check, jokes, two pieces and cleanup thanks. Both reviewers prefer RAW. Special thanks to is gratitude, not an asserted new cause; low lexical overlap is expected for authorized voice editing. Attempted Special shout-out to Lee preserves specifics and is safe but unnecessary and rejected; remaining blockers still force fallback to the formal source."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "Conversational thanks replace ceremonial opening/gratitude while preserving Lee's folding table, forgotten space check, jokes, two pieces and cleanup thanks. Both reviewers prefer RAW. Special thanks to is gratitude, not an asserted new cause; low lexical overlap is expected for authorized voice editing. Attempted Special shout-out to Lee preserves specifics and is safe but unnecessary and rejected; remaining blockers still force fallback to the formal source."
}
```

### V3-017

Frozen text hashes: source `48294b4d696084620740f6e885c29d615f22ead335f53a17641b744dc3ae0b82`; objective `ad74ac579a845a751bf6364bf4ac97e580551003b29359c1720bae5cc54da3ab`.

**SOURCE**

````text
A change has come up with the mural weekend. We're still sorting through the details, and I know people have set aside time to come paint. The team is talking with the building manager because we need to understand what work can go ahead in the space. We have not made a decision yet about this weekend. I wanted to say something now rather than let everyone plan around an event that may have to change.

If you were planning to bring supplies, please hold on to them for the moment. We will tell everyone what is happening when we know more. I appreciate your patience, and I'm sorry this is arriving so close to the weekend. I know some of you arranged childcare or moved other plans so you could help. We are grateful for that, even if the timing has turned out awkwardly. Please pass this along to anyone who said they might drop by but isn't in this group, so they know the plan is uncertain too.
````

**OBJECTIVE**

````text
Write a clearer update for volunteers. We don't yet know whether the work will happen this weekend, so make that uncertainty plain and avoid inventing a decision or a timeline.
````

**RAW**

````text
The mural weekend has hit a snag. We're still sorting through the details, and I know people have set aside time to come paint. The team is talking with the building manager because we need to understand what work can go ahead in the space. We haven't decided yet whether the work will happen this weekend. I wanted to tell you now rather than let everyone plan around an event that may have to change.

If you were planning to bring supplies, please hold on to them for now. We'll tell everyone what is happening when we know more. Thank you for your patience, and I'm sorry this is arriving so close to the weekend. I know some of you arranged childcare or moved other plans so you could help. We're grateful for that, even if the timing has turned out awkwardly. Please pass this along to anyone who said they might drop by but isn't in this group, so they know the plan is uncertain too.
````

**FINAL**

````text
A change has come up with the mural weekend. We're still sorting through the details, and I know people have set aside time to come paint. The team is talking with the building manager because we need to understand what work can go ahead in the space. We have not made a decision yet about this weekend. I wanted to say something now rather than let everyone plan around an event that may have to change.

If you were planning to bring supplies, please hold on to them for the moment. We will tell everyone what is happening when we know more. I appreciate your patience, and I'm sorry this is arriving so close to the weekend. I know some of you arranged childcare or moved other plans so you could help. We are grateful for that, even if the timing has turned out awkwardly. Please pass this along to anyone who said they might drop by but isn't in this group, so they know the plan is uncertain too.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Weekend work remains undecided while team talks with building manager.",
  "Volunteers should hold supplies; news will be shared when more is known.",
  "Some volunteers arranged childcare or changed plans; pass uncertainty to people outside group."
]. Intentional voice: [
  "Apologetic appreciation for volunteers’ arrangements."
]. Missing information prevents fulfillment: `False`. Notes: "Put unresolved status and immediate instruction prominently; no timeline supplied or required."

#### Primary and available second blind labels

- **primary/O1B**; item `blind-7ca28d988e9d600b9c121e9ac4de79ba`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 6.
- `added_claim` — “We'll” appears in the rewrite but not in your text.
- `added_claim` — “Thank” appears in the rewrite but not in your text.
- `assertion_strength_changed` — “so” became “help” (causation weakened).
- `added_claim` — An unrelated claim changes outside the requested semantic delta.
- `added_claim` — An unrelated claim changes outside the requested semantic delta.
- `added_claim` — An unrelated claim changes outside the requested semantic delta.

**Final verification**

- Status: `review`; finding count: 1.
- `assertion_strength_changed` — “so” became “help” (causation weakened).

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
I wanted to say something now rather than let everyone plan around an event that may have to change.
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-017",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update requested.",
  "vagueUpdateObserved": "YES",
  "vagueUpdateEvidence": "Weekend plan is unresolved and no decision or timeline is supplied; RAW clarifies uncertainty without guessing.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW directly says whether work happens this weekend is undecided; supplies hold, building-manager consultation, childcare acknowledgment and no promised deadline remain. Blind reviewer favors RAW. Blocking unrelated-change findings target equivalent tell you/say something, for now/for the moment and thank you/appreciate paraphrases. Attempted repair restores one source sentence safely but fails remaining blockers, losing no real defect because none existed. Fallback loses clarity benefit."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW directly says whether work happens this weekend is undecided; supplies hold, building-manager consultation, childcare acknowledgment and no promised deadline remain. Blind reviewer favors RAW. Blocking unrelated-change findings target equivalent tell you/say something, for now/for the moment and thank you/appreciate paraphrases. Attempted repair restores one source sentence safely but fails remaining blockers, losing no real defect because none existed. Fallback loses clarity benefit."
}
```

### V3-021

Frozen text hashes: source `3d114d64449b03b07d671056e8eb5e32a346fb79583c7cd5f4c0ded5bd4e17fe`; objective `61f5deea6046e1c6e1d1846a5b186c254a486a9cf9da88381e6117ccd98930f1`.

**SOURCE**

````text
Here is where the riverside path project stands. The volunteer crew cleared 80 meters of brush last weekend, working from the upper gate toward the picnic area. That gives people a clearer view of the marked route and lets the maintenance team reach the drainage channel. The parks office agreed to collect the cuttings on Friday. Until then, the bundles are stacked beside the service track, away from the walking surface. Thanks to the six people who came out in the drizzle and to June for lending the wheelbarrow; it saved several trips up the slope.

We still cannot open the lower bend because the rail there is loose. A contractor is due to inspect it next week. That visit is an inspection, not a repair, and we will not know the repair plan until the inspection is done. A few people have asked whether the bend could open for walkers while we wait. The answer for now is no. The ground narrows near the rail, and there is no room to move around it safely if someone is coming the other way.

The route sketch at the community center shows the upper path as the temporary walking option. Please use that path even if the lower bend looks passable. We have put a notice at each entrance, but signs can be easy to miss when you already know the trail. If you are walking with someone who has not seen the update, please point them toward the upper path as well.

We will post another update after the inspection, when we have something definite to share. I know the closure makes a familiar short walk longer, especially for people coming from the south side. The crew wants the bend open too, but we need a sound rail before we can invite everyone back onto that section.
````

**OBJECTIVE**

````text
Revise this update with the new facts: volunteers cleared 95 meters, and the parks office will collect cuttings on Monday. Keep the lower bend closed and distinguish inspection from repair. Make the notice easy to skim.
````

**RAW**

````text
**Riverside path update**

**Brush clearing**
The volunteer crew cleared 95 meters of brush last weekend, working from the upper gate toward the picnic area. That gives people a clearer view of the marked route and lets the maintenance team reach the drainage channel. The parks office agreed to collect the cuttings on Monday. Until then, the bundles are stacked beside the service track, away from the walking surface. Thanks to the six people who came out in the drizzle and to June for lending the wheelbarrow; it saved several trips up the slope.

**Lower bend: still closed**
We still cannot open the lower bend because the rail there is loose.
- Next week: a contractor is due to inspect the rail.
- That visit is an inspection, not a repair. We will not know the repair plan until the inspection is done.
- Can it open for walkers while we wait? For now, no. The ground narrows near the rail, and there is no room to move around it safely if someone is coming the other way.

**What to do now**
- Use the upper path, which the route sketch at the community center shows as the temporary walking option. Please use it even if the lower bend looks passable.
- We have put a notice at each entrance, but signs can be easy to miss when you already know the trail. If you are walking with someone who has not seen the update, please point them toward the upper path as well.

**Next update**
We will post another update after the inspection, when we have something definite to share. I know the closure makes a familiar short walk longer, especially for people coming from the south side. The crew wants the bend open too, but we need a sound rail before we can invite everyone back onto that section.
````

**FINAL**

````text
Here is where the riverside path project stands. The volunteer crew cleared 80 meters of brush last weekend, working from the upper gate toward the picnic area. That gives people a clearer view of the marked route and lets the maintenance team reach the drainage channel. The parks office agreed to collect the cuttings on Friday. Until then, the bundles are stacked beside the service track, away from the walking surface. Thanks to the six people who came out in the drizzle and to June for lending the wheelbarrow; it saved several trips up the slope.

We still cannot open the lower bend because the rail there is loose. A contractor is due to inspect it next week. That visit is an inspection, not a repair, and we will not know the repair plan until the inspection is done. A few people have asked whether the bend could open for walkers while we wait. The answer for now is no. The ground narrows near the rail, and there is no room to move around it safely if someone is coming the other way.

The route sketch at the community center shows the upper path as the temporary walking option. Please use that path even if the lower bend looks passable. We have put a notice at each entrance, but signs can be easy to miss when you already know the trail. If you are walking with someone who has not seen the update, please point them toward the upper path as well.

We will post another update after the inspection, when we have something definite to share. I know the closure makes a familiar short walk longer, especially for people coming from the south side. The crew wants the bend open too, but we need a sound rail before we can invite everyone back onto that section.
````

#### Frozen pre-generation scope

- **R1B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: [
  "Volunteers cleared 95 meters of brush.",
  "Parks office will collect cuttings Monday."
]. Preserved facts: [
  "Lower bend stays closed; contractor visit is inspection only, with repair plan not yet known."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""
- **R2B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: [
  "Volunteers cleared 95 meters of brush",
  "Parks office will collect cuttings Monday"
]. Preserved facts: [
  "Work ran from upper gate toward picnic area",
  "Brush clearing improves route visibility and drainage access",
  "Six volunteers came in drizzle; June lent wheelbarrow",
  "Lower bend remains closed because rail is loose",
  "Contractor visit next week is inspection only, not repair; repair plan follows inspection",
  "Narrow ground makes passing the rail unsafe",
  "Upper path is temporary route; walkers should use it",
  "Next update follows inspection; reopening requires sound rail"
]. Intentional voice: [
  "Practical, appreciative community notice"
]. Missing information prevents fulfillment: `False`. Notes: "Organize for skimming while preserving closure, safety rationale, and inspection-versus-repair distinction."

#### Primary and available second blind labels

- **primary/O1B**; item `blind-610d851741887c67517b8dfe2e15e7d5`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-610d851741887c67517b8dfe2e15e7d5`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 8.
- `altered_number` — AUTHORIZED_CHANGE: The figure 80 from your text is missing or changed.
- `altered_number` — AUTHORIZED_CHANGE: The rewrite introduces 95, which is not in your text.
- `altered_date` — AUTHORIZED_CHANGE: The date reference “friday” is missing or changed.
- `altered_date` — AUTHORIZED_CHANGE: The rewrite adds a date reference “monday”.
- `assertion_strength_changed` — Certainty rose from possible to asserted.
- `assertion_strength_changed` — The qualifier “a few” was dropped, which generalises the claim.
- `added_question` — The rewrite asks a question the source does not ask.
- `altered_date` — The requested temporal replacement conflicts with a preservation directive.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-021",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective specifies 95 meters and Monday collection; RAW updates those without altering next-week inspection; FINAL restores 80 and Friday.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update with missing replacement values requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The objective identifies a concrete improvement or update the source still needs.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW applies 95 meters and Monday and adds useful section headings/bullets, retaining closure, next-week inspection rather than repair, safety rationale, upper-path guidance, six volunteers and June. Reframing a few people's question as FAQ loses incidental attribution but makes no unsupported factual generalization or opening promise. Both blind reviewers prefer RAW. Blocking temporal preservation conflict rejects explicitly requested Monday despite keep referring to closure and inspection distinction. No repair; fallback loses current facts and scanning benefit."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW applies 95 meters and Monday and adds useful section headings/bullets, retaining closure, next-week inspection rather than repair, safety rationale, upper-path guidance, six volunteers and June. Reframing a few people's question as FAQ loses incidental attribution but makes no unsupported factual generalization or opening promise. Both blind reviewers prefer RAW. Blocking temporal preservation conflict rejects explicitly requested Monday despite keep referring to closure and inspection distinction. No repair; fallback loses current facts and scanning benefit."
}
```

### V3-023

Frozen text hashes: source `2e102b9d3de826b124531776b661d31a885098f831b42fda1a4f2a1e2556196e`; objective `b086ffc38a13239408b29736299a2675b138eb71d6550f063a30371eab906715`.

**SOURCE**

````text
We put the first issue of our tiny local history zine together on the library floor, surrounded by photo copies and two kinds of tape. It is now at the printer, which still feels unlikely. The issue has a piece about the old ferry landing, a recipe from the market's first cook, and drawings by the after-school art group. The drawings arrived in an envelope with a note telling us which way was up on each page. That note was useful. We managed to get them all facing the right way in the final layout.

We were hoping for 200 copies, but the current budget covers 120. I wish we could put one in every hand that asked for one, but I also think a modest first run is fine. We will leave copies at the library and the market and share any remaining ones at the open house. I am keeping a list of people who helped with the issue so we can make sure they receive a copy. If we have enough interest, we can look at a second print run later, though nothing is arranged yet.

I am writing to share this exciting milestone and invite everyone to be part of the next chapter of our journey. More practically, we need a couple of people to help fold copies next Thursday evening. It should take about an hour if the printer delivers on Wednesday as promised. If delivery slips, I'll send a note rather than ask people to turn up for nothing. There will be a folding guide, and nobody needs experience. I only ask that we work at a table this time; the library floor has earned a rest.

Thank you to the library staff for letting us borrow the big table so many times, and to everyone who checked dates or hunted down photographs. The work shows in small ways throughout the issue. I am looking forward to seeing the pages as an actual little booklet instead of a stack that slides off my desk.
````

**OBJECTIVE**

````text
Turn this into a natural update for the contributors. The second paragraph sounds too promotional; keep the excitement, the budget limit, the delivery condition, and the folding request.
````

**RAW**

````text
We put the first issue of our tiny local history zine together on the library floor, surrounded by photo copies and two kinds of tape. It is now at the printer, which still feels unlikely. The issue has a piece about the old ferry landing, a recipe from the market's first cook, and drawings by the after-school art group. The drawings arrived in an envelope with a note telling us which way was up on each page. That note was useful. We managed to get them all facing the right way in the final layout.

We were hoping for 200 copies, but the current budget covers 120. I wish we could put one in every hand that asked for one, but I also think a modest first run is fine. We will leave copies at the library and the market and share any remaining ones at the open house. I am keeping a list of people who helped with the issue so we can make sure they receive a copy. If we have enough interest, we can look at a second print run later, though nothing is arranged yet.

I'm excited to share that the issue is done and on its way. More practically, we need a couple of people to help fold copies next Thursday evening. It should take about an hour if the printer delivers on Wednesday as promised. If delivery slips, I'll send a note rather than ask people to turn up for nothing. There will be a folding guide, and nobody needs experience. I only ask that we work at a table this time; the library floor has earned a rest.

Thank you to the library staff for letting us borrow the big table so many times, and to everyone who checked dates or hunted down photographs. The work shows in small ways throughout the issue. I am looking forward to seeing the pages as an actual little booklet instead of a stack that slides off my desk.
````

**FINAL**

````text
We put the first issue of our tiny local history zine together on the library floor, surrounded by photo copies and two kinds of tape. It is now at the printer, which still feels unlikely. The issue has a piece about the old ferry landing, a recipe from the market's first cook, and drawings by the after-school art group. The drawings arrived in an envelope with a note telling us which way was up on each page. That note was useful. We managed to get them all facing the right way in the final layout.

We were hoping for 200 copies, but the current budget covers 120. I wish we could put one in every hand that asked for one, but I also think a modest first run is fine. We will leave copies at the library and the market and share any remaining ones at the open house. I am keeping a list of people who helped with the issue so we can make sure they receive a copy. If we have enough interest, we can look at a second print run later, though nothing is arranged yet.

I am writing to share this exciting milestone and invite everyone to be part of the next chapter of our journey. More practically, we need a couple of people to help fold copies next Thursday evening. It should take about an hour if the printer delivers on Wednesday as promised. If delivery slips, I'll send a note rather than ask people to turn up for nothing. There will be a folding guide, and nobody needs experience. I only ask that we work at a table this time; the library floor has earned a rest.

Thank you to the library staff for letting us borrow the big table so many times, and to everyone who checked dates or hunted down photographs. The work shows in small ways throughout the issue. I am looking forward to seeing the pages as an actual little booklet instead of a stack that slides off my desk.
````

#### Frozen pre-generation scope

- **R1B — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: [
  "Current budget covers 120 copies, not hoped-for 200; folding Thursday depends on delivery Wednesday as promised."
]. Intentional voice: [
  "Contributor-facing excitement; grounded and natural."
]. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1C**; item `blind-9121b22df42e2fe62a373f4b643516e0`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-9121b22df42e2fe62a373f4b643516e0`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `missing_claim` — This claim no longer appears in the rewrite (33% of its content words survive).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-023",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "UNNECESSARY_FALLBACK",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update request.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "The source has the exact promotional line targeted for naturalization.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW replaces the promotional journey sentence with natural excitement and preserves the 120-copy limit, conditional delivery and folding request. A deterministic missing-claim rejection triggers source fallback, restoring the promotional text and losing the requested improvement."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW replaces the promotional journey sentence with natural excitement and preserves the 120-copy limit, conditional delivery and folding request. A deterministic missing-claim rejection triggers source fallback, restoring the promotional text and losing the requested improvement."
}
```

### V3-030

Frozen text hashes: source `401007f79d3366ea5231c80d266fdd927c0869965686e8d9aa2ee460211d01d9`; objective `50b45ed4448e758124a903714e1fe277e6e0d3f5b82d326f844a9b1df2f79c5a`.

**SOURCE**

````text
We are pleased to announce that the storage room cleanout initiative has reached its successful conclusion. Through everyone’s collaborative effort, the shelves are now labeled and old equipment has been set aside for pickup. Please direct any remaining questions to me by Wednesday so that we can bring this effort to a close.
````

**OBJECTIVE**

````text
Make this ordinary team update sound direct and natural, while retaining what was done and the Wednesday question deadline.
````

**RAW**

````text
The storage room cleanout is done. Thanks to everyone's work, the shelves are labeled and the old equipment is set aside for pickup. If you still have questions, send them to me by Wednesday so we can wrap this up.
````

**FINAL**

````text
We are pleased to announce that the storage room cleanout initiative has reached its successful conclusion. Through everyone’s collaborative effort, the shelves are now labeled and old equipment has been set aside for pickup. Please direct any remaining questions to me by Wednesday so that we can bring this effort to a close.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Cleanout finished; shelves labeled; old equipment set aside for pickup.",
  "Remaining questions due to writer by Wednesday."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Corporate wording spans the message and can be simplified."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-1c2e6ab944f315ec44fd32007cd91113`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 5.
- `altered_name` — “Through” no longer appears in the rewrite.
- `missing_claim` — This claim no longer appears in the rewrite (33% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (25% of its content words survive).
- `added_claim` — Likely added content: 2 of 3 content words are not in the source.
- `added_claim` — An added “if” clause with content not in the source (still).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-030",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "UNNECESSARY_FALLBACK",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update request.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source uses announcement and initiative language the prompt asks to make direct and natural.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW makes the update direct while preserving completed cleanout, labeled shelves, pickup equipment and Wednesday question deadline. Source fallback restores the promotional phrasing and loses the objective benefit."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW makes the update direct while preserving completed cleanout, labeled shelves, pickup equipment and Wednesday question deadline. Source fallback restores the promotional phrasing and loses the objective benefit."
}
```

### V3-035

Frozen text hashes: source `a46d882c2b649416c43c704d4a6788a88989c7f9a42fe9eb037e39e8a880bd3b`; objective `8714c9f9bbde777e6626597fdc2cfef79f239fe705ef75dec9136324f7a24717`.

**SOURCE**

````text
Monday status: 18 of the 24 room signs are installed. The six remaining signs are waiting on mounts, which the supplier says should arrive Wednesday. Their estimate is useful for planning, but we have not received a shipping notice yet.

If the mounts arrive by Thursday morning, we can finish the installation before the Friday walkthrough. If they arrive later, I’ll mark the six locations on the map and send a revised completion date. No other work is blocked by the signs.
````

**OBJECTIVE**

````text
Turn this into a crisp project status update. Keep the numbers, the supplier’s attribution, the conditional schedule, and the limited impact accurate.
````

**RAW**

````text
Monday status: 18 of the 24 room signs are installed. The remaining six are waiting on mounts. The supplier estimates they'll arrive Wednesday, which is useful for planning, but we haven't received a shipping notice yet.

If the mounts arrive by Thursday morning, we can finish installation before the Friday walkthrough. If they arrive later, I'll mark the six locations on the map and send a revised completion date. No other work is blocked by the signs.
````

**FINAL**

````text
Monday status: 18 of the 24 room signs are installed. The six remaining signs are waiting on mounts, which the supplier says should arrive Wednesday. Their estimate is useful for planning, but we have not received a shipping notice yet.

If the mounts arrive by Thursday morning, we can finish the installation before the Friday walkthrough. If they arrive later, I’ll mark the six locations on the map and send a revised completion date. No other work is blocked by the signs.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "18 of 24 signs installed; mounts expected Wednesday per supplier without shipping notice; finish before Friday walk-through only if arrive by Thursday morning."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1C**; item `blind-8e4bdba252fdc523775280efd857f753`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `altered_name` — “I’ll” no longer appears in the rewrite.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-035",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "UNNECESSARY_FALLBACK",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update request.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source is accurate but could be crisper; RAW makes remaining six signs and supplier attribution easier to follow.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW clarifies that six signs await mounts, keeps the Wednesday arrival as supplier estimate, preserves the Thursday condition and limited impact. FINAL source fallback loses the crisp status edit. Apostrophe normalization is immaterial."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW clarifies that six signs await mounts, keeps the Wednesday arrival as supplier estimate, preserves the Thursday condition and limited impact. FINAL source fallback loses the crisp status edit. Apostrophe normalization is immaterial."
}
```

### V3-036

Frozen text hashes: source `2ff0a3d61378d2913b303351d0f565e462339a2c2f51850abee86328a03d2282`; objective `d3de85c2298e98fe5e79fd46b69ae44d79de7298f0416832f81537b7ce22fc38`.

**SOURCE**

````text
Hi team, the community room will be unavailable for the first two weeks of June while the floor is refinished. We had planned to reopen on Monday, June 16, with the evening classes returning that week. The painting crew will still work in the adjoining hallway during the closure, so the east entrance may be noisy even when the room is shut.

I’ll post the revised class schedule after instructors confirm which sessions can move online.
````

**OBJECTIVE**

````text
Update the planned reopening date to Wednesday, June 18. Keep the closure period, class schedule uncertainty, and hallway work clear; do not imply classes automatically return on the new reopening day.
````

**RAW**

````text
Hi team, the community room will be unavailable for the first two weeks of June while the floor is refinished. We had planned to reopen on Wednesday, June 18, with the evening classes returning that week. The painting crew will still work in the adjoining hallway during the closure, so the east entrance may be noisy even when the room is shut.

I’ll post the revised class schedule after instructors confirm which sessions can move online.
````

**FINAL**

````text
Hi team, the community room will be unavailable for the first two weeks of June while the floor is refinished. We had planned to reopen on Monday, June 16, with the evening classes returning that week. The painting crew will still work in the adjoining hallway during the closure, so the east entrance may be noisy even when the room is shut.

I’ll post the revised class schedule after instructors confirm which sessions can move online.
````

#### Frozen pre-generation scope

- **R1A — `LOCAL_EDIT`.** Authorized factual changes: [
  "Change planned reopening from Monday, June 16 to Wednesday, June 18."
]. Preserved facts: [
  "Closure remains first two weeks of June.",
  "Hallway painting continues; east entrance may be noisy.",
  "Class schedule awaits instructor confirmation of online sessions."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Date correction is local; avoid attaching class return to the new reopening day."
- **R2A — `LOCAL_EDIT`.** Authorized factual changes: [
  "Change planned reopening from Monday June 16 to Wednesday June 18."
]. Preserved facts: [
  "Closure first two weeks of June for floor refinishing; hallway painting continues and east entrance may be noisy.",
  "Revised class schedule awaits instructor confirmation of online sessions; class return must not be assumed on reopening day."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Update date and clarify that class scheduling remains pending."

#### Primary and available second blind labels

- **primary/O1D**; item `blind-cca98b6b425d775b2c8ce7b887f2dcb8`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-cca98b6b425d775b2c8ce7b887f2dcb8`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "NO",
  "unauthorizedSemanticChange": "YES",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 5.
- `altered_date` — AUTHORIZED_CHANGE: The date “June 16” is missing or changed.
- `altered_date` — AUTHORIZED_CHANGE: The rewrite adds the date “June 18”.
- `altered_date` — AUTHORIZED_CHANGE: The date reference “monday” is missing or changed.
- `altered_date` — AUTHORIZED_CHANGE: The rewrite adds a date reference “wednesday”.
- `altered_date` — The requested temporal replacement conflicts with a preservation directive.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
Wednesday, June 18 (previously Monday, June 16)
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-036",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "UNNECESSARY_FALLBACK",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "User explicitly replaces planned Monday June 16 reopening with Wednesday June 18; RAW applies it.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update request.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source contains the superseded planned reopening date.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW makes the authorized June 18 update and retains the two-week closure, classes returning that week (not automatically on reopening day), hallway work and schedule uncertainty. Repair returns a date phrase that still conflicts with preservation checks; fallback restores June 16, defeating the update."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW makes the authorized June 18 update and retains the two-week closure, classes returning that week (not automatically on reopening day), hallway work and schedule uncertainty. Repair returns a date phrase that still conflicts with preservation checks; fallback restores June 16, defeating the update."
}
```

### V3-043

Frozen text hashes: source `f5e36355071702c4cf7eec9b5fa25747beb34b0d9d6c2b20dcf31c881c1315d7`; objective `28d260dcdfc384e197acd90f01b43cfa5ff6c05d4b0ca1f0439b30cf2b5119f5`.

**SOURCE**

````text
We can send the draft guide to the regional coordinators on Friday if Legal finishes its review by noon Thursday. I’ve already checked the links and image descriptions; both are ready. The remaining question is whether the paragraph about public submissions needs a shorter retention period.

Please don’t schedule the public posting yet. The coordinators can review a draft under the current plan, but the posting date depends on the final wording and a second accessibility check after any edits. I’ll update the schedule once those pieces are settled.
````

**OBJECTIVE**

````text
Clarify the two different release steps and their conditions. Preserve the distinction between sharing a draft for review and posting it publicly.
````

**RAW**

````text
There are two separate steps here. The first is sending the draft guide to the regional coordinators for review. We can do that on Friday if Legal finishes its review by noon Thursday. I've already checked the links and image descriptions, and both are ready. The remaining question is whether the paragraph about public submissions needs a shorter retention period.

The second step is posting the guide publicly, and please don't schedule that yet. The coordinators can review a draft under the current plan, but the posting date depends on the final wording and a second accessibility check after any edits. I'll update the schedule once those pieces are settled.
````

**FINAL**

````text
We can send the draft guide to the regional coordinators on Friday if Legal finishes its review by noon Thursday. I’ve already checked the links and image descriptions; both are ready. The remaining question is whether the paragraph about public submissions needs a shorter retention period.

Please don’t schedule the public posting yet. The coordinators can review a draft under the current plan, but the posting date depends on the final wording and a second accessibility check after any edits. I’ll update the schedule once those pieces are settled.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Draft may go to regional coordinators Friday if Legal finishes by noon Thursday.",
  "Links and image descriptions checked; retention period for public submissions unresolved.",
  "Public posting unscheduled, dependent on final wording and second accessibility check after edits."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Make conditional draft circulation and later public posting separately visible."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-328ed7a0815e9877c52787b314f32a2e`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 4.
- `altered_number` — The rewrite introduces 2, which is not in your text.
- `altered_name` — “I’ve” no longer appears in the rewrite.
- `altered_name` — “I’ll” no longer appears in the rewrite.
- `added_claim` — Likely added content: 3 of 3 content words are not in the source.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-043",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "UNNECESSARY_FALLBACK",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update request.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source has the two conditions but does not explicitly signpost the distinct release steps.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW clearly labels draft circulation as the first step and public posting as the second, preserving Legal's deadline and the later wording/accessibility conditions. A deterministic check mistakes the helpful numbered structure for unsupported content and fallback removes that clarification."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW clearly labels draft circulation as the first step and public posting as the second, preserving Legal's deadline and the later wording/accessibility conditions. A deterministic check mistakes the helpful numbered structure for unsupported content and fallback removes that clarification."
}
```

### V3-045

Frozen text hashes: source `5662aca0313e0636c835c2b2de53167c01d86d0d68b8dba4d1660f572fd0b4cc`; objective `33f6a55fc97443660cded4a2a414eedaab9ba33508b77fe954b7194db6d9c2d1`.

**SOURCE**

````text
Thank you for joining the orientation planning call. We agreed that the welcome table should open at 8:30 a.m. and that the first tour will begin at 9:15. The printed map will be available at the entrance, and the same map will go into the reminder email.

Jordan will check whether the portable microphone is available and report back by Monday. Lee will send the draft reminder email for comments on Tuesday. I’ll review the route with the safety lead, since the stairs by the courtyard may still be closed for maintenance. If those stairs are closed, the tour will use the longer indoor route; we will decide that after the walk-through.

One correction to the staffing plan: I said on the call that we needed two greeters, but the updated registration count means we need three. Please use three in the rota. Nothing else in the plan changed, and there is no need to contact visitors until we settle the route.
````

**OBJECTIVE**

````text
Update the welcome table opening time to 8:45 a.m. and the first tour start to 9:30 a.m. Keep the corrected three-greeter requirement, assignments, and route contingency clear.
````

**RAW**

````text
Thank you for joining the orientation planning call. We agreed that the welcome table should open at 8:45 a.m. and that the first tour will begin at 9:30. The printed map will be available at the entrance, and the same map will go into the reminder email.

Jordan will check whether the portable microphone is available and report back by Monday. Lee will send the draft reminder email for comments on Tuesday. I’ll review the route with the safety lead, since the stairs by the courtyard may still be closed for maintenance. If those stairs are closed, the tour will use the longer indoor route; we will decide that after the walk-through.

One correction to the staffing plan: I said on the call that we needed two greeters, but the updated registration count means we need three. Please use three in the rota. Nothing else in the plan changed, and there is no need to contact visitors until we settle the route.
````

**FINAL**

````text
Thank you for joining the orientation planning call. We agreed that the welcome table should open at 8:30 a.m. and that the first tour will begin at 9:15. The printed map will be available at the entrance, and the same map will go into the reminder email.

Jordan will check whether the portable microphone is available and report back by Monday. Lee will send the draft reminder email for comments on Tuesday. I’ll review the route with the safety lead, since the stairs by the courtyard may still be closed for maintenance. If those stairs are closed, the tour will use the longer indoor route; we will decide that after the walk-through.

One correction to the staffing plan: I said on the call that we needed two greeters, but the updated registration count means we need three. Please use three in the rota. Nothing else in the plan changed, and there is no need to contact visitors until we settle the route.
````

#### Frozen pre-generation scope

- **R1A — `LOCAL_EDIT`.** Authorized factual changes: [
  "Change welcome table opening from 8:30 a.m. to 8:45 a.m.",
  "Change first tour start from 9:15 to 9:30."
]. Preserved facts: [
  "Three greeters required, correcting earlier two; use three in rota.",
  "Printed map at entrance and reminder email.",
  "Jordan checks microphone and reports Monday; Lee sends draft email Tuesday.",
  "Writer and safety lead review route; courtyard stairs may be closed, requiring longer indoor route.",
  "Do not contact visitors until route settled."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Two local time changes; keep other assignments and contingency."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-13f6f5ad61a142bbcfb1d3db9104e197`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 2.
- `altered_number` — The figure 15 from your text is missing or changed.
- `altered_number` — The rewrite introduces 45, which is not in your text.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
45
````.
- Fallback reason: `repair-failed`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-045",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective explicitly changes welcome opening to 8:45 a.m. and first tour to 9:30; only these times authorized.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW makes exactly the authorized 8:45 and 9:30 changes and preserves three greeters, assignments and route contingency. FINAL restores outdated times. Deterministic 15/45 protection rejects authorized changes; repair replacement 45 fails acceptance and fallback loses both updates. Agree with blind comparison."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW makes exactly the authorized 8:45 and 9:30 changes and preserves three greeters, assignments and route contingency. FINAL restores outdated times. Deterministic 15/45 protection rejects authorized changes; repair replacement 45 fails acceptance and fallback loses both updates. Agree with blind comparison."
}
```

### V3-046

Frozen text hashes: source `79f3fea798125f1583613db382de93a8cd9eca74454b8fb4dfca546bb067e489`; objective `dc77e4789b2a5901063d666a3a9a9f698b326e497465bdeeabd0a0c8a1fed15b`.

**SOURCE**

````text
In the spirit of continuous improvement, our team embarked on a comprehensive examination of the monthly supply request process. This work has allowed us to surface several valuable learnings and identify a promising pathway toward a more seamless future state. In practical terms, employees now spend less time looking for the right form because the request link is on the staff home page.

During the first month, 62 requests came through the new link. Of those, 54 included the delivery location on the first submission. The other eight needed a follow-up question, usually because the requester named a building but not a room. We have not compared these results with the old process, so we cannot say whether the new link reduced the total time to fulfill requests.

Our next step is to adjust the form label to ask for both building and room. We will review another month of submissions before deciding whether any further changes are needed. People can still ask the supply team for help if they are unsure which location to enter.
````

**OBJECTIVE**

````text
Turn this into a plain-language operations report. Remove the inflated opening while retaining the measured data, lack of baseline comparison, and concrete next step.
````

**RAW**

````text
Our team reviewed the monthly supply request process. Employees now spend less time looking for the right form because the request link is on the staff home page.

During the first month, 62 requests came through the new link. Of those, 54 included the delivery location on the first submission. The other eight needed a follow-up question, usually because the requester named a building but not a room. We have not compared these results with the old process, so we cannot say whether the new link reduced the total time to fulfill requests.

Our next step is to adjust the form label to ask for both building and room. We will review another month of submissions before deciding whether any further changes are needed. People can still ask the supply team for help if they are unsure which location to enter.
````

**FINAL**

````text
In the spirit of continuous improvement, our team embarked on a comprehensive examination of the monthly supply request process. This work has allowed us to surface several valuable learnings and identify a promising pathway toward a more seamless future state. In practical terms, employees now spend less time looking for the right form because the request link is on the staff home page.

During the first month, 62 requests came through the new link. Of those, 54 included the delivery location on the first submission. The other eight needed a follow-up question, usually because the requester named a building but not a room. We have not compared these results with the old process, so we cannot say whether the new link reduced the total time to fulfill requests.

Our next step is to adjust the form label to ask for both building and room. We will review another month of submissions before deciding whether any further changes are needed. People can still ask the supply team for help if they are unsure which location to enter.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Request link on staff home page reduces time finding form.",
  "62 first-month requests; 54 included location; eight needed follow-up, usually missing room.",
  "No old-process comparison; total fulfillment-time improvement cannot be claimed.",
  "Label will ask building and room; review another month; supply team can help."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Opening needs strong simplification; remaining report needs light polishing."
- **R2A — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: [
  "Request link on staff home page reduces searching for form.",
  "First month 62 requests; 54 delivery locations on first submission; eight follow-ups, usually building without room; no old-process comparison or demonstrated fulfillment-time reduction.",
  "Change label to request building and room; review another month; supply team help remains available."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Replace inflated framing and reorganize around operational evidence."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-26a200c2a7a3388ca8700576daacfe52`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-26a200c2a7a3388ca8700576daacfe52`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `missing_claim` — This claim no longer appears in the rewrite (0% of its content words survive).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-046",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW removes inflated framing while preserving 62/54/eight, no baseline comparison and building/room next step. The missing-claim block protects the very filler the objective asks to remove; no repair, source fallback loses plain-language benefit. Blind reviewers differ on source partial usefulness and edit scope, but agree RAW better; those differences do not establish a substantive RAW defect."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW removes inflated framing while preserving 62/54/eight, no baseline comparison and building/room next step. The missing-claim block protects the very filler the objective asks to remove; no repair, source fallback loses plain-language benefit. Blind reviewers differ on source partial usefulness and edit scope, but agree RAW better; those differences do not establish a substantive RAW defect."
}
```

### V3-059

Frozen text hashes: source `033277d2246b5ea47f8ef6784db6399a93791998f7a534ef6f8010490c5e7ddd`; objective `68aedaeadb101951dd19bb6798eee9e69200c66a6e6223340e3213e57fd56bbf`.

**SOURCE**

````text
When a visitor follows a public collection, we send an email after new items are added. The email is meant to give followers a useful summary, rather than a separate alert for every item. Additions made within the same hour are grouped into one email. If several people add items during that hour, the follower still receives just the one update for those additions.

Following and email preferences are separate. Someone can continue to follow a collection while turning off collection emails. In that case, new items remain available in the collection, but we do not send that person an email about them. The preference applies even if they followed the collection before switching emails off.

The collection owner does not receive a separate owner copy of these updates. An owner who wants the same email as other followers needs to follow the collection and leave collection emails on. This often comes up when an owner sees that colleagues received an update and assumes theirs went missing.
````

**OBJECTIVE**

````text
Rewrite this feature explanation for a help page so readers can see when an email is sent and the two exceptions. Keep the hour-long grouping rule.
````

**RAW**

````text
When a visitor follows a public collection, we send them an email after new items are added. The email is meant to give followers a useful summary, rather than a separate alert for every item.

**When an email is sent**

Additions made within the same hour are grouped into one email. If several people add items during that hour, the follower still receives just the one update for those additions.

**Two exceptions**

1. **Followers who have turned off collection emails.** Following and email preferences are separate. Someone can continue to follow a collection while turning off collection emails. In that case, new items remain available in the collection, but we do not send that person an email about them. The preference applies even if they followed the collection before switching emails off.

2. **The collection owner.** The owner does not receive a separate owner copy of these updates. An owner who wants the same email as other followers needs to follow the collection and leave collection emails on. This often comes up when an owner sees that colleagues received an update and assumes theirs went missing.
````

**FINAL**

````text
When a visitor follows a public collection, we send an email after new items are added. The email is meant to give followers a useful summary, rather than a separate alert for every item. Additions made within the same hour are grouped into one email. If several people add items during that hour, the follower still receives just the one update for those additions.

Following and email preferences are separate. Someone can continue to follow a collection while turning off collection emails. In that case, new items remain available in the collection, but we do not send that person an email about them. The preference applies even if they followed the collection before switching emails off.

The collection owner does not receive a separate owner copy of these updates. An owner who wants the same email as other followers needs to follow the collection and leave collection emails on. This often comes up when an owner sees that colleagues received an update and assumes theirs went missing.
````

#### Frozen pre-generation scope

- **R1A — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: [
  "New public-collection additions trigger follower summary email; same-hour additions grouped into one email even with multiple contributors.",
  "Following can continue with emails off; then no collection emails sent, including for earlier follows.",
  "Owner gets no separate copy; must follow with emails on."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Requested help-page presentation may restructure the explanation around rule and exceptions."

#### Primary and available second blind labels

- **primary/O1C**; item `blind-854ed4d79df8bc7a157cd3a3051912c3`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `altered_number` — AUTHORIZED_CHANGE: The rewrite introduces 1, which is not in your text.
- `altered_number` — The rewrite introduces 2, which is not in your text.
- `added_claim` — Likely added content: 2 of 2 content words are not in the source.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
Second
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-059",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "FAILED_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW headings and numbered exceptions make grouping, email opt-out and owner-copy rules findable with all qualifications intact. FINAL returns dense source. Deterministic rejection of list number 2 mistakes structure for factual addition while number 1 is authorized. Replacement Second is not accepted and fallback loses useful structure. Agree blind labels; no semantic defect justifying fallback."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "FAILED_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW headings and numbered exceptions make grouping, email opt-out and owner-copy rules findable with all qualifications intact. FINAL returns dense source. Deterministic rejection of list number 2 mistakes structure for factual addition while number 1 is authorized. Replacement Second is not accepted and fallback loses useful structure. Agree blind labels; no semantic defect justifying fallback."
}
```

### V3-060

Frozen text hashes: source `96793d67fc25abc046c9cc35da8c636a38a9bef0be06f422d6907f713c1df4a6`; objective `47a14db7d93b421f6e0ff8dd2d4ad335af08947cbf1b63cef30f3d829c7a4ccc`.

**SOURCE**

````text
The nightly export writes one file per workspace. Each workspace's run begins at 2 a.m. in that workspace's time zone, so the files do not all appear at the same clock time for the team watching them. A large workspace can take more than an hour to finish. The start time is therefore not a promise that its file will be ready by 3 a.m.

If someone reports a missing file at 3 a.m., first identify the workspace and check its export status page. The page reports either completion or a specific error for each workspace. A run that has not yet produced a file should not be called a failure solely because it has passed the one-hour mark. This is especially relevant when comparing a small workspace with a much larger one.

Use the status shown for the affected workspace when deciding whether to file an incident. Include the workspace and the reported error if there is one, so the person investigating can start with the actual run rather than the absence of a file.
````

**OBJECTIVE**

````text
Make this internal operations note more concise and ordered by action. Preserve the timing, the one-file rule, and the warning against assuming failure at 3 a.m.
````

**RAW**

````text
The nightly export writes one file per workspace. Each workspace's run begins at 2 a.m. in that workspace's time zone, so the files do not all appear at the same clock time for the team watching them. A large workspace can take more than an hour to finish, so the start time is not a promise that its file will be ready by 3 a.m.

If someone reports a missing file at 3 a.m.:

1. Identify the workspace and check its export status page. The page reports either completion or a specific error for each workspace.
2. Use the status shown for the affected workspace to decide whether to file an incident. A run that has not yet produced a file should not be called a failure solely because it has passed the one-hour mark. This is especially relevant when comparing a small workspace with a much larger one.
3. If you file an incident, include the workspace and the reported error if there is one, so the person investigating can start with the actual run rather than the absence of a file.
````

**FINAL**

````text
The nightly export writes one file per workspace. Each workspace's run begins at 2 a.m. in that workspace's time zone, so the files do not all appear at the same clock time for the team watching them. A large workspace can take more than an hour to finish. The start time is therefore not a promise that its file will be ready by 3 a.m.

If someone reports a missing file at 3 a.m., first identify the workspace and check its export status page. The page reports either completion or a specific error for each workspace. A run that has not yet produced a file should not be called a failure solely because it has passed the one-hour mark. This is especially relevant when comparing a small workspace with a much larger one.

Use the status shown for the affected workspace when deciding whether to file an incident. Include the workspace and the reported error if there is one, so the person investigating can start with the actual run rather than the absence of a file.
````

#### Frozen pre-generation scope

- **R1B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "One file per workspace; runs begin at 2 a.m. in each workspace time zone; do not treat absence at 3 a.m. as failure."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1D**; item `blind-ea76c539a53c1aec368178e0328b5575`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-ea76c539a53c1aec368178e0328b5575`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `review`; finding count: 2.
- `altered_number` — AUTHORIZED_CHANGE: The rewrite introduces 1, which is not in your text.
- `assertion_strength_changed` — “therefore” became “decide” (causation strengthened).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `REJECT`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `verifier-rejected`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-060",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "SEMANTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW orders identification, status-based incident decision and reporting details as actions while preserving one file/workspace, local 2 a.m. and no assumed failure at 3 a.m. FINAL loses actionable ordering. Semantic REJECT acknowledges preserved meaning and ordered steps but demands more shortening; partial objective fulfillment is still material. Agree blind reviewers over semantic utility rejection. No repair; unnecessary source fallback."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW orders identification, status-based incident decision and reporting details as actions while preserving one file/workspace, local 2 a.m. and no assumed failure at 3 a.m. FINAL loses actionable ordering. Semantic REJECT acknowledges preserved meaning and ordered steps but demands more shortening; partial objective fulfillment is still material. Agree blind reviewers over semantic utility rejection. No repair; unnecessary source fallback."
}
```

### V3-061

Frozen text hashes: source `ae0676e99472bbcfd576b17806c43a623a1614ca57700c7cded93913ff35de5d`; objective `52eb95a7b4be5e9a1de070967e100447ab7c3458ce07dcc0e2f70bb03c481914`.

**SOURCE**

````text
We built the small dial because the big dashboard was too much to glance at while mixing. Most of the time, you only want to know where the batch is now and where you asked it to stop. The dial shows the current temperature, and the pale mark shows that stopping point. It is a target you set, not a warning that the batch is in trouble.

The dial keeps those two pieces of information together without asking you to read a full chart while your hands are busy. It does not try to tell the whole story of the batch. If you want to see how the temperature changed over time, the dashboard still has the full temperature history.

That split is deliberate. The dial is for the quick look; the dashboard is for the longer look, if that's your thing. We want the mark to be useful at a glance, especially when it sits close to the current reading, without making it sound like an alarm.
````

**OBJECTIVE**

````text
Smooth this product copy while keeping its plainspoken, lightly playful voice. Make the target mark unambiguous without turning the paragraph into marketing copy.
````

**RAW**

````text
We built the small dial because the big dashboard was too much to glance at while mixing. Most of the time, you only want to know where the batch is now and where you asked it to stop. The dial shows the current temperature, and the pale mark shows that stopping point. That mark is a target you set, not a warning that the batch is in trouble.

Both pieces of information sit together, without asking you to read a full chart while your hands are busy. The dial doesn't try to tell the whole story of the batch. If you want to see how the temperature changed over time, the dashboard still has the full temperature history.

That split is deliberate. The dial is for the quick look; the dashboard is for the longer look, if that's your thing. We want the mark to be useful at a glance, especially when it sits close to the current reading, and we don't want it to sound like an alarm.
````

**FINAL**

````text
We built the small dial because the big dashboard was too much to glance at while mixing. Most of the time, you only want to know where the batch is now and where you asked it to stop. The dial shows the current temperature, and the pale mark shows that stopping point. It is a target you set, not a warning that the batch is in trouble.

The dial keeps those two pieces of information together without asking you to read a full chart while your hands are busy. It does not try to tell the whole story of the batch. If you want to see how the temperature changed over time, the dashboard still has the full temperature history.

That split is deliberate. The dial is for the quick look; the dashboard is for the longer look, if that's your thing. We want the mark to be useful at a glance, especially when it sits close to the current reading, without making it sound like an alarm.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Dial shows current batch position and target mark; retain plain, lightly playful voice."
]. Intentional voice: [
  "Plainspoken, lightly playful voice."
]. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1B**; item `blind-63ba4d8a49a0ddabcd0eee0dba2361cd`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "NO"
}`.
- **second/O2A**; item `blind-63ba4d8a49a0ddabcd0eee0dba2361cd`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `altered_number` — The figure 2 from your text is missing or changed.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-061",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW That mark makes pale-mark antecedent explicit and smooths copy while preserving playful if thats your thing, target vs alarm and dashboard history. Both pieces preserves source two pieces exactly in meaning. Deterministic missing figure 2 block is false; no repair and source fallback loses clarity. Agree both blind reviewers."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW That mark makes pale-mark antecedent explicit and smooths copy while preserving playful if thats your thing, target vs alarm and dashboard history. Both pieces preserves source two pieces exactly in meaning. Deterministic missing figure 2 block is false; no repair and source fallback loses clarity. Agree both blind reviewers."
}
```

### V3-067

Frozen text hashes: source `3ad71ee9d38eca9fe67c6a6c26768bda9229e8a499c8081a9f333b7ef457f6b3`; objective `b72b3030cdd3784642e2ef3dbc11ade8a745a6e2e64d9a3b3e00a0593ed57e4d`.

**SOURCE**

````text
For general requests that arrive by 4 p.m., we usually send an initial reply on the same business day. Requests that arrive after 4 p.m. are normally handled the next business day. Those are typical response times, not a guarantee that every issue can be investigated or resolved on that schedule. The time a request arrives matters, but so does what the request is about.

An initial reply means that we have received the request and can begin working out what it needs. It is an acknowledgement, not a promise that the underlying issue will be fixed that day. Please keep that distinction in the FAQ so people know what to expect when they see a quick response from us.

If the service is unavailable, use the outage form instead of the general request form. The outage form is the path the on-call team watches for service interruptions. Someone facing an outage should not have to read through the routine response-time details before finding that instruction.
````

**OBJECTIVE**

````text
Improve this service FAQ without making the response-time language more absolute. Make the outage path easy to spot.
````

**RAW**

````text
If the service is unavailable, use the outage form instead of the general request form. The outage form is the path the on-call team watches for service interruptions.

For general requests that arrive by 4 p.m., we usually send an initial reply on the same business day. Requests that arrive after 4 p.m. are normally handled the next business day. Those are typical response times, not a guarantee that every issue can be investigated or resolved on that schedule. The time a request arrives matters, but so does what the request is about.

An initial reply means that we have received the request and can begin working out what it needs. It is an acknowledgement, not a promise that the underlying issue will be fixed that day. Please keep that distinction in the FAQ so people know what to expect when they see a quick response from us.
````

**FINAL**

````text
For general requests that arrive by 4 p.m., we usually send an initial reply on the same business day. Requests that arrive after 4 p.m. are normally handled the next business day. Those are typical response times, not a guarantee that every issue can be investigated or resolved on that schedule. The time a request arrives matters, but so does what the request is about.

An initial reply means that we have received the request and can begin working out what it needs. It is an acknowledgement, not a promise that the underlying issue will be fixed that day. Please keep that distinction in the FAQ so people know what to expect when they see a quick response from us.

If the service is unavailable, use the outage form instead of the general request form. The outage form is the path the on-call team watches for service interruptions. Someone facing an outage should not have to read through the routine response-time details before finding that instruction.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Usual same-business-day response for requests by 4 p.m.; later requests normally next business day; outage route."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1A**; item `blind-36926974e8cb2c05930728a2efd53124`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 2.
- `altered_name` — “Someone” no longer appears in the rewrite.
- `missing_claim` — This claim no longer appears in the rewrite (20% of its content words survive).

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-067",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No explicit factual update request.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague factual update request or guessed replacement value.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source still needs the requested update, organization, genre conversion or specific clarity improvement.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW puts outage form first while retaining usually/normally, acknowledgement vs resolution and non-guarantee. Deleting the instruction about not burying outages fulfills its purpose through order rather than losing product meaning. Remaining editor-facing FAQ sentence limits polish but does not negate material benefit. Missing-claim block and Someone name warning misclassify that deletion; no repair, source fallback loses urgent-path visibility. Agree blind preference."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW puts outage form first while retaining usually/normally, acknowledgement vs resolution and non-guarantee. Deleting the instruction about not burying outages fulfills its purpose through order rather than losing product meaning. Remaining editor-facing FAQ sentence limits polish but does not negate material benefit. Missing-claim block and Someone name warning misclassify that deletion; no repair, source fallback loses urgent-path visibility. Agree blind preference."
}
```

### V3-071

Frozen text hashes: source `5f3e4141aee3d14204758990ce8292aeb2df3d6544158774e5457b56cc06aac3`; objective `1087cde5b03e4fb02f7a7be7aed34f2ad3e62da75d1a5334b9994cab5c8dd49d`.

**SOURCE**

````text
The event check-in desk used to open 30 minutes before each session. From 1 September, it will open 45 minutes before each session. The session start times are not changing. We need the attendee page to show that new check-in window clearly, because some people plan their arrival around when they can collect a badge. The page should state the change as an opening time relative to each session, not as a new session start time.

The current draft says everyone must visit the desk, but that was never true. Only attendees collecting a badge need to check in there. Someone who already has a badge should go straight to the room rather than queue at the desk. The instructions for those two groups should be easy to distinguish at a glance, especially for an attendee reading the page on the way into the venue. Avoid wording that suggests the desk needs to approve every attendee's entry.

Attendees with a badge can enter when the room opens, 15 minutes before the session. That room-opening time is separate from the check-in desk opening. An attendee collecting a badge may choose to arrive earlier because the desk is available 45 minutes before the session, but the room itself will still open at the same 15-minute point. Keeping the two times together without blending them should prevent readers from assuming that earlier check-in also means earlier room access.

Staff may sometimes open the desk a few minutes early if they are ready, but that is discretionary. Please do not put that possibility on the attendee page as a guaranteed time. The reliable information for the page is the 45-minute desk window from 1 September, the unchanged session starts, and the 15-minute room entry for people who already have a badge. An attendee should be able to use the published times without relying on an exception.
````

**OBJECTIVE**

````text
Write a revised attendee-page explanation using the 45-minute check-in window effective 1 September. Correct the badge instructions, keep room entry at 15 minutes before the session, and avoid promising an early desk opening.
````

**RAW**

````text
Check-in desk hours are changing. From 1 September, the check-in desk will open 45 minutes before each session. It used to open 30 minutes before. Session start times are not changing.

If you're collecting a badge: go to the check-in desk. It opens 45 minutes before your session, so you can arrive earlier than before if that suits your plans.

If you already have a badge: go straight to the room. You don't need to stop at the desk. The room opens 15 minutes before the session, and you can go in then.

The two times are separate. The desk opens 45 minutes before the session, and the room opens 15 minutes before the session. Checking in earlier doesn't mean the room opens earlier.
````

**FINAL**

````text
The event check-in desk used to open 30 minutes before each session. From 1 September, it will open 45 minutes before each session. The session start times are not changing. We need the attendee page to show that new check-in window clearly, because some people plan their arrival around when they can collect a badge. The page should state the change as an opening time relative to each session, not as a new session start time.

The current draft says everyone must visit the desk, but that was never true. Only attendees collecting a badge need to check in there. Someone who already has a badge should go straight to the room rather than queue at the desk. The instructions for those two groups should be easy to distinguish at a glance, especially for an attendee reading the page on the way into the venue. Avoid wording that suggests the desk needs to approve every attendee's entry.

Attendees with a badge can enter when the room opens, 15 minutes before the session. That room-opening time is separate from the check-in desk opening. An attendee collecting a badge may choose to arrive earlier because the desk is available 45 minutes before the session, but the room itself will still open at the same 15-minute point. Keeping the two times together without blending them should prevent readers from assuming that earlier check-in also means earlier room access.

Staff may sometimes open the desk a few minutes early if they are ready, but that is discretionary. Please do not put that possibility on the attendee page as a guaranteed time. The reliable information for the page is the 45-minute desk window from 1 September, the unchanged session starts, and the 15-minute room entry for people who already have a badge. An attendee should be able to use the published times without relying on an exception.
````

#### Frozen pre-generation scope

- **R1A — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: [
  "Use 45-minute desk opening before each session from 1 September, replacing 30 minutes.",
  "Correct draft requirement that everyone check in: only badge collectors need desk."
]. Preserved facts: [
  "Session starts unchanged; room opens 15 minutes before session.",
  "Only attendees collecting badges visit desk; existing badge holders go straight to room.",
  "Occasional early desk opening is discretionary and not a guarantee."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Convert editorial brief into attendee guidance distinguishing desk and room times."
- **R2A — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: [
  "Publish desk opening 45 minutes before sessions from 1 September instead of 30 minutes.",
  "Correct universal check-in instruction: only badge collectors use desk; existing badge holders go to room."
]. Preserved facts: [
  "Session starts unchanged; room opens 15 minutes before session; discretionary early desk opening not guaranteed."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Replace drafting commentary with attendee instructions."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-31981a10c21c6a8a4849b3df108ef477`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-31981a10c21c6a8a4849b3df108ef477`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 13.
- `altered_name` — “Someone” no longer appears in the rewrite.
- `altered_name` — “Avoid” no longer appears in the rewrite.
- `altered_name` — “Staff” no longer appears in the rewrite.
- `assertion_strength_changed` — Certainty rose from possible to asserted.
- `assertion_strength_changed` — The qualifier “sometimes” was dropped, which generalises the claim.
- `missing_claim` — This claim no longer appears in the rewrite (20% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (8% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (17% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (0% of its content words survive).
- `missing_claim` — This claim no longer appears in the rewrite (14% of its content words survive).
- `length_out_of_range` — The rewrite is 40% of your length; Natural aims for 75–115%.
- `meaning_drift` — Only 25% of your key words survive. Read closely for anything dropped.
- `altered_date` — The requested temporal replacement conflicts with a preservation directive.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-071",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective explicitly sets 45-minute check-in window effective 1 September and retains 15-minute room entry; RAW states both.",
  "vagueUpdateObserved": "YES",
  "vagueUpdateEvidence": "Objective says avoid promising an early desk opening; RAW makes no such promise.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source is long explanatory prose; objective requests clear attendee-page wording.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW clearly separates 45-minute desk availability from 15-minute room access, identifies badge groups, preserves unchanged session starts, and avoids promising early opening. FINAL reverts to source and does not provide requested attendee-page explanation. Trace blocks the authorized 45-minute update as conflicting with preservation; this is a false rejection of the explicitly requested update."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW clearly separates 45-minute desk availability from 15-minute room access, identifies badge groups, preserves unchanged session starts, and avoids promising early opening. FINAL reverts to source and does not provide requested attendee-page explanation. Trace blocks the authorized 45-minute update as conflicting with preservation; this is a false rejection of the explicitly requested update."
}
```

### V3-080

Frozen text hashes: source `68442df2d2d6e054fdba73d01b8e02337d2aba6bb5e4d3f51cdbe857324110db`; objective `b2c7992495ec5eedc82f07d749a8e1f50f2ddd5ce813160fe52bbf8013520ea6`.

**SOURCE**

````text
The proposed seminar will meet monthly from September through December. Each session will last 90 minutes and include a short presentation followed by discussion. The current budget provides for three guest speakers; the final session will be led by members of the department.
````

**OBJECTIVE**

````text
Revise the proposal to reflect a confirmed budget for four guest speakers, with a guest leading each session.
````

**RAW**

````text
The proposed seminar will meet monthly from September through December. Each session will last 90 minutes and include a short presentation followed by discussion. The confirmed budget provides for four guest speakers, with a guest leading each session.
````

**FINAL**

````text
The proposed seminar will meet monthly from September through December. Each session will last 90 minutes and include a short presentation followed by discussion. The current budget provides for three guest speakers; the final session will be led by members of the department.
````

#### Frozen pre-generation scope

- **R1A — `LOCAL_EDIT`.** Authorized factual changes: [
  "Change budget from three to four guest speakers.",
  "Have a guest lead every session, including final session previously led by department members."
]. Preserved facts: [
  "Seminar monthly September through December; sessions 90 minutes with short presentation then discussion."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Budget and final-session leader are local factual updates."
- **R2B — `LOCAL_EDIT`.** Authorized factual changes: [
  "Budget is confirmed for four guest speakers",
  "A guest will lead each of the four sessions"
]. Preserved facts: [
  "Seminar meets monthly September through December",
  "Each session lasts 90 minutes and has a short presentation followed by discussion"
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Update speaker count and leadership arrangement; keep schedule and format."

#### Primary and available second blind labels

- **primary/O1C**; item `blind-8614d2b121595ad4c11417f133be8183`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `altered_number` — The figure 3 from your text is missing or changed.
- `altered_number` — The rewrite introduces 4, which is not in your text.
- `assertion_strength_changed` — The rewrite adds “confirmed”, a stronger evidence claim than the source makes.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-080",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective confirms four guest speakers and one guest per session, authorizing replacement of source's three-speaker/member-led last session.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update language observed.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "RAW updates the requested budget and format while retaining schedule, duration, presentation and discussion.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW makes exactly the authorized budget and speaker update and preserves all other proposal details. FINAL reverts to stale three-speaker/member-led facts. Trace blocks the explicit authorized number change and 'confirmed' status; objective itself confirms both, so fallback loses a correct useful edit."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW makes exactly the authorized budget and speaker update and preserves all other proposal details. FINAL reverts to stale three-speaker/member-led facts. Trace blocks the explicit authorized number change and 'confirmed' status; objective itself confirms both, so fallback loses a correct useful edit."
}
```

### V3-087

Frozen text hashes: source `7067d480276bcb9bb806daa6a47c11ed2d649f0cd5fcfdcf22a24c179417702f`; objective `e7dfca94b412bb7ed9dee432ddd6b976bb767f27e8e0685fd30147b94eb15c23`.

**SOURCE**

````text
The delivery of a successful induction experience is a key component in enabling new volunteers to feel empowered to engage with the organisation's wider mission. At present, information is distributed across several documents, which can create a degree of uncertainty regarding the actions required during the initial period of involvement.

We propose bringing the essential information into a two-page guide. The guide would explain how to sign up for a shift, who to contact if plans change, and where to find the safeguarding policy. It would not replace the introductory conversation with a coordinator, which volunteers have consistently described as useful.
````

**OBJECTIVE**

````text
Make the opening paragraph plain and natural, and lightly polish the rest for a funding proposal.
````

**RAW**

````text
A good induction helps new volunteers feel confident about getting involved in the organisation's wider mission. At the moment, information is spread across several documents, which can leave people unsure what they need to do in their first weeks.

We propose bringing the essential information into a two-page guide. It would explain how to sign up for a shift, who to contact if plans change, and where to find the safeguarding policy. It would not replace the introductory conversation with a coordinator, which volunteers have consistently described as useful.
````

**FINAL**

````text
The delivery of a successful induction experience is a key component in enabling new volunteers to feel empowered to engage with the organisation's wider mission. At present, information is distributed across several documents, which can create a degree of uncertainty regarding the actions required during the initial period of involvement.

We propose bringing the essential information into a two-page guide. The guide would explain how to sign up for a shift, who to contact if plans change, and where to find the safeguarding policy. It would not replace the introductory conversation with a coordinator, which volunteers have consistently described as useful.
````

#### Frozen pre-generation scope

- **R1B — `SUBSTANTIVE_RECONSTRUCTION`.** Authorized factual changes: []. Preserved facts: []. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1D**; item `blind-d9e04cdad8bc9491bfd0dbdc27233477`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-d9e04cdad8bc9491bfd0dbdc27233477`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `assertion_strength_changed` — “enabling” became “helps” (causation weakened).
- `missing_claim` — This claim no longer appears in the rewrite (21% of its content words survive).
- `added_claim` — Likely added content: 6 of 6 content words are not in the source.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-087",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "No factual update requested.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "No vague update language observed.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "RAW gives the requested plain, natural opening and lightly polishes the rest.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW materially simplifies dense opening while preserving successful induction, volunteer engagement, distributed information and uncertainty; it retains all guide contents and coordinator conversation. 'First weeks' is a reasonable rendering of initial period. FINAL restores the very dense language the objective asked to simplify; rejection rests on over-literal claim matching."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW materially simplifies dense opening while preserving successful induction, volunteer engagement, distributed information and uncertainty; it retains all guide contents and coordinator conversation. 'First weeks' is a reasonable rendering of initial period. FINAL restores the very dense language the objective asked to simplify; rejection rests on over-literal claim matching."
}
```

### V3-089

Frozen text hashes: source `9b4213cc92eb75890d6d7419654566f7173caefc1a49764f80a25852fa174ebf`; objective `836548379b715aa900b45649213cff568a5d3fe1af89f043a91022bc80e61706`.

**SOURCE**

````text
Applications are assessed against three criteria: relevance to the collection, feasibility within the proposed period, and the likely benefit to future researchers. A proposal does not need to meet all three criteria equally well, but it must explain any substantial limitation.

The panel currently meets twice a year, in April and October. Applicants receive a decision within four weeks of the meeting. An invitation to revise is not an offer of funding, and revised applications return to the panel for assessment. We encourage applicants to contact the programme administrator if they are unsure whether their project falls within the scheme.
````

**OBJECTIVE**

````text
Update the guidance: the panel now meets in February, June, and October, and decisions are sent within three weeks. Keep the rest clear and professional.
````

**RAW**

````text
Applications are assessed against three criteria: relevance to the collection, feasibility within the proposed period, and the likely benefit to future researchers. A proposal does not need to meet all three criteria equally well, but it must explain any substantial limitation.

The panel currently meets three times a year, in February, June, and October. Applicants receive a decision within three weeks of the meeting. An invitation to revise is not an offer of funding, and revised applications return to the panel for assessment. We encourage applicants to contact the programme administrator if they are unsure whether their project falls within the scheme.
````

**FINAL**

````text
Applications are assessed against three criteria: relevance to the collection, feasibility within the proposed period, and the likely benefit to future researchers. A proposal does not need to meet all three criteria equally well, but it must explain any substantial limitation.

The panel currently meets twice a year, in April and October. Applicants receive a decision within four weeks of the meeting. An invitation to revise is not an offer of funding, and revised applications return to the panel for assessment. We encourage applicants to contact the programme administrator if they are unsure whether their project falls within the scheme.
````

#### Frozen pre-generation scope

- **R1B — `LOCAL_EDIT`.** Authorized factual changes: [
  "Panel meetings are in February, June, and October.",
  "Decisions are sent within three weeks."
]. Preserved facts: [
  "Assessment criteria and revision process remain; revision invitation is not funding offer."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""

#### Primary and available second blind labels

- **primary/O1D**; item `blind-bc66f04c02c8c6778bdccbd0c63c793e`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-bc66f04c02c8c6778bdccbd0c63c793e`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "NO",
  "unauthorizedSemanticChange": "YES",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 5.
- `altered_number` — The figure 4 from your text is missing or changed.
- `altered_date` — The date reference “april” is missing or changed.
- `altered_date` — The rewrite adds a date reference “february”.
- `altered_date` — The rewrite adds a date reference “june”.
- `mechanical_damage` — Unexpected capital after “,”: “y, June”.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `ADDITIVE_ADJUDICATION_12`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-089",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "BAD",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "DATE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "YES",
  "explicitUpdateEvidence": "Objective supplies February, June, October and three-week decisions; RAW applies both, FINAL reverses both.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "None: no unspecified factual update requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source has a concrete update, structure, register or clarity task identified by objective.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW applies precisely the authorized February/June/October cadence and three-week decisions, retaining criteria and revision caveats. FINAL restores explicitly superseded April/October and four weeks, a factual error against the supplied update. Deterministic date/number protection rejected authorized changes; no repair or semantic call occurred. Both blind reviewers favor RAW; O2 calls FINAL unauthorized whereas I treat it as stale factual rollback."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
{
  "caseId": "V3-089",
  "raw": "GOOD_RAW",
  "final": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS_STALE_GUIDANCE",
  "evidence": "Objective supplies 'February, June, and October' and 'three weeks'; RAW applies exactly these, FINAL=SOURCE restores 'April and October' and 'four weeks'. This is a material factual failure against updated context, but not an unsupported RAW escaping verification.",
  "operationallyIncorrectFinal": true,
  "auditorCorrection": "BAD_FINAL as an escaped unsafe semantic rewrite is unsupported: final exactly equals source. The original audit itself records badOutcomeStatus NOT_BAD and catchOrEscape NOT_APPLICABLE. O2B's meaningPreserved NO reflects objective-relative stale facts; O1D records preservation YES. Apply the same source-fallback rule as V3-012 rather than treating this lone stale schedule as an escape.",
  "severity": {
    "semanticSafetyEscape": "NONE",
    "objectiveFailure": "MATERIAL",
    "potentialOperationalImpact": "MODERATE",
    "rationale": "Publishing superseded panel months can mislead application planning and omits two current meetings; four-week versus three-week decision guidance overstates expected wait. No evidence establishes actual publication, missed deadline, funding loss, physical harm or high severity."
  }
}
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS_STALE_GUIDANCE",
  "evidence": "Objective supplies 'February, June, and October' and 'three weeks'; RAW applies exactly these, FINAL=SOURCE restores 'April and October' and 'four weeks'. This is a material factual failure against updated context, but not an unsupported RAW escaping verification."
}
```

### V3-096

Frozen text hashes: source `25c1bb8bca3bba1d6afcdfd5d740e18bf02d38f74055f8dc1fbc2054160bb40e`; objective `a0a08a284ff8d05fdcc6fb0fcd4f0ff3ea7e84eb99f363ead6e9e8ab6bbb33f8`.

**SOURCE**

````text
The residency scheme gives early-career makers access to a shared studio for a limited period. Residents receive a workbench, basic storage, and access to the weekly technical clinic. The scheme does not include a materials allowance, and residents are responsible for arranging any specialist equipment they need.

In the last round, we received 63 applications for six places. The panel selected residents on the basis of their project proposal and the suitability of the studio for their work. Previous exhibition experience was considered where relevant, but it was not a requirement. Several unsuccessful applicants asked for clearer information about how the criteria were weighted.

We have revised the application guide to include a worked example of how the panel discusses a proposal. The example is fictional and does not guarantee that a similar project will be selected. Its purpose is to show the kinds of questions the panel asks, including whether a project can be completed with the facilities available.

The next application round is expected to open in the autumn. We will announce the timetable once studio maintenance has been scheduled. Applicants should not make travel or accommodation commitments on the assumption that the dates will match last year's programme.
````

**OBJECTIVE**

````text
Refresh this scheme report for the next round and add the confirmed opening date, application deadline, and residency dates.
````

**RAW**

````text
The residency scheme gives early-career makers access to a shared studio for a limited period. Residents receive a workbench, basic storage, and access to the weekly technical clinic. The scheme does not include a materials allowance, and residents are responsible for arranging any specialist equipment they need.

In the last round, we received 63 applications for six places. The panel selected residents on the basis of their project proposal and the suitability of the studio for their work. Previous exhibition experience was considered where relevant, but it was not a requirement. Several unsuccessful applicants asked for clearer information about how the criteria were weighted.

We have revised the application guide to include a worked example of how the panel discusses a proposal. The example is fictional and does not guarantee that a similar project will be selected. Its purpose is to show the kinds of questions the panel asks, including whether a project can be completed with the facilities available.

The next application round is expected to open in the autumn. We will announce the timetable once studio maintenance has been scheduled. Applicants should not make travel or accommodation commitments on the assumption that the dates will match last year's programme.

[Opening date, application deadline and residency dates to be added once confirmed. None were supplied, so none are stated here.]
````

**FINAL**

````text
The residency scheme gives early-career makers access to a shared studio for a limited period. Residents receive a workbench, basic storage, and access to the weekly technical clinic. The scheme does not include a materials allowance, and residents are responsible for arranging any specialist equipment they need.

In the last round, we received 63 applications for six places. The panel selected residents on the basis of their project proposal and the suitability of the studio for their work. Previous exhibition experience was considered where relevant, but it was not a requirement. Several unsuccessful applicants asked for clearer information about how the criteria were weighted.

We have revised the application guide to include a worked example of how the panel discusses a proposal. The example is fictional and does not guarantee that a similar project will be selected. Its purpose is to show the kinds of questions the panel asks, including whether a project can be completed with the facilities available.

The next application round is expected to open in the autumn. We will announce the timetable once studio maintenance has been scheduled. Applicants should not make travel or accommodation commitments on the assumption that the dates will match last year's programme.
````

#### Frozen pre-generation scope

- **R1A — `INSUFFICIENT_INFORMATION`.** Authorized factual changes: [
  "Add confirmed opening date, application deadline and residency dates once supplied."
]. Preserved facts: [
  "Studio provides workbench, basic storage and weekly technical clinic; no materials allowance; residents arrange specialist equipment.",
  "63 applications for six places; selection by proposal and studio suitability; exhibitions not required.",
  "Guide’s worked example fictional and not selection guarantee.",
  "Do not assume previous year’s dates for travel or accommodation."
]. Intentional voice: []. Missing information prevents fulfillment: `True`. Notes: "Requested confirmed dates are absent; autumn expectation is not a confirmed timetable."
- **R2A — `INSUFFICIENT_INFORMATION`.** Authorized factual changes: [
  "Add confirmed opening date, application deadline and residency dates if supplied."
]. Preserved facts: [
  "Limited studio residency includes workbench, storage, weekly technical clinic; no materials allowance; residents arrange specialist equipment.",
  "63 applications for six places; project and studio suitability criteria; exhibition experience not required; weighting clarity requested.",
  "Guide fictional worked example not selection guarantee; timetable awaits maintenance scheduling; avoid commitments based on prior dates."
]. Intentional voice: []. Missing information prevents fulfillment: `True`. Notes: "Requested confirmed dates are absent; cannot fulfill date addition from supplied information."

#### Primary and available second blind labels

- **primary/O1B**; item `blind-69616d8c154f2699bc739c9aa44854bf`; A side `FINAL`, B side `RAW`; pairwise `NEITHER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "NO",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2A**; item `blind-69616d8c154f2699bc739c9aa44854bf`; A side `FINAL`, B side `RAW`; pairwise `OUTPUT_B_BETTER`. Output A labels: `{
  "objectiveSatisfied": "NO",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `preserved`; finding count: 0.

**Final verification**

- Status: `preserved`; finding count: 0.

#### Semantic verdicts

- Initial verifier semantic verdict: `REJECT`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `verifier-rejected`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-096",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "SEMANTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "None: objective supplies no concrete replacement fact.",
  "vagueUpdateObserved": "YES",
  "vagueUpdateEvidence": "Objective requests confirmed opening, deadline and residency dates but supplies none; RAW flags absence and guesses no values.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source has a concrete update, structure, register or clarity task identified by objective.",
  "disputedOrUncertain": "YES",
  "evidence": "No actual confirmed dates are supplied. RAW preserves the report and explicitly identifies all three missing dates, materially clarifying why the requested timetable cannot responsibly be added. FINAL removes that useful transparency. Semantic REJECT acknowledges no dates were supplied but penalizes inability to fulfill an impossible objective. Blind reviewers agree both incomplete, with placeholder useful; my GOOD concerns material missing-information benefit, not full fulfillment. No guessed date or collateral update."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "No actual confirmed dates are supplied. RAW preserves the report and explicitly identifies all three missing dates, materially clarifying why the requested timetable cannot responsibly be added. FINAL removes that useful transparency. Semantic REJECT acknowledges no dates were supplied but penalizes inability to fulfill an impossible objective. Blind reviewers agree both incomplete, with placeholder useful; my GOOD concerns material missing-information benefit, not full fulfillment. No guessed date or collateral update."
}
```

### V3-108

Frozen text hashes: source `f6f019bfd5d1f0cd5a607f7cf462c86f325fe812f933cd513c4451d685dfb971`; objective `1f125213d96c9bb007b8f1ebd5a6bb4abe143ca478b936ff7a5c1547398cdf37`.

**SOURCE**

````text
**What time does the shuttle leave?** The first shuttle leaves the station at 8:10 a.m. After that, one leaves every 40 minutes until noon. The schedule is the same on both days of the event. If you're arriving close to noon, check the posted board at the station in case the last departure has changed.

**Can I bring a folding cart?** Yes, as long as it folds down enough to fit under a seat. The driver can't store carts in the aisle, since that blocks the way for other riders. **Does it stop at the clinic?** No. The closest stop is across from the pharmacy, about a five-minute walk from the clinic entrance. Give yourself a little extra time if you're carrying anything or walking with someone who needs a slower pace.
````

**OBJECTIVE**

````text
Make the answers easy to scan and preserve the schedule, cart condition, and precise clinic-stop limitation.
````

**RAW**

````text
**What time does the shuttle leave?**
The first shuttle leaves the station at 8:10 a.m. After that, one leaves every 40 minutes until noon. The schedule is the same on both days of the event. If you're arriving close to noon, check the posted board at the station in case the last departure has changed.

**Can I bring a folding cart?**
Yes, as long as it folds down enough to fit under a seat. The driver can't store carts in the aisle, since that blocks the way for other riders.

**Does it stop at the clinic?**
No. The closest stop is across from the pharmacy, about a five-minute walk from the clinic entrance. Give yourself a little extra time if you're carrying anything or walking with someone who needs a slower pace.
````

**FINAL**

````text
**What time does the shuttle leave?** The first shuttle leaves the station at 8:10 a.m. After that, one leaves every 40 minutes until noon. The schedule is the same on both days of the event. If you're arriving close to noon, check the posted board at the station in case the last departure has changed.

**Can I bring a folding cart?** Yes, as long as it folds down enough to fit under a seat. The driver can't store carts in the aisle, since that blocks the way for other riders. **Does it stop at the clinic?** No. The closest stop is across from the pharmacy, about a five-minute walk from the clinic entrance. Give yourself a little extra time if you're carrying anything or walking with someone who needs a slower pace.
````

#### Frozen pre-generation scope

- **R1A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "First shuttle station departure 8:10 a.m.; every 40 minutes until noon; same schedule both event days.",
  "Near noon check posted board for changed last departure.",
  "Folding carts must fit under seat, cannot be in aisle.",
  "No clinic stop; closest stop opposite pharmacy, about five-minute walk to clinic; slower walkers or loads need extra time."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Separate question blocks and compact answers to improve scanning."
- **R2A — `LOCAL_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "Station first shuttle 8:10 a.m.; every 40 minutes until noon; same both event days; near noon consult board for changed last departure.",
  "Cart must fold under seat; no aisle storage; no clinic stop; closest across pharmacy about five-minute walk from clinic entrance; extra time for slower pace or carrying."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Separate each FAQ and shorten phrasing."

#### Primary and available second blind labels

- **primary/O1C**; item `blind-9c17b592cbf46cf32f778764e4663d09`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.
- **second/O2B**; item `blind-9c17b592cbf46cf32f778764e4663d09`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 1.
- `altered_name` — “No The” no longer appears in the rewrite.

**Final verification**

- Status: `rejected`; finding count: 1.
- `altered_name` — “No The” no longer appears in the rewrite.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `False`; accepted: `False`; exact replacement when returned: no replacement recorded.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-108",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "NO_REPAIR",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "None: objective supplies no concrete replacement fact.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "None: no unspecified factual update requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source has a concrete update, structure, register or clarity task identified by objective.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW separates each question and answer, materially exposing clinic non-stop limitation while preserving 8:10, every 40 minutes until noon, both days, under-seat carts and five-minute walk. FINAL re-merges clinic into cart paragraph. No The is not a person/entity and text was not lost: deterministic name rejection is false. No repair occurred. Both blind reviewers favor RAW for scanability."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "NO_REPAIR",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW separates each question and answer, materially exposing clinic non-stop limitation while preserving 8:10, every 40 minutes until noon, both days, under-seat carts and five-minute walk. FINAL re-merges clinic into cart paragraph. No The is not a person/entity and text was not lost: deterministic name rejection is false. No repair occurred. Both blind reviewers favor RAW for scanability."
}
```

### V3-110

Frozen text hashes: source `9c76bd53f3cd65e44145962b0a6fa3095565428a04b94fdae305bbe86c505993`; objective `4a69f0569cdf29d3eb7ca66ae593f199f4cc08b35c43e549dd8175568dc01694`.

**SOURCE**

````text
**Do I need to register?** No. You can walk in, but the room holds 30 people. If it fills, we may have to pause entry until someone leaves, so arriving early is a good idea if you need a seat. There isn't a reservation list, and coming early doesn't guarantee entry once the room reaches capacity.

**Is there childcare?** A quiet table with coloring supplies will be available for children to use with their adults nearby. There isn't supervised childcare, and parents or guardians remain responsible for them. **Can I submit a question ahead of time?** Yes. Use the form by Wednesday evening so the facilitator has time to group similar questions. You can also ask during the meeting, though we may not get to every question before the room closes. If you use the form, keep the question brief and include the topic you're asking about so it can be routed to the right part of the discussion.
````

**OBJECTIVE**

````text
Improve the FAQ's readability while making the distinction about childcare and the capacity caveat clear.
````

**RAW**

````text
**Do I need to register?**
No. You can walk in, but the room holds 30 people. If it fills, we may have to pause entry until someone leaves, so arriving early is a good idea if you need a seat. There isn't a reservation list, and coming early doesn't guarantee entry once the room reaches capacity.

**Is there childcare?**
Not supervised childcare, no. A quiet table with coloring supplies will be available for children to use with their adults nearby. Parents or guardians remain responsible for them.

**Can I submit a question ahead of time?**
Yes. Use the form by Wednesday evening so the facilitator has time to group similar questions. If you use the form, keep the question brief and include the topic you're asking about so it can be routed to the right part of the discussion. You can also ask during the meeting, though we may not get to every question before the room closes.
````

**FINAL**

````text
**Do I need to register?** No. You can walk in, but the room holds 30 people. If it fills, we may have to pause entry until someone leaves, so arriving early is a good idea if you need a seat. There isn't a reservation list, and coming early doesn't guarantee entry once the room reaches capacity.

**Is there childcare?** A quiet table with coloring supplies will be available for children to use with their adults nearby. There isn't supervised childcare, and parents or guardians remain responsible for them. **Can I submit a question ahead of time?** Yes. Use the form by Wednesday evening so the facilitator has time to group similar questions. You can also ask during the meeting, though we may not get to every question before the room closes. If you use the form, keep the question brief and include the topic you're asking about so it can be routed to the right part of the discussion.
````

#### Frozen pre-generation scope

- **R1B — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "No registration; room capacity 30 and early arrival does not guarantee entry; activity table is not supervised childcare; adults remain responsible."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: ""
- **R2A — `DISTRIBUTED_LIGHT_EDIT`.** Authorized factual changes: []. Preserved facts: [
  "No registration/reservation; capacity 30; entry may pause until departures; early arrival does not guarantee entry at capacity.",
  "Colouring table with nearby adults is not supervised childcare; guardians responsible.",
  "Advance form by Wednesday evening, brief question with topic; meeting questions allowed but may not all be addressed before closure."
]. Intentional voice: []. Missing information prevents fulfillment: `False`. Notes: "Separate answers and foreground caveats."

#### Primary and available second blind labels

- **primary/O1A**; item `blind-13b5934a6561ebf565e7b0dc69b13641`; A side `RAW`, B side `FINAL`; pairwise `OUTPUT_A_BETTER`. Output A labels: `{
  "objectiveSatisfied": "YES",
  "editoriallyUseful": "YES",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "NO",
  "unnecessaryChangeToGoodSource": "N/A"
}`. Output B labels: `{
  "objectiveSatisfied": "PARTIAL",
  "editoriallyUseful": "PARTIAL",
  "meaningPreserved": "YES",
  "unauthorizedSemanticChange": "NO",
  "unsupportedInformation": "NO",
  "voicePreserved": "YES",
  "overedited": "NO",
  "underedited": "YES",
  "unnecessaryChangeToGoodSource": "N/A"
}`.

#### Deterministic findings

**Candidate / RAW verification**

- Status: `rejected`; finding count: 3.
- `altered_name` — “No You” no longer appears in the rewrite.
- `negation_changed` — The rewrite adds a negation (“not”) the source does not have.
- `missing_claim` — The negated statement (“isn't … supervi childca”) is gone from the rewrite.

**Final verification**

- Status: `rejected`; finding count: 1.
- `altered_name` — “No You” no longer appears in the rewrite.

#### Semantic verdicts

- Initial verifier semantic verdict: `not run`.
- Reverify semantic verdict: `not run`.

#### Repair and fallback

- Repair requested: `True`; accepted: `False`; exact replacement when returned: ````text
A quiet table with coloring supplies will be available for children to use with their adults nearby. There isn't supervised childcare.
````.
- Fallback reason: `hard-meaning-failure`; outcome: `source-fallback`.

#### Original audit layer

Source layer: `FIRST_MANDATORY_AUDIT`. Original mandatory-audit judgment (verbatim fields):

```json
{
  "caseId": "V3-110",
  "rawMaterialClass": "GOOD",
  "finalMaterialClass": "OTHER",
  "goodRetentionStatus": "GOOD_LOST",
  "badOutcomeStatus": "NOT_BAD",
  "catchOrEscape": "NOT_APPLICABLE",
  "lossCause": "DETERMINISTIC_FALSE_REJECTION",
  "badFinalEscapeType": "NONE",
  "repairQuality": "SAFE_REVERSION",
  "fallbackQuality": "UNNECESSARY_GOOD_EDIT_LOSS",
  "explicitUpdateObserved": "NO",
  "explicitUpdateEvidence": "None: objective supplies no concrete replacement fact.",
  "vagueUpdateObserved": "NO",
  "vagueUpdateEvidence": "None: no unspecified factual update requested.",
  "alreadyGoodSource": "NO",
  "alreadyGoodEvidence": "Source has a concrete update, structure, register or clarity task identified by objective.",
  "disputedOrUncertain": "NO",
  "evidence": "RAW materially separates FAQ entries and leads with no supervised childcare, retaining parent responsibility, 30-person capacity and no early-entry guarantee. Deterministic No You name and relocated negation blockers are false. Repair returns childcare wording to source-equivalent form without losing separation or responsibility, so independently a safe reversion despite trace FAILED_REPAIR. Remaining false name blocker causes source fallback and loses useful structure. Blind reviewer favors RAW."
}
```

#### Adjudication layer

Independent adjudication (separate sealed layer):

```json
null — none recorded
```

#### Final locked interpretation

Sealed final interpretation (kept distinct from the original audit and adjudication):

```json
{
  "rawClass": "GOOD_RAW",
  "finalClass": "OTHER",
  "materialGoodEditLost": true,
  "unsafeFinal": false,
  "repair": "SAFE_REVERSION",
  "fallback": "UNNECESSARY_GOOD_EDIT_LOSS",
  "evidence": "RAW materially separates FAQ entries and leads with no supervised childcare, retaining parent responsibility, 30-person capacity and no early-entry guarantee. Deterministic No You name and relocated negation blockers are false. Repair returns childcare wording to source-equivalent form without losing separation or responsibility, so independently a safe reversion despite trace FAILED_REPAIR. Remaining false name blocker causes source fallback and loses useful structure. Blind reviewer favors RAW."
}
```

## Identity check

Exactly 25 case IDs: V3-003, V3-009, V3-012, V3-013, V3-014, V3-017, V3-021, V3-023, V3-030, V3-035, V3-036, V3-043, V3-045, V3-046, V3-059, V3-060, V3-061, V3-067, V3-071, V3-080, V3-087, V3-089, V3-096, V3-108, V3-110.
