# Candidate D frozen 48-case replay

**Decision: B — ADAPTER WORKS, REPLAY EXPOSES FAILURES.**

The isolated `candidate-d-control-v1` adapter classifies SOURCE + OBJECTIVE before editor access and passes frozen V15 RAW through the existing exact authorized-update gate. Published V15/C, the older post-V3 D arm, prompts, corpus, and Astra artifacts are unchanged. No live model calls were made.

## Required outcomes

| Measure | Actual |
|---|---:|
| Supplied updates completed | 8/8 |
| Already-good KEEP | 8/8 |
| Editor callback calls on KEEP | 0 |
| Stale SOURCE accepted as completed update | 0 |
| Correct supplied-update V15 RAW retained | 8/8 |

The already-good assessment is an explicit fixture oracle, matching the prior control tests; this does not establish a production quality classifier. The stale-SOURCE probe replaces RAW with SOURCE through the adapter for every case: no non-KEEP branch publishes it as COMPLETED.

## Full replay

48 cases: **11 COMPLETED, 8 KEEP, 29 ABSTAINED**. Classification: 11 REQUIRED_UPDATE, 8 KEEP, 12 CANNOT_SAFELY_COMPLETE, 17 EDIT. There were 28 frozen RAW callback reads (11 update + 17 EDIT), zero live editor/verifier/repairer/judge calls. The EDIT callback is exercised for replay integration but its result is never claimed to prove objective completion.

Against V15 FINAL: **7 byte-identical, 12 changed, 29 withheld**. The 12 changed outputs are seven localized RAW retentions (005–008, 029, 031, 046) and five KEEP reversions (002, 004, 025–027). The complete word/whitespace additions and removals for each deliverable final are in the replay JSON; withheld finals have null diffs rather than being treated as empty-string rewrites.

The additional completion outside supplied-update cases is 021 (`killn` → `kiln`); 045 and 046 are localized updates. All 19 delivered outputs equal frozen Astra finals. Their frozen matching final-arm labels are SAFE. This is inherited byte-equality evidence, **not a new independent safety judgment of Candidate D or RAW**. No apparent unsafe/unresolved delivered-text regression was found. No general safety certification follows from this replay.

**Coverage failures remain:** 23 abstentions withhold previously SAFE V15 finals: 013, 014, 015, 016, 017, 018, 019, 020, 022, 023, 024, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 047, 048. These are availability/coverage regressions, not unsafe delivered text. In particular, 022 and 044 remain unbound despite their correct frozen RAW. All 17 general EDIT objectives abstain because this control version has no positive objective-completion verifier. Eleven abstentions report ambiguous binding; one reports missing/unbound replacement. Case 009 remains unresolved in frozen judgments; abstention does not relabel it as confirmed stale.

The required narrow transition hypothesis passes, but full end-to-end editing does not. These results support further isolated work rather than promoting Candidate D or declaring its architecture invalid.

| Case | Classification | Disposition / abstention reason | Versus V15 FINAL |
|---|---|---|---|
| AC48V2-001 | KEEP | KEEP | IDENTICAL |
| AC48V2-002 | KEEP | KEEP | CHANGED |
| AC48V2-003 | KEEP | KEEP | IDENTICAL |
| AC48V2-004 | KEEP | KEEP | CHANGED |
| AC48V2-005 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-006 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-007 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-008 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-009 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-010 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-011 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-012 | CANNOT_SAFELY_COMPLETE | ABSTAINED — MISSING_OR_UNBOUND_REPLACEMENT | WITHHELD |
| AC48V2-013 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-014 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-015 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-016 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-017 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-018 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-019 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-020 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-021 | REQUIRED_UPDATE | COMPLETED | IDENTICAL |
| AC48V2-022 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-023 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-024 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-025 | KEEP | KEEP | CHANGED |
| AC48V2-026 | KEEP | KEEP | CHANGED |
| AC48V2-027 | KEEP | KEEP | CHANGED |
| AC48V2-028 | KEEP | KEEP | IDENTICAL |
| AC48V2-029 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-030 | REQUIRED_UPDATE | COMPLETED | IDENTICAL |
| AC48V2-031 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-032 | REQUIRED_UPDATE | COMPLETED | IDENTICAL |
| AC48V2-033 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-034 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-035 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-036 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-037 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-038 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-039 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-040 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-041 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-042 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-043 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |
| AC48V2-044 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-045 | REQUIRED_UPDATE | COMPLETED | IDENTICAL |
| AC48V2-046 | REQUIRED_UPDATE | COMPLETED | CHANGED |
| AC48V2-047 | CANNOT_SAFELY_COMPLETE | ABSTAINED — AMBIGUOUS_REPLACEMENT | WITHHELD |
| AC48V2-048 | EDIT | ABSTAINED — EDIT_VERIFICATION_UNSUPPORTED | WITHHELD |

## Reproduction and validation

```sh
node_modules/.bin/vitest run src/lib/reconstruction/candidate-d/control.test.ts src/lib/reconstruction/candidate-d/adapter.test.ts
node --import tsx tools/eval/candidate-d-frozen-replay.ts
node --import tsx tools/eval/candidate-d-frozen-replay.ts --validate
```

Targeted tests: **15/15 passed** (9 existing control tests, 6 adapter/replay tests). Replay validation independently recomputes all 48 cases and compares the saved artifact exactly. No full-suite, lint, typecheck or build rerun was needed; no browser check applies to this offline adapter/replay.

Artifact: `.evaluations/candidate-d-frozen-48-v1/replay.json` (gitignored, regenerated by the command above). It contains input fingerprints, fixture assessment evidence, dispositions, editor counts, stale probes, final text/hash, mechanical diffs, and inherited-label evidence. This document persists the disposition audit; evaluation output remains in `.evaluations/`.

Frozen SHA-256 fingerprints (replay rejects mismatches):

- `data/evaluation/astra-control-fresh-48-v2/data-phase/corpus.json`: `464eafef5b49cc5c6e9a80ff96ba2bed9661cdc3e7f5c1fa73ba00b2d0dc8f22`
- `data/evaluation/astra-product-benchmark-48-v1/outputs.jsonl`: `08deccc8263f956fa0b69c7a6a768f50464565fbfce51af705fd698d2605e152`
- `data/evaluation/astra-product-benchmark-48-v1/blind/decoded-case-results.json`: `092863cc9946722af3951e814e7094ae3603f2c70aea8ca12865ac61a0979d13`
