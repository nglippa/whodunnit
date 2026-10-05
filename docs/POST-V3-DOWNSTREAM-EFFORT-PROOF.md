# Post-V3 downstream effort proof and protocol finding

**Current decision (2026-10-05): C — FROZEN PROTOCOL DID NOT PROSPECTIVELY PIN AN EXACT DOWNSTREAM EFFORT.** The exact registered Claude Code 2.1.288 executable has now been restored byte-for-byte and its effort path inspected. It explains what an explicit flag would do, but the frozen authority still does not choose a value for `<proof.effort>`. Assigning one now would be a post-freeze operational choice. No effort-proof JSON, final pre-call certificate, or request capture is created. The comparison remains blocked.

## Prior investigation (2026-10-04)

The prior decision was **D — INDETERMINATE** because this Mini then lacked the registered 2.1.288 executable. The active Homebrew launcher was 2.1.289. The explicit Part 5 stop rule prevented substituting that version or continuing to a 2.1.288 precedence certificate. The record below preserves that earlier state; the restoration and current decision follow it.

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

The registered future argv is `--print --model sonnet --effort <proof.effort> ...` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 11–25). The RAW editor's `--effort medium` does not fill that slot. The inspected original documents did not explicitly freeze a downstream value, deterministically frozen preset mapping, or incorporation of historical reviewer effort by reference. At that time, the missing registered binary and Part 5 stop rule prevented completing the implementation-specific precedence proof. The 2026-10-05 sections below complete that audit and reach C.

Historical V10–V15 and Holdout V3 settings are not promoted to current authority. The original manifest calls Holdout V3 a prior successful 2.1.288 structured-output smoke and explicitly says it does not prove present availability or settings (`operational-manifest.json` lines 491–503). The committed Holdout V3 editor adapter's argument list has `--model sonnet` and no `--effort` flag (`tools/eval/holdout-v3-generate.ts` lines 45–51); its environment scrub is at lines 35–43. That is historical ambient behavior, not a frozen downstream effort. The manifest's downstream stage entries name one future shared profile rather than `same settings as V15` or an equivalent historical incorporation. A detailed V10–V15 effort-flag inventory was not completed after the Part 5 stop.

## Registered installation gate

The committed pre-call record identifies the registered path as `/Users/nicholaslippa/.local/share/claude/versions/2.1.288` and its expected SHA-256 as `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` line 13; `POST-V3-PRECALL-ACQUISITION.md` line 17). **That is a committed prior-machine hash, not a hash measured for an installed 2.1.288 binary on this Mini.** The registered path was absent here. A scoped search of `~/.local/share`, the Claude application-support installation, Homebrew's Anthropic package, and `/usr/local/lib/node_modules` found no 2.1.288 installation.

On this Mini, `/opt/homebrew/bin/claude` points into `@anthropic-ai/claude-code`; `claude --version` and its package metadata report 2.1.289. The local Homebrew executable SHA-256 is `03d66745e3bb69ec727d66023696f3820bc0a00a8a5ba725eb6706d0c67cbe69`. The separate `~/.local/bin/claude` symlink points to a 2.1.234 application bundle, not 2.1.288. Neither is a permitted substitute.

| Required edge | Status on this Mini |
| --- | --- |
| Frozen requirement → registered invocation profile | The hard-stop requirement and placeholder argv are documented; no exact downstream effort found in the inspected governing entries. |
| Registered profile → **actual 2.1.288 flag/preset semantics** | **Unavailable during the prior pass: registered executable then absent.** |
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

## Prior decision and next step, now completed

The prior **D — INDETERMINATE** finding correctly left `--effort <proof.effort>` unfilled. Its immediate next task was restoring the exact registered executable. That task is complete below. The separate native pre-transport capture issue remains untouched.

## 2026-10-05 restoration and checkout

This pass began at `/Users/nicholaslippa/Projects/Whodunnit`, HEAD `79903f944af6ac5c4e02d94afaf09755552098ed`. Initial status was `main...origin/main [ahead 1]`, modified `.gitignore`, and untracked `.ignore`; the previously reported untracked `graft/` was no longer present. These current non-task files were not changed, staged, or committed.

No 2.1.288 artifact was found in the scoped local installation search before restoration. `/opt/homebrew/bin/claude` remained the active 2.1.289 launcher. The official `claude install 2.1.288` command downloaded the native build, then exited 1 because an older, non-installer-owned `~/.local/bin/claude` symlink points to a 2.1.234 application bundle and the installer would not replace it. The executable **was** installed at the already registered absolute path, so no force option or symlink replacement was needed. Anthropic documents installing a specific native version and the native versions directory in its [setup guide](https://code.claude.com/docs/en/setup).

| Registered executable check | Observed on Mini |
| --- | --- |
| Absolute path | `/Users/nicholaslippa/.local/share/claude/versions/2.1.288` |
| Direct `--version` | `2.1.288 (Claude Code)` |
| Type / mode / size | Mach-O arm64; `-rwxr-xr-x`; 229,255,312 bytes |
| Direct SHA-256 | `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750` — **exact registered match** |
| Normal Homebrew client | Still 2.1.289; SHA-256 `03d66745e3bb69ec727d66023696f3820bc0a00a8a5ba725eb6706d0c67cbe69` |

The experimental path is the absolute 2.1.288 executable, never the bare `claude` launcher. The installed binary was not modified after download.

## Frozen authority after restoring the binary

The original architecture preregistration at `f40a54c` required an operational manifest to pin caller/model/settings **before case creation** and required shared verifier/repair settings across arms (`POST-V3-ARCHITECTURE-PREREGISTRATION.md` lines 124, 128). The manifest at `85bd0ca` instead says effective thinking/reasoning settings were unavailable and must be observed and pinned before a call; its downstream stage entries prescribe one shared future reviewer/repair settings profile without an effort value or named preset (`operational-manifest.json` lines 505–512, 543–568). It does not incorporate a historical V10–V15 or Holdout V3 effort profile by reference. Holdout V3's committed CLI adapter has no `--effort` flag (`tools/eval/holdout-v3-generate.ts` line 46), and the manifest explicitly disclaims that smoke as present settings proof (lines 491–503).

The `7acb2bb` amendment pins `medium` **only for RAW generation** and limits its supersession accordingly (`POST-V3-RAW-GENERATION-CONTRACT.md` lines 15–29). Later cached/catalog `medium` and the single prior-Mac bootstrap response are observations, not the original downstream setting. The committed future downstream invocation still has `--effort <proof.effort>` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 15–25; `POST-V3-PRECALL-ACQUISITION.md` line 19). No exact value or deterministically frozen preset mapping fills it.

## Verified 2.1.288 effort and thinking semantics

All offsets below are zero-based **byte offsets in the executable whose SHA-256 is shown above**. They are static source inspection; no model path was executed.

| Step | 2.1.288 source evidence | Consequence |
| --- | --- | --- |
| Accepted values | `lu=["low","medium","high","xhigh","max"]` at 179485154; CLI parser `oJe` at 182843834; option at 196544263 | Five advertised levels are accepted. Source also accepts `med` as `medium` and hidden `ultracode` as `xhigh`; invalid flags warn and fall back. Acceptance alone does not register one value. |
| CLI to session | `Uyt(e)` at 182849197 forms `sessionEffort: ve(qJn(e))`; startup uses `Uyt(o.effort)` at 196247227 and state construction spreads `Uyt(e.effort)` at 196520688 | An explicit CLI flag becomes a session-level effort. |
| Session and ordinary settings | `xd` at 182847653 returns an explicit session level before its inherited settings table; `Ah` at 182870506 uses a permission-layer effort if one exists, otherwise `xd` | Ordinary user/project effort defaults do not displace an explicit session level on this path. A permission-layer effort can. |
| Main request resolver | Main query passes `effortValue:Ah(f)` at 195137337; `ow` is called with `V.effortValue`, turn effort, hook effort and carried effort at 188989786 | The CLI-derived session value reaches the request resolver unless a prior layer substitutes another value. |
| Resolver precedence | `ow` at 182848048 selects hook effort first; then `rK()` (182844454) reads `CLAUDE_CODE_EFFORT_LEVEL`; its core is `p ?? (p===null ? E : undefined) ?? turnEffort ?? sessionValue ?? E`, where `E=vbn(model,carried)` | Concrete environment effort beats session effort. `auto`/`unset` yields `null`, which can select default `E` before the session value. With environment absent and no hook/turn override, the explicit session value precedes `E`. |
| Defaults and bootstrap | `vbn` at 182850321 is `cIe(model) ?? oe(model) ?? carried ?? Oe(model) ?? ke(model)`; `cIe` at 182842613 reads the first-party cached account default; `oe` reads `tengu_witty_wand` | Account/bootstrap and feature values affect the default branch. They do **not** override an explicit session value on the ordinary absent-environment path. A later bootstrap can change the default branch, not select a missing registered flag. |
| Caps and model support | `cWt`/`nK` at 182842303–182843400 combine the lowest applicable settings/organization/model cap; `F` at 182848528 clamps and downgrades unsupported `max`/`xhigh`; `BDe` at 188962454 deletes effort if the model lacks support | Even a chosen explicit flag may yield a lower or omitted request effort under applicable policy/model state. |
| Extra body | `XY` at 188959741 parses `CLAUDE_CODE_EXTRA_BODY`; request builder initializes `Aa` from `Ji.output_config` at 189008421; `BDe` returns when `Aa` already contains `effort` | An inherited extra-body `output_config.effort` can supersede the resolver. The registered environment denylist does not name this variable. It is absent in the inspected Mini process, but that snapshot does not bind a future process. |
| Thinking and temperature | Request construction at 189008900–189011500 chooses adaptive or fixed-budget thinking from active model/runtime/thinking state; disabled thinking may clamp above-high effort to `high`; at 189011700–189015100, temperature is `!mh && acceptsTemperature ? temperatureOverride ?? 1 : undefined` | No exact thinking mode, budget, or temperature presence/value is implied by the unfilled effort slot. These remain conditional until the future state is pinned and, separately, captured. |
| Request field | `BDe` writes string resolved effort into `Aa.effort` at 188962454; request builder includes `output_config:Aa` at 189015040; dispatch calls `beta.messages.create` at 189047451 | This statically closes CLI-to-request construction for effort without making a call or capturing a payload. |

## Mini state and cross-machine reproducibility

The inspected process has no relevant `CLAUDE_CODE_*`, effort, thinking, or model environment variable; in particular `CLAUDE_CODE_EFFORT_LEVEL` and `CLAUDE_CODE_EXTRA_BODY` are absent. The documented future harness **inherits** its parent environment and scrubs a provider/fallback denylist (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 25–27); it does not freeze an allowlist. This present absence therefore cannot certify the eventual child environment. The invocation's `--setting-sources ""` excludes ordinary user/project settings according to the registered pre-call record (lines 31–40). For this Mini, inspected user and project settings contain no effort/model/thinking selectors; managed settings files at the inspected standard locations are absent. These are scoped observations, not an exhaustive managed-policy guarantee.

The Mini's global account configuration SHA-256 is `e39c3c69ef0ca5ab6e2639ec800bd7f601faaaaba18c5fcfe4d541cf3327733c`; its `orgModelDefaultCache` is null, `tengu_witty_wand` is absent, and `tengu_delegated_quail` reports `{mode:shadow, served:primary}`. Its matching account-scoped `cc` catalog SHA-256 is `fd287eae816b1c9a58c29368daf64571e4b5120b80b7a08c319c41695d7b0e32`; the Sonnet 5.5 thinking row says effort `medium`. The Mini has **no matching `sdk-cli` / Sonnet 5.5 / 2.1.288 bootstrap client-data slot**. By contrast, the prior-Mac committed pre-call record reported catalog SHA-256 `9e90831da800263847ffa13c516ca9f65f903a4162d2a3e36388345576dad2d2` and a matching slot with `per_turn_effort=true` (`POST-V3-DOWNSTREAM-PRECALL-STATE.md` lines 54–60), while the acquired remote `org_model_default` was null (`POST-V3-PRECALL-ACQUISITION.md` line 31). No bootstrap refresh occurred in this pass.

These machine-local differences matter to a default/cached-effort claim. They cannot create frozen authority for an explicit value. If a value had been prospectively registered, a separately frozen execution environment could establish whether environment, extra-body, policy, and caps preserve its effective request value. The present protocol did not register one.

## Proof chain and independent review

```text
FROZEN AUTHORITY: shared downstream settings required, exact effort absent
    ↓  preregistration and operational manifest
REGISTERED INVOCATION: --effort <proof.effort>
    ↓  2.1.288 CLI parser and Uyt/xd/Ah path
VERIFIED CLIENT SEMANTICS: an X could become session effort and request effort
    ↓  ow/BDe plus environment, extra-body, hooks, caps, thinking state
ACTIVE MINI STATE: local selectors observed, future process not immutably bound
    ↓  NO AUTHORITY EDGE SELECTS X
EXACT EFFORT: UNPROVED
```

Two independent read-only reviewers received no preferred answer. Reviewer A attempted a positive proof and found **C**: five valid flag values, a traced explicit path, but no frozen downstream selection. A marked the manifest/RAW scope/CLI path as **FACT**, the post-freeze-choice conclusion as **INFERENCE**, and rejected cached `medium` as an **ASSUMPTION**. Reviewer B sought an alternate precedence path and identified environment, extra-body, hook/turn, account/default and cap branches as **FACT**. B initially inferred that account/feature defaults always outrank explicit CLI effort; source review corrected that inference: they are the default branch after explicit session effort when the environment is absent. B retained future parent environment and cache timing as unresolved **ASSUMPTIONS**, and found no alternate frozen value. The reviewers converge: the prior D installation blocker is removed, but exact downstream effort is not prospectively pinned. Root independently checked the cited frozen lines and the binary parser, `xd`/`Ah`/`ow`, `XY`/`BDe`, request, thinking, and temperature snippets before adjudicating **C**.

## Current decision, validation, and next task

**C — FROZEN PROTOCOL DID NOT PROSPECTIVELY PIN AN EXACT EFFORT.** The original documents required pinning before case creation and exact pre-call observation, yet supplied neither a downstream value nor a frozen preset/profile that deterministically selects one. `medium` was fixed only for RAW; historical omitted flags and machine-local default `medium` cannot fill `<proof.effort>`. Selecting any of the accepted values now would be a post-freeze choice. No further nonexperimental source or cache read can turn a default into original authority. The effort blocker remains; no native request capture is permitted in this pass. That separate capture issue is not adjudicated here.

Offline validation: the preregistration and operational manifest SHA-256 values still match `2611f1d7434728d6f46820dd1152fcdab8a498571a51b1a4d654f1c23e3699e2` and `db867a9d9d4f79dff48b3c1702cf24b67d0e1d6467c422eb1d14703e0409d21e`. `post-v3-raw-freeze-verify.ts` returned `valid:true`, 40 attempts, 36 successes, four technical failures, RAW SHA-256 `fadf3b99c0d73e1ff3bf1618fb7a4d9e5ea4e3ad10d05d2cb933705a4aabc104`, and `comparisonOutputsAbsent:true`. The registered binary version and SHA-256 match exactly. Because the decision is C, no effort-proof JSON or integrity sidecar exists to validate. The staged diff check must pass before commit.

This pass made **zero downstream Claude Code/provider inference calls, zero bootstrap refreshes, zero arm executions, zero RAW retries, zero experimental judgments, and $0 experimental spend**. Two independent Codex reviewer agents performed the requested read-only analysis; neither ran the registered Claude client. The official version installer and official documentation lookup used network access; neither submitted experimental text or invoked a Claude model. RAW, corpus, protocol, candidate architectures, production, V16, and comparison outcomes were not modified. No push or deployment is authorized. The exact next task is a separate protocol-governance decision on this prospective pinning defect; do not choose an effort or begin request capture under the existing freeze.
