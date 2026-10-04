# Post-V3 downstream pre-call state

Investigation: 2026-10-04. Decision: **B — PARTIAL PROOF; SPECIFIC REMOTE/UNOBSERVABLE STATE REMAINS**. This is not a READY certificate, an amendment, or an inference attempt. The missing edge is the normal client's asynchronous authenticated bootstrap response and its timing relative to request construction, specifically its `client_data` and `org_model_default` values affecting output and effort. No metadata fetch was performed to fill that edge.

## Literal requirement and scope

The original operational manifest at `85bd0ca` requires alias `sonnet`, resolved model `claude-sonnet-5-5`, and CLI 2.1.288. Its stage definitions say “pin exact resolved identity before any call.” Its settings clause requires the “CLI's effective temperature, top-p/top-k if exposed, thinking/reasoning setting, max output tokens” and other exposed controls; “If the exact effective settings cannot be observed and pinned, hard stop the affected run.” The full clause also names structured output, prompt/schema hashes and permission/tool/network configuration.

This requires the registered **client's pre-call resolution and effective request settings**, not an additional guarantee about what the server will ultimately execute. Runtime response identity is distinct and cannot replace pre-call proof. Exact omitted/inapplicable fields are different from invented numeric defaults. The RAW waiver does not apply. No hidden backend parameter is introduced as a new requirement here.

## Exact contemplated invocation

The unchanged `tools/eval/post-v3-live-transport.ts` pins `/Users/nicholaslippa/.local/share/claude/versions/2.1.288`, SHA-256 `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`. The bare launcher and 2.1.289 are not used.

The actual argument constructor returns:

```text
--print --model sonnet --effort <proof.effort>
--system-prompt <stage system bytes> --json-schema <stage schema JSON without $schema>
--output-format json --no-session-persistence --tools ""
--safe-mode --setting-sources "" --strict-mcp-config
--mcp-config {"mcpServers":{}} --disable-slash-commands
```

`proof.effort` has no concrete valid value yet. The investigator did not choose one. Existing profiles supply stage-specific prompt/schema bytes from the frozen constructors; no real case prompt was supplied to Claude. The process runs without a shell in a fresh empty `mkdtemp` directory under the host temporary directory, sends the user payload on stdin, and uses a 20,000 ms SIGTERM/SIGKILL cancellation wrapper.

The environment is **inherited with a denylist**, not an allowlist. The constructor removes keys beginning `ANTHROPIC_`, `CLAUDE_CODE_USE_`, `AWS_`, `GOOGLE_`, `OPENROUTER_`, plus keys containing `FALLBACK` or `AUTH_TOKEN`, and sets `MAX_STRUCTURED_OUTPUT_RETRIES=0` and `CLAUDE_CODE_MAX_RETRIES=0`. The inspected tool-process environment contains none of the relevant inherited Claude/Anthropic selectors; `HOME` selects the normal user configuration location. This is a snapshot of the inspection context, not a guarantee that a later parent process has identical environment. The incomplete artifact records redacted selector hashes.

Authentication was already established as account-backed `claude.ai` Pro. This static pass does not rerun status, read token values, or infer current credit/overage attestation.

## Configuration and precedence

| Source | Local observation | Precedence/effect |
| --- | --- | --- |
| CLI flags | Above explicit model/tool/session/system/schema flags | Startup resolver `sqr` begins with CLI model; environment/settings model considered if absent |
| Inherited environment | Relevant selectors absent in inspected context; scrub policy reproduced | Environment defaults/provider selectors can affect resolution; no changed environment is proposed |
| User settings | `.claude/settings.json` exists and is hashed | `--setting-sources ""` excludes ordinary user/project/local settings; presence is not application |
| Local settings | `.claude/settings.local.json` exists and is hashed | Same exclusion |
| Fresh working directory | No project settings/CLAUDE.md supplied by harness | Safe mode and empty setting sources; no repository context copied |
| Managed settings | `/Library/Application Support/ClaudeCode/managed-settings.json` absent | Safe mode does not imply all policy is absent; no exhaustive OS-policy proof claimed |
| Global account/cache state | `.claude.json` exists and is hashed, account-scoped caches matched without disclosing identifiers | Not excluded by empty ordinary setting sources |
| Served catalog | Matching account scope and `cc` surface exists | First-party active catalog can outrank compiled alias defaults |
| Feature cache | `tengu_delegated_quail={mode:shadow,served:primary}`; `tengu_witty_wand` absent | Served catalog mode and effort precedence respectively |
| Account effort cache | `orgModelDefaultCache=null` | Current cached `cIe` branch contributes no effort override |
| Client data | Exact `sdk-cli` / model / CLI-version / organization scoped slot matches | Output/default controls consumed by the request constructor |
| Normal startup bootstrap | Implemented authenticated `/api/claude_cli/bootstrap` fetch | May replace applicable cached client data and account effort before the request |

Hashes and exact binary source anchors are in `data/evaluation/post-v3-comparison/precall-investigation/precall-state.incomplete.json`. Personal account identifiers, scope filenames and tokens are intentionally omitted. Full local config hashes are evidence identifiers, not copies of private contents.

The first local `.claude.json` hash was `d6f199fd5bdcc360e8c661d32c708924a4c6932deba8b4596695fe43c87e8be2`; independent repetition observed `c0902d385e1971e4203d84e5893ad3f091adb5d4d5797dfceffba24a1103b8db`. The final incomplete snapshot records the latter. All selected relevant values, source anchors, matched catalog and SDK data agree, but full account config bytes changed externally during this read-only pass. No continuous host-state immutability or whole-snapshot byte equality is claimed. This is another reason a historical snapshot alone is not the future invocation certificate.

## Locally derivable model and cached settings

The registered client's `--print` entrypoint becomes `sdk-cli` in the absence of a supplied entrypoint. Catalog surface selection is `cc` for this normal non-desktop/non-remote route. The account-scoped catalog filename is selected using organization plus SHA-256 account scope; the matching boolean and file hash are retained. The matched catalog hash is `9e90831da800263847ffa13c516ca9f65f903a4162d2a3e36388345576dad2d2`, version 2, fetchedAt `1791104503776`, staleAt `1791108092737`.

The matched catalog contains `claude-sonnet-5-5`, with Sonnet thinking state `medium`. Cached feature mode selects served primary when its account/traffic/policy gates admit it. The compiled first-party alias also targets 5.5. The absence of ordinary environment defaults removes that override branch. These are strong, current, **local alias/model evidence**; the remaining settings blocker is not an invented remote execution-identity guarantee.

The exact bootstrap cache key is SHA-256 of JSON `[entrypoint,model,ccVersion,organizationUuid]`, truncated with the `bi1-` prefix. Computing it for `sdk-cli`, `claude-sonnet-5-5`, 2.1.288 and the local organization matches the existing slot. Its `heather_vale` assigns 128000 to Sonnet 5.5; `per_turn_effort=true`. The catalog/compiled model also provides 128000 output and medium default effort. This eliminates the previous generic uncertainty about whether the historical `sdk-cli` cache is relevant.

For a cached-only branch, local evidence supports Sonnet 5.5, medium default effort, adaptive thinking, temperature omission while thinking is enabled, and 128000 maximum output. These are **conditional derived values**, not a certificate of the future normal request. A supplied effort, managed caps, bootstrap refresh or request-specific branch must still be incorporated faithfully.

## Exact unresolved edge and timing

Source offsets are zero-based bytes in the pinned executable, checked against literal function anchors:

| Path | Offset | Relevance |
| --- | ---: | --- |
| `VF` / served state | 181735611 | Active catalog accessor |
| `$x` | 181793707 | Concrete request-model/policy resolution |
| `NZ`, `J5o` | 181799599, 181800176 | Served/default/client-data output limits |
| `cIe`, `vbn` | 182842613, 182850321 | Account default effort precedes feature/default inputs |
| `getFeatureValueWithSource` | 181579458 | Fresh feature payload precedes cached disk values |
| `qnr`, client-data slot | Near 181941000 | Exact version/model/entrypoint/org scope |
| `rt` bootstrap GET | 194872180 | Non-generative authenticated remote metadata |
| `wrs` update | 194874602 | Writes client data, model access, org default and account state |
| `ast` | 194842170 | Registers background promise; it does not await it |
| `Qt` | 195739590 | Headless served-catalog initialization |
| Startup prefetch | Near 196250300 | Starts `ast(lne(...))` after initial model selection |

Initial startup model/catalog resolution occurs before the background bootstrap. Then startup chooses the prefetch branch unless bare mode is active or a positive `tengu_cicada_nap_ms` plus recent timestamp excludes it. The contemplated invocation has `--safe-mode`, **not** `--bare`; the inspected cached nap flag and `startupPrefetchedAt` are absent, giving the ordinary prefetch branch under the cached state.

`lne` calls `wrs`, which awaits `rt`; `rt` makes `/api/claude_cli/bootstrap` GET when its first-party/auth/essential-traffic gates allow it. `wrs` can replace `clientDataCacheSlots`, `orgModelDefaultCache`, model access and account data, and clears relevant render caches when data changes. The outer `ast(lne(...))` registers a promise without waiting. The matched current SDK client-data slot makes `U2e()` true, so `gho` returns without a wait. The `uqe` preflight's 1500 ms limit, gated by `tengu_deep_shore=true`, is a **latent cold/missing-slot branch**, not the active cached-path wait. The active cached path has no bootstrap join at that point. A background response arriving before request construction can affect effective fields, while a late/failing response leaves cached fields. The exact network outcome/timing has not been observed. This is a concrete settings race, not the claim that every feature might change arbitrarily.

In particular, `NZ`/`J5o` consult the active client-data `heather_vale` output map, and `cIe` consults the account `default_effort_level` for the model. A normal bootstrap response can change the output map and account default effort. This does **not** mean it automatically overrides a future explicit `--effort`: explicit effort generally precedes the default in final selection, subject to applicable override/cap rules. The present profile's effort slot is unfilled, and the output-limit edge independently suffices to prevent a complete settings certificate. Temperature presence is subsequently computed from active thinking: `!mh && yt.acceptsTemperature ? V.temperatureOverride ?? 1 : undefined`. Thus current local cached values alone do not settle the future effective tuple.

The earlier broad GrowthBook concern is narrowed: for a warm feature cache, ordinary non-remote print invocation, the startup warm-cache GrowthBook kick is not eligible. No claim is made that this observed branch initiates a fresh GrowthBook fetch. The distinct bootstrap fetch remains the identified edge.

## Settings/payload matrix

| Required control | Config/source | Current proof | Would-be payload | Satisfied for future normal invocation? |
| --- | --- | --- | --- | --- |
| Requested alias | CLI | `sonnet` | Model locally resolved before request | Request policy yes |
| Local resolved identity | Catalog/resolver/provider/policy | Both matched local/compiled first-party targets 5.5; no captured genuine resolver object | Expected `claude-sonnet-5-5` | Strong partial local evidence; complete certificate not claimed |
| Effort | CLI proof slot, account `cIe`, feature `oe`, served/default | Cached medium; slot concrete value not pinned; bootstrap can replace account default | `output_config.effort` | No |
| Thinking | Model capability and active thinking/effort | Cached branch adaptive | Adaptive object, conditional details | No exact active payload |
| Temperature | Thinking/capability/override | Cached adaptive branch omits it | Omitted if thinking enabled; otherwise value-or-omission formula | No exact active payload |
| Maximum output | `NZ`/`J5o`, catalog, client data, env, request override | Applicable cached/default 128000 | Computed `max_tokens` | No; bootstrap-sensitive |
| Top-p / top-k | Conditional on exposure | No applicable CLI control identified | No introduced value | No additional blocker established |
| System prompt | Frozen stage prompt constructor/CLI flag | Repository prompt bytes pinnable; effective request not captured | System structure | Partial |
| Structured output/schema | Frozen schema, `--json-schema` | Explicit; synthetic structured-output tool may appear internally | Constructor-dependent schema/tool form | Repository policy pinned; no effective capture |
| Tools/MCP | `--tools ""`, empty strict MCP, safe mode | No external tools requested | Internal schema tool is distinct from external tool permissions | Policy pinned; no active payload capture |
| Session | Fresh cwd, no resume, no persistence | Explicit | Fresh conversation payload; no session carried over | Harness policy pinned |
| Provider/auth | Scrubbed alternatives, prior account status | First-party `claude.ai` route | Auth not retained in artifact | Route known; no new auth assertion |
| Timeout | Harness | 20000 ms cancellation wrapper | Not sampling payload | Pinned |
| Retries | Harness/env | Zero | No call retry permitted | Pinned policy |
| Repair/recheck | Frozen arms/ledger | At most one each | Separate isolated requests if needed | Pinned ceilings |
| Other exposed controls | Effective client construction | Not exhaustively captured | No invented values | Not certified |

No genuine full request-construction path was executed and no would-be payload was captured. Payload hash is null. No field is mislabeled as remotely computed merely because it was not captured: model, effort, thinking, temperature and maximum output have client-side computations; their bootstrap-sensitive inputs are the remote-dependent part.

## Safety and incomplete artifact

`tools/eval/post-v3-precall-inspect.py` reads binary/local JSON bytes, hashes them, checks source anchors and prints a redacted snapshot. It imports no Claude code, executes no registered binary, and uses no network libraries. The artifact is explicitly `INCOMPLETE`, `executionPermitted:false`, outside the frozen READY namespace. Its integrity sidecar pins exact artifact/tool bytes.

No transport instrumentation was executed. Native execution with network/host-write denial would establish the denied-network fallback, not silently certify the normal bootstrap-enabled path. Stubbing bootstrap with the cached response would choose an unproved response; allowing it through would make a new remote metadata request, which this pass does not authorize merely because it is non-generative. No such request was made. This supports B, not a universal impossibility claim D or an unproved claim C that every legitimate mechanism is prohibited.

Inference network calls: **0**. Other network calls in this targeted local investigation: **0**. No model/arm path, prompt submission, status/config fetch, or smoke invocation was run. Static inspection has no inference boundary to escape.

## Independent review and consequence

The independent reviewer reproduced the binary hash, invocation source, matching SDK client-data key, applicable catalog and source anchors, and confirmed that the matching active cache suppresses the latent bounded bootstrap wait. That correction is incorporated above. The reviewer separately audited the static inspection tool: no Claude import, CLI execution, subprocess/network sender or inference-capable path exists. An initial raw account-default object was narrowed to selected nonsecret fields even though its current value is null. State derivation is partial; safety passes. No reviewer claims a complete active payload, inference identity or universal impossibility.

The pre-call proof requirements are **not satisfied**. A READY freeze and arm execution remain prohibited. This report does not conclude that the client is opaque or that no future proof mechanism can exist. The exact next task is to decide, from original authorization/protocol evidence, whether a separately bounded **non-generative bootstrap state acquisition and immutable request capture** can be permitted and can faithfully bind that state through the future invocation. No new authorization is inferred here, no repeated broad investigation is proposed, and no network fetch is taken. Even with that missing edge resolved, credits/overage-disabled attestation and explicit execution authorization remain distinct.

No corpus, RAW, prelabels, V15, candidates, thresholds, protocol, presentation, randomization, production or generation evidence is changed. No V16, output scoring, blind judgments, push or deployment occurs. Only this report, narrow static inspection tooling and clearly incomplete investigative artifact/sidecar are eligible for a documentary commit.
