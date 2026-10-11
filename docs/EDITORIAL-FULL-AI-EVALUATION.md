# Full editorial experiment: supplied AI judgments

**Direct editing won 5 cases; specialized diagnosis won 0; 7 tied. Decision: B — DIRECT EDITING IS BETTER OR EQUIVALENT.** This experiment does not support integrating specialization. Keep direct editing as the default within this experimental comparison; production behavior is unchanged.

Both arms were judged SAFE and objective-complete on all 12 cases (12/12, 100% each). No material defects were confirmed. These are supplied evaluator judgments, not independently established safety guarantees. No statistical-significance claim is made.

## Case results

| Case | Type | Blind preference | Confidence | Direct versus specialized |
|---|---|---|---|---|
| EI-001 | already_good | TIE | HIGH | Tie |
| EI-002 | already_good | TIE | HIGH | Tie |
| EI-003 | synthetic | Y | MEDIUM | Direct wins |
| EI-004 | synthetic | Y | MEDIUM | Direct wins |
| EI-005 | mixed_quality | Y | HIGH | Direct wins |
| EI-006 | mixed_quality | TIE | HIGH | Tie |
| EI-007 | supplied_update | TIE | HIGH | Tie |
| EI-008 | supplied_update | TIE | HIGH | Tie |
| EI-009 | voice_sensitive | TIE | HIGH | Tie |
| EI-010 | voice_sensitive | TIE | HIGH | Tie |
| EI-011 | professional | Y | HIGH | Direct wins |
| EI-012 | professional | X | MEDIUM | Direct wins |

Specialization lost EI-003, EI-004, EI-005, EI-011 and EI-012. It tied EI-001, EI-002, EI-006, EI-007, EI-008, EI-009 and EI-010. It won no case. All seven ties had identical X/Y final text.

## What the supplied judgments establish

- **EI-003:** direct preferred at MEDIUM confidence, despite equal dimension ratings. No preference rationale was supplied in the preserved pilot judgment, so no cause is inferred.
- **EI-004:** direct retained the shared-listening theme and was judged slightly more conversational. Specialized voice fidelity was 4/5; direct was 5/5. This is a voice/content-preservation benefit, not merely additional polish.
- **EI-005:** direct retained the visitor-specific requirement. Specialized omitted that qualification. The evaluator called this a scope-fidelity weakness while still assigning SAFE/YES and confirming no material safety failure. Those ratings and that unresolved concern are preserved; the report does not upgrade it into a confirmed failure or erase it.
- **EI-011:** direct improved concision and clarified the published 86 versus proposed 83. Specialized returned SOURCE unchanged. Specialized restraint was 4/5 versus direct 5/5; this reflects the supplied judgment of appropriate task completion, not a rule rewarding rewriting.
- **EI-012:** direct put the recommendation first for a busy lead while preserving evidence limits. Specialized returned SOURCE unchanged. Specialized restraint was 4/5 versus direct 5/5. The recorded benefit is task-appropriate information ordering.

No supplied finding establishes gratuitous rewriting by the specialized arm. The professional-case preferences favor useful changes that specialization withheld; the other preferences favor voice/theme and scope preservation. Equal top-line naturalness scores do not establish a general naturalness advantage. Additional diagnosis did not establish an editorial benefit in this sample.

## Results by case type

| Type | Cases | Direct wins | Specialized wins | Ties | SAFE / YES in each arm |
|---|---:|---:|---:|---:|---|
| already_good | 2 | 0 | 0 | 2 | 2/2 SAFE; 2/2 YES |
| synthetic | 2 | 2 | 0 | 0 | 2/2 SAFE; 2/2 YES |
| mixed_quality | 2 | 1 | 0 | 1 | 2/2 SAFE; 2/2 YES |
| supplied_update | 2 | 0 | 0 | 2 | 2/2 SAFE; 2/2 YES |
| voice_sensitive | 2 | 0 | 0 | 2 | 2/2 SAFE; 2/2 YES |
| professional | 2 | 2 | 0 | 0 | 2/2 SAFE; 2/2 YES |

## Provenance and freeze

The user supplied finalized results attributed to **ChatGPT GPT-6, an AI editorial evaluator**, review date **October 10, 2026**. The user attests that the evaluator did not consult arm identities and did not participate in generating these ten outputs; generation provenance was not independently verified. This is neither independent human review nor a GPT-6.1 Sol High evaluation. The two earlier pilot judgments retain their original provenance and were not retroactively assigned a reviewer identity.

The supplied ten-case ratings, preferences, confidence and evidence notes were transcribed verbatim. No new editorial evaluation or inference was performed. The existing review-form field structure was used with AI provenance labels. Supplied evidence is prose, not structured exact quotations; it remains in each case's reason, with no invented quote objects. Unsupplied fields remain null/empty. This artifact is not a fabricated live-model judge receipt and was not imported through the strict live-model judgment schema. The original two pilot records and their bytes are preserved.

The full set was validated and frozen **before the first full private mapping read**. The two pilot cases had already been frozen and unblinded in the previous pass. Mapping bindings were then checked against all 24 accepted final texts. No ratings were edited after unblinding.

- [Frozen judgments](../data/experiments/editorial-intelligence-v1/full-ai-review/judgments.final.json)
- [Authoritative supplied results](../data/experiments/editorial-intelligence-v1/full-ai-review/authoritative-results.json)
- [Freeze receipt](../data/experiments/editorial-intelligence-v1/full-ai-review/judgment-freeze.json)
- [Unblinded report](../data/experiments/editorial-intelligence-v1/full-ai-review/unblinded-report.json)
- [Preference matrix](../data/experiments/editorial-intelligence-v1/full-ai-review/preference-matrix.csv)
- [Artifact validation](../data/experiments/editorial-intelligence-v1/full-ai-review/validation-results.json)

Full judgment SHA-256: `0d2483cceea15c08b3af8627b7ea6c6290a710ad685dd9c51154c77449b1ee44`.

Full blind packet SHA-256: `1f12a48508eb67008b8a08ebbed89ae5f6170ccb24def7b7f716a631ad1fd73a`.

Preserved pilot judgment SHA-256: `76ab71696d62b08fd70134ec0da94a5190b17065ab37f01eb15e2680ad92adf0`.

## Validation and implication

`python3 tools/editorial-intelligence/validate-full-ai-review.py` passes: 12 frozen judgments; 60 exact supplied numerical ratings; two unchanged pilot judgments; 36 accepted import hash/raw bindings; 12 original blind packet bindings; 24 mapping/final bindings; six case-type totals; freeze timestamp before full unblinding. A separate read-only validation of the existing import schemas, metadata contracts and pinned manifest/holdout/prompt/schema bindings passed 36/36 with zero issues. Twelve original blind source/objective and request/prompt/metadata bindings also passed. No application tests, additional model invocations, production changes, push or deployment occurred.

Limitations: twelve authored cases with only two per type; supplied exploratory AI judgments rather than independent human review; reviewer and generator runtime identities not independently verified; incomplete configuration/cost/latency assurances from manual subscription execution; mixed account provenance; pilot preference rationale absent; EI-005 scope concern remains despite SAFE label. B adds a diagnosis call and context, so the experiment does not isolate diagnosis from additional inference. Do not infer population performance or superiority over other frontier models.

**Smallest justified next experiment:** obtain a second blinded assessment of these same twelve pairs from an evaluator independent of both generation and the original AI reviewer. Use the same rubric, preserve ties and freeze all judgments before revealing mappings. This requires no new generator outputs, prompt changes or editorial architecture. Until that replication, retain direct editing as the default and make no specialization integration or revision on this evidence alone.
