# Post-V3 downstream feasibility

Investigation date: 2026-10-04. Decision: **D — INDETERMINATE**. The original downstream preflight remains unsatisfied. This is a documentary determination, not a READY execution contract, protocol amendment, inference attempt, or claim of impossibility.

The evidence supports a narrower correction to the preceding readiness summaries: Claude Code 2.1.288 contains locally inspectable alias resolution and settings construction. It is not established that these values exist only behind an opaque server alias. Conversely, compiled defaults do not prove the effective state of the contemplated isolated account-backed invocation. No complete, demonstrated read-only effective-state proof was obtained.

## Questions and governing evidence

The questions are whether the original required pre-call resolution of `sonnet` to `claude-sonnet-5-5`, and the original exact effective-settings proof, can be satisfied without inference through the registered Claude Code CLI 2.1.288 account-backed route.

| Evidence | Governing commit / applicability |
| --- | --- |
| `docs/POST-V3-ARCHITECTURE-PREREGISTRATION.md` | `f40a54c`; general model/settings freeze and unchanged downstream behavior |
| `data/evaluation/post-v3-comparison/operational-manifest.json` | `85bd0ca`; literal original downstream preflight and stage requirements |
| `docs/POST-V3-RAW-GENERATION-CONTRACT.md` | `7acb2bb`; RAW-only supersession, expressly not a downstream waiver |
| `docs/POST-V3-PROTOCOL-ADJUDICATION.md` | `91219a65bb0101e609b3fa17e904298a2ae5b4cf`; sequential evidentiary stages |
| `docs/HOLDOUT-V3.md`, historical adapters and provenance | prior transport evidence; expressly insufficient for present availability/settings |
| Current uncommitted readiness documents, manifests and live harness | documentary implementation context; not new governing proof or amendment |
| Registered native CLI binary and embedded client source/catalog | version-specific read-only evidence, not a model response |
| Official Claude Code documentation | current provider documentation; version history corroborates some 2.1.288 behavior, not an account-specific effective snapshot |

No existing frozen artifact is modified by this report. The historical blocked snapshots and uncommitted readiness tooling remain preserved. The four generation failures and 36 successful triples are unchanged.

## Literal requirements and minimum evidence

The operational manifest's `callersAndBudgets.futureCallPreflight` requires `requiredCli: "Claude Code CLI 2.1.288"`, `requiredAlias: "sonnet"`, and `requiredResolvedModel: "claude-sonnet-5-5"`.

Its `availability` requirement says: “Before any call, re-confirm exact CLI version, alias resolution, account-backed $0 access, and effective settings.” If the version or resolved model differs or cannot be reported, or settings cannot be pinned, the affected run must stop. Both downstream review and repair stage definitions separately say “pin exact resolved identity before any call.” This temporal condition is explicit. A later response identity cannot substitute for it. The alias is expressly allowed and required; replacing it with another requested identifier is not an authorized cure.

The exact `exactSamplingSettings` language is:

> Unavailable from committed evidence. Before any call, freeze and record the CLI's effective temperature, top-p/top-k if exposed, thinking/reasoning setting, max output tokens, structured-output mode, system prompt hash, request schema hash, permission/tool/network configuration, and any other exposed sampling or routing controls. If the exact effective settings cannot be observed and pinned, hard stop the affected run.

The minimum model evidence therefore distinguishes four different claims:

| Claim | What is established / required |
| --- | --- |
| Alias accepted | `--help` establishes syntax only; insufficient |
| Current alias resolution is the exact identity | Required pre-call; needs applicable active resolver/state evidence |
| Backend is guaranteed to execute that identity | Not explicitly a separate pre-call guarantee in the literal text; client resolution is not such a guarantee |
| Returned response identifies that identity | Relevant runtime provenance; no response obtained here, and not a substitute for pre-call proof |

The settings clause does **not** literally demand every unknown hidden backend parameter. It requires the enumerated CLI effective controls, top-p/top-k conditionally when exposed, and other **exposed** sampling/routing controls. Defaults are not categorically prohibited if their exact effective values can truthfully be observed and pinned. An applicable required setting marked merely unknown does not pass. A field proved inapplicable or omitted by the active client path is different from an invented numeric default. No RAW-only allowance for unobservable defaults is extended downstream.

## Historical findings

`docs/HOLDOUT-V3.md:28` records a successful structured-output smoke using CLI 2.1.288 with resolved model `claude-sonnet-5-5`. It establishes prior transport behavior, not current alias resolution, availability, or exact settings. The operational manifest itself explicitly calls this “prior successful structured-output smoke only; does not prove present availability or settings.” Its current version-only check likewise disclaims account, model-resolution, and settings proof.

Saved requests and adapters establish prompt/schema/request construction and historical isolated invocations. They do not supply a present effective-state snapshot for the proposed registered account-backed invocation. The successful RAW records used a distinct RAW-only first-response identity/defaults amendment; they cannot supply the original alias/settings preflight. Accordingly, historical evidence does not establish outcome A.

## Registered CLI inspection

The registered binary is `/Users/nicholaslippa/.local/share/claude/versions/2.1.288`, a native ARM64 Mach-O executable. Its pinned SHA-256 is `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`. Read-only `--help` inspection and lawful inspection of installed embedded strings/source make no model call. Source function names below are minified, can repeat in different embedded modules, and identify this binary rather than a stable public API.

The embedded hand-maintained model catalog has `aliases.sonnet.default: "claude-sonnet-5-5"`, with distinct third-party provider targets. Its Sonnet 5.5 row contains first-party identity `claude-sonnet-5-5`, default and upper maximum output tokens of 128000, default effort `medium`, and adaptive-thinking/effort capabilities.

The client resolver chain includes `Rt`, `Lm`, `ga` / `BI`, `sa`, `pa` / `Yb`, and `$x`. It can resolve the requested alias locally to a concrete model ID placed into the request. Environment defaults, provider selection, available-model restrictions, model overrides, policy, and active catalogs participate. The compiled first-party alias mapping alone is therefore **conditional evidence**, not proof of the contemplated active resolution. It also does not prove server execution identity.

Source exposes served/published catalog initialization and cached catalogs. `Qt({headless})` can fetch non-generative account/catalog metadata when a suitable cache is absent; published catalog initialization can consume cached/local state. These paths mean that categorical absence of pre-call evidence has not been proved. No claim is made that a supported complete introspection command was found.

The main-loop request constructor uses `model: $x(V.model)`, computed `max_tokens`, thinking and output configuration, and conditional temperature. The temperature expression is `!mh && yt.acceptsTemperature ? V.temperatureOverride ?? 1 : undefined`; it is an explicit value-or-omission branch, not proof that an arbitrary hidden numeric default applies. Model capability handling and active thinking state select that branch.

`J5o`, `NZ`, and `fGt` select output limits through model/catalog metadata, served values, capability cache, and the `CLAUDE_CODE_MAX_OUTPUT_TOKENS` override. `vbn`, `cIe`, and related effort logic can combine account/admin defaults, feature-gate configuration, served catalog, explicit effort, and caps. The baked 128000/medium values do not establish those effective branches.

No standalone advertised alias-registry or full effective-request inspection command was found in `--help`. Help lists an effort control and isolated session/tool/system/schema controls but does not display effective values. It does not advertise temperature/top-p/top-k flags. Locally inspectable payload construction exists; the exact contemplated effective payload is not captured pre-call.

Reproducible zero-based byte offsets in the exact registered executable locate the relevant embedded source:

| Source location | Byte offset |
| --- | ---: |
| Compiled Sonnet alias entry | 180061987 |
| Active catalog alias lookup (`cb`) | 181751206 |
| Provider alias lookup (`pa`) | 181767244 |
| Sonnet fallback resolver (`sa`) | 181768194 |
| Concrete request-model resolver (`$x`) | 181793707 |
| Output-limit resolver (`NZ`) | 181799599 |
| Default-output resolver (`J5o`) | 181800176 |
| Account effort resolver (`cIe`) | 182842613 |
| Effective effort resolver (`vbn`) | 182850321 |
| Main-loop temperature branch (`Ys`) | 189012697 |
| Served catalog initialization (`Qt`) | 195739590 |

These are source-identification anchors, not executed proof functions. Source presence does not prove which branch the future invocation selects.

## Official documentation

The official [model configuration documentation](https://code.claude.com/docs/en/model-config) was read on 2026-10-04. Its version-history table attributes the Anthropic first-party Sonnet 5.5 alias change to v2.1.284, corroborating the compiled 2.1.288 mapping. It describes provider-specific alias behavior, environment/model overrides, organization restrictions, effort settings, and `/status` for the current session model. This is useful version-aware evidence, not a current isolated invocation snapshot.

The official [settings documentation](https://code.claude.com/docs/en/settings) describes settings precedence. Neither inspected page establishes a complete exact effective tuple for the registered invocation or hidden account-specific state. No visible publication/update timestamp was supplied; access date and the explicit version-history applicability are recorded instead. Current general documentation is not assumed to reproduce every 2.1.288 branch. No third-party documentation is used.

The official [environment-variable reference](https://code.claude.com/docs/en/env-vars), retrieved 2026-10-04 without a visible publisher update date, describes model-dependent output limits, effort-variable precedence over CLI effort subject to caps, and adaptive/fixed thinking controls. It supports the existence of configurable branches rather than a universal numeric default. It supplies no present account-specific effective tuple and is not substituted for registered-version proof.

## Settings satisfiability matrix

“Not established” means current pre-call evidence is incomplete; it does not mean the setting is proven permanently unobservable.

| Setting | Required? | User controllable? | Explicitly set in proposed path? | Read-only observable? | Authoritatively documented? | Hidden/state-dependent? | Satisfied now? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Requested model | Yes | CLI flag | `sonnet` | Request string/source | Yes, alias syntax | No for request string | Yes, request policy only |
| Resolved model | Yes, pre-call | Overrides affect resolution | Expected identity, not an observed value | Compiled target; active value not established | Version history | Active catalog/policy/provider | No |
| Effort/reasoning | Yes | Effort flag; thinking controls | No finalized effective effort profile | Source/control exists; active value not established | Defaults, precedence and caps | Account/config/thinking branch | No |
| Temperature | Yes, applicable control | No advertised flag; source override path | No | Source formula; active branch not established | No exact applicable tuple found | Capability/thinking branch | No |
| Top-p | If exposed | No inspected CLI exposure | No | No active exposure demonstrated | No exact value established | Applicability not invented | Conditional; no extra blocker established |
| Top-k | If exposed | No inspected CLI exposure | No | No active exposure demonstrated | No exact value established | Applicability not invented | Conditional; no extra blocker established |
| Max output | Yes | Environment override | No; proposed defaults | Metadata/source; active value not established | Model-dependent limits | Catalog/capability/default branch | No |
| System prompt | Yes, hash | CLI prompt control | Frozen repository prompt bytes | Repository bytes/hash; effective additions not fully established | CLI control documented | Client additions must be accounted for | Bytes pinnable; tuple incomplete |
| Structured output/schema | Yes | CLI flags | Explicit schema/format | Repository schema and flags | Yes | Strict parser path known | Pinnable |
| Tools/MCP/permissions | Yes | CLI controls | Explicit disabling/isolation | Flags/source; managed effective tuple incomplete | Yes | Managed behavior | Controls pinnable; tuple incomplete |
| Session persistence | Required isolation | CLI flags | Disabled; no resume | Flags/source | Yes | No carryover requested | Pinnable |
| Timeout | Frozen runtime control | Harness configuration | 20000 ms | Mock-tested code | Repository contract | No | Pinnable |
| Retries | Frozen budget | Harness/environment controls | Zero | Code and mocks; no live validation | Repository contract | Internal behavior separately constrained | Pinnable policy |
| Repair count | At most one | Frozen arm budget | One ceiling | Frozen source/harness | Repository contract | Conditional need | Pinnable |
| Recheck count | At most one | Frozen arm budget | One ceiling | Frozen source/harness | Repository contract | Conditional need | Pinnable |
| Provider | Account-backed only | Route configuration | Alternatives scrubbed | Existing route/auth evidence | Yes | Routing/config remains relevant | Account route established; tuple incomplete |
| Auth route | Yes | User login | `claude.ai` | Existing host status | Yes | No credentials stored here | Established separately |

This matrix does not replace the frozen protocol or authorize proposed settings. It separates repository-enforceable controls from the unresolved effective-state proof.

## Model evidence chain

| Link | Finding |
| --- | --- |
| REQUESTED | `sonnet` |
| CLIENT RESOLUTION | Compiled first-party target is `claude-sonnet-5-5`; active override/catalog branch not established |
| SERVER RESOLUTION | Not observed; no inference made |
| EXPECTED | `claude-sonnet-5-5` |
| PRE-CALL PROOF | Partial static/version evidence; complete current applicable proof absent |
| RUNTIME PROOF | None collected; cannot substitute for the required pre-call proof |

Alias acceptance, compiled alias defaults, active request resolution, backend execution and response identity are kept separate. No valid complete active chain is claimed.

## Informational newer-version inspection

The 2.1.289 `--help` output was inspected informationally only. It is byte-identical to the 2.1.288 help output; both SHA-256 values are `a58ca2282c01312250fc8d861088dae6e46340ad55346557fcdbc0053f415367`. No newly advertised mechanism appears in that comparison. This does not prove all internal behavior is identical or no hidden mechanism exists. The bare launcher/newer version cannot satisfy the registered 2.1.288 requirements, and neither binary was changed or upgraded.

## Independent reviews and adjudication

Reviewer A was assigned to attempt a satisfiability proof; reviewer B was assigned to attempt an infeasibility proof. Both received the same frozen requirements, known execution facts and neutral evidence. Their initial conclusions were formed independently before evidence exchange; no architecture outcomes exist.

Reviewer A concludes **D**, independently of reviewer B. **Evidence:** compiled local alias mapping, source settings construction, version-aware official alias documentation. **Inference:** a pre-call branch-specific proof may be possible, so permanent infeasibility is not established. **Unproven assumption rejected:** compiled defaults equal present effective state. Neither A nor B is currently proved.

Reviewer B independently concludes **D**. **Evidence:** explicit pre-call hard stops, insufficient historical smoke, dynamic alias/effort/output construction and absence of a complete captured effective tuple. **Inference:** execution remains blocked. **Unproven assumption rejected:** lack of a demonstrated mechanism establishes that no permitted mechanism can exist. A categorical C finding would exceed the evidence.

The positions converge on D while approaching opposite proof burdens. The final adjudication is **D — INDETERMINATE**: existing evidence is insufficient, and locally inspectable dynamic machinery prevents claiming impossibility solely from earlier unsuccessful introspection. This corrects overbroad paraphrases without weakening a requirement.

## Consequence and exact next task

Current arm execution and a READY freeze are **not permitted**: the original pre-call requirements have not been satisfied. The current comparison is not certified executable as written. It is also not adjudicated permanently infeasible. No protocol is amended, alias is substituted, RAW waiver extended, or runtime proof accepted in place of pre-call proof.

The exact missing evidence is a legitimate non-generative effective-state determination for the registered 2.1.288 isolated host/account invocation: applicable active served/published catalog and resolution scope/freshness, relevant managed policy/config/feature-gate branches, resolved request identity, effective effort/thinking, temperature presence/value or proven inapplicability, maximum output, and remaining exposed required controls. It must be independently attributable to the actual proposed path, not arbitrary proof booleans or a modified provider.

The next permitted task is to investigate whether that complete effective-state determination can be obtained through permitted read-only catalog/config/diagnostic mechanisms, or obtain authoritative version-specific evidence proving why a required applicable value cannot be exposed. There is no permission to make a smoke/model call to answer it. If later evidence supports C, the current protocol cannot be executed validly as written; abandoning it or preregistering a new prospective experiment are future choices, and reuse of frozen materials would require explicit prospective treatment. None is taken here.

No model inference, arm execution, RAW regeneration, blind judgment, scoring, architecture/protocol/production change, or V16 creation occurs in this investigation. Incremental experimental paid API spend is $0; agent-system review cost is not separately audited.

Offline validation: `node --import tsx tools/eval/post-v3-raw-freeze-verify.ts` returned valid, 40 attempts, 36 successes, four technical failures and comparison outputs absent; its RAW and freeze-manifest hashes match the stated frozen values. All 28 original input/tooling pins in the historical v2 blocked snapshot independently reproduce. The registered binary hash reproduces. `git diff --check` passes. These checks are not pre-call model/settings proof. Unrelated `.gitignore` and `.ignore` remain unstaged and byte-preserved; only this documentary report is eligible for this commit.
