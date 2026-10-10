# Candidate D final mechanical recovery

**A — MECHANICAL RECOVERY COMPLETE.** Implementation checkpoint: `825f569`; replay comparison: `0efbf9c`. This completes the authorized deterministic slice. Semantic verification is the next architecture boundary.

## Result

| Measure | V2 baseline | V3 |
|---|---:|---:|
| Completed | 21 | 22 |
| KEEP | 8 | 8 |
| Abstained | 19 | 18 |
| Previously SAFE V15 finals recovered | 10/23 | 11/23 |
| Verified RAW returns | 21 | 22 |
| SOURCE returns | 8 | 8 (all KEEP) |
| Verified SOURCE fallbacks | 0 | 0 |

**Only AC48V2-036 changes.** It now returns byte-identical frozen V15 RAW/FINAL, labeled SAFE/YES. Its original D classification remains `CANNOT_SAFELY_COMPLETE/AMBIGUOUS_REPLACEMENT`; the explicit route is `V15_SENTENCE_EDIT`. No original objective-state classification is silently rewritten.

**AC48V2-022 remains abstained.** Its captured V15 PASS depends on authorized factual exceptions (`review` deterministic status, two authorized-change findings). D still lacks the named extension binding. Existing verification can validate that artifact but cannot supply D's missing routing authority. The sentence route rejects it even when explicitly given its extension sentence as scope. No extension rules or deadline contract were added.

The recovered-safe tally includes the inherited 016 SAFE/PARTIAL disagreement: ten recovered finals have frozen YES and one has PARTIAL. It is not eleven independently judged full objective completions. No judging was rerun.

## Narrow implementation

[Mechanical adapter](../src/lib/reconstruction/candidate-d/mechanical-adapter.ts) accepts an explicit `SentenceEditIntent` bound to exact SOURCE, OBJECTIVE and one unique complete source sentence. This is a trusted offline caller annotation, not a text classifier. The replay supplies that annotation only for 036; production has no new integration or automatic intent inference.

The route applies only to the original ambiguous CANNOT state. KEEP and REQUIRED_UPDATE retain their existing gates. RAW must preserve every byte outside the identified sentence and contain one nonempty replacement sentence. It must then pass unchanged V15 deterministic/voice verification and its unique schema-valid captured semantic review bound to exact SOURCE/OBJECTIVE/candidate. Acceptance additionally requires `preserved` deterministic status and zero authorized factual changes. There is no repair, factual exception or preservation-only SOURCE fallback in this route. Unchanged SOURCE requires its own objective-satisfying exact review; the saved RAW review cannot authorize it.

V2's frozen-verifier plumbing was extracted into a shared helper without changing selection. Before V3 runs, the replay recomputes V2 and compares every row and summary with the persisted baseline. V1/V2 replay artifacts remain untouched. No V15, Candidate C, editor, prompt, semantic check, benchmark input or model output was changed.

Semantic cases 015, 017, 023, 024, 037, 041; legitimate abstentions 040, 043, 047, 048; and unsupported deadline case 044 remain unchanged. This report closes deterministic recovery; the next work is semantic verification, not additional routing passes.

## Invariants and validation

| Hard invariant | Result |
|---|---:|
| Supplied updates completed | 8/8 |
| Already-good KEEP | 8/8 |
| Editor calls on KEEP | 0 |
| Stale SOURCE successes | 0 |
| Correct supplied-update V15 RAW retained | 8/8 |
| Previously unsafe V15 finals rejected | 12/12 |
| Apparent unauthorized factual changes accepted | 0 |
| New apparent safety regressions | 0 |
| Live model calls | 0 |

Safety counts are frozen exact-text evidence after selection, not universal safety claims. All 48 cases and stale-SOURCE/unsafe-FINAL probes run offline. V15 FINAL and frozen safety labels never authorize selection.

- Candidate D targeted tests: **32 passed across 4 files** (`npx vitest run src/lib/reconstruction/candidate-d`). Includes missing/mismatched/duplicated evidence, invalid intent, ambiguous/multiple sentence scope, outside-sentence mutation, deterministic semantic rejection, SOURCE eligibility, factual-update exclusion, KEEP accounting and replay invariants.
- Frozen replay generation and saved-artifact validation: `node --import tsx tools/eval/candidate-d-mechanical-replay.ts` and the same command with `--validate`.
- Typecheck passed after the shared helper/replay interface change; targeted lint passed. No full application suite or browser verification (isolated offline adapter; no UI integration).

Artifact: `.evaluations/candidate-d-frozen-48-v3/replay.json` (gitignored). Its manifest records frozen input hashes, implementation hashes, exact V2 baseline hash, all 48 dispositions, mechanical differences against V15 FINAL, safety probes and case-by-case V2 comparison. V2 baseline SHA-256: `7197a6a8830a09f9ff4bf8843682bd5d7ac500b015027538ad2e9cbf7aa72f42`.

Relative to V15 FINAL: **18 identical, 12 changed, 18 withheld**. Relative to `0efbf9c`: **one changed case, 036**, with all other rows and safety results preserved.
