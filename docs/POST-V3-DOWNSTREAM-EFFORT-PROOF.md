# Post-V3 downstream effort investigation

**Decision: D — INDETERMINATE. Exact downstream effort is UNPROVED.** This Mini does not have the registered Claude Code 2.1.288 executable available at the registered path or in the inspected installation locations. The active Homebrew launcher is 2.1.289. The explicit Part 5 stop rule prevents substituting that version or continuing to a 2.1.288 precedence and active-state certificate. No effort value is assigned to `<proof.effort>`; no effort-proof JSON or integrity sidecar is created. The comparison remains blocked.

## Checkout and scope

At the start of this pass, `pwd` was `/Users/nicholaslippa/Projects/Whodunnit`, HEAD was `d804df21c4d2f6d58ff2b320d8ea4fbaec913189`, and `git status --short --branch` showed `## main...origin/main` plus untracked `graft/`. The tree therefore did **not** begin clean. `origin` was `https://github.com/nglippa/whodunnit.git`. The untracked directory was left untouched. The requested `docs/POST-V3-DOWNSTREAM-RECALL-STATE.md` does not exist in this checkout; the committed file is `docs/POST-V3-DOWNSTREAM-PRECALL-STATE.md`.

This is a documentary finding with a local installation check. The investigation stopped at the missing-binary gate. It did not inspect account secrets, run a Claude model, make a network request, repeat bootstrap acquisition, execute an arm, or construct/capture a model request.

## Frozen authority and chronology

| Stage | Committed evidence | Effort authority |
| --- | --- | --- |
| Original architecture preregistration, `f40a54c` | `POST-V3-ARCHITECTURE-PREREGISTRATION.md` lines 124 and 128: the operational manifest must pin caller/model/settings before case creation; verifier and repair versions/settings are fixed across arms. | Requires a prospective settings freeze, but gives no exact downstream effort or named preset. |
| Original operational manifest, `85bd0ca` | `operational-manifest.json` lines 505–512 and 543–568: CLI 2.1.288, alias `sonnet`, resolved model `claude-sonnet-5-5`; exact thinking/reasoning settings must be observed and pinned before a call; one shared downstream reviewer settings profile across arms and rechecks. | No numeric/named effort value in the cited downstream settings clause or stage entries. The reference is to settings **to be pinned**, not to a specified historical V10–V15 reviewer profile. |
| RAW-only amendment, `7acb2bb` | `POST-V3-RAW-GENERATION-CONTRACT.md` lines 15–29: exact model identifier and `medium` effort are pinned **for RAW generation only**; the amendment expressly limits its supersession to RAW alias/default observability. | `medium` is RAW authority, not a downstream effort assignment. |
| Later feasibility and pre-call observations, `9619e7d` and `88dd423` | `POST-V3-DOWNSTREAM-FEASIBILITY.md` lines 55–63 describes compiled/catalog `medium` defaults and dynamic effort branches. `POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 54–60 describes conditional cached medium/adaptive state, then lines 82–84 warns about bootstrap timing and an unfilled explicit effort slot. | Observed defaults and cache state are not a frozen invocation value. |
| Authority adjudication and acquisition, `fa140a8` and `d804df2` | `POST-V3-PRECALL-AUTHORITY-ADJUDICATION.md` lines 26–34 preserves the original settings hard stop. `POST-V3-PRECALL-ACQUISITION.md` lines 3, 19, 31, 41–50 and 66 records one bootstrap GET, `org_model_default=null`, conditional cached medium/adaptive, and the still-unfilled `<proof.effort>`. | Later observations explicitly declined to assign medium. No downstream protocol amendment occurred. |

The registered future argv is `--print --model sonnet --effort <proof.effort> ...` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 11–25). The RAW editor's `--effort medium` does not fill that slot. The inspected original documents did not explicitly freeze a downstream value, deterministically frozen preset mapping, or incorporation of historical reviewer effort by reference. This is evidence against asserting A or B; the missing registered binary and Part 5 stop rule prevent completing the requested implementation-specific precedence proof. A final C finding would require completing the committed-evidence and registered-client audit, not borrowing a default from an unrelated stage.

Historical V10–V15 and Holdout V3 settings are not promoted to current authority. The original manifest calls Holdout V3 a prior successful 2.1.288 structured-output smoke and explicitly says it does not prove present availability or settings (`operational-manifest.json` lines 491–503). The committed Holdout V3 editor adapter's argument list has `--model sonnet` and no `--effort` flag (`tools/eval/holdout-v3-generate.ts` lines 45–51); its environment scrub is at lines 35–43. That is historical ambient behavior, not a frozen downstream effort. The manifest's downstream stage entries name one future shared profile rather than `same settings as V15` or an equivalent historical incorporation. A detailed V10–V15 effort-flag inventory was not completed after the Part 5 stop.

## Registered installation gate

The committed pre-call record identifies the registered path as `/Users/nicholaslippa/.local/share/claude/versions/2.1.288` and its expected SHA-256 as `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` line 13; `POST-V3-PRECALL-ACQUISITION.md` line 17). **That is a committed prior-machine hash, not a hash measured for an installed 2.1.288 binary on this Mini.** The registered path was absent here. A scoped search of `~/.local/share`, the Claude application-support installation, Homebrew's Anthropic package, and `/usr/local/lib/node_modules` found no 2.1.288 installation.

On this Mini, `/opt/homebrew/bin/claude` points into `@anthropic-ai/claude-code`; `claude --version` and its package metadata report 2.1.289. The local Homebrew executable SHA-256 is `03d66745e3bb69ec727d66023696f3820bc0a00a8a5ba725eb6706d0c67cbe69`. The separate `~/.local/bin/claude` symlink points to a 2.1.234 application bundle, not 2.1.288. Neither is a permitted substitute.

| Required edge | Status on this Mini |
| --- | --- |
| Frozen requirement → registered invocation profile | The hard-stop requirement and placeholder argv are documented; no exact downstream effort found in the inspected governing entries. |
| Registered profile → **actual 2.1.288 flag/preset semantics** | **Unavailable: registered executable absent. Stop here.** |
| 2.1.288 semantics → configuration precedence | Not traced on this Mini; no 2.1.289 inference substituted. |
| Configuration precedence → active applicable state | Not certified; user/project/managed/account settings, environment and feature/cache state were not promoted from a different machine. |
| Active state → exact effort | **UNPROVED.** |

Thus accepted `--effort` values, explicit-flag versus environment/account/cap precedence, bootstrap influence, adaptive-thinking mode/budget, thinking enablement, temperature branch, and request-construction implications remain unproved for this Mini. Committed earlier reports contain conditional source-derived claims, including that explicit effort normally outranks defaults subject to overrides/caps; those claims are historical evidence, not a new local 2.1.288 source verification. An explicit effort would need to be fixed by frozen authority before machine-local state could safely be treated as overridden. The current placeholder and different local installations leave a cross-machine reproducibility issue.

## Independent review

Two independent read-only reviewers were assigned: A to seek a proof from frozen authority and precedence, B to seek a falsifying precedence or machine-state path. Neither ran inference or changed files.

| Reviewer | Fact | Inference | Assumption rejected | Decision |
| --- | --- | --- | --- | --- |
| A, proof attempt | The manifest leaves thinking/reasoning settings for later pinning, RAW `medium` is scoped to RAW, Holdout V3 had no effort flag, future argv still has `<proof.effort>`, and local 2.1.288 was not located. | Selecting an explicit value now would be new rather than derived from the inspected frozen authority. | No assumption supports an exact value; registered precedence remains unverified. | **C**, based on the apparent prospective freeze defect. |
| B, falsification attempt | Local launcher is 2.1.289, the registered 2.1.288 installation was not found, the manifest specifies shared downstream settings without a value, RAW `medium` is limited, and the placeholder remains. | Ambient/cache settings could vary by machine, and 2.1.288 explicit-flag precedence cannot be verified here. | 2.1.289 cannot stand in for 2.1.288; RAW effort is not incorporated downstream by reference. | **D**, applying the Part 5 stop. |

**Adjudication:** Both reviewers agree that no exact downstream effort is proved and that RAW/historical/ambient `medium` cannot fill the slot. Their C/D difference is about the scope of the conclusion. A's C inference is a serious prospective-freeze concern supported by the inspected primary texts, but Part 5 explicitly commands a stop when the registered implementation is absent, before completing the requested preset/precedence and active-state audit. This report therefore records **D** for this Mini and does not certify a final protocol-deficiency C finding. No A/B path is supported.

## Validation and integrity

Offline `post-v3-raw-freeze-verify.ts` returned `valid:true`, 40 recorded attempts, 36 successes, 4 technical failures, RAW SHA-256 `fadf3b99c0d73e1ff3bf1618fb7a4d9e5ea4e3ad10d05d2cb933705a4aabc104`, and `comparisonOutputsAbsent:true`. The preregistration and operational-manifest file hashes match the hashes embedded in the implementation integrity record: respectively `2611f1d7434728d6f46820dd1152fcdab8a498571a51b1a4d654f1c23e3699e2` and `db867a9d9d4f79dff48b3c1702cf24b67d0e1d6467c422eb1d14703e0409d21e`. The RAW contract verifier is a **pre-generation** gate and, as expected, stops now because `frozen/raw.json` exists; it is not used as a current RAW-integrity verdict. The 2.1.288 local binary hash/version check could not pass because that binary is absent. No proof artifact exists to integrity-check.

This pass made zero Claude inference calls, zero network/bootstrap calls, zero arm runs, zero RAW retries, zero new judgments or scores, and zero experimental spend. RAW, corpus, protocol, candidate architectures, production code, and V16 were not changed. Only this report is proposed for commit. No push or deployment is authorized.

## Decision and next permitted step

**D — INDETERMINATE.** The exact replacement for `--effort <proof.effort>` is **UNPROVED**; the effort blocker is not cleared. The immediate nonexperimental proof step is to make the **exact registered 2.1.288 executable** available for read-only inspection on the eventual execution machine and verify its version and SHA-256 against the committed registered hash. Then resume the frozen-authority, historical-profile, 2.1.288 precedence, and active-configuration audit without choosing an effort value. The separate native pre-transport capture issue remains untouched and is not the next task.
