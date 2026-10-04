# Post-V3 frozen-protocol adjudication

This is documentary adjudication of the experiment frozen at commit `e3445408552e0bdaa208e17623df53d0e25a1e21`. It adds no rule, threshold, authorization, label, or experimental output. No model call, retry, architecture execution, scoring, or blind labeling occurred in this pass.

## Questions and disposition

1. Did continuing after later CLI failures PVC-012, PVC-014, PVC-015, and PVC-028 violate the frozen generation contract?
2. What evidentiary stage may follow for the 36 successful RAW cases, distinguishing blind labeling, architecture execution, and advancement?

**Generation disposition: VALID WITH PREREGISTERED LIMITATION.** The integrated pre-call contract and incorporated adapter distinguish a process-level CLI failure from a successfully parsed response lacking model identity. Continuing after the four later process-level failures was permitted under that interpretation; none was accepted as RAW or retried. This is a procedural disposition, not certification that all 40 invocations used the requested model. Failed-call identities remain unknown.

The next permitted task is an **offline downstream-readiness audit**, not standalone RAW labeling. Architecture execution remains conditional on the frozen downstream preflight and separately recorded authorization. Required blind review follows the freezing of all arm outcomes; advancement is assessed after label lock and the full-corpus audit. The GOOD_RAW/BAD_RAW/update minima do not gate collecting labels.

## Frozen evidence and chronology

Exact committed text, incorporated implementation bytes, and pre-call hash records govern this analysis. The recovery audit supplies observed accounting and limitations, not a replacement contract. All dates below are UTC.

| Event | Commit or durable record | Timing and significance |
|---|---|---|
| Original preregistration | `f40a54caed05a295f540bd8f0876a6ce858008c9` | 2026-10-03 09:22:30; freezes product contract and decision rules |
| Operational registration | `85bd0ca9bfb14afd1e1d989acdecb5c319c73ca9` | 2026-10-03 09:51:07; operational details before creation/implementation |
| Corpus/prelabels freeze | `0bace0834bf5f85b4bc9ae3d29311badcd2adacc` | 2026-10-03 10:33:10 |
| Candidate implementation | `26bc2c865d177a8ff0c80c4836932aaccc0d3bdf` | 2026-10-03 11:45:02 |
| Candidate implementation manifest | `19ccd7569403058d6afd7086ad3bf8a0ce836b25` | 2026-10-03 11:54:18 |
| Additive RAW contract/manifest/adapter freeze | `7acb2bb5246400e8d792d13979e204f4cb9b765e` | 2026-10-04 05:45:23; before call 1 |
| Pre-call authorization and implementation hashes | `raw-attempts/pre-call-authorization.json` | 2026-10-04 06:20:45.855; pins runner/verifier before attempts |
| RAW run artifacts, runner/verifier, recovery audit committed | `e3445408552e0bdaa208e17623df53d0e25a1e21` | 2026-10-04 07:08:06 |

The preregistration, operational manifest, additive contract, generation manifest, and adapter have no byte changes between the generation-contract commit and RAW-freeze commit. The runner and freeze verifier were first committed with the RAW artifacts, **not** in the pre-call contract commit. Their pre-call durable hashes match their post-run/current bytes. This establishes endpoint equality, not continuous monitoring or pre-call Git commitment.

Evidence paths:

- [Preregistration](POST-V3-ARCHITECTURE-PREREGISTRATION.md), especially freeze sequence, blind review, measures, advancement, and failure rules.
- [Operational manifest](../data/evaluation/post-v3-comparison/operational-manifest.json), especially `futureCallPreflight`, stage budgets, `failurePolicy`, randomization, and advancement gates.
- [Additive RAW contract](POST-V3-RAW-GENERATION-CONTRACT.md), especially lines 17–29 and 39–46.
- [Generation manifest](../data/evaluation/post-v3-comparison/frozen/raw-generation-manifest.json) and its integrity sidecar: exact contract/adapter/schema/prompt hashes and nullable attempt provenance.
- [Frozen adapter](../tools/eval/post-v3-raw-adapter.ts), `parseResponse`, lines 88–108; [runner](../tools/eval/post-v3-raw-runner.ts), identity-stop branch, lines 267–275.
- [Pre-call authorization](../data/evaluation/post-v3-comparison/raw-attempts/pre-call-authorization.json), [attempt journal](../data/evaluation/post-v3-comparison/raw-attempts/attempts.jsonl), [RAW](../data/evaluation/post-v3-comparison/frozen/raw.json), [freeze manifest](../data/evaluation/post-v3-comparison/frozen/raw-freeze-manifest.json), and their integrity sidecars.
- [Recovery audit](../data/evaluation/post-v3-comparison/raw-attempts/recovery-audit.json), [implementation freeze](../data/evaluation/post-v3-comparison/frozen/implementations.json), corpus metadata and frozen prelabel hashes.

## Governing language and precedence

There is **no general explicit hierarchy** ranking all six documents/implementations. The preregistration's freeze sequence requires operational choices to implement the already-frozen contract and decision rules. The additive contract expressly supersedes only two identified RAW pre-call requirements; it does not grant general priority to code or later documents.

Minimum exact language relevant to the disputes:

- Additive contract line 17: “The first actual corpus request is the first possible resolution check.” Its response lacking auditable resolved identity requires a hard stop.
- Line 27: “A response showing a different model, fallback, or no resolved identity stops further generation”.
- Line 29 limits supersession to “pre-call alias resolution” and “unexposed provider/CLI defaults”; model identity acceptance and provenance remain required.
- Lines 19 and 39 incorporate the pre-call “adapter source hash”, “output parser”, and “adapter hashes”.
- Generation manifest `resolvedModelPolicy`: “First actual corpus response must report exactly claude-sonnet-5-5 and no fallback”. Its attempt record explicitly permits `resolvedModelOrNull` and `responseSha256OrNull`; technical failures are retained without substitution or exclusion.
- Preregistration evaluability gate: “all 40 cases have auditable execution/review disposition and all required labels”. Missing thresholds, unassessable technical outcomes, or unresolved required comparisons mean INCONCLUSIVE.
- Operational manifest line 661: “Assign opaque randomized IDs only after all arm outputs are frozen.” Line 662 requires both reviewers independently to review every one of the 240 packages in separately randomized order.

| Issue | Classification | Resolution or remaining boundary |
|---|---|---|
| Original alias/settings preflight versus additive RAW amendment | APPARENT CONFLICT RESOLVABLE BY SCOPE | Express prospective supersession covers only RAW alias resolution and unobservable defaults. Original downstream gates remain. |
| Later CLI failure with absent recorded identity versus response identity stop | APPARENT CONFLICT RESOLVABLE BY SCOPE in final adjudication | Incorporated pre-call parser treats process failure separately from an accepted/parseable response. Reviewer 1 preserves residual lexical ambiguity over “response”; see below. |
| First-call identity requirement versus nullable later technical provenance | NO CONFLICT | First-call gate is stricter; later failures remain technical evidence, never accepted candidates. |
| One RAW per case versus four missing candidates | APPARENT CONFLICT RESOLVABLE BY SCOPE | Technical-failure rules explicitly preserve missing outcomes; no replacement. All 40 dispositions remain required. |
| Common evaluable denominators versus “do not exclude” | APPARENT CONFLICT RESOLVABLE BY SCOPE | Missing text is absent from evaluable pairs, not removed from corpus/accounting or advancement scrutiny. |
| Advancement minima versus labeling/run entry | NO CONFLICT | These are advancement requirements, determined from later blind labels and common FINAL evaluability. |
| RAW-only review now versus frozen randomized output-review order | NO CONFLICT | The operational sequence requires all arm outcomes frozen before output-ID assignment; standalone RAW review now would depart from it. |

No genuine contradiction is established under the integrated reading. There is no invented precedence rule and no retrospective amendment. “Response” lacks an explicit prose definition delimiting arbitrary stdout versus an accepted CLI envelope; reviewer disagreement over whether that is genuine residual ambiguity is preserved rather than erased.

## Four later CLI failures

All four followed the passed first-call identity gate. Each had one attempt and zero retries. The adapter checked timeout and process exit before parsing an envelope or model identity. Its frozen ordering is: timeout → `code !== 0` CLI failure → envelope parse → model identity → strict response schema. An absent identity in a valid envelope becomes `model-unresolved`; a different or multiple identity becomes `model-mismatch`.

The runner hard-stops on any first-call missing identity, and on explicit later model-unresolved/model-mismatch or a recorded non-null mismatched model. Later ordinary CLI failure is retained and the runner continues. The pre-call authorization fixes these runner bytes; the pre-call-committed adapter independently establishes the same failure boundary.

| Case | Sequence | Frozen result | Model identity | Timeout classified | Malformed classified | Retry count | Primary category |
|---|---:|---|---|---|---|---:|---|
| PVC-012 | 12 | technical-failure / cli-failure | unknown | no | no | 0 | vague_update_or_missing_required_replacement |
| PVC-014 | 14 | technical-failure / cli-failure | unknown | no | no | 0 | vague_update_or_missing_required_replacement |
| PVC-015 | 15 | technical-failure / cli-failure | unknown | no | no | 0 | vague_update_or_missing_required_replacement |
| PVC-028 | 28 | technical-failure / cli-failure | unknown | no | no | 0 | voice_sensitive_editing |

**CLI failure does not prove no response.** All four have non-null stdout/envelope hashes, establishing stdout existed. The actual envelope bytes, exact exit code, and stderr were not retained; parsing stopped before identity inspection. They cannot establish whether that stdout was parseable, contained model identity, contained a mismatch, or contained a malformed candidate. No such content is inferred here.

Interpretation B is adopted from the incorporated pre-call parsing contract: the response-identity stop applies to returned envelopes admitted to response parsing, while process-level failures follow technical-failure handling. Interpretation A—every invocation with no recorded identity must stop, regardless of process outcome—is a plausible broad lexical reading, but fits the separately frozen parser and nullable failure fields less well. The adopted reading is grounded in pre-call materials, not in preserving a desired result. It cannot certify identities hidden in failed stdout.

Permitted claims: 40 fixed-order attempts; 36 strict-schema accepted RAWs with recorded resolved model `claude-sonnet-5-5`; exact first-call gate passed; four frozen technical failures; zero retries; continued generation conforms to the integrated procedural rule. Prohibited claims: all 40 calls demonstrably used that model; failed calls demonstrably returned no response; no mismatch/fallback occurred in any invocation; 40 evaluable RAWs; clean complete outcome/provenance observation. No mismatch is **recorded among accepted successes**; failed identities remain unknown.

## Gates and evaluability

| Stage | Frozen requirements | When assessed |
|---|---|---|
| Generation entry | Frozen corpus/prelabels/implementations and RAW transport; separately authorized account-backed $0 access; prescribed CLI/settings/preflight; exact first-call model gate; one attempt/no retry | Before generation and on first response; now retrospective |
| RAW labeling entry | Registered reviewer roles/instructions/settings if model-assisted, cost/access and separate authorization where required; opaque IDs/presentation after all arm outcomes freeze; two independent reviewers, no protected mappings/traces/prelabels | After arm-output freeze, not now as a separate RAW-only stage |
| Architecture execution entry | Frozen RAW evidence; identical available SOURCE/OBJECTIVE/RAW bytes for V15/A–D; frozen implementations/presentation/stage budgets; separately pinned downstream model/caller/settings; original downstream preflight; separately recorded authorization and $0 access | Before any downstream execution; not established/authorized by this adjudication |
| Advancement decision | Both original blind-label sets locked; full-corpus post-lock audit; all safety, evaluability, retention/update/fallback/objective/integrity gates | After labels and audit; not before evidence collection |

The ≥16 confirmed GOOD_RAW, ≥6 RAW-correct primary explicit updates, and ≥3 confirmed BAD_RAW thresholds are evaluated **after blind RAW review**, with common evaluable FINAL pairs determined after arm execution/review and audit. They are not prerequisites to acquiring the labels needed to establish those classes. There is no circular gate. A preliminary RAW class count alone cannot establish the common paired denominators or advancement.

There are 40 frozen case dispositions and 36 available exact successful triples. The four failures remain in overall accounting, with auditable TECHNICAL_FAILURE/missing-output dispositions and required-review absence identified explicitly. They supply no candidate to label and no identical RAW triple to run. They are not substituted with source text, placeholders, inferred outputs, or replacement cases. Exclusion from a calculable complete-case denominator does not remove the case from the experiment or safety accounting.

Technical loss itself does not invalidate generation. However, if a required outcome is unavailable, the preregistered advancement result is **INCONCLUSIVE**; meeting numerical minima does not override that rule. A confirmed safety failure takes precedence and means FAIL. Descriptive evidence can still be collected under the registered sequence; no positive advancement claim is currently possible.

The missing-information primary category has 3 of 6 available triples; the voice-sensitive category has 3 of 4. There is no preregistered numeric category-level sufficiency threshold to invent. These are reduced descriptive probes, with missing cases retained and reported. Required unassessable outcomes affect experiment-level advancement as above; category attrition does not independently establish experiment invalidity. The eight-case primary explicit-update category loses no generation case; its required six RAW-correct cases remain unknown until review.

## Independent reviews and final adjudication

Two independent agent sessions reviewed the same exact frozen protocol documents, pre-call code/hash chronology, and known execution facts. Neither received a desired result or architecture results; none exist. They performed read-only documentary review, without experimental labeling, scoring, or editor calls. Reviewer 1 was `/root/protocol_review_1`; reviewer 2 was `/root/protocol_review_2`.

**Reviewer 1:** VALID WITH PREREGISTERED LIMITATION. Scope B is best supported by the incorporated pre-call adapter and distinct CLI-failure/model-unresolved categories. No generic code-over-prose precedence exists. Preserves genuine residual lexical ambiguity if “response” includes arbitrary stdout, and notes broad scope A would prohibit continuation. Failed stdout cannot prove no response or no mismatch. Standalone RAW labels now are not permitted by output-ID ordering; downstream execution is conditional; adequacy follows labels/audit. Four missing required outcomes can make advancement inconclusive.

**Reviewer 2:** VALID WITH PREREGISTERED LIMITATION. Scope B follows the pre-call adapter; no irreducible conflict remains after scope is applied. Unknown failed identities are not retroactively inferred. Agrees standalone RAW labels now are not permitted, downstream execution is conditional, and advancement minima are post-review/audit requirements rather than label-entry thresholds. Required technical absence yields INCONCLUSIVE unless a confirmed safety failure already yields FAIL.

**Preserved disagreement:** reviewer 1 treats the undefined prose boundary of “response” as residual genuine ambiguity; reviewer 2 considers it resolved by the integrated frozen contract. Both agree stdout presence cannot establish failed response contents. Neither claims all 40 identities are verified.

**Final adjudication:** adopts the integrated scope-B interpretation and VALID WITH PREREGISTERED LIMITATION. The contract explicitly incorporated the adapter/parser before call 1; that parser already distinguished process failure from an identity-deficient response. The narrower first-response gate, nullable failed-attempt provenance, technical-failure retention rule, and unchanged runner hash align with this interpretation. This is evidence-based scope construction, not a new precedence rule or retrospective cure. The lexical qualification and missing failed-envelope evidence remain visible.

## Decision matrix

| Decision | Status | Governing reason and consequence |
|---|---|---|
| RAW generation validity | PERMITTED retrospectively — VALID WITH PREREGISTERED LIMITATION | Integrated pre-call failure boundary permits later process-failure continuation. No further generation or retry is permitted. Four failed identities remain unknown. |
| Blind RAW labeling now as standalone stage | NOT PERMITTED | Random output IDs are assigned only after all arm outcomes freeze; review covers the registered combined packages. Eventual RAW review is conditional on that stage's requirements. |
| Architecture execution | CONDITIONAL | Does not depend on GOOD_RAW/BAD_RAW class minima; requires unchanged downstream preflight, frozen presentation/callers/settings, account-backed $0 access, and separate authorization. This pass grants none and executes none. |
| Advancement evaluation | CONDITIONAL | Requires label lock and full audit before applying all gates. No decision now; unavailable required outcomes mean INCONCLUSIVE, unless safety failure means FAIL. Positive advancement cannot be inferred from 36 valid RAWs. |

## Offline integrity and limitations

The offline RAW freeze verifier passed: 40 attempts, 36 successes, four technical failures, zero retries, expected order/hashes, unchanged generation-contract files, frozen corpus, V15/candidate dependencies, and no comparison output. RAW SHA-256 is `fadf3b99c0d73e1ff3bf1618fb7a4d9e5ea4e3ad10d05d2cb933705a4aabc104`; freeze-manifest SHA-256 is `7e3f5479291888fdaf32f6a136b41cec4dd2f550a2420f4110081d8a67009f31`. Corpus-manifest SHA-256 is `25e8af5b82cdc5fe4954cf9166b8729f889e078fce129ce6ef0fb21913942cfe`.

Runner pre/post hash: `4bc5b3cad0d27a848703fde1c6abbcf5155251aab362b1e8cc6ac2e281c18a3b`. Verifier pre/post hash: `b0b28642b7a05dcc6e7b0024f1d25f4706806ee79380b36ec0f8db82d262e8c8`. Adapter pre-call contract hash: `76729a56b1a1ff8bf0bdb95d1f3addf58d5e645bdeb7f2b593ef657668d07a86`. No RAW/corpus/prelabel/architecture/production bytes were modified; production remains `reconstruction-v1`; no V16 or comparison run exists. Incremental Whodunnit generation API spend was $0, with zero editor/model-generation or external reviewer API calls. Independent protocol reviews used the existing agent system, whose usage cost was not separately audited.

The frozen inaccurate `dates_times` tags on PVC-008/PVC-009 remain unchanged; no clean inference from that secondary cohort is permitted. Unobservable provider sampling defaults remain an accepted RAW reproducibility limitation. Failed stdout bytes/exact exits/stderr are unavailable, so envelope hashes alone cannot reproduce identity/content. Pre-call runner/verifier hashes establish endpoint consistency, not continuous monitoring. No prospective clarification can retrospectively change the adjudicated rules.

## Exact next permitted task

Perform **offline downstream execution-readiness verification only**: cross-check existing frozen presentation, adapters, stage budgets and shared downstream caller/model/settings against the unchanged operational manifest; establish which original preflight proofs and separate authorizations are still missing; preserve the four failure dispositions and all 40 planned slots. The RAW-only amendment does not relax downstream identity/settings gates. If those requirements cannot be met, stop the affected downstream run and document the blocker without revising the protocol.

After the original downstream entry requirements are actually satisfied and separately authorized, execute frozen V15 and A–D under the frozen downstream attempt/failure rules against the identical 36 available triples, retaining four missing-input dispositions. Only after all outcomes are frozen may the custodian prepare the registered randomized combined blind-review packages. Do not infer or fabricate text for missing packages; retain explicit absence in full accounting. After both independent label sets lock, audit all 40 cases and apply the unchanged advancement rules.

Still prohibited now: model/editor calls, retries/replacements, standalone blind RAW labeling, scoring, architecture execution, advancement claims, frozen evidence changes, threshold/protocol amendments, push, and deploy.
