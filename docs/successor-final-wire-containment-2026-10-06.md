# Final-wire containment feasibility (6 October 2026)

**Status: viable architecture, not certified.** This note evaluates the lower
transport boundary for the registered, byte-identical Claude Code 2.1.288 file.
It does not claim a native capture, authorize a native model attempt, or change
the successor preregistration. The binary SHA-256 was rechecked as
`bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`.
Starting HEAD was `0f4006e8b8b6086dc499b10c99b53b24839aff56`; the only
initial changes were the known Graft `.gitignore` edit and untracked `.ignore`.

## Native and registered constraints

In the exact binary, `rt` at byte 194872180 obtains first-party bootstrap via
an Axios `GET /api/claude_cli/bootstrap` against the configured first-party base
URL. The historical authorized acquisition records the ordinary first-party
host `api.anthropic.com` and query
`entrypoint=sdk-cli&model=claude-sonnet-5-5`; that acquisition used a Python
transport replica and is **not** evidence that the whole native client took the
same branch. Other possible account/catalog paths must still be inventoried.
The binary also skips bootstrap for a Unix-socket-proxied session, so switching
to `ANTHROPIC_UNIX_SOCKET` would change the branch being certified.

For first-party model dispatch, the prior source inspection and fresh static
check establish `gJ -> zJ -> MI -> NI -> _Rn`; `MI` can gzip/replace the body,
and `NI` can supply `Mjr("modelApi", init)` as an alternative to global fetch.
In the registered standalone executable, `Mjr` can obtain a Bun `FetchSession`
for this route. A capture at `fetchOverride` replaces `zJ`, so it is not the
boundary here. A final transport observer must see the resulting HTTP request
after `MI`, including its compressed entity body when compression runs.

The public [Messages API](https://platform.claude.com/docs/en/api/overview)
uses `POST /v1/messages` at `https://api.anthropic.com`. This gives a useful
method/path discriminator against the known bootstrap GET, **but the host is
shared**. A host allowlist, DNS rule, SNI filter, or ordinary socket guard
cannot permit that bootstrap while independently denying this model endpoint.
The exact client may have other model, account, retry, fallback, and provider
routes; neither this discriminator nor the known bootstrap GET is an exhaustive
allowlist.

The [successor preregistration](../data/evaluation/post-v3-successor/preregistration.json)
requires no routing overrides on experimental calls and permits only a
committed **capture-only** destination override with differential proof of
identical body/account/bootstrap branch. Setting a proxy only during capture is
therefore a material intervention to prove equivalent, even though it need not
change the model request's prompt or sampling fields. Static proxy support does
not satisfy that differential requirement.

## Candidate boundary

The best currently testable candidate is a local TLS-inspection proxy reached
through Claude Code's documented `HTTPS_PROXY` setting and a trusted local CA,
with the registered client constrained to the local proxy socket by an OS
sandbox. Anthropic's [network configuration](https://code.claude.com/docs/en/network-config)
documents both proxy and CA settings for native installs, as well as gzip
request bodies. Compression must remain enabled under its ordinary policy; the
documented option to disable it would change the request being certified.

The local TLS endpoint can in principle observe the HTTP method, path, headers,
and final body bytes after the client has run `zJ`, and reject a model request
before it is forwarded. It must first prove that the exact first-party
`FetchSession`, Axios bootstrap, streaming, retries, and every applicable
provider transport actually use this proxy. A successful `CONNECT` alone proves
only tunnel use: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)
specifies that CONNECT names host and port, then blindly tunnels data. Without
controlled TLS termination the proxy cannot read the inner method/path/body.

The client-side OS rule is a **separate bypass barrier**: deny every nonlocal
network connection of the registered process and descendants, while allowing
only the local proxy socket. This can stop a provider route that ignores proxy
settings, but cannot capture that route. The proxy must itself lack remote
egress. A distinct, more privileged bootstrap forwarder would need to accept
only an independently parsed, narrowly allowlisted non-inference request and
return the genuine upstream response. Keeping capture and forwarding in one
remotely connected proxy would make its own failure an inference escape path.
The forwarder is a proposed architecture, **not an implemented or certified
guard**. It must preserve native account/auth and bootstrap response behavior;
its method/path check must reject unknown paths, redirects, upgrades, tunneled
requests, and malformed framing before any upstream write.

Two guards would then be independent in a limited, testable sense: the kernel
rule blocks client direct egress, and the separate path-aware forwarder blocks
model egress even if the capture proxy tries to send it. Independence is not
established merely by naming two processes. The forwarder must be the *only*
process with remote reachability, and the proxy's inability to bypass it needs
OS-level proof. A guard crash must remove remote capability rather than select
an unrestricted fallback. The endpoint mapping for the bootstrap forwarder may
still alter upstream HTTP/TLS wire details, so fidelity requires comparison of
the semantic native request and response branch, not an assertion of byte-for-
byte end-to-end TLS equality.

The same Anthropic network guide notes that background-agent supervisors can
outlive the shell and start workers from a fixed path, bypassing a PATH wrapper.
The successor profile should disable such activity where registered; otherwise
the guard must demonstrably cover the supervisor and workers too. A guarded
foreground CLI parent and one synthetic child do not establish that coverage.

## Inert OS-guard probe

Only Python sockets were exercised, with no Claude launch, credentials, or
model/Beacon endpoint. The inherited shell sandbox rejects nested
`sandbox-exec` with exit 71; the following authorized inert probe ran outside
it. Under `(version 1) (allow default) (deny network*) (allow network-outbound
(remote ip "localhost:1"))`, a connect to `127.0.0.1:1` returned errno 61
(`ECONNREFUSED`, so the local outbound rule admitted it), while a connect to
the documentation address `192.0.2.1:1` returned errno 1 (`EPERM`). The same
results occurred in one child Python process. This proves a narrowly scoped
loopback-versus-nonlocal distinction and one child inheritance example on this
machine. It does **not** prove the registered binary, all descendants, Unix
sockets, IPv6, proxy listener reachability, all provider transports, or guard
failure behavior. Apple's local `sandbox-exec(1)` manual labels the utility
deprecated; reproducibility and long-term support remain material risks.

## Mechanism comparison

This is a candidate-capability table, not achieved native evidence. `Yes`
means the mechanism supports the property by design, not that the registered
binary has been proved to use it. `Conditional` means a named proof is still
required. `No` means the mechanism lacks the property.
The columns correspond to the requested criteria: **Z** after `zJ`, **U**
unchanged `zJ`, **R** native routing retained, **B** final body, **S** secret
sanitization, **D** block inference, **St** streaming, **RF** retry/fallback,
**A** alternate providers, **Bt** bootstrap, **Rep** reproducible, **Bin**
binary unchanged, **Sci** scientific settings unchanged, **G** independent
second guard possible.

| Candidate | Z | U | R | B | S | D | St | RF | A | Bt | Rep | Bin | Sci | G |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SDK `fetchOverride` | No | No | No | No | Conditional | Yes | Conditional | Conditional | No | Conditional | Conditional | Yes | Conditional | Yes |
| Ordinary HTTPS CONNECT proxy | Yes | Yes | Conditional | No | No | Host only | Yes | Conditional | Conditional | Conditional | Yes | Yes | Conditional | Yes |
| Local trusted TLS inspection + client OS rule + separate bootstrap guard | Conditional | Yes | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Yes | Conditional | Conditional |
| Bun dispatcher/FetchSession instrumentation | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | No supported hook found | Conditional | Conditional | Yes |
| Injected socket/TLS interposition | Conditional | Conditional | Conditional | Conditional | Conditional | Yes | Conditional | Conditional | Conditional | Conditional | Conditional | No proven byte-identical path | Conditional | Yes |
| Packet filter or Network Extension alone | Yes | Yes | Yes | No after TLS | No | Host/IP only | Yes | Yes | Yes | Shared host fails | Conditional | Yes | Yes | Cannot independently distinguish path |
| `ANTHROPIC_UNIX_SOCKET` | Conditional | Conditional | No | Conditional | Conditional | Yes | Conditional | Conditional | No proof | **No** (bootstrap skip) | Conditional | Yes | **No** | Yes |

Apple documents that a Network Extension flow URL is present only for
WebKit-originated flows, not arbitrary native socket flows
([`NEFilterFlow.url`](https://developer.apple.com/documentation/networkextension/nefilterflow/url)).
Its [socket-flow endpoint](https://developer.apple.com/documentation/networkextension/nefiltersocketflow/remoteendpoint)
can describe a connection destination, not the decrypted API path. Thus a
packet/socket layer by itself is not the path-aware shared-host guard.

## Certification gate and bounded conclusion

No native inert test was run: a complete independent egress guard was not
established before launch. There is no captured request, bootstrap run, model
dispatch, or inference response. To proceed, a lab would need to prove, before
native launch: (1) the client and all descendants can connect only to the
specified local capture socket; (2) the capture process cannot connect remotely;
(3) the separate forwarder can reach only the required upstream destinations
and rejects every request except a fixed, proven non-inference bootstrap/account/
catalog allowlist; (4) failures of either guard remove reachability; (5) the
registered native transports all honor the proxy or are independently denied.
Then an inert native differential test must establish account/bootstrap branch,
model policy, serialized body, compression, routing, streaming, and retry
equivalence under the capture-only proxy, with all secrets removed before any
durable artifact. The final experimental calls cannot inherit a capture-only
routing override without resolving the registration constraint.

The current evidence supports **D — both final-wire capture and egress
containment remain incomplete but viable**, not certification and not an
impossibility proof. The strongest unresolved risk is a shared-host bootstrap
forwarder that has remote reachability but lacks an independently proven,
fail-closed path decision. A client-only kernel restriction plus a remotely
connected capture proxy does not satisfy the independent-guard requirement.
