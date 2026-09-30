# Independent writing holdout

This exam is separate from development fixtures, the clean and adversarial corpora, and model benchmark cases. Three corpus creators received only Whodunnit's product purpose and broad genre/length targets. They did not inspect rules, thresholds, fixtures, or engine output. The third creator supplied additional medium and 1,000+ word documents after a pre-freeze length audit found a 247–626-word gap and long documents clustered near 600–730 words. Two independent blind reviewers received only document IDs and text: one reviewed a substantial sample of the original corpus, and one reviewed the supplement. Neither saw creator labels or engine output. Every document is newly authored synthetic writing.

Before freeze and before any engine run, a read-only editorial audit caught one accidental pasted paragraph at the end of C035, evidently belonging to C034. That paragraph was removed from C035. The fixed document was not in the blind-review sample. This correction addressed corpus validity, not detector behavior. The audit also flagged P017/P018 as possibly padded and M005/M018 as conspicuously self-critical; these were retained as possible real-world failure modes and should limit claims about natural sampling.

## Freeze and provenance

The creator drafts and blind-review handoff remain local in `data/evaluation/holdout/drafts/`. `pnpm eval:holdout freeze` separates source text from gold labels, records reviewer disagreements as ambiguity, fingerprints exact document, label, and review bytes, and refuses to overwrite frozen files. The tracked exam is in `data/evaluation/holdout/frozen/`. `pnpm eval:holdout validate` checks fingerprints and cross-file IDs before any run. No normal rule-development command writes this directory.

Gold labels are never passed into `buildRewritePlan`. The evaluator passes only source text with the Natural preset. It imports deterministic planning modules and no provider. It records the production v1 model-call policy separately from the experimental v3 unchanged decision. A v1 model call is *change pressure*, not an observed model rewrite.

## Interpretation

- Human dispositions are `LEAVE_ALONE`, `LIGHT_EDIT`, and `SUBSTANTIVE_RECONSTRUCTION`. Concept labels describe the writer's judgment, not rule IDs.
- Reviewer disagreement on disposition marks a case `ambiguous`; these cases remain visible but are excluded from hard error rates.
- A detected rule category is only a coarse proxy for concept coverage. A matching category does not prove understanding of the particular defect. Unsupported strengthening generally needs a before/after comparison, so this single-source exam cannot assess it directly.
- Localized span coverage excludes document-wide metric findings; those are reported separately. It estimates reconstruction pressure, not actual changed words.
- Times are per-document wall times for two deterministic plan builds on this machine. They have no prior runtime baseline and do not establish a regression.
- The Natural preset may create pressure on legitimate formal writing. This is a specific condition of this exam and should be considered when interpreting formal cases.

The baseline command is `pnpm eval:holdout run baseline-62259e8`. It writes one immutable JSON report and refuses overwrite. A single `post-fix` run is reserved for a justified general correction. Neither command makes model calls. Model comparison remains a separate later experiment; this holdout's gold labels must never enter a reconstruction prompt.
