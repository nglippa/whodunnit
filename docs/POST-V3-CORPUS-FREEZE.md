# Post-V3 comparison corpus freeze

The corpus freeze follows protocol commit `85bd0ca9bfb14afd1e1d989acdecb5c319c73ca9`. The frozen manifest SHA-256 is `25e8af5b82cdc5fe4954cf9166b8729f889e078fce129ce6ef0fb21913942cfe`. It contains 40 cases from four creators, with two independent reviews per case.

Four pre-freeze draft contexts were replaced: three CREATOR-03 quality-screen cluster replacements and PVC-008, whose CSV instruction had an independently detected exact phrase overlap with V2. The final corpus contains all 40 cases. The creation-history record is a retrospective custodian attestation; original bytes and hashes do not survive for the first three retired drafts or the listed early expansions and quality revisions. Reviewer-02's ID-only correction is recorded with the original submission preserved. No frozen artifact was edited and no case was removed after freeze.

The independent integrity audit is **PASS**. The truthful secondary-tag audit is **FAIL**: `dates_times` is unsupported for PVC-008 and PVC-009. The additive independent disposition opinion says the preregistered primary comparison remains valid. Preserve all frozen IDs and annotations; do not recategorize or exclude either case. Report the downstream `dates_times` cohort as recorded and conspicuously disclose that its membership includes these two unsupported annotations. This prevents clean inference from that secondary cohort.

Custodian disposition: proceed only for the preregistered primary/overall comparison; this metadata limitation prevents clean `dates_times` secondary-cohort inference; no outcome-based relabeling. This is not a full audit PASS.

No RAW or architecture work was performed. Incremental paid spend: $0. No push or deploy.

The requested next-task ordering differs from the committed preregistration: its freeze sequence requires all four candidate implementations to be frozen while implementers cannot access the corpus, RAW, or outputs, then generates one RAW per case only after implementation freeze. The committed preregistration governs: first implement and freeze the candidates behind that blind boundary, then generate and freeze one RAW per case, then run the same RAW through V15 and each candidate. No work on these steps is included here.
