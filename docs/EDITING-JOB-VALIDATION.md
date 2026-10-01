# Editing-job feasibility development validation

## Decision

**Holdout V3: NO-GO. Keep `semantic-review.v3` and `reconstruction-v7` unchanged.** The pinned review-all run on 90 frozen synthetic development documents preserved the first editor's 40 clean diagnoses, but it did not identify a partially safe, blocked, or substantive case at the corresponding scope. The experiment also exposed a label-definition problem: editors often disagree about whether absent information is required for the *current writing edit* or for a possible later deliverable. A job-level contract may be useful, but these results do not demonstrate that adding one would improve decisions.

No frozen Holdout V1/V2 was read or run. Holdout V3 was not generated. No rewriting model, metered API, or local model was called. Production `reconstruction-v1`, experimental v5/v6/v7, and semantic-review.v3 were unchanged.

## Corpus and blind process

Eight independent account-backed creators wrote synthetic drafts from an editorial brief without engine details. A/B/C drafts were initially too much like editing briefs; their pre-freeze revisions became mostly clean controls. D/E/F supplied new standalone drafts. G/H drafts were revised once because a separate plausibility audit found many descriptions of how another text should be edited. The final [pre-freeze audit](../data/fixtures/editing-job-validation/prefreeze-audit.json) records the selection before any engine request. **90 of 182 generated candidates** were selected for genre, length, source plausibility, and editorial diversity. This is a development set assembled through iteration, never a blind holdout.

Primary editors received only document ID, text, and the [annotation rubric](../data/fixtures/editing-job-validation/review-rubric.json). They described material jobs, exact source evidence, required missing propositions, prohibited inferences, scope, coupling, and feasibility. A separate editor covered **52/90** documents. First-review labels are retained as the comparison reference; disagreements remain flagged and are not silently adjudicated. Creator requests are stored separately and were excluded from semantic-review requests.

The `reviewer` values in the frozen blind-review file are **batch identifiers**, not agent identities. Separate creator, repair, and second-review account-backed session IDs are recorded in [reviewer provenance](../data/fixtures/editing-job-validation/reviewer-provenance.json). This post-freeze clarification does not alter any document or annotation.

| Dimension | Count |
| --- | ---: |
| Scope: leave alone / local / distributed light / substantive | 40 / 29 / 13 / 8 |
| Feasibility: safe / partially safe / blocked | 75 / 9 / 6 |
| Gold jobs: safe / partial / blocked | 64 / 2 / 14 |
| Coupling: not applicable / independent / partially coupled / global | 40 / 31 / 11 / 8 |
| Length: under 80 / 80–199 / 200–599 / 600+ words | 1 / 46 / 41 / 2 |

The 80 jobs comprise 29 clarify, 13 add information, 12 deduplicate, 10 reorganize, 10 compress, and 6 surface existing information. Genres include healthcare operations, technical reports, academic discussion, policy, customer correspondence, project updates, procedural notes, personal writing, and community communications. The median is 197 words and the longest is 781. The set has fewer long and genuinely partial cases than intended. Attempts to raise the partial count by making missing facts obvious produced implausible editing briefs; those were excluded. This shortfall limits the feasibility conclusions.

Of 52 second reviews, **38 agreed on scope**, **44 on document feasibility**, and **40 on coupling**. Independent conceptual coding paired **36/55** first-review jobs with a second-review job and **36/46** in the reverse direction; 18 documents had no jobs in either review. Among eight first-review partial cases with a second review, only **three** were also called partial. Among five first-review blocked cases with a second review, only **two** were also called blocked. Eight selected documents carry explicit feasibility-dispute flags. Agreement measures editorial stability, not truth.

Only six conceptually matched job pairs named a required missing fact. Manual comparison found the same core missing proposition in all six; one H13 pair disagreed on whether board approval was also required. This conditional six-pair agreement should not be generalized to all missing-fact annotations.

The [manifest](../data/fixtures/editing-job-validation/manifest.json) was written and validated **before** exporting v3 requests. It fingerprints documents, labels, secondary reviews, creator requests, pre-freeze audit, and rubric. The pinned document SHA-256 is `38a40775f3287699da857fbfba24c910e5834c003dbc0fd75dc48f652321f149`; label SHA-256 is `ba1ecbe9a8c2cb6186245a74318f472dc7c92c1d514098c411f4e751db9b9a52`. Tests pin both plus the blind-review fingerprint. **Do not tune against this frozen development set or turn its outputs into expected detector fixtures.**

## Pinned v3 review-all baseline

`pnpm eval:editing-jobs requests` exported v7 deterministic plans plus the pinned v3 system prompt from the frozen documents. Ten account-backed agent batches reviewed nine documents each. Their transport saw no gold or creator request. The [saved responses](../data/fixtures/editing-job-validation/reviewer-output.json) and [execution record](../data/fixtures/editing-job-validation/review-execution.json) preserve IDs, batch hashes, contract, and output hash. `pnpm eval:editing-jobs audit data/fixtures/editing-job-validation/reviewer-output.json` verifies both request and saved-output fingerprints, then replays through v7 with a fake client and no external call. **90/90** reviews passed schema and exact UTF-16 span validation. That validates response shape, not editorial correctness.

The immutable initial [baseline summary](../data/fixtures/editing-job-validation/baseline-summary.json) records these matrices. Below, “diagnosis” is the reviewer's scope; “final” includes deterministic v7 reconciliation.

| First-review scope | N | Exact v3 diagnosis | Exact final scope | Main behavior |
| --- | ---: | ---: | ---: | --- |
| Leave alone | 40 | 40 | 39 | One deterministic local rule survives the reviewer brake (C05). |
| Local | 29 | 15 | 12 | Fourteen diagnosed leave-alone. |
| Distributed light | 13 | 0 | 0 | Eight diagnosed local; five leave-alone. |
| Substantive | 8 | 0 | 0 | Four diagnosed distributed light; four leave-alone. |

For document feasibility, **75/75** first-review safe cases received `SAFE_WITH_SOURCE` or neutral `NO_EDIT_NEEDED`; **0/9** partial cases received `PARTIAL_ONLY`; **0/6** blocked cases received `NEEDS_INFORMATION`. The latter two rates include disputed labels. Three of eight second-reviewed partial labels and two of five second-reviewed blocked labels were independently affirmed; v3 recognized none of those agreed cases either. There were **no reviewer-imposed false blocks** and **no `BLOCKED_PENDING_INFORMATION` execution decisions**.

V3 named missing information in **one** document, F14, while still returning `SAFE_WITH_SOURCE`. It noticed missing route evidence but did not distinguish a safe narrower correction from the blocked final route recommendation. Conservative post-run job coding found **29/64** safe jobs explicitly recognized, **1/14** blocked-job missing propositions named, and **0/14** blocked jobs represented as blocked editorial work. The 2 first-review `PARTIAL` jobs were not recognized. These are qualitative coding judgments, not automatic semantic equivalence tests. The [coding](../data/fixtures/editing-job-validation/job-match-coding.json) preserves each decision.

Among 20 documents whose creators intended some information to be absent but whose blind first editor labeled the writing clean, v3 diagnosed all 20 leave-alone and v7 left all 20 unchanged. Creator intent is not an independent information-sufficiency label. F07 is the opposite risk: its first editor identified only a blocked substantive job, while v7 selected a distributed edit after the reviewer reported full safety. This is a **potential unsafe authorization**, not proof of factual invention; no rewrite occurred. F14 has a safe narrow job and a blocked final recommendation, but v7 has no job-level representation to enforce that boundary.

All eight first-review substantive documents were marked globally coupled, yet none received substantive v3 diagnosis or execution. Coupling alone does not prove that a global rewrite is warranted. No selective routing or final reconstruction was evaluated.

Post-run job coding found safe operations recognized in **23/33** jobs on documents labeled independently coupled, **4/14** on partially coupled documents, and **2/17** on globally coupled documents. The pattern is consistent with local edit recognition being stronger than global organization recognition, but both coupling and job recognition are editorial annotations with limited agreement.

## Independent audit and interpretation

An independent account-backed reviewer inspected the method, baseline, and 15 sampled source/label/output triples without altering the engine. It confirmed that **90 accepted means valid structure**, not correct judgments, and that clean diagnosis (40/40) differs from unchanged final execution (39/40). It found real absent operational facts in F07/F14/H17/H23, but also questioned several first-review jobs that seek a future deliverable rather than an edit to the supplied document. A11/A12/H20/G15 are especially sensitive to that distinction; H15's proposed desk-script deduplication refers to wording outside the provided source. Those critiques are accepted as limits on the gold labels, not used to change the frozen labels. The audit does not establish that v3 made any actual unsafe edit because no text was generated.

A separate read-only code audit identified two evaluation-provenance gaps: audit mode accepted any ordered saved-review file, and the blind-review batch names could be mistaken for creator identities. Replay now checks the recorded request and output hashes, and the post-freeze reviewer-provenance file records distinct sessions. Neither fix changed v3/v7, the frozen corpus, saved reviews, or baseline results.

**Architecture decision: keep v3/v7 pinned.** The scalar feasibility result is visibly unable to attach F14's missing route evidence to the specific blocked recommendation, so a job-level representation is a credible hypothesis. The stronger uncertainty is whether the requested deliverable is part of the input at all. When editors see only a document, deleting or qualifying an unsupported claim is often a complete safe edit, while supplying evidence for a future claim is a different job. Changing the schema now would confound that input-definition problem with reviewer capability. No semantic-review.v4 or reconstruction-v8 was created; there is no post-change replay.

## Exact next experiment

Create a **new** development set of source-document × explicit user editing objective pairs, with independent editors labeling jobs and feasibility from both inputs. Include the same source under two legitimate objectives: (1) safely improve the current wording and (2) deliver a specific answer, recommendation, or operational instruction that requires a named absent fact. Include clean information-incomplete controls and buried-fact negatives. Require agreement that at least one safe and one blocked job coexist before testing a versioned job-level contract. Compare pinned v3 against that contract on the new set once, with no paid API, local model, final rewrite, routing optimization, or frozen holdout. Holdout V3 remains deferred until the state model is stable.
