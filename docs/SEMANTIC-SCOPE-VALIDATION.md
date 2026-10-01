# Fresh semantic scope validation (development, 2026-09-30)

## Decision

**NO-GO for creating blind Holdout V3.** Pinned `semantic-review.v3` and `reconstruction-v7` preserve clean writing well and make substantive scope reachable, but they do not yet separate fully safe from partially safe editing reliably. Review-all identified only 3 of 10 undisputed substantive cases as substantive. The corpus contains no blind-labeled `SUBSTANTIVE_RECONSTRUCTION + BLOCKED_PENDING_INFORMATION` case, so that required state remains unvalidated. Production `reconstruction-v1`, v5, v6, and the v2 prompt were untouched.

This is a development-set result from saved account-backed reviewer responses, not evidence about unseen documents, final rewrite quality, or a live paid provider. Neither frozen Holdout V1 nor V2 was read or run. Holdout V3 was not generated.

## Corpus and separation

Five independent account-backed creators received only an editorial brief. They authored 122 synthetic drafts in `/private/tmp`; 23 were excluded **before** freeze for conspicuously planted wording, internally conflicting facts, or implausible genre. The [pre-freeze log](../data/fixtures/semantic-scope-validation/prefreeze-audit.json) lists every exclusion. There are 99 retained documents from creators A/B/C/D/E: **25/24/26/13/11**. No private user writing or licensed third-party text was used.

| Length | Documents | Primary editorial scope | Documents |
| --- | ---: | --- | ---: |
| Very short, under 80 words | 19 | Leave alone | 58 |
| Short, 80–199 | 20 | Local edit | 19 |
| Medium, 200–599 | 50 | Distributed light edit | 12 |
| Long, 600+ | 10 | Substantive reconstruction | 10 |

The longest document is 1,136 words. The corpus uses many genres; the most frequent are project memo (8), casual email (6), personal reflection and healthcare operations (5 each), and meeting notes and FAQ (4 each). The [documents](../data/fixtures/semantic-scope-validation/documents.json) retain each original genre label. Primary information labels are **68 sufficient, 24 partial, 7 critical missing**; primary rewrite-feasibility labels are **87 safe, 11 partially safe, 1 blocked**. Creator requests are stored separately and never entered model requests.

Four blind annotators covered 22 disjoint documents each. Two more annotated a prespecified 44-document overlap; a separate pair annotated the 11 retained E documents. Thus every document has a primary label and **55/99 have a second independent label**. The gold file preserves the first label, with disputes flagged rather than silently adjudicated. On the 55 overlaps, exact agreement was **45/55 scope, 42/55 information sufficiency, 48/55 feasibility**; substantive-vs-other agreement was **54/55**. Scope agreement by length was 8/10 very short, 11/13 short, 21/26 medium, and 5/6 long. Ten scope disputes are excluded from hard scope rates. The [blind reviews](../data/fixtures/semantic-scope-validation/blind-reviews.json) retain both rationales. This is first-reviewer gold with challenges, not consensus truth.

The [manifest](../data/fixtures/semantic-scope-validation/manifest.json) froze documents, labels, blind reviews, creator requests, and the pre-freeze log **before** reviewer requests were exported. SHA-256 fingerprints are checked by `node --import tsx tools/eval/scope-validation.ts integrity` and a unit test. The document fingerprint is `d8fd46585f5b3f2a76cece6598822b65cb1ca3896888a1da431ed6866fe64968`; label fingerprint is `e6ec6bd23bc64be80a7f06457dfef80fc05e68840ec75aa99cd95d6f01128209`; blind-review fingerprint is `c44185a8e1c9a1ab78dded3b0d6de227a8b9c2b53ed1b2f11804daeeae4a88ad`. The input bundle contains no engine outputs.

## Execution and limitations

The [request exporter](../tools/eval/scope-validation.ts) generated v7 deterministic plans and pinned v3 requests from the frozen documents. It exported no gold labels or creator intentions. Ten account-backed agent batches applied the pinned prompt and [transport schema](../data/fixtures/semantic-scope-validation/reviewer-transport.md). No metered API, Groq call, local model, rewrite model, or second family was used. A second family could not be positively verified as zero incremental cost. Account-agent runtime settings and true reviewer latency/token counts are unavailable, so this is **single-family, account-backed contract validation**, not a precise reproduction of a configured production API call.

One parallel dispatch partially succeeded before reporting a thread limit. A duplicate batch-1 job was stopped before writing; a second batch-2 job overwrote the original saved file before cancellation. The replacement batch-2 file was retained by file state without comparing answers. [Execution provenance](../data/fixtures/semantic-scope-validation/review-execution.json) records batch hashes and hashes binding the frozen manifest, request bundle, saved output, and local replay. This deviation limits strict one-pass reviewer reproducibility, though no contract or engine threshold was changed.

All **99/99** saved responses passed the pinned Zod schema and exact UTF-16 evidence-span validation; the independent auditor checked **167** saved evidence and counterevidence spans. Acceptance proves shape and quotation integrity, not editorial correctness. [Saved responses](../data/fixtures/semantic-scope-validation/reviewer-output.json) can be replayed with `node --import tsx tools/eval/scope-validation.ts audit data/fixtures/semantic-scope-validation/reviewer-output.json`. Replay output lives in `.evaluations/` and contains no source text. No raw user text entered telemetry; every source was synthetic.

## Review-all diagnosis and execution

Rates below exclude the ten disputed scope cases. “Diagnosis” is the accepted reviewer disposition. “Execution” is v7 reconciliation after evidence and feasibility checks.

| First-reviewer gold | N | Exact diagnosis | Exact final scope | Main error |
| --- | ---: | ---: | ---: | --- |
| Leave alone | 55 | **54** | **53** | One semantic false edit; one deterministic edit survives a reviewer brake |
| Local edit | 17 | **13** | **9** | Minor findings are often held below execution threshold |
| Distributed light edit | 7 | **5** | **3** | Several supported diagnoses remain unchanged |
| Substantive | 10 | **3** | **3** | Six diagnosed as lighter scope; one as local |

Across 89 undisputed cases, diagnosis made **2 scope overcalls and 12 undercalls**; final execution made **2 overcalls and 19 undercalls**. There were **zero false substantive diagnoses**: all three substantive recommendations matched first-reviewer substantive labels. The deterministic preliminary plan was exact for 55/89 and left 32 gold-edit cases too narrow. Review-all escalated final scope in 20 cases and de-escalated one. These are scope comparisons, not rewrite outcomes.

The four clean-writing false-positive details matter: the reviewer diagnosed 54/55 undisputed clean cases clean; v7 left 53/55 unchanged. In **B19**, a procedure, the reviewer said leave alone with no findings, but the deterministic local finding remained authoritative and produced `LOCAL_EDIT`. In **C09**, the reviewer marked a phrase as locally misleading despite a later explicit clarification. Neither was changed after inspection. Clean writing with missing information was mostly handled correctly: all 14 undisputed clean documents with partial or critical information labels were diagnosed leave alone and left unchanged.

Among substantive gold cases, v3 diagnosed **1/5 safe** and **2/5 partially safe** at substantive scope: A29, B14, and C30. All three proceeded as fully safe substantive execution; the two partially safe cases were not identified as partial. A09 is a one-paragraph substantive label; v7's distributed-span requirement across multiple blank-line paragraphs prevents the stronger execution scope on that form. This is a general structural limitation to investigate separately, not a reason to change the pinned contract during validation.

### Feasibility is the limiting result

For 81 comparable `SAFE` gold cases, v7 returned `SAFE_WITH_SOURCE` or neutral `NO_EDIT_NEEDED` in all 81. For **nine actionable, undisputed `PARTIALLY_SAFE` cases, it returned `SAFE_WITH_SOURCE` in all nine**; eight were authorized for an edit. The sole gold `BLOCKED_PENDING_INFORMATION` case, C05, was diagnosed `LOCAL_EDIT + NEEDS_INFORMATION` and execution was blocked correctly. There were **zero false blocks** and **zero approvals of that fully blocked case**. No first-reviewer gold case combined substantive scope with fully blocked feasibility, so the required fourth state has no direct validation. Two clean E cases with non-safe primary labels expose an annotation-rubric ambiguity: feasibility of an unnecessary hypothetical rewrite differs from feasibility of the actual no-edit decision. They are not counted as actionable partial cases. The frozen E05 `feasibilityDisputed` flag marks this construct ambiguity even though its two annotators both said partially safe; it must not be misreported as reviewer disagreement.

`SAFE_WITH_SOURCE` might still permit a conditional or narrower safe edit, and no text was rewritten here. The result shows that missing dependencies were usually **not represented** in the reviewer output: 10/11 primary partially safe cases lacked `missingInformation`. It cannot establish an actual hallucination, but it cannot certify full-rewrite feasibility either. No case tested safe narrow editing under a globally blocked substantive diagnosis.

## Evidence, genre, short text, and routing

The paragraph-role map was complete for 99/99 documents. Possible restatement links appeared in **5/10** undisputed substantive and **4/7** undisputed distributed-light cases, and in **0/55** undisputed clean cases. Those links were useful evidence for some recurring propositions (A29, B14, C26, C29), neutral where the broad issue was organization or a conflicting decision (C30), and are not independent proof of semantic equivalence. Only one substantive case received a `RESTATES` paragraph role, so the role map alone misses most global scope issues. Literary critique A04 and editorial critiques C06/C28 were left alone; editable feedback C20 received a local diagnosis. Exact spans establish grounding, not correctness of the inferred relationship.

Genre recognition remained uneven: A06 interview was classified prose; B01 policy and B02 procedure were unknown; B19 procedure was classified prose and retained deterministic edit pressure; several notes and FAQs were called prose or unknown. The reviewer often preserved structured writing despite classifier uncertainty, but A16 interview, B12 notes, and E12 procedure note were missed edit cases. These are associations, not proven causes.

No response used `INSUFFICIENT_EVIDENCE`, including the 19 very-short documents. Among undisputed very-short cases, review diagnosis kept **13/13 clean** clean and detected **4/4 problematic**. The absence of abstention means short-text uncertainty was not exercised, even though the observed decisions happened to agree with those labels. By length, undisputed clean/problem detection was: short **11/12 and 4/6**, medium **25/25 and 18/20**, long **5/5 and 4/4**.

Only **55/99** documents triggered the current selective router: 27/55 undisputed clean, 10/17 local, 4/7 distributed, and 7/10 substantive. On all 41 first-reviewer edit labels, routing requested 28. The selective counterfactual produced an edit in **14/41**, versus **22/41** under review-all. Six undisputed cases where review-all selected the exact gold scope would be lost solely to routing (A05, B02, B09, C07, C14, C30); C30 would fall from substantive to unchanged. This is replay substitution on the same saved reviews, **not live selective model performance**. Routing remains downstream of diagnostic quality and was not tuned.

## Independent audit, gates, and next decision

An independent account-backed auditor reviewed frozen metadata, annotations, saved responses, evaluator code, aggregate replay, and sampled disagreements without modifying the engine. It confirmed substantive undercoverage, routing losses, missing-information omissions, the two different clean-pressure causes, first-reviewer gold provenance, and the limits of 99/99 schema acceptance. It found no user documents in artifacts and no proven annotation leakage; the exact runtime agent prompts/settings cannot be independently reconstructed from repository files. Its E05 finding exposed the feasibility-label interpretation issue above. The evaluator CLI's initial top-level-await CJS launch error was corrected **before** the first review request; no writing-engine change or engine rerun followed. No frozen input was modified after the manifest was created.

Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` (**520 passing**), `pnpm rules:validate` (64 valid rules), 48/48 meaning fixtures, 13/13 voice fixtures, the 108-case discourse development replay, the existing semantic development replay, and substantive-control replay passed. The documented `pnpm build --webpack` production build passed. One repeat invocation of the `tsx` CLI hit an environment IPC `EPERM`; `node --import tsx tools/eval/cli.ts semantic` reran and passed all 61 fixtures. No browser check was needed for this CLI/data-only change. The pre-existing paid-provider deny-by-default tests cover metered frontier, worker, judge, and unverified remote routes; no real paid call was made.

**Single next architectural experiment:** establish the meaning of `PARTIAL_ONLY` on a *new* focused development set with an explicit proposed editing job per document. Independently label (1) what can be copy-edited now, (2) what full reconstruction would require, and (3) the exact absent facts. Include naturally occurring substantive-plus-blocked examples only when editors independently agree they exist. Test v3 review-all against those orthogonal labels before considering a versioned contract change. Do not use this 99-document set, frozen Holdouts V1/V2, or a newly generated Holdout V3 to tune thresholds. Once feasibility and substantive scope are both demonstrably useful, route optimization and blind Holdout V3 can follow.
