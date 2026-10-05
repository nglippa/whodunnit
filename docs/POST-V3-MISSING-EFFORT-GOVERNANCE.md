# Post-V3 missing downstream effort: governance adjudication

**Decision: C — the current preregistered comparison is downstream-unexecutable and must be closed; a separately prospectively registered comparison is required for any future execution.** This is a governance decision, not an effort selection, execution authorization, outcome judgment, or new protocol. The original RAW run remains a frozen, valid-with-limitation historical artifact. No V15/A/B/C/D output, blind judgment, or score existed when the defect was found. A successor may cite or conditionally reuse frozen material, but cannot claim that an effort chosen after corpus creation was pinned by the original preregistration.

## 1. Chronology and detection

Times are UTC, from committed Git history and the [prior protocol chronology](POST-V3-PROTOCOL-ADJUDICATION.md#frozen-evidence-and-chronology). The restoration record is in the [latest effort proof](POST-V3-DOWNSTREAM-EFFORT-PROOF.md#2026-10-05-restoration-and-checkout).

| Event | Commit or record | UTC time | Consequence |
| --- | --- | --- | --- |
| Architecture preregistration | `f40a54caed05a295f540bd8f0876a6ce858008c9` | 2026-10-03 09:22:30 | Hypotheses, measures, freeze order, and decision rules registered. |
| Operational manifest | `85bd0ca9bfb14afd1e1d989acdecb5c319c73ca9` | 2026-10-03 09:51:07 | CLI/model and a pre-call settings hard stop registered; exact downstream effort omitted. |
| Corpus and prelabels | `0bace0834bf5f85b4bc9ae3d29311badcd2adacc` | 2026-10-03 10:33:10 | Forty source/objective pairs and two original prelabel sets frozen. |
| Candidate implementation | `26bc2c865d177a8ff0c80c4836932aaccc0d3bdf` | 2026-10-03 11:45:02 | A–D code committed. |
| Candidate manifest | `19ccd7569403058d6afd7086ad3bf8a0ce836b25` | 2026-10-03 11:54:18 | A–D and unchanged V15 dependencies hashed. |
| RAW generation contract | `7acb2bb5246400e8d792d13979e204f4cb9b765e` | 2026-10-04 05:45:23 | Explicit, narrow RAW-only amendment committed before RAW call 1. |
| RAW authorization | `raw-attempts/pre-call-authorization.json` | 2026-10-04 06:20:45.855 | RAW runner/verifier hashes authorized. |
| RAW run and freeze | `e3445408552e0bdaa208e17623df53d0e25a1e21` | 2026-10-04 07:08:06 | Forty attempts, 36 accepted RAWs, four technical failures, zero retries. |
| Protocol adjudication | `91219a65bb0101e609b3fa17e904298a2ae5b4cf` | 2026-10-04 07:33:42 | RAW validity qualified; only offline downstream readiness was next. |
| Downstream feasibility | `9619e7db6a9e98047ec048f9fc66cb307c13f740` | 2026-10-04 09:00:04 | Defaults and dynamic settings investigated; no downstream value registered. |
| Pre-call state | `88dd42399f36f70ff8d203ee93158189e07b3123` | 2026-10-04 09:30:12 | `<proof.effort>` explicitly recorded as unfilled. |
| Pre-call authority and acquisition | `fa140a8e7bbec7c4be75c867b66473d9f3028ea6`; `d804df21c4d2f6d58ff2b320d8ea4fbaec913189` | 2026-10-04 10:00:50; 17:37:43 | Limited preflight methods adjudicated; one metadata acquisition recorded; neither selected effort. |
| Missing-pin investigation | `79903f944af6ac5c4e02d94afaf09755552098ed` | 2026-10-05 04:45:25 | First committed analysis identified the missing prospective downstream value; then-absent binary limited the verdict. |
| Exact binary restored and finding finalized | `3a77568614f8b51b33a4ea74b20e73263460b143` | 2026-10-05 05:31:41 | Registered 2.1.288 path/hash verified; multiple effort values supported; no frozen value or deterministic rule found. |

The omission became **detectable when the operational manifest was committed** without the setting that the preregistration required before case creation. It became a crossed freeze-sequence defect at the corpus freeze. Its unresolved placeholder was actually observed in `88dd423`; its governance significance was first documented in `79903f9` and confirmed after exact-binary restoration in `3a77568`. These are different meanings of “detected.” The binary blocker is cleared. No architecture arms, comparison outputs, blind labels, or scoring existed at the confirmed discovery ([effort proof](POST-V3-DOWNSTREAM-EFFORT-PROOF.md#current-decision-validation-and-next-task), [RAW verifier](../tools/eval/post-v3-raw-freeze-verify.ts)).

## 2. Frozen authority and missing specification

| Already frozen | Anchor |
| --- | --- |
| Product contract and A–D hypotheses against V15 | [Preregistration §§ contract, hypotheses](POST-V3-ARCHITECTURE-PREREGISTRATION.md#four-architecture-hypotheses). |
| V15 baseline, A–D implementation, prompt/schema and dependency hashes, stage budgets | [Implementation freeze](../data/evaluation/post-v3-comparison/frozen/implementations.json); V15 anchor `5871e02d3ead1e72faf0cb0d2333d8f696b8072b`. |
| Forty cases, strata/tags, creator provenance, two prelabel sets and their hashes | [Freeze sequence](POST-V3-ARCHITECTURE-PREREGISTRATION.md#freeze-sequence); [corpus manifest](../data/evaluation/post-v3-comparison/frozen/corpus-manifest.json). Prelabels describe acceptable behavior, not expected prose. |
| RAW prompt/schema, one-attempt contract, model and RAW-only effort, attempt journal and exact frozen RAW bytes | [RAW contract](POST-V3-RAW-GENERATION-CONTRACT.md#caller-identity-and-settings-amendment); [RAW freeze manifest](../data/evaluation/post-v3-comparison/frozen/raw-freeze-manifest.json). |
| Primary measures, denominators, zero-safety and advancement thresholds, failure/invalidation rules | [Preregistration §§ measures–rules](POST-V3-ARCHITECTURE-PREREGISTRATION.md#twelve-primary-measures). |
| Randomization algorithm and seeds; six-package presentation; two independent blind reviewers and rubric; post-lock audit order | [Operational manifest](../data/evaluation/post-v3-comparison/operational-manifest.json), `randomization` and `reviewRubric`; [preregistration blind-review rule](POST-V3-ARCHITECTURE-PREREGISTRATION.md#blind-output-review-and-separate-audit). |
| CLI 2.1.288, `sonnet`/resolved `claude-sonnet-5-5` requirement, account-backed $0 access, one shared downstream reviewer/repair profile and exact pre-call settings proof | [Operational manifest](../data/evaluation/post-v3-comparison/operational-manifest.json), `futureCallPreflight` and `stages`. |

**Never successfully specified:** an exact downstream effort value; a previously frozen rule or named preset selecting it; a historical reviewer effort profile incorporated by reference; a completed effective downstream settings certificate; separate downstream run authorization. The future argv contains `--effort <proof.effort>` ([pre-call state](POST-V3-DOWNSTREAM-PRECALL-STATE.md#exact-contemplated-invocation)). RAW's explicit setting is scoped to RAW by the amendment's own supersession clause. Historical V10–V15/Holdout V3 behavior and ambient, catalog or cached defaults are observations, not incorporated authority ([effort proof](POST-V3-DOWNSTREAM-EFFORT-PROOF.md#frozen-authority-and-chronology)).

**Classification: MISSING SPECIFICATION, not CHANGED SPECIFICATION.** No downstream value was ever pinned and no downstream settings change occurred during arm execution, because there was no arm execution. This distinction does not remove the earlier obligation to pin settings before case creation.

## 3. Whodunnit's own rule for omissions

The original [freeze sequence](POST-V3-ARCHITECTURE-PREREGISTRATION.md#freeze-sequence) says the operational manifest **must** pin model/caller/settings before any case creation or candidate implementation; operational choices must implement the frozen contract; no outcome-based amendment is permitted. It also requires identical verifier/repair settings across arms. The [operational manifest](../data/evaluation/post-v3-comparison/operational-manifest.json) instead marks exact effective sampling settings unavailable and orders observation and pinning **before any call**, with a hard stop if they cannot be pinned. It fixes a shared downstream profile but not its effort. This is an internal timing tension, not a deterministic choice rule.

The [invalidation table](POST-V3-ARCHITECTURE-PREREGISTRATION.md#invalidation-and-failure-rules) expressly handles changed corpus/prelabels/thresholds after freeze, implementation exposure, settings changes **during execution**, technical failures, and insufficient evidence. It does **not** give an express cure for a required setting omitted before case creation and discovered before the first arm. Therefore the omission cannot be mechanically labeled a “changed setting during execution,” nor does the table explicitly say every such omission automatically invalidates all previously collected RAW.

There is a concrete precedent for a prospective, scoped amendment: the [RAW generation contract](POST-V3-RAW-GENERATION-CONTRACT.md) expressly cites user authorization, names exactly two superseded RAW pre-call requirements, preserves predecessor hashes, and was committed before RAW call 1. It does **not** authorize downstream amendments. After RAW, the [protocol adjudication](POST-V3-PROTOCOL-ADJUDICATION.md#exact-next-permitted-task) directs an offline readiness check and says to stop and document any unmet downstream requirement **without revising the protocol**; its prohibited-actions list includes protocol amendments. That interpretation predates the effort finding. The [latest effort proof](POST-V3-DOWNSTREAM-EFFORT-PROOF.md#current-decision-validation-and-next-task) establishes this is a missing authority edge, not an observability problem the exact binary can solve.

Internal answer: the present comparison can preserve its RAW record and be audited offline, but the existing governance supplies **no authority to select a new material downstream effort inside it**. The pre-call hard stop still operates. Closing the current comparison is a governance judgment about that combined record; the frozen text does not contain a sentence literally saying “missing effort requires a new experiment.”

## 4. Clarification versus amendment

| Characterization of filling `<proof.effort>` | Verdict | Reason |
| --- | --- | --- |
| Clarification of an already determined value | **Unsupported** | No exact value exists to clarify. The restored client accepts multiple values ([effort proof](POST-V3-DOWNSTREAM-EFFORT-PROOF.md#verified-21288-effort-and-thinking-semantics)). |
| Operationalization of a preexisting deterministic rule | **Unsupported** | The frozen documents require a shared profile and preflight, but give no rule mapping that requirement to one effort. RAW, history, cache and defaults are not incorporated. |
| Completion of an omitted execution parameter | **Accurate description of the act** | It would fill an unbound argument before arm outputs; it would still occur after the required pre-case freeze and after RAW outcomes became known. |
| Substantive protocol amendment | **Required governance classification** | Effort can affect review, repair and final outcomes. Choosing among valid settings changes the effective experimental intervention; it is not merely collecting a preexisting measurement. |

The first two are false even though no arms ran. A disclosed amendment could make a *new* prospective execution layer reproducible, but cannot retroactively satisfy the original freeze deadline or become an original-setting clarification.

## 5. Adaptivity and materiality

Before a potential selection, investigators know the sealed Holdout V3 pattern (25 GOOD_RAW losses; 18 deterministic false rejections, five unnecessary fallbacks, two semantic false rejections; eight lost RAW-correct explicit updates), previous replay/development behavior, conservative verifier tendencies, the A–D mechanisms and hypotheses, frozen cases/prelabels, and the RAW run's 36/40 technical-success pattern and four failed IDs. RAW text is frozen and accessible even though no blind RAW quality labels exist. These facts can make one effort appear more attractive for semantic disagreement, repair, throughput, or expected candidate retention. The risk is **material but bounded**: no V15/A–D outputs or blind judgments permit direct tuning to observed arm winners, but pre-arm input/RAW knowledge and architecture-specific expectations can still influence a choice. We do not assert that any person actually made such a choice or read every RAW text. [Holdout loss analysis](HOLDOUT-V3-LOSS-ANALYSIS.md), [preregistration hypotheses](POST-V3-ARCHITECTURE-PREREGISTRATION.md#four-architecture-hypotheses), [RAW adjudication](POST-V3-PROTOCOL-ADJUDICATION.md#gates-and-evaluability).

Effort is experimentally material. Claude's [effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort) says effort controls work across a response, including thinking depth and behavior, and supports multiple levels for Sonnet 5.5. In [A–D code](../src/lib/reconstruction/post-v3/index.ts), structured semantic review supplies `safety`, `unsupportedInformation`, `voicePreserved`, `objectiveSatisfied`, `usefulPartial` and repair spans; those fields control acceptance, abstention, whether repair is attempted, and whether a rechecked result is delivered. [V15](../src/lib/reconstruction/verified-reconstruction.ts) likewise uses semantic reviewer and repair responses after deterministic gates. Thus effort could alter semantic judgment, repair output, safety detection, retention, final acceptance and outcome rates. There is no measured causal effect for this particular workload yet; the setting is material because the pathway exists, not because a direction or effect size has been observed.

## 6. Remediation classes and claim strength

| Remedy | Governance result | Claim afterward |
| --- | --- | --- |
| 1. Fill one effort in the **current** frozen protocol | **Not authorized as a mere preflight completion.** It is a post-freeze material amendment after corpus and RAW creation. Disclosure reduces concealment, not the original freeze violation; prior adjudication says stop without revision. | If nonetheless run, the outputs could be described as an explicitly amended, partially preregistered analysis, never as the original fully preregistered comparison. Under current rules they cannot satisfy the original integrity gate or justify its advancement claim. |
| 2. Deterministic preexisting derivation | **Unavailable.** No frozen default/preset/reference chooses a value. A new rule made now is Remedy 1 or 4, not Remedy 2. | No current comparative claim. |
| 3. Close the current comparison | **Required for current protocol-conforming downstream execution.** Retain all frozen artifacts and this reason; do not overwrite, retry or score. | RAW procedural facts and prior study limitations only; **invalid for comparative inference** because no arms ran. |
| 4. New prospective comparison | **Viable as a separate registration**, subject to honest input provenance and prospective setting/execution freeze. It may use preserved artifacts conditionally under the matrix below; it must not claim the prior freeze's timing was satisfied. | With fresh, independent cases/RAW and all settings fixed before their creation: potentially fully preregistered confirmatory *pilot* screening, within the registered scope. With reused cases/RAW: **qualified, partially prospective** conditional comparison at best; no pristine independent confirmation. |
| 5. “New execution layer, same hypotheses” | This is Remedy 4 if it has a new experiment identity, explicit supersession, provenance, independently frozen operational contract and separate claims. It is Remedy 1 if it simply fills the current experiment's placeholder. A new name alone changes nothing. | Same claim tier as the actual design and reuse exposure, not the layer label. |

“Confirmatory” here never means proof of universal safety or statistical superiority: the original 40-case design itself only screened candidates for a later **separate independent holdout** ([preregistration](POST-V3-ARCHITECTURE-PREREGISTRATION.md#preregistered-advancement-rule)).

## 7. Reuse matrix for a separately registered successor

“Can reuse” means preserve and cite existing bytes as historical inputs; it does **not** silently transfer the original experiment's confirmatory status. A successor must state the access history and whether each artifact was fixed before RAW. The original failure/no-retry rule already exists; Reviewer C's suggestion that it may not is contradicted by [the preregistration](POST-V3-ARCHITECTURE-PREREGISTRATION.md#invalidation-and-failure-rules) and [manifest](../data/evaluation/post-v3-comparison/operational-manifest.json).

| Component | Can reuse? Why? | Required disclosure | Consequence with reuse |
| --- | --- | --- | --- |
| Hypotheses | **Yes, unchanged.** Frozen before cases/RAW, but motivated by known V3 behavior. | Original commit and V3 motivation. | Prospective to new arm outcomes; qualified as previously formulated, not novel independent hypotheses. |
| 40-case corpus | **Conditionally.** Bytes/strata fixed before RAW; cases are now existing, potentially inspected inputs. | Hashes, creators, access, known RAW failures/content exposure; no case replacement. | Qualified/semi-confirmatory fixed-dataset pilot, not a fresh independent test. Fresh cases needed for strongest confirmation. |
| Two prelabel sets | **Conditionally unchanged.** Both precede RAW; no retrospective reconciliation. | Hashes, any access alongside RAW, disputes. | Preserve as prior annotations; do not convert them into new ground truth or generator instructions. |
| RAW | **Conditionally as historical fixed input.** Keep exact 36 accepted texts and four failures; never regenerate or recast the original attempts. | RAW-only effort, 40/36/4, unknown failed-call identities, exposure, time/model limits. | Useful paired input for a qualified successor; RAW class and advancement adequacy still unjudged. A fresh confirmatory design needs newly generated RAW on fresh cases. |
| V15 | **Yes, if unchanged.** Baseline hash and visible disposition are pinned. | Exact anchor/dependencies, no new disclosure policy. | Prospective baseline for new arm outcomes; condition on reused input set if applicable. |
| A/B/C/D | **Yes, if unchanged.** Implementations and prompts/schemas predate RAW. | Freeze hashes and confirmation of no post-access edits. | Prospective architecture contrasts, conditional on new setting and input provenance; no tuning to RAW. |
| Safety/development fixtures | **Only as background validation.** The original design excludes these from the 40-case corpus. | Prior use and exclusion list. | Exploratory/development evidence; not a confirmatory denominator or replacement for fresh safety cases. |
| Thresholds and measures | **Conditionally unchanged.** Prespecified before RAW; changing them now risks outcome-based adjustment. | Original thresholds, four failed slots, all denominators and limitations. | Qualified prospectivity; cannot restore full original integrity gate if original freeze order failed. New independent study must justify its own locked gates before new evidence. |
| Randomization algorithm/seeds | **Conditionally unchanged.** Committed before outcomes; assignment happens only after all arm outputs freeze. | Original seeds and any mapping access; preserve blinding. | Compatible with qualified successor if implementation and concealed mapping are verified. |
| Presentation design | **Yes, unchanged.** Status is part of observable output and IDs are assigned after outcomes. | Original visible-status rule and any access. | Can retain prospectivity if no outputs/identity leaked to blind reviewers. |
| Review rubric/schemas | **Yes, unchanged.** No output judgments yet. | Original fields, roles and settings for any model-assisted reviewers. | Can retain prospective outcome assessment with genuine blinding and independent labels. |
| Architecture hashes | **Yes, as provenance anchors.** Hashes attest bytes, not effective runtime settings. | Original and successor byte/hash comparison, any dependency/runtime drift. | Supports reproducibility; cannot itself fill effort. |

The new registration must decide its reuse policy **before** any new arm output. If it retains old RAW, it must keep all four missing-input dispositions and the original no-retry rule; the old record must never be edited. A successor's new cases/RAW would be a different experiment, not a retry of the old one. Known RAW technical failures do not establish GOOD_RAW/BAD_RAW classes. RAW is a common input and separately blind-reviewed package, **not an architecture comparator arm**; Reviewer C's “RAW effort confound in an arm contrast” does not follow when V15 and A–D all consume identical RAW. Time/model drift and the post-RAW setting choice remain genuine limitations.

Under the original advancement rule, the four absent RAW inputs leave required outcomes unavailable. The [prior adjudication](POST-V3-PROTOCOL-ADJUDICATION.md#gates-and-evaluability) therefore calls a positive advancement result **INCONCLUSIVE** absent a confirmed safety failure, regardless of numerical minima on the 36 available triples. A successor that reuses old RAW *and* the original gate inherits that limit. Rewriting the gate after learning which RAW attempts failed would be a new, potentially adaptive decision and cannot be presented as unchanged original confirmation.

## 8. External guidance, after internal rules

The [Center for Open Science preregistration FAQ](https://www.cos.io/initiatives/prereg) allows transparent preregistration amendments in many circumstances before outcomes/analysis, and distinguishes planned from exploratory work. It also says preexisting-data registration must disclose prior access and knowledge, which can diminish bias control. [OSF guidance](https://help.osf.io/article/330-welcome-to-registrations) recommends precise, explicit methods and decisions before viewing data, and timestamped, justified updates. These principles support a *new, disclosed prospective registration* and calibrated claims; they do not override Whodunnit's earlier setting deadline or its post-RAW stop-without-revision instruction. They also do not prove that old cases/RAW are independent evidence after their contents and failures are known.

## 9. Independent adversarial reviews and adjudication

| Reviewer | FACT | INTERPRETATION | METHODOLOGICAL JUDGMENT |
| --- | --- | --- | --- |
| A — strongest prospective-completion case (read-only `repo-middle`) | The manifest committed before cases says pin effective settings before any call; RAW had a scoped pre-call amendment; no arm outputs exist. | A two-stage commitment could make the hard stop suspensive: freeze a shared profile before the first downstream call, disclose the late completion. | Supports a **qualified** prospective downstream comparison, never a claim that exact effort was preregistered before cases. |
| B — strongest abandonment case (read-only `repo-grunt`) | The original freeze required settings before cases; the downstream placeholder remains; RAW scope is separate; no derivation exists. | A newly chosen value defines the treatment after freeze; current design has no executable original setting. | Close the current comparison; preserve RAW, start a successor if desired. |
| C — independent reuse critique (read-only external Claude review; supplied nonsecret summary only) | It accepted the supplied freeze chronology, 40/36/4 RAW status and no arm outputs. It did not inspect files. | Existing inputs can be reused only with exposure/provenance disclosure; a new label does not cure original timing. | Conditional reuse may support a qualified successor; fresh independent evidence gives stronger confirmation. |

**Disagreements resolved:** A correctly identifies a possible textual reading of “before any call,” and the absence of arm outputs sharply limits direct winner-selection bias. It does not reconcile the preregistration's earlier **before-case** settings requirement with a newly chosen material value after RAW, or the pre-finding [adjudication's explicit no-revision instruction](POST-V3-PROTOCOL-ADJUDICATION.md#exact-next-permitted-task). B's conclusion is adopted for *the current protocol*, without declaring the RAW run invalid. C correctly stresses disclosure but assumed RAW was a comparator and that the failure rule might be absent; the source contradicts those two points. Cross-model suggestions were verified before use and not adopted automatically.

## 10. Decision and exact next permitted action

**C — current comparison must be abandoned for downstream comparative execution; new experiment required.** The current record has a material missing setting, no frozen rule that selects it, a missed pre-case freeze deadline, and a preexisting instruction to stop without revising the protocol when downstream requirements cannot be met. No compliant V15/A/B/C/D call is possible under the current freeze. This conclusion is narrower than invalidating RAW or claiming that *all* reuse is forbidden.

The **next permitted task** is a separate, documentary closure and successor-design pass: mark the original comparison stopped with the missing-effort reason and all original hashes/failure dispositions; inventory who saw case/prelabel/RAW material; decide whether a successor will use fresh evidence or expressly qualified fixed existing inputs; draft a new independently timestamped registration that pins the exact downstream settings-selection mechanism, effective-environment proof, model/caller, budgets, blinding, exclusions, and claims **before any successor execution**. That later pass may determine an effort-selection mechanism and value; **this pass selects neither**. No request capture, architecture call, RAW retry, blind labeling, scoring, threshold change, or experiment-file amendment follows from this report.

## 11. Integrity of this governance pass

Only this Markdown report is added. The original protocol, RAW, corpus, prelabels, V15, A–D, and V16 are unchanged. No experimental Claude Code/provider model call, RAW retry, architecture run, blind judgment, score, push, or deploy occurred; experimental spend is $0. The three requested independent governance reviews used model assistance; the external read-only Reviewer C consult reported **$0.1733608 review cost**, separate from experimental spend. The preexisting `.gitignore` modification and untracked `.ignore` are preserved. This report is an additive adjudication, not an operational registration or authorization.

## Requested final-report ledger

This index gives a short answer to each requested field; the preceding sections contain evidence and qualifications.

1. Preregistration: `f40a54c`, 2026-10-03 09:22:30 UTC.
2. Operational protocol: `85bd0ca`, 2026-10-03 09:51:07 UTC.
3. Corpus/prelabels: `0bace08`, 2026-10-03 10:33:10 UTC.
4. Candidates: implementation `26bc2c8`, freeze manifest `19ccd75`.
5. RAW contract: `7acb2bb`, before RAW call 1.
6. RAW freeze: `e344540`, 40 attempts/36 successes/four technical failures.
7. Detection: unfilled placeholder `88dd423`; prospective omission `79903f9`; final exact-binary finding `3a77568`.
8. Architecture outputs at detection: none.
9. Exact downstream effort required: yes, as an effective thinking/reasoning setting and explicit invocation argument.
10. Exact downstream value frozen: no.
11. Classification: **missing**, not changed.
12. Material setting: yes, review/repair/final decisions can vary.
13. Amendment rules: scoped RAW precedent, no outcome-based amendment, no protocol revision at the post-RAW readiness gate.
14. General pre-execution omission cure: none specified.
15. Clarification rule: none that deterministically supplies effort.
16. Protocol consequence: hard stop; current comparison cannot execute compliantly.
17. Known information: V3 losses, replay/development behavior, frozen designs/cases/prelabels, RAW text and 36/4 technical pattern.
18. Could influence selection: plausibly yes.
19. Severity: material but bounded pre-arm adaptivity, not observed winner tuning.
20. No-arm-output relevance: prevents direct outcome-based arm optimization; does not restore the missed pre-case freeze.
21. Fill now in current protocol: no compliant current-protocol remedy; it would require a material amendment.
22. Preexisting deterministic derivation: none.
23. Current comparison: close for comparative execution; preserve evidence.
24. New comparison: viable with separate registration and explicit provenance.
25. New execution layer: viable only as the genuinely new comparison in item 24, not a relabeled current run.
26. Hypotheses: reuse unchanged with V3 motivation disclosed.
27. Corpus: conditional reuse as existing fixed inputs; fresh cases for strongest independent confirmation.
28. Prelabels: conditional, byte-identical reuse with access and disagreement disclosure.
29. RAW: conditional historical input reuse, retaining all four failures; no old-run retry.
30. V15: reuse its frozen anchor and dependencies if hashes match.
31. A/B/C/D: reuse unchanged implementations if hashes and no post-access edits are verified.
32. Thresholds: unchanged reuse only with limitations; do not retune to known RAW or future arms.
33. Randomization: conditional reuse of committed algorithm/seeds while preserving mapping blindness.
34. Review design: reuse unchanged rubric, presentation and independent review sequence with verified blinding.
35. Strongest viable claims: current closure gives no comparison; fresh successor can make prospectively registered pilot claims; reused-input successor gets qualified conditional claims.
36. Confirmatory status: never fully preregistered under the original missed setting freeze; fresh independent successor can regain prospective status for its own evidence.
37. External sources: Center for Open Science preregistration FAQ, OSF guidance, Anthropic effort documentation (links above).
38. External principles: timestamp changes, disclose deviations and prior data access, distinguish planned from exploratory, treat effort as behaviorally material.
39. Effect: supports transparent successor and calibrated claims, not overriding project rules.
40. Reviewer A: strongest two-stage prospective-completion argument.
41. Reviewer B: strongest original-freeze/stop-and-close argument.
42. Reviewer C: conditional reuse and access-provenance critique.
43. Disagreement: A reads pre-call pin as suspensive; B treats pre-case freeze and no-revision directive as controlling; C's RAW comparator/failure-rule assumptions were corrected.
44. Adjudication: adopt B for current protocol; preserve A's disclosure insight and C's verified reuse cautions.
45. Decision: **C**.
46. Rationale: omitted material setting, no deterministic authority, missed freeze deadline, post-RAW no-revision directive.
47. Current comparison viable: no, for registered comparative execution.
48. Amendment required for any late setting: yes; cannot be represented as original clarification.
49. New experiment required: yes, for any downstream comparison.
50. Effort selection permitted now: no.
51. Effort value selected: no.
52. Experimental model calls: no; independent governance reviewers used model assistance.
53. Arm runs: no.
54. RAW changed: no.
55. Corpus changed: no.
56. Protocol changed: no.
57. Architectures changed: no.
58. V16: no.
59. Spend: $0 experimental; $0.1733608 external governance-review consult.
60. Diff check: `git diff --check` passed; only this report is task work, with preexisting `.gitignore`/`.ignore` preserved.
61. Report: `docs/POST-V3-MISSING-EFFORT-GOVERNANCE.md`.
62. Commit: recorded in the final task response after committing this report.
63. Pushed: no.
64. Deployed: no.
65. Next task: documentary closure and prospective successor design, including reuse/access disclosure and an effort-selection mechanism **before** any successor execution; no value in this pass.
