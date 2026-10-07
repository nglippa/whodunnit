# Claude Code 2.1.288 final transport: static evidence

This is a **static map, not a final-wire capture or egress certification**. The
registered Mach-O executable is
`/Users/nicholaslippa/.local/share/claude/versions/2.1.288`, SHA-256
`bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`.
Offsets below are byte offsets in that file. Inspection did not execute the
client, load account state, send a request, or query a Beacon.

## Final JavaScript path

| Stage | Direct binary evidence | Consequence |
| --- | --- | --- |
| SDK build and retry | `makeRequest` at 185475920 calls `buildRequest`, `fetchWithTimeout`, and `retryRequest`. `buildRequest` at 185481171 builds URL, headers and body. `fetchWithTimeout` at 185478914 applies `prepareRequest` and request middleware. | A retry rebuilds the request; observing one attempt cannot prove all attempts. |
| Native wrapper | `xD` at 185923945 passes `gJ` as the SDK fetch and constructs provider clients with common options. `gJ` at 185940310 can add headers, set `compress`, alter the string body through `ZSt`, and redispatch via `II` and `F6r`. | An SDK-entry capture is before native mutation. |
| Default fetch | `gJ` selects `fetchOverride ?? zJ`. `zJ` at 185918198 runs `MI` only for compressible `/v1/messages` requests, then `NI`. | Internal `fetchOverride` replaces `zJ`; it does not observe an unchanged default request. |
| Final compression | `MI` at 185914806 can replace the string body with compressed bytes and set `Content-Encoding: gzip`. It can also return the original init, including `compress`, for mode 0, runtime compression or error; `LI` at 185918198 parses this option. | The final wire bytes are not necessarily the body visible before `zJ`, and in some branches native fetch may still handle `compress`. The exact runtime encoding cannot be certified from this JavaScript alone. |
| Route selection | `NI` at 185918320 calls `_Rn(url, init, Mjr("modelApi", init))`. `Mjr` at 185290632 returns a `Bun.FetchSession.fetch` closure for the standalone executable, passing fetch options while omitting `tls` when neither `proxy` nor `unix` is specified. `GZr` at 180154756 creates and caches `Bun.FetchSession` with mTLS/CA settings. | The route can be a Bun session rather than global fetch. The native FetchSession implementation lies below the extracted JavaScript. |
| Dispatch | `_Rn` at 181300364 captures `globalThis.fetch`, then uses the route only when that value equals original `d` (captured at 181298525); otherwise it calls global fetch. | Monkeypatching global fetch changes transport selection. `_Rn` is the last located JavaScript pre-dispatch call, but not proof of the last mutation before bytes leave. |

The main streaming call at 189047453 invokes
`beta.messages.create({...params, stream: true}).withResponse()` through the
same `xD` client. The nonstreaming fallback at 188968049 invokes
`beta.messages.create({...params, stream: false}).withResponse()` through
`xD`. SDK `retryRequest` (185479900 range) reruns `makeRequest`. `gJ` can send
an identity-body retry after compression rejection through `F6r` (184943684)
and a block-compression rejection through `II` (185914806 range). These are
static call paths, not dynamic coverage of every retry or fallback condition.

## Proxy, socket and provider routing

`Fi` at 180163162 builds fetch options for `xD` with
`forAnthropicAPI: true` (185923945). In precedence order:

1. If `ANTHROPIC_UNIX_SOCKET` is set, it returns `unix: path` **before**
   considering proxies. At the JavaScript level it does not rewrite the URL,
   method, headers or body; Bun's connection/TLS behavior with this option is
   not established. This setting changes the native destination for every
   `xD` provider and cannot be presumed experimentally equivalent. A Unix
   listener that forwards traffic would also escape a guard applied only to
   the Claude process's IP sockets.
2. Otherwise, a valid configured HTTP(S) proxy is used unless `Lh` matches
   `NO_PROXY`/`no_proxy` (180159733–180160795). Proxy authentication can add
   `Proxy-Authorization` through the proxy auth helper. A matching no-proxy
   rule returns direct fetch options.
3. Otherwise, fetch is direct with available mTLS/CA options. An optional
   fallback proxy has its own IP/CIDR and no-proxy checks.

`Sw` at 180163162 separately configures Axios agents and an Undici global
dispatcher for other traffic. Those paths are not thereby covered by the
`modelApi` FetchSession route or an interception of global fetch.

`xD` at 185923945–185933197 branches to gateway, Bedrock, Foundry,
Anthropic-on-AWS, Anthropic Google Cloud, Mantle, Vertex and first-party
clients. `iJ` at 185933197 selects provider base URLs, some overridable by
environment. The first-party beta SDK message method posts
`/v1/messages?beta=true` (185423750); the ordinary method posts
`/v1/messages` (185463100 range). Other provider SDKs live in bundled chunks;
their final paths and any provider-specific transport mutations have **not**
been exhaustively established here. `zJ`'s explicit compression test at
185914559 parses the URL and checks its *pathname* for `/v1/messages`, so the
first-party `?beta=true` query does not prevent that path match. Provider
paths may take different branches.

The JavaScript `_Rn` implementation does not itself implement TLS, HTTP
framing, CONNECT, redirects or sockets. It calls a Bun `FetchSession` or
global fetch. No byte-level proof was obtained for their native HTTP/TLS
implementation, redirect policy, connection establishment, or streaming
transfer framing. A successful socket connect probe alone would reveal only
destination metadata on TLS traffic, not final HTTP headers and body.

## Candidate boundary and limits

The strongest **located JavaScript** boundary is the argument pair entering
`_Rn` after `zJ`, including the selected `Bun.FetchSession` closure. It is
post-`MI` for JavaScript block compression and before the fetch call. It is
**not certified as the final semantic HTTP request**: runtime compression,
HTTP framing/headers, proxy behavior, TLS and redirects can happen below it.
Changing `globalThis.fetch` to observe it would itself disable the
`FetchSession` branch. An explicit proxy can preserve the JS `zJ` path but
changes transport routing, and an HTTPS CONNECT proxy sees host/port only
unless a trusted local TLS terminator is introduced. TLS termination would
need separate proof of trust, request-byte fidelity, bootstrap compatibility,
nonforwarding behavior and an independent lower egress guard. The binary was
left byte-identical.

| Claim | Fact | Inference | Assumption still needed | Severity |
| --- | --- | --- | --- | --- |
| Final-body equivalence | `MI` can produce gzip bytes or leave `compress` for native fetch. | A JS hook before or replacing `zJ` can miss final body behavior. | Native fetch encoding and wire bytes are identical to an observed representation. | HIGH |
| Route coverage | `Mjr` may select `Bun.FetchSession`; `_Rn` also has global-fetch branch; `Fi` has Unix, proxy and direct options. | One fetch/proxy hook does not cover all routes by itself. | Provider SDKs and all descendants use the observed route. | CRITICAL |
| External final-wire capture | No TLS termination or post-Bun HTTP capture ran. | Socket metadata cannot expose encrypted request body. | A local TLS/proxy arrangement can preserve account/bootstrap, model policy and native routing while capturing and refusing inference. | HIGH |
| Egress containment | No guard was tested against this registered binary or all routes in this inspection. | A process-only IP guard may miss Unix-socket forwarding or other processes. | A separately enforced guard covers every established model egress path and fails closed. | CRITICAL |

**Bounded result:** Static inspection establishes a narrow post-`zJ` JS call
site but no certified external final-wire capture or exhaustive containment.
The exact final HTTP/TLS/socket behavior and provider-specific paths require
non-inference instrumentation or authoritative native-runtime evidence before
any inert native request may be attempted. No inference, model dispatch or
experimental spend occurred in this analysis.
