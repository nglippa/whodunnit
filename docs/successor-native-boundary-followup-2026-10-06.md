# Successor native boundary follow-up (6 October 2026)

**Verdict: D — capture and egress remain incomplete.** This is static inspection
of the registered Claude Code binary and inert loopback guard probes. It is not a
native effective-request capture or permission to run a successor profile.

The registered file at
`/Users/nicholaslippa/.local/share/claude/versions/2.1.288` has SHA-256
`bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`.
The requested identity is `claude-sonnet-5-5`. No remote served identity was
observed or inferred.

## Static request path

Byte offsets below identify UTF-8 code bytes in that exact executable. At
185475920, SDK `makeRequest` prepares options, invokes `buildRequest`, and calls
`fetchWithTimeout`. At 185481171, `buildRequest` creates the URL, serialized
body and headers. At 185478914, `fetchWithTimeout` wraps the configured SDK
`fetch` in a timeout and a wrapper that calls `prepareRequest`; `by`/`SH` at
185341104 composes request middleware before that wrapper. The SDK `fetch`
therefore receives the request after SDK middleware and `prepareRequest`.

The native client constructor `xD` at 185923945 accepts an internal
`fetchOverride` and passes it to `gJ` through the SDK `fetch` option. `gJ` at
185940310 mutates headers and can compress/replace the body before calling its
underlying fetch. Thus capturing at the SDK `fetch` entry is **too early** for a
final native request. The internal `fetchOverride` reaches a later seam, but
`gJ` selects `fetchOverride ?? zJ`: supplying the override **replaces** the
default `zJ` path. `zJ` at 185918320 conditionally calls `MI` at 185914806,
which can change the serialized body and `Content-Encoding` before `NI` calls
`_Rn`. `NI` also supplies `Mjr("modelApi", ...)`, whose route selection can
replace the global fetch transport. `_Rn` at 181300364 chooses between that
route and `globalThis.fetch`. Therefore an override capture is not automatically
the same bytes or transport decision as ordinary native dispatch. `gJ` can
redispatch after a response through `II` and
`F6r`, again calling the underlying fetch. The SDK `makeRequest` can retry by
calling `retryRequest` and rebuilding the request. Main nonstreaming fallback at
188967442 forwards `e.fetchOverride` into `xD`; the main streaming path at
189041040 also forwards it. These are source-derived call-path facts, not
runtime coverage tests.

At 185931800, `xD` constructs first-party, gateway, Bedrock, Foundry,
Anthropic-on-AWS, Anthropic Google Cloud, Mantle and Vertex SDK clients. The
`gJ` wrapper is passed in the shared options, but provider-specific SDK modules
and other model dispatches have not been exhaustively traced or exercised. The
CLI has no demonstrated supported external mechanism to supply `fetchOverride`
for the registered invocation. Even if injection became available, the default
`zJ`/`MI`/`NI`/`Mjr` effects would require equivalence proof. A separate
generator, static payload estimate, pre-middleware hook, or model endpoint proxy
would not establish final native request equivalence.

## Inert network probe and limit

The following probes ran outside the inherited sandbox. All tried only
`127.0.0.1:1`; neither launched Claude, read credentials, or contacted a remote
host.

| Probe | Result |
| --- | --- |
| `/usr/bin/python3 -c 'import socket; s=socket.socket(); s.connect(("127.0.0.1",1))'` | `ConnectionRefusedError`, errno 61 |
| Same Python command under `sandbox-exec -p '(version 1) (allow default) (deny network*)'` | `PermissionError`, errno 1 |
| Guarded Python parent launching a Python child that makes the same connect | Child `PermissionError`, errno 1; parent observed child exit 1 |

This proves denial of that direct outbound loopback connect and inheritance by
one Python child process. It does not prove all descendants, Unix socket
coverage, the registered native process, all endpoints/providers, or
guard-failure behavior. The inherited sandbox
itself rejects nested `sandbox-exec` with exit 71, so the probe was run outside
it. No guarded native client was launched.

A deny-all network profile would also deny the normal remote account/bootstrap
and catalog requests that may affect effective request construction. The
bootstrap path and first-party inference endpoint share `api.anthropic.com`;
allowing that host in a host-level guard cannot distinguish the permitted
metadata path from forbidden model dispatch. Path-aware permission would require
an independently verified network boundary that preserves native TLS, account,
and bootstrap behavior. No such boundary has been implemented or certified.

## Certification gaps

| Finding | Fact | Inference | Assumption | Severity |
| --- | --- | --- | --- | --- |
| Native capture injection | An internal `fetchOverride` reaches the late `gJ` seam, but replaces default `zJ`; `MI` and `Mjr` can alter body and transport. | An override could see post-`gJ` requests on covered paths, but those may differ from default dispatch. | CLI injection, default-path equivalence and full provider/path coverage are available. | HIGH |
| Native equivalence | No native request was constructed or captured. | Static fields cannot certify the effective request. | A cached/replicated bootstrap state matches normal startup. | HIGH |
| Dispatch safety | Direct and one child guarded Python loopback connects were denied. | A process-scoped sandbox may block further socket traffic. | Native, all descendants, retries, fallback and alternate transports are blocked. | CRITICAL |
| Bootstrap fidelity | Native bootstrap/catalog can fetch remote state; strict network denial blocks it. | A strict offline run could select a different request branch. | Offline and online branches are equivalent. | HIGH |

The fail-closed matrix, descendant/alternate transport tests, sanitized native
request artifact and three positive certification audits cannot be performed
from this evidence. No interceptor is installed, so the requested negative
failure cases must remain **UNTESTED**, not PASS. The exact next infrastructure
task is to establish a supported native late-fetch injection and an independent
path-aware guard with exhaustive provider and descendant coverage, then run the
inert synthetic matrix before any successor effort proof. No model inference,
model dispatch, target Beacon query, effort selection or successor arm was made
in this follow-up.
