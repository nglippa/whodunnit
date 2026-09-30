# Blind discourse holdout V2

## Status and use

**FROZEN HOLDOUT — DO NOT TUNE AGAINST THIS CORPUS.** This is an independent exam for the experimental reconstruction-v5 planner. It is not a rule-development fixture, a prompt corpus, or a model benchmark. Production reconstruction-v1 is unchanged. Do not expose the frozen documents or annotations to reconstruction prompts or model workers. Do not rerun this holdout during engine development. Future generalization work needs a fresh holdout.

The corpus consists of newly authored synthetic documents. No private drafts or licensed third-party text were used. Multiple independent authors received only an editorial brief. Two independent reviewers received document IDs, text, and an editorial rubric; they saw no creator requests, engine implementation, findings, or planner decisions. Disposition disagreements become `AMBIGUOUS` and are excluded from hard clean/problematic rates. Concept labels require both reviewers to select a concept. Genre disagreement produces a null gold genre and is excluded from genre accuracy.

## Frozen files

`data/evaluation/holdout-v2/frozen/` contains documents, creator briefs, two blind reviews, adjudicated labels, a manifest, and SHA-256 fingerprints. The creator briefs are provenance, not gold labels. Exact-byte validation checks all frozen data and derives labels again from blind reviews. The manifest carries `FROZEN_HOLDOUT_DO_NOT_TUNE`. Run `corepack pnpm eval:holdout-v2 validate` to check integrity without invoking writing analysis.

The manifest also pins the pre-audit Git revision and a SHA-256 fingerprint of the domain, library, rule-pack, evaluator, and package sources. The audit refuses changed **fingerprinted source files** or a manifest hash other than the hash declared after freeze. This protects the one-shot comparison from an unnoticed source/file swap within that scope; Git history protects the committed artifact afterward. The fingerprint does not include `pnpm-lock.yaml`, the resolved dependency tree, or the Node runtime.

The one-shot CLI writes a lock before analysis and refuses a second run. It writes per-document outcomes without raw document text to `reports/one-shot.json`. If aggregate reporting needs correction, recalculate from that stored record; do not run the plans again. Any bug requiring another engine pass must be disclosed explicitly. Unit tests use separate synthetic validation items and never assert desired engine behavior on frozen documents.

## Audit protocol

The audit runs only deterministic analysis and planning, once per frozen document for each configuration:

1. Published reconstruction-v1: pattern pressure; it has no unchanged bypass, so its prospective model-call count is a **policy implication**, not an observed rewrite.
2. Reconstruction-v3: historical minimal-change, source-voice planner. This is the meaningful prior planner disposition baseline.
3. Reconstruction-v5: experimental discourse planner, including document structure and distributed findings.

Only document `text` enters `buildRewritePlan`; creator briefs, reviews, labels, and rationales remain outside the reconstruction input. No provider is imported by the audit CLI, and no rewriting model is called. A finding is an editing reason, never an authorship probability. The report separates restraint, coverage, planner scope, genre, length, concept overlap, and runtime. It contains no composite quality score. A concept overlap is a proxy requiring editorial inspection, not proof that the engine understood the concept.

## Pre-freeze editorial changes

An independent editorial auditor inspected the drafts before any review or engine run. The following corrections were made before the blind review batches were assembled:

`data/evaluation/holdout-v2/editorial-changes.json` records each affected text's before/after SHA-256 fingerprint and the editorial reason. It contains no engine output.

| IDs | Editorial issue | Correction |
| --- | --- | --- |
| B015 | Text described its own need for editing | Removed the self-assessment while retaining a calendar announcement with a localized wording issue |
| B002 / D008 | Two device procedures overlapped in task and wording | Recast D008 as a label-printer procedure |
| A022 / D031 | Two accounts shared a ferry worker and episode | Recast A022 around a city archivist and disputed exhibition label |
| A024 / C032 | Two equipment FAQs followed nearly the same sequence | Recast C032 around traveling exhibition panels |
| E001 / E002 | Long policy and procedure identified their genres explicitly | Removed self-labeling while retaining standing rules and sequential instructions |

The B author did not record requested length bands (`UNSET`); actual bands are computed from text. Some author-requested light and substantive examples are editorial boundary cases. Blind reviews, rather than creator requests, determine the gold disposition. The freeze checks the predeclared structural minimum of 15 very-short and five 1,000+ word documents. It does not force a gold-label balance after blind review, since doing so would bias the annotation process.

Final frozen texts have unique IDs and exact content; the highest pairwise five-word-shingle Jaccard similarity observed in the 138-document set is 0.011. This is a lexical duplicate check, not proof of conceptual independence.

## Results

The single deterministic audit ran on 2026-09-30. Its immutable raw outcomes are in `data/evaluation/holdout-v2/reports/one-shot.json`; the `one-shot-started.json` lock prevents a repeat. The predeclared manifest fingerprint was `7745a23a0b6e839131601aaf75f483a34fccf279e1223182f482692574d8446a`; the document fingerprint was `3a64bfd41fa8e6b3fa0532d87ba63e878df2253edfadf6bae0b3b4adba74b0ff`; the gold-label fingerprint was `949542c8a1d7b2c7754b54415ecf7fd374c224c22a099c476b7cba31b96fa670`. The evaluated engine revision was `b99209a3c638411e5b0bb1481be9d43d2dde7971`, with source/config fingerprint `04f54963618f553ca12396d57bed26bb3057dea4bccb99461d9ff5e6dac19336`. The one-shot result SHA-256 is `57de9b9a53aa1a2f973d37259798cb559206fe302c3ddd47dbf0546495c2decf`.

The conversation record contains the manifest/document hash declaration before the audit call; the audit lock records a start time of `2026-09-30T09:08:31.610Z` and the same hashes. The committed repository captures the frozen files and audit result, but by itself cannot prove when the declaration was made or that reviewers lacked other access. Those are process claims supported by the isolated agent instructions and conversation record, not cryptographic properties of the files.

### Corpus and blind agreement

Five separate author roles wrote 138 new synthetic documents (A: 31; B, C, D: 33 each; E: 8 long-form supplements). The creators requested 47 leave alone, 45 light edit, and 46 substantive cases. The two blind reviewers independently annotated every document. Their adjudicated dispositions were **66 leave alone, 32 light edit, 30 substantive, and 10 ambiguous**. This shift toward clean labels was retained. A gold concept requires agreement by both reviewers; genre disagreements leave gold genre unset.

Creator roles worked from an editorial prompt in isolated temporary files without repository access. A separate editorial auditor found pre-freeze quality issues, and a separate editor repaired only the identified texts. Review work was divided into two 69-document batches of 24,989 and 24,990 words. Each batch received two independent reviewer agents using the same rubric and document-only files; `R1` and `R2` identify the two review lanes across batches, not a claim that one individual annotated the entire set. Reviewer outputs were merged by ID only after both lanes completed. No creator request or engine output entered a reviewer file.

| Actual length | Documents | Disposition agreement | Exact concept-set agreement |
| --- | ---: | ---: | ---: |
| Very short, <80 words | 16 | 14/16 | 10/16 |
| Short, 80–199 | 24 | 24/24 | 18/24 |
| Medium, 200–599 | 74 | 70/74 | 48/74 |
| Long, 600+ | 24 | 20/24 | 12/24 |
| All | 138 | **128/138 (92.8%)** | **88/138 (63.8%)** |

Mean document-level concept Jaccard was 0.804, counting two empty concept sets as agreement. Disposition disagreement IDs: A016, C003, C012, C018, C027, C030, C033, D002, E002, E005. Genre disagreement IDs: C006, C021, C024, D011, D032. All 10 disposition disputes are excluded from hard clean/problematic rates. Genre coverage is uneven: the 133 agreed genres comprise 60 prose, 20 email, 14 procedure, 11 FAQ, 11 notes, 6 interview, 4 policy, 3 transcript, 2 chat, 2 mixed, and no agreed list case. The intended domain spread included personal, healthcare, software, academic, institutional, support, procedure, policy, interview, FAQ, and notes.

Disposition agreement by the first reviewer's genre was prose 52/60, email 19/20, chat 2/2, transcript 3/3, interview 6/6, FAQ 11/11, procedure 15/16, policy 5/5, notes 13/13, and mixed 2/2. Exact concept-set agreement in those same groups was 35/60, 12/20, 1/2, 3/3, 4/6, 10/11, 10/16, 4/5, 8/13, and 1/2 respectively. These are small cells for most structured genres; the one-shot JSON retains the full breakdown.

### Planning and restraint

| Blind gold disposition | v3 unchanged | v3 light | v3 substantive | v5 unchanged | v5 light | v5 substantive |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Leave alone (66) | 50 | 16 | 0 | **56** | 10 | 0 |
| Light edit (32) | 24 | 8 | 0 | 28 | **4** | 0 |
| Substantive reconstruction (30) | 23 | 7 | 0 | 21 | 9 | **0** |

On this unseen corpus, v5 left **56/66 (84.8%)** unambiguous clean documents unchanged, versus v3's **50/66 (75.8%)**. Production v1 has no unchanged bypass: its policy would send all 66 clean documents to the reconstruction provider, even though only 16 had actionable local findings. This is prospective model-call pressure, not a measured rewrite or output quality result.

V5 proposed any edit on **13/62 (21.0%)** unambiguous documents needing work, versus v3's **15/62 (24.2%)**. It chose light editing for 4/32 light cases and 9/30 substantive cases; it chose substantive reconstruction for **0/30**. Exact disposition accuracy on problematic writing was therefore **4/62 (6.5%)**, because nine substantive cases were undercalled as light in addition to 49 misses. The clean-restraint gain came with a small net loss in problematic coverage. Compared with v3, v5 suppressed six clean and six problematic edit decisions, promoted four problematic and two ambiguous cases, and promoted no clean case. No model was invoked, so the measured outcome is a planner decision rather than a changed document.

### Incremental discourse evidence

The buckets below use v3's historical local edit decision and v5's actionable discourse findings. They exclude ambiguous gold labels.

| Evidence source | Clean | Light needed | Substantive needed | Total |
| --- | ---: | ---: | ---: | ---: |
| Local planner only | 16 | 7 | 6 | 29 |
| Discourse only | 0 | 1 | 3 | 4 |
| Both | 0 | 1 | 1 | 2 |
| Neither | 50 | 23 | 20 | 93 |

This is a **cross-planner** comparison: “local” means v3 would edit. It does not assert that v5 still acts on all 29 local-only cases. Within v5 itself, the stored outcomes give **17 local-only, 4 discourse-only, 2 both, and 105 neither** among 128 unambiguous cases. The original one-shot JSON remains untouched; this clarification was calculated from its stored outcomes after independent review, without a second engine pass.

Nine documents received an actionable discourse finding: six unambiguous problematic cases (A019, B031, B032, C015, D021, D027) and three disputed cases (C018, C030, C033). **None of the 66 unambiguous clean documents received an actionable discourse finding.** Four problematic documents (A019, C015, D021, D027) received useful edit pressure from discourse alone. All nine discourse actions were `DISTRIBUTED_LIGHT_EDIT`, never substantive. This is genuine, precise incremental evidence with narrow reach; the local-rule suppressions explain why total v5 coverage nevertheless fell.

Concept labels overlap, and an edited document is not proof that the matching phenomenon was understood. Among unambiguous documents needing work:

| Blind concept | Annotated | v5 proposed any edit | Direct relevant discourse proxy |
| --- | ---: | ---: | ---: |
| Genericness | 33 | 8 | 4 generic-register findings |
| Redundancy | 22 | 8 | 0 restatement findings |
| Mechanical structure | 7 | 2 | 0 mechanical findings |
| Register inflation | 30 | 5 | 3 generic-register findings |
| Empty significance | 22 | 6 | no direct discourse proxy |
| Formulaic argument | 7 | 1 | no direct discourse proxy |
| Local wording | 13 | 2 | no direct discourse proxy |

This is weak coverage for redundancy, mechanical structure, empty significance, and formulaic argument. The proxy counts deliberately avoid treating any unrelated finding as concept recognition.

### Length and document type

| Band | Clean unchanged | Problematic edited | Actionable findings | Advisory discourse findings | Insufficient evidence | v5 median / p95 / worst ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Very short (16) | 10/10 | 0/4 | 0 | 0 | 16 | 0.78 / 3.22 / 3.22 |
| Short (24) | 12/13 | 0/11 | 1 | 2 | 5 | 1.25 / 1.86 / 2.09 |
| Medium (74) | 26/32 | 8/38 | 15 | 17 | 1 | 2.60 / 3.52 / 5.41 |
| Long (24) | 8/11 | 5/9 | 15 | 1 | 0 | 7.40 / 9.89 / 10.26 |

The very-short planner was appropriately uncertain about distributed judgments and left every clean example alone, but it also missed four short texts that reviewers wanted edited. Short-text false negatives include plainly inflated local wording, which would not require a confident document-wide inference. Long documents did not produce a finding explosion: 15 v5 actionable items across 24 long documents. For the complete three-strategy deterministic pass, median/p95/worst wall times were 2.66/188.98/188.98 ms for very short, 4.10/6.42/9.77 ms for short, 8.21/12.22/19.32 ms for medium, and 23.59/28.49/30.62 ms for long. The very-short p95 reflects the first v1 cold-start call (183 ms); these timings are a single run, not a performance regression study.

The document-structure classifier matched **74/133 (55.6%)** agreed genre labels overall. Outside prose, it matched **24/73 (32.9%)**. It matched **24/26 (92.3%)** at confidence ≥0.8, but only 26/133 (19.5%) cases received such confidence. Its correct/total counts were prose 50/60, email 10/20, chat 0/2, transcript 2/3, interview 6/6, FAQ 6/11, procedure 0/14, policy 0/4, notes 0/11, mixed 0/2. There was no agreed list case. The two high-confidence mismatches were A027 (mixed classified email) and B009 (chat classified transcript). The deliberately unmarked E001 policy and E002 procedure were both classified prose; E001 stayed unchanged, while E002 had an ambiguous edit disposition and stayed unchanged. Genre errors matter because local structural protections failed on clean FAQs, notes, chat, and mixed material.

Among 25 clean documents jointly annotated with a voice device, v5 left 21 unchanged. Among 30 clean documents jointly marked with genre-justified structure, it left 24 unchanged. These groups overlap. They account for the 10 clean false positives below; no discourse finding drove those false positives.

The one-shot report's `mixed` field selects cases with a jointly annotated protective `VOICE` or `GENRE_JUSTIFIED_STRUCTURE` concept. All 50 such unambiguous cases are clean, and 40 remain unchanged. That field measures preservation of difficult clean controls, **not** performance on problematic documents that mix useful writing with a weak section. The latter appears in the missed-case audit and requires a more explicit future annotation design.

### Every clean false positive

| ID | Cause | Why an edit was unwarranted |
| --- | --- | --- |
| A011 | Voice | A single contrast distinguishes closeness from conversation in a precise family scene. |
| A017 | Structure | Dash-density counted six handoff list bullets as prose dashes. |
| A020 | Voice | A contrast clarifies that a supposed receipt is a feed-order scrap. |
| A023 | Genre | A timestamped two-person exchange was treated as self-answered prose questions. |
| C008 | Genre | Three FAQ question prefixes were treated as repeated paragraph openers. |
| C031 | Voice | Repeated openings serve distinct memories and perspectives in a long flood narrative. |
| C032 | Structure | Nine FAQ question prefixes were treated as repeated paragraph openers. |
| D019 | Structure | Dashes divide a receiving log into timed, fact-bearing entries. |
| D025 | Genre | A chat followed by bakery handoff notes was treated as repeated prose openings. |
| E007 | Voice | One meaningful contrast sits inside an extended, specific reflection on keys. |

These are 4 voice-context failures and 6 genre/structure failures. A017, C008, C032, and D019 are particularly clear structure errors; no holdout text or thresholds were changed after seeing them. E007 was requested as problematic by its creator, but both blind reviewers judged it clean. The blind gold decision prevails.

### Missed problematic writing

Forty-nine of 62 unambiguous light/substantive cases remained unchanged. A concept-diverse read of 16 misses found several distinct causes:

- **Short-text insufficiency:** A002, A010, C006 contain local inflated or empty wording yet receive no edit pressure. Conservatism about a distributed pattern is appropriate, but it should not erase clear bounded concerns.
- **Semantic judgment:** B008 promises improvement without specifying a change; E006 repeats an operational arrangement and adds a broad reflection. Neither is safely captured by word overlap alone.
- **Advisory evidence that never becomes an action:** B018, D009, and other cases have a generic-register observation but remain unchanged. Some suppression is appropriate for transcripts; some reflects weak aggregation or scope policy.
- **Localized weak regions inside useful documents:** B015, B022, B030, D017, D029, D032, and E004 have specific content with one broad or inflated section. Whole-document reconstruction would be disproportionate.
- **Distributed problems:** A022, B008, D009 and other cases repeatedly abstract or evade the actual decision. These need a document-level editorial judgment; a single phrase match is insufficient.

Missing concrete details must **never** be invented to fill a vague source. A future semantic reviewer should identify missing or redundant information as an editing reason, and the reconstruction path must preserve the source's factual limits. The holdout does not tell us whether a rewriting model could make a safe candidate.

### Interpretation and promotion decision

V5 did generalize one narrow capability: it found four additional unambiguous problematic documents from discourse evidence alone and made no unambiguous clean discourse hits. It did **not** generalize as a sufficient planner. Clean restraint was 84.8% on this difficult corpus, problematic edit coverage was 21.0%, and substantive coverage was 0/30. Genre handling failed on unmarked policy/procedure and many structured negatives. The evidence does not justify promoting v5 to production or adopting it as the sole planning foundation for cloud reconstruction. Production v1 remains in place; v5 stays experimental.

The remaining misses often require judgments about whether a paragraph adds information, whether formal language is necessary, and whether a document's specificity supports its length. The near-zero direct restatement and mechanical findings, together with the broad semantic misses, suggest that deterministic discourse detection may be approaching its practical ceiling for these phenomena. That is an architectural inference from this holdout, not proof that deterministic methods cannot improve. The next experiment should test **deterministic screening plus a narrowly bounded semantic review** of uncertain/unchanged documents against a *new independent* holdout, then compare planning scope and clean restraint before involving a frontier reconstruction model. Do not tune rules or thresholds on V2.

### Independent post-run review

Two independent post-run reviewers examined the frozen corpus and stored outcomes without running the engine or editing it. The editorial reviewer inspected all 10 clean false positives and 19 concept-diverse problematic misses. Its classifications matched the causes above: voice/genre errors on clean texts, short-text limits, advisory-only evidence, localized weak sections, and cases requiring semantic judgment. It judged broader reconstruction appropriate only for pervasive problems; isolated weak paragraphs needed local attention.

The methodological reviewer reconciled all 138 documents, 128 agreed dispositions, 10 ambiguous cases, 133 agreed genre labels, and frozen fingerprints. It found no arithmetic error in the primary matrices or timing bands. It flagged two **interpretation errors** in the first read of the report: the 29/4/2/93 evidence buckets mix v3 local decisions with v5 discourse findings, and the `mixed` field contains only clean protective controls. Both are now stated explicitly above; the v5-only buckets and 24/73 non-prose genre accuracy were recomputed from the stored outcomes. It also stressed that 49 unchanged problematic cases omit nine substantive cases undercalled as light, and that high-confidence genre accuracy applies to only 19.5% of agreed-genre documents. No evaluator bug required another engine run, and the one-shot record was not rewritten.

The reviewer correctly observed that file hashes prove internal consistency, while reviewer blindness and freeze timing also depend on the recorded protocol and the pre-run fingerprint declaration. The manifest hash was declared before the audit in the development record; the one-shot lock pins that hash and the engine fingerprint. It suggested enforcing a minimum number of clean and problematic gold labels. That suggestion was **not** adopted: changing the acceptance criteria after independent annotation would pressure reviewers or authors toward a target distribution. The requested author balance, complete reviewer coverage, 15 very-short documents, and five 1,000+ word documents were predeclared; the resulting gold imbalance is reported as evidence. No writing-engine behavior changed.

A final independent read-only diff review found no arithmetic mismatch, raw document text in the outcome report, near-duplicate passages, or production behavior change. It called the repository-only evidence for pre-run declaration and reviewer blindness a possible blocker. We accept the evidence limit and narrow the claim above: the conversation record, not the repository alone, establishes the declaration's sequence. It also observed that the source fingerprint omits the lockfile and runtime; that limit is stated above. It suggested tests for the existing-lock refusal and a saved-report checker. We did not add a new test that merely mirrors `writeFileSync(..., { flag: "wx" })` or alter the already-run evaluator. The committed report hash and Git history provide post-commit integrity; a future reporting command could validate the saved result without running the engine.

### Gates and remaining limits

Final checks passed: lint, typecheck, 494/494 unit tests, 64 validated writing rules, 48/48 meaning fixtures, 13/13 voice fixtures, frozen-file integrity, and the documented webpack production build. The unit suite includes the existing clean, adversarial, metamorphic, and property-style cases; its V2 tests use unrelated synthetic validation data. The default Turbopack `pnpm build` failed in this sandbox while PostCSS attempted to create a process and bind a local port (`EPERM`); `pnpm build --webpack` compiled and generated every page. This reproduces the previously documented environment restriction, not an application compilation error. One `tsx` CLI invocation also hit a sandbox IPC `EPERM`; the semantic fixtures passed through `node --import tsx`. No UI changed, so a browser flow would add little signal.

The blind reviews are capable agent editorial judgments rather than a population study of human editors. Concept agreement is weaker than disposition agreement; concept denominators use only intersections. There are no agreed `LIST` gold cases, and procedure/policy accuracy is limited by small and difficult genre samples. The historical v1 comparison measures provider-call policy and local finding pressure, not actual rewrites; no candidate text, semantic verification, or cloud reconstruction quality was measured. A single timing pass cannot establish performance regression. The frozen corpus and this result must remain out of rule or threshold tuning. No local model, paid provider, deployment, or push was used.
