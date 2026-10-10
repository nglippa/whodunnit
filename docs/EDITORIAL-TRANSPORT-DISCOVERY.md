# Editorial experiment transport discovery

**C — NO PERMITTED TRANSPORT AVAILABLE for the locked experiment using currently configured access.** Starting checkpoint: `3f622ea`. Discovery performed October 9, 2026 (recorded timestamps are UTC, October 10). Authenticated metadata access works; exact-model inference access has not been established. No smoke test or quality comparison ran.

## Existing supported transports

The project selects Gemini, Anthropic or OpenAI-compatible APIs through [select.ts](../src/lib/ai/select.ts) and [index.ts](../src/lib/ai/index.ts). Its evaluation tooling also supports [Groq](../src/lib/ai/groq.ts). Workspace configuration contains Gemini and Groq credentials; no OpenAI or Anthropic API credential or custom OpenAI-compatible base URL is configured. Only credential-presence booleans were recorded. Subscription authentication was not converted into API credentials.

The isolated [discovery utility](../tools/editorial-intelligence/transport-discovery.ts) performs authenticated GET requests to the official Gemini and Groq model catalogs. It has fixed destinations, rejects redirects, sanitizes failures, retains only model IDs/statuses and hashes that safe projection. It never launches a CLI, generates text or connects a substitute model to the experiment.

| Authenticated catalog | HTTP | Complete model IDs | `gpt-6-astra` listed | `gpt-6.1-sol` listed | Catalog latency |
|---|---:|---:|---|---|---:|
| Gemini `v1beta/models` | 200 | 62 | no | no | 171.9 ms |
| Groq `openai/v1/models` | 200 | 11 | no | no | 142.3 ms |

These are metadata observations, not runtime model identities or inference entitlements. The configured Gemini name `gemini-flash-3.8` is not the catalog's `gemini-3.8-flash`; the alternative `gpt-oss-120b` is not Groq's exact `openai/gpt-oss-120b`. Neither was silently aliased or invoked. Neither would satisfy the pinned experiment models.

Successful evidence: [transport-discovery.json](../data/experiments/editorial-intelligence-v1/transport-discovery.json). The initial network-sandbox failure is separately preserved in [transport-discovery-sandbox.json](../data/experiments/editorial-intelligence-v1/transport-discovery-sandbox.json). There were **four metadata request attempts**, two failing before an HTTP response and two succeeding after approved network escalation. No generation endpoint was contacted. Discovery used the existing credentials in memory/authentication headers only; headers, credentials and raw error bodies are absent from artifacts.

## Why account CLI access is blocked

The local [subagent guard](/Users/nicholaslippa/.agents/bin/subagent-guard.py:28), registered in [hooks.json](/Users/nicholaslippa/.codex/hooks.json:45), rejects `codex exec`, `codex e`, `codex review`, and Claude print/background command strings before execution. That explains the earlier rejection of `codex exec --help`: the matcher has no help exemption. It is an orchestration safety restriction enforcing native worker slots, not an authentication failure and not merely a missing experiment adapter. The [canonical policy](/Users/nicholaslippa/.agents/instructions/subagent-orchestration.md) also prohibits separate CLI model sessions and bypassing hooks.

The historical Claude RAW adapter launches a CLI subprocess. Hiding such a launch inside Node would evade the matcher without satisfying the policy. It was not attempted. Native repository workers have fixed task roles/models and are not a neutral, receipt-bearing frontier editor interface. Codex catalog visibility and Claude MCP readiness do not prove exact-model invocation. The existing Claude critique interface does not establish the required neutral editing and blind-judge transport.

Existing project providers also discard returned model identity or report configured identity, and may retry. They cannot directly supply the harness's exact runtime identity and one-attempt provenance contract. No inference adapter was connected because discovery did not establish a permitted exact-model transport.

## Execution and next required action

Actual invocations: **0 direct editor, 0 diagnosis, 0 reconstruction, 0 independent judge**. Actual model identities: **none**. Smoke case: **not executed**. Tokens, inference costs and inference latency: **unavailable**, not a zero-price estimate. The measured latencies above concern catalog requests only. There are no blinded outputs, judgments or editorial quality findings. Historical prepared experiment manifests remain unchanged.

The smallest API-path user action is to configure a separately entitled OpenAI API credential securely and explicitly authorize the potentially metered three-call smoke test (plus the independent judge if available). Exact editor/judge availability must then be established and a small isolated caller must retain returned identity, inference parameters, request IDs, usage, latency and sanitized response provenance; model substitution must fail. An account-only CLI path instead requires explicit approval for a narrow change to the canonical orchestration policy and guard, followed by synchronization/restart and an audited entry point. This pass changes neither credentials nor guards and does not request a broad bypass.

Validation: targeted harness/discovery tests and saved catalog artifact checks; historical prepared-manifest validation. Browser verification is unnecessary for this isolated metadata CLI/documentation work. Candidate D, V15, Candidate C, frozen benchmarks and production integrations are unchanged.
