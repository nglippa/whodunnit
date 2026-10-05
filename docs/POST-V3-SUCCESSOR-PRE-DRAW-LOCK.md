# Post-V3 successor pre-draw investigation — BLOCKED

**Experiment:** `post-v3-successor-fresh-40`
**Decision:** **D — CAPTURE SAFETY NOT PROVEN**. A complete pre-draw lock has **not** been made.
**Secondary finding:** B — material non-effort fields and all five effective-request proofs remain unresolved.
**State:** `PREREGISTERED — BLOCKED BEFORE DATA CREATION`. No READY artifact exists.

This report records a failed lock attempt under the immutable [successor preregistration](POST-V3-SUCCESSOR-PREREGISTRATION.md), commit `8d9a4b6173e54020eaa44a36bb75fe07314ca456`. It is evidence and a stop decision, **not** an execution contract or a change to that preregistration. The [parent](POST-V3-CLOSURE.md) remains `CLOSED — NOT EXECUTED`. No effort was drawn, no target NIST pulse was queried, and no successor text or model request was generated. The existing experimental inputs and architectures were not edited.

## Verified authority and client

The committed [machine registration](../data/evaluation/post-v3-successor/preregistration.json), [reuse policy](../data/evaluation/post-v3-successor/reuse-policy.json), [READY schema](../data/evaluation/post-v3-successor/execution-contract.schema.json), and their [integrity sidecar](../data/evaluation/post-v3-successor/preregistration.integrity.json) were read. All four recorded SHA-256 hashes matched exact file bytes. The registration hash is `9e027a0f3b56eaec3398c4db0bc7495e49c50bb1c137bf7a90799acfca4c75ac`.

The registered executable at `/Users/nicholaslippa/.local/share/claude/versions/2.1.288` exists and is executable (`-rwxr-xr-x`, Mach-O arm64, 229,255,312 bytes). Its `--version` is `2.1.288 (Claude Code)` and its SHA-256 exactly matches `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`. This proves executable identity, not effective request behavior or account entitlement. The requested and only acceptable resolved model identity is `claude-sonnet-5-5`; there is no fallback. No account, policy cap, provider snapshot, zero-incremental-spend authorization, or resolved request identity was certified in this pass.

## Sealed draw arithmetic; no selection

The ordered set is exactly **`low`, `medium`, `high`, `xhigh`, `max`**. The only target is the signed NIST Beacon 2.0 pulse stamped `2026-10-15T00:00:00.000Z` at `https://beacon.nist.gov/beacon/2.0/pulse/time/1792022400000`. The field is `pulse.outputValue`, decoded as exactly 64 bytes of case-insensitive hex. For counter `i` from zero, hash `UTF8("whodunnit-post-v3-successor-effort-v1") || 0x00 || pulseBytes || uint32be(i)` with SHA-256, read its first four bytes as unsigned big-endian `x`, accept the first `x < floor(2^32/5)*5`, and use index `x mod 5`. Invalid, unavailable, ambiguously identified or unverifiable pulse means BLOCKED, with no substitution or redraw. The fixed pulse was **not accessed**.

The pure local [arithmetic implementation](../tools/eval/post-v3-successor-draw.ts) returns an index and proof, never a selected effort. Its [tests](../tools/eval/post-v3-successor-draw.test.ts) use only synthetic bytes, including the preregistered `00..3f` vector, and never query the Beacon. Passing these tests confirms arithmetic only. The preregistration also requires a future signed-pulse certificate, chain/precommitment verification and an independently checked exact response; none was implemented or used here. These are not permission to use the arithmetic result as the experimental draw.

## Five-level effectiveness proof

| Sealed level | Parser and static client evidence | Effective request under frozen account/profile | Result |
| --- | --- | --- | --- |
| `low` | Advertised by exact client; parser accepts spelling | No genuine pre-dispatch request proof; precedence and caps unsealed | **UNRESOLVED** |
| `medium` | Advertised and parsed; old RAW-only medium cannot govern successor | Same missing proof | **UNRESOLVED** |
| `high` | Advertised and parsed | Same missing proof | **UNRESOLVED** |
| `xhigh` | Advertised and parsed; baked catalog advertises Sonnet 5.5 capability | Client can clamp unsupported models; live model/account/cap path and request not proven | **UNRESOLVED** |
| `max` | Advertised and parsed; baked catalog advertises Sonnet 5.5 capability | Client can clamp unsupported models; live model/account/cap path and request not proven | **UNRESOLVED** |

Static inspection of the exact 2.1.288 binary found the ordered parser and model catalog, but also a resolver that can take an environment value, hook or turn/session state, and a normalizer that changes unsupported `xhigh` or `max` to `high` and applies caps. The baked catalog lists all five for Sonnet 5.5; it is not proof of the active account, effective request or absence of overrides. Thus **none of the five rows satisfies the preregistered effectiveness proof**, and the set cannot yet be used for a draw. No value was selected or preferred.

## Sixteen required model-stage profiles

The [READY schema](../data/evaluation/post-v3-successor/execution-contract.schema.json) names exactly sixteen. The table inventories their inherited prompt/schema source; it does **not** certify a successor profile. Every row still lacks a frozen successor transport, effective request, non-effort reasoning/sampling/output state, environment and capture proof. The intended common effort rule is one future selected value across all sixteen.

| ID | Purpose and inherited source | Lock status |
| --- | --- | --- |
| `raw_editor` | One fresh RAW editor call; frozen RAW prompt and JSON schema in `data/evaluation/post-v3-comparison/` | **INCOMPLETE**; old RAW adapter hardcodes `medium` and cannot be reused as successor transport |
| `v15_review` | V15 initial review; `VERIFY_SYSTEM_V3`, `candidateReviewSchemaV10` | **INCOMPLETE** |
| `v15_repair` | V15 bounded repair; `REPAIR_SYSTEM_V2`, local replacement schema | **INCOMPLETE** |
| `v15_recheck` | V15 whole-result recheck; review prompt/schema | **INCOMPLETE** |
| `a_review` | A initial review; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `a_repair` | A bounded repair; frozen Post-V3 repair prompt/schema | **INCOMPLETE** |
| `a_recheck` | A whole-result recheck; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `b_review` | B initial review; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `b_repair` | B bounded repair; frozen Post-V3 repair prompt/schema | **INCOMPLETE** |
| `b_recheck` | B whole-result recheck; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `c_review` | C initial review; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `c_repair` | C bounded repair; frozen Post-V3 repair prompt/schema | **INCOMPLETE** |
| `c_recheck` | C whole-result recheck; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `d_review` | D initial review; frozen Post-V3 review prompt/schema | **INCOMPLETE** |
| `d_repair` | D bounded repair; frozen Post-V3 repair prompt/schema | **INCOMPLETE** |
| `d_recheck` | D whole-result recheck; frozen Post-V3 review prompt/schema | **INCOMPLETE** |

The old V15 caller uses model alias `sonnet` without an effort pin. The old RAW adapter sets `medium`, which has no successor authority. A pre-call inspector references `post-v3-live-transport.ts` and `post-v3-live-profiles.ts` that do not exist. There is no successor adapter for supplying the new saved RAW to V15 or the candidates, and no sixteen-profile effective-request specification. Candidate implementation hashes remain frozen and unchanged; adding a separate harness would be permitted only if it respects that boundary.

## Material non-effort settings still unfrozen

| Class | Required contract and present finding |
| --- | --- |
| Model | Exact requested/resolved `claude-sonnet-5-5`, provider revision if exposed, account entitlement and zero incremental spend proof are required; request/response resolution is unobserved. |
| Reasoning | Adaptive/thinking enablement, representation, budget or proven omission, model-specific switches, account cap and override behavior are not fixed. Effort remains future-selected; all other reasoning settings also remain unresolved. |
| Sampling/output | Effective temperature, top-p, top-k, numeric maximum output and structured-output representation are not proven as explicit values or omissions. Neither `DEFAULT` nor static catalog maximum is an acceptable lock. |
| Tools and prompts | Tools, MCP, slash commands, safe/restricted permission mode, hooks, file/network capability, extra body, exact system-prompt/stage-instruction/schema hashes and dynamic-input canonicalization are not frozen per profile. Source prompts/schemas exist, but no complete byte-hashed successor profile binds them to the native request. |
| Session | Fresh isolated process, empty work directory, no persistence/reuse, zero retries, numeric timeout, termination/grace period, pacing, one repair and one recheck ceilings, malformed-response and exact exit-code disposition are not all embodied in a successor transport. The old 120,000 ms RAW and 20,000 ms reviewer defaults are observations, not successor locks. |
| Presentation | The preregistered source/objective/RAW visibility, masking, human reviewer separation, seed derivation and six-package design remain authority. No successor case or presentation packet exists; executable custody/profile bindings remain unverified. |

The registration requires **all** material non-effort settings and code/prompt/schema/transport hashes before the fixed pulse. Locking a guessed default or marking an omission without construction proof would violate it. The current READY schema requires a selected effort and certified captures; it cannot itself serve as a pre-draw lock.

## Environment and precedence boundary

An eventual machine must reproduce the contract, not inherit incidental settings on this Mini. The exact client exposes CLI `--effort`, `--model`, `--tools`, `--strict-mcp-config`, `--setting-sources`, `--no-session-persistence`, `--safe-mode` and `--restricted`; option appearance does not prove effective request fields. `--bare` changes auth and is not an equivalent substitute for the required account-backed path. User, project, local and managed settings, account policy/caps, cache/catalog/bootstrap, hooks, permission layer and feature flags can affect construction and require a pinned/excluded/overridden/capture-verified/fatal-if-present disposition. In particular, `CLAUDE_CODE_EFFORT_LEVEL` can override the intended level and `CLAUDE_CODE_EXTRA_BODY` can alter the request. No complete explicit environment allowlist, secret-safe hashes, settings-source precedence, managed-policy proof, bootstrap provenance, auto-update-disable proof or per-call fingerprint is frozen. Routing or reasoning overrides on experiment calls must be absent; exact absence has not been proven. Future machine acceptance remains conditional on exact binary/config proof and a faithful capture.

## Native no-dispatch capture blocker

The preregistration permits a capture-only destination override only with differential proof that the **body, account/bootstrap branch and setting precedence** are identical to the future live path. It requires interception before transport dispatch, a fixed pre-model bootstrap/auth endpoint allowlist, a sink that cannot forward, and synthetic nonexperimental input. It must capture and sanitize endpoint identity, requested/resolved model, effort, thinking, temperature, top-p, top-k, maximum output, tools/MCP, system prompt and schema hashes, persistence/session fields, extra body and relevant metadata for every stage. Any unexpected model dispatch is an entire-experiment stop. **No authoritative capture was run.**

The exact client calls `/api/claude_cli/bootstrap` during the normal authenticated path. Static binary inspection shows `ANTHROPIC_UNIX_SOCKET` skips that bootstrap branch, so a Unix-socket capture is not automatically body/account-equivalent. A base-URL/proxy override likewise needs proof it changes destination only. A DYLD interposer is not established against the hardened binary. In this sandbox, attempted **local safety probes only** showed TCP connection to `127.0.0.1:1` denied with `EPERM`, a local Unix listener denied with `EPERM`, and a nested deny-network sandbox rejected (`sandbox_apply: Operation not permitted`). These probes sent no model request. They do not positively demonstrate a functioning safe local interception sink. A blanket denial that makes bootstrap fail would exercise the wrong branch. Consequently, there is no demonstrated interception-before-dispatch mechanism or differential equivalence, and a native synthetic `--print` invocation was deliberately not attempted. No capture harness is presented as safe.

## Registered stop policy

The [preregistration stop table](POST-V3-SUCCESSOR-PREREGISTRATION.md#stop-and-failure-rules) remains governing. Binary, model, effort, effective field, prompt/schema, tool, environment, cap/bootstrap, capture-equivalence, cost/auth, candidate/custody or unexpected dispatch mismatch means **STOP ENTIRE EXPERIMENT**. Provider 429/529, cap or auth failure also stops the entire experiment. A process-level no-response, locked numeric timeout, partial stream or malformed payload with an intact contract is a **CASE TECHNICAL FAILURE**, with no retry and no replacement; an ambiguous classification stops the experiment. One missing required RAW/FINAL/review result makes advancement **INCONCLUSIVE** unless confirmed safety failure already yields FAIL. No stop rule was relaxed here.

## Independent adversarial audits

Three read-only subagents separately audited the contract, draw and capture. Their claims were checked against the committed registration, schema, source and exact binary where material.

| Audit | FACT | INFERENCE | ASSUMPTION | FINDING |
| --- | --- | --- | --- | --- |
| A — execution contract | READY schema names 16 profiles; inherited V15/A–D and RAW sources exist; successor transport/profile files do not; old RAW has `medium` and old V15 uses `sonnet`. | Inherited callers cannot supply a complete successor request contract. | A new separate transport may be created without changing frozen candidates, subject to hash verification. | **Confirmed:** non-effort settings, per-stage bindings and request proofs are incomplete. |
| B — effort/draw | Exact registration seals five ordered levels and fixed pulse/mapping; exact client parser advertises them and binary contains model-dependent clamp/cap/override paths. | A baked Sonnet capability entry cannot establish five effective requests in active account state. | Active account may permit all five, but that is not demonstrated. | **Confirmed:** five support/effectiveness proofs are unresolved; no draw is permissible. |
| C — capture safety | Normal binary path calls bootstrap; Unix-socket path skips it; local interception/network-denial probes failed in this sandbox. | Socket/proxy/interposer shortcuts cannot currently certify native live-path equivalence or dispatch prevention. | A controlled external sandbox might enable a faithful sink; none is proven here. | **Confirmed:** no safe native no-dispatch capture method is established; do not invoke native synthetic capture. |

No audit establishes that a registered level is *actually* unsupported. It establishes that the mandatory proof has not been obtained. This distinction avoids falsely declaring outcome C. The decisive blocker is capture safety (D), with additional incomplete non-effort fields (B). These cannot be converted to A by describing intended values as effective values.

## Decision and next permitted action

**D — CAPTURE SAFETY NOT PROVEN.** A pre-draw lock would falsely certify mechanical dispatch prevention and request equivalence. Therefore `pre-draw-lock.json`, its integrity sidecar, any READY artifact and any selected-effort record are **absent**. The machine-readable [investigation record](../data/evaluation/post-v3-successor/pre-draw-investigation.json) and its [integrity sidecar](../data/evaluation/post-v3-successor/pre-draw-investigation.integrity.json) preserve evidence without asserting completion.

The next permitted task is a separate **pre-pulse, offline execution-contract and capture-safety proof pass**: establish a positive pre-dispatch interception mechanism that preserves the normal account/bootstrap branch and blocks egress, implement a hashed successor transport and all sixteen complete profiles, pin every non-effort value and environment precedence, and prove each of the five sealed efforts yields its own intended request state without inference. Independently audit and commit the complete lock **before `2026-10-15T00:00:00.000Z`**. Only then may a later pass verify the fixed pulse and record the selected effort. If this pre-draw lock deadline is missed, this registration expires for execution; a separately preregistered experiment with full disclosure would be needed. No output or setting may be adapted to the future pulse.
