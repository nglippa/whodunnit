# Frozen writing holdout: untouched 62259e8 baseline

The first deterministic run used the frozen version 1.0.0 exam on 2026-09-30. Raw, non-text results are in `data/evaluation/holdout/reports/baseline-62259e8.json`. That file is the immutable baseline; this document interprets it. No provider, judge, local model, or paid API ran. The writing engine under `src/lib/rules`, `src/lib/reconstruction`, `src/lib/semantics`, `src/lib/analysis`, and `data/rules/packs` was unchanged from 62259e8.

## Exam and labels

84 newly authored synthetic documents: 44 clean-cohort, 20 problematic-cohort, 20 mixed-cohort. Actual word bands: 18 very short (<80), 27 short (80–199), 27 medium (200–599), 12 long (600+), with a maximum of 1,221 words. Gold dispositions: 57 leave alone, 7 light edit, 20 substantive reconstruction; one light-edit case is marked ambiguous after a blind reviewer judged it leave alone. The 83 unambiguous cases are the denominator for disposition rates.

Two independent reviewers labeled 38 documents using text and IDs alone. They agreed with creators on disposition for 37/38 (97.4%) and on the exact concept-tag set for 19/38 (50%). M020 is the disposition disagreement. High disposition agreement does not make the concept taxonomy settled; category-level coverage below is exploratory. The sampled cases were not shown to the deterministic engine with their labels.

Fingerprints (SHA-256 over exact tracked file bytes): documents `1e8649cd68fd64d0ca7f4f09ed14a55c4ca482d2e50a10c383dae7c42ef8cd6a`; labels `bb2385f4912407a29cace03e620f7592b373fd97e11b6e5471793631c95e94a2`; reviews `c0ad6c89c5a9cd3b157499111579099129cb98153f685bf754d465eba8e46ce0`.

Before freeze and before any engine run, an editorial auditor caught and removed an unrelated pasted ending from C035. The same audit found missing 350–600 and 1,000+ word coverage, so six newly authored pieces were added and independently reviewed. P017/P018 may read as length padded, and M005/M018 conspicuously discuss their own generic wording. These reduce the corpus's natural-sampling claim; none were edited after the baseline.

## Clean generalization and change pressure

Among 57 unambiguous `LEAVE_ALONE` documents, one (1.8%) had actionable findings. The v3 planner chose `UNCHANGED` for 56/57 (98.2%). The outlier, M017, is a 635-word oral-history transcript: repeated `Interviewer:` paragraph openings and questions followed by answers yielded two active rules, ten matches, and a *substantive* planner decision. It accounts for all 259 localized characters and 11 targeted sentences in clean writing, or 7.8% of that document's characters. The rules were `core.repeated-paragraph-openers` and `slop.self-answered-questions`. The source-local voice profile did not classify the interview structure as an intentional recurring device despite high text-volume confidence. The narrow known-device conflict counter is zero; that counter does not cover transcript structure.

The production v1 strategy has no unchanged bypass. It would call a model for all 57 unambiguous clean documents. This is an inferred call policy, **not** an observed reconstruction or an observed semantic change. The v3 experimental planner bypass is what produced 56 unchanged decisions here. Production remains v1.

## Problematic prose, mixed cases, and planner calibration

Only 5/26 (19.2%) unambiguous documents labeled `LIGHT_EDIT` or `SUBSTANTIVE_RECONSTRUCTION` had any actionable finding. Here “unambiguous” refers only to disposition agreement; many reviewed concept-tag sets were contested. Any finding is an upper bound on relevant coverage: a hit can be unrelated to the annotated defect. The planner chose `UNCHANGED` for 21/26 (80.8%). All six unambiguous `LIGHT_EDIT` cases were left unchanged. Of 20 `SUBSTANTIVE_RECONSTRUCTION` cases, 15 were unchanged, five were assigned light edit, and none were assigned substantive reconstruction. P019, a 1,046-word generic municipal proposal with concrete operational facts, drew one 17-character importance finding and only a light-edit decision. The miss is not a short-text-only artifact.

| Human disposition | Planner unchanged | Planner light edit | Planner substantive |
|---|---:|---:|---:|
| Leave alone (57) | 56 | 0 | 1 |
| Light edit (6) | 6 | 0 | 0 |
| Substantive reconstruction (20) | 15 | 5 | 0 |

The mixed cohort contains 20 cases: 19 unchanged, one flagged for substantive reconstruction (M017, the false positive). Its seven light-edit labels include ambiguous M020; none prompted a light edit. This shows high restraint and low sensitivity at the same time.

The coarse category proxies found possible coverage for 3/22 formulaic, 1/9 redundancy, 2/22 generic-register, and 0/6 mechanical-structure annotations in unambiguous problematic cases. These are *category overlaps*, not verified recognition of the annotated defect. Eleven unsupported-strength annotations have no valid single-source category proxy. A source-only rule cannot establish whether an authority claim is supported or whether a rewrite strengthens it; that needs evidence or a before/after comparison. Exact concept tags agreed in only half the blind sample, which further limits concept-level conclusions.

## Length, pressure, and runtime

Very short texts were conservative: 0/18 received actionable findings, including 0/14 clean and 0/4 problematic. That avoids overconfident style judgments but misses all four short problems. In long text, 3/12 had actionable findings, including 1/8 clean and 2/4 problematic. Actionable density was 0.43 findings per 1,000 long-document words. There was no observed long-document finding explosion; this corpus has only 12 long samples.

Across all 84 documents, six had localized planner targets. Their union covered 396 characters and 17/1,376 prose sentences (1.24%); there were zero whole-document metric targets. Mean localized share was 0.168% per document. M017 alone contributed 259/396 characters and 11/17 targeted sentences. This small targeted area reflects missed problems as well as restraint; it is not a quality score. No actual text was rewritten.

| Words | Documents | Median deterministic plan time | p95 | Worst observed |
|---|---:|---:|---:|---:|
| <80 | 18 | 2.15 ms | 91.59 ms | 91.59 ms |
| 80–199 | 27 | 3.33 ms | 8.10 ms | 199.68 ms |
| 200–599 | 27 | 5.82 ms | 10.06 ms | 10.85 ms |
| 600+ | 12 | 13.41 ms | 21.85 ms | 21.85 ms |

Times cover a v1 and a v3 deterministic plan build per document. This is one local run without a prior runtime baseline. The very-short and short worst cases are isolated timing outliers; they do not establish a regression.

## Failure triage and decision

| Class | Evidence | Interpretation |
|---|---|---|
| Rule/taxonomy gap | P002's vague workplace memo and P011's broad city-planning editorial have zero findings; many similarly generic cases also missed. | The present rules reliably recognize some constructions but do not represent whole-paragraph genericness, unsupported abstraction, or recycled argumentative shape. Adding their exact phrases would contaminate development. |
| Possible threshold problem | All four problematic very-short cases were unchanged. | Sparse text warrants caution, so this cannot be called a threshold defect without independent development evidence. |
| Voice-suppression failure | M017's interview prompts became repeated-opener and self-answer findings. | The known-device voice profile misses dialogic/document-genre structure. One holdout case is insufficient basis for a specific code fix. |
| Planner problem | 15/20 substantive cases were unchanged; the five remaining were light edit. | Intensity is downstream of actionable findings, so low detection recall becomes an unchanged decision. M017 shows repeated matches can also overstate needed intensity. |
| Annotation ambiguity | Reviewer judged M020 leave alone; creator chose light edit. | It remains visible but is excluded from hard rates. Concept labels also had low exact agreement. |
| Not safely deterministic | Unsupported authority/strength, abstract restatement, and the usefulness of formal transitions depend on context or external evidence. | A phrase detector must not claim semantic certainty. These are candidates for bounded advisory review on a separate development corpus. |

**No correction pass was made.** The misses are broad semantic and discourse phenomena, while the main false positive is one transcript-genre case. A small regex or threshold tweak chosen from these IDs would teach the exam and could damage the strong clean result. There is therefore no post-fix audit and no second engine run. The remaining failures are future development evidence, not a target to optimize against this frozen holdout.

## Recommendation

Do not use the current planner as a quality-promotion gate for the v4 cloud experiment. Its unchanged decision would bypass most genuinely problematic documents in this exam. Build a *separate* development set for discourse-level genericness and transcript-like voice, define conservative evidence and advisory boundaries there, and obtain another fresh independent holdout before judging promotion. The frozen corpus can still be used later to compare v1, v3, v4 single-frontier, and v4 with delegation, provided gold annotations never enter reconstruction prompts and this report is treated as prior exposure. No model benchmark was run here.

## Independent implementation review and gates

A separate read-only agent reviewed the evaluator diff without reading the corpus text or rerunning the exam. It found two real guard gaps: `post-fix` could compare different frozen inputs, and the baseline engine-diff check was too narrow. The evaluator now pins a post-fix run to baseline document/label hashes and checks changes across `src/lib`, `src/domain`, and rule packs, permitting only the new evaluator files. This hardening changed no writing-engine behavior or baseline data. The reviewer also cautioned that concept tags remain contested (accepted and made explicit above) and that v1 call policy is not a v1 output comparison (accepted and stated above). No review finding was dismissed as incorrect.

`pnpm lint`, `pnpm typecheck`, `pnpm test` (458/458), `pnpm rules:validate` (64 valid rules), and `pnpm eval:semantic` (48/48 meaning, 13/13 voice) passed. The full suite includes clean, adversarial, metamorphic, and property-style tests; a focused run of those test files passed 60/60. `pnpm eval:holdout validate` confirmed all frozen fingerprints. The default `pnpm build` failed in this sandbox when Turbopack tried to bind a local port while processing CSS (`EPERM`); the documented `pnpm build --webpack` completed successfully. There were no UI changes, so browser verification would add no signal. No deployment, push, paid API, or local-model benchmark occurred.
