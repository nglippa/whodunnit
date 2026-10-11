# User-operated semantic verification

The earlier subscription-authenticated Codex workflow is reusable **from the user's own terminal**. Account selection is per process (`codex3`), using the existing `/Users/nicholaslippa/.codex-account-3` configuration. Nothing logs out, copies tokens, changes accounts' configuration, or disables security guards. The agent must never execute or source this workflow.

Requested verifier: **gpt-6.1-sol**, reasoning **high**. Installed package inspected: Codex **0.162.1**. Current authentication, credits and access to that model have not been re-established. Execution stops on CLI errors or any reported different model; there is no substitution. A missing reported identity remains unknown and the evidence remains exploratory.

## One user command

Run this yourself in your authenticated terminal:

```sh
cd /Users/nicholaslippa/Projects/Whodunnit && zsh tools/eval/semantic-discrimination-user-run.zsh --continue-with-sp008-retry
```

The script validates all original artifacts and skips SP-001 through SP-007, which already have accepted first attempts. It submits the pending first attempts SP-009 through SP-012, then the single explicitly authorized SP-008 retry, each in a fresh ephemeral invocation. It captures response bytes directly with the prior CLI's `--output-last-message` mechanism and imports each response before the next call. An existing unfinished or failed first capture stops execution; do not delete it to retry. The retry has its own permanent one-slot reservation; a failure or interrupted run consumes that slot, rather than authorizing another invocation. The final action validates the complete archive and reports first-attempt and retry validity separately. The script does **not** unblind, run another judge, repair answers or report experimental results.

The requested settings retain read-only sandbox, high reasoning, disabled web search, memories, multi-agent features, default apps and image viewing from the prior workflow. This does not establish a global tool-free mode: built-in shell and inherited integrations may still be available. Any recognized tool-use event stops the run. Account rules, project instructions and guards remain active. No enforceable output-token limit was established; the original 4096-token setting is an intended budget, not a claimed enforced cap. Actual provider settings and internal retry behavior remain unverified.

## Evidence instruction and immutable requests

Every existing `request.json`, `prompt.txt`, metadata template, blind identifier, manifest, packet and fingerprint remains unchanged. The raw input is **the original prompt bytes followed by** [evidence-instructions.txt](../data/experiments/semantic-discrimination-probe-v1/evidence-instructions.txt). The composed prompt and supplemental instruction each receive separate hashes. This is an explicit evidence-format supplement; it is not a claim that the effective invocation is byte-identical to the original prompt alone. No candidate, source, objective, control, safety criterion or Candidate D contract changes.

The existing strict verifier response schema is retained. Its `reason` string must contain compact JSON naming the assessed proposition, an exact source quotation, an exact candidate quotation (or null for claimed omission), and explicit uncertainty when equivalence cannot be established. The existing 300-character reason limit applies. The verifier is instructed to assess the full texts rather than just its excerpts. Neither expected labels, control keys, case identities nor prior editorial judgments are supplied to it.

Quotation checks establish literal evidence binding only. They cannot establish semantic equivalence, prove that a claimed omission is real, or establish that the cited proposition explains the verdict. Those questions remain for the post-freeze evidence audit. The supplementary format does not add a new semantic acceptance rule.

## Response destinations and automatic imports

For each `SP-NNN`, the recorder reserves a unique directory:

```text
.evaluations/semantic-discrimination-probe-v1/captures/SP-NNN/<attempt-id>/
  attempt.json
  effective.prompt.txt
  response.raw
  events.jsonl
  stderr.txt
  provenance.json
  metadata.raw.json
```

These retain CLI version, requested model/effort, non-secret profile label, explicitly reported model fields if any, available token usage, wall duration, exact invocation settings, and input/response/event/provenance hashes. Cost and provider latency remain null when unavailable; wall duration is recorded separately. No model identity is inferred from an alias or the requested argument.

After successful first-attempt capture, the script runs the existing import command:

```sh
node --import tsx tools/eval/semantic-discrimination-probe.ts import SP-NNN \
  .evaluations/semantic-discrimination-probe-v1/captures/SP-NNN/<attempt-id>/response.raw \
  .evaluations/semantic-discrimination-probe-v1/captures/SP-NNN/<attempt-id>/metadata.raw.json
```

The placeholders describe the actual directory reserved by the script; there is no need to run this manually during normal execution. First-attempt response and metadata bytes are archived unchanged under `imports/SP-NNN/`, with `validation.json`. The explicitly labeled SP-008 retry uses `import-retry SP-008` and archives under `retries/SP-008/1/`; its new UUID capture remains alongside the original under `captures/SP-008/`. It never replaces the first archive. Malformed responses or binding failures stop the sequence and preserve their evidence. Do not strip fences, rewrite JSON or select a better attempt.

To verify afterward (the agent can run this file-only command):

```sh
node --import tsx tools/eval/semantic-discrimination-probe.ts validate
```

Only after twelve accepted imports, the existing `report` command can freeze reviews and then unblind. It is intentionally excluded from this execution workflow.

## Preparation validation

12/12 focused software tests passed, targeted lint passed, scoped TypeScript check passed, Python compilation and recorder checks passed, and user-script syntax passed. Artifact validation passed for all twelve unchanged fingerprint-bound requests and **0/12 imports**. No subscription CLI, inference, independent judgment or production integration was executed during preparation.

Evidence-instruction SHA-256: `a48c2267a47ea724e830f03fa55f2f71acdb7b856de170d9acd3d15438db0467`. Original manifest SHA-256 remains `ab40aa04d6be1f79c256c0f929ef592dd9dcd4e10c7d51b6ebe25c1c91e3918d`.

## Authorized continuation, October 11, 2026

SP-008's first attempt remains permanently **INVALID**. Its malformed repair span is preserved exactly. [continuation-authorization.json](../data/experiments/semantic-discrimination-probe-v1/continuation-authorization.json) pins all 118 existing capture/archive/request/manifest/packet files plus the unchanged evidence supplement. Both recorder and validator enforce that snapshot. This authorization permits exactly one separately labeled SP-008 retry, not retries for any other request.

The original archive status is never upgraded. `validate` now distinguishes archive integrity from response validity: an intact INVALID archive is retained and reported as INVALID after its failure is independently reproduced. Binding failures, changed error records, mutated frozen files and invalid accepted responses still fail validation. UTF-16 checks are unchanged. A retry receives a new UUID and explicit ordinal/first-response/first-validation hash references in its capture, provenance and metadata. Its archive is separate and write-once. A retry success cannot increase first-attempt validity counts.

Current accounting: **7 valid first attempts, 1 invalid first attempt, 4 pending; 0 valid retries, 1 retry not started; 7 available valid responses**. SP-008's original claimed LOCAL_REPAIR is retained, but its usable semantic verdict is null because its response is invalid. For all responses, proposition-evidence correctness remains **UNASSESSED**; schema/quote validation does not establish semantic correctness.

After execution, available-response discrimination may include an explicitly labeled valid retry; first-attempt results are reported separately. Reporting still refuses to unblind until twelve requests have a valid available response, freezes first-attempt and retry records together before opening the private key, and never reports a retry as first-attempt success. A failed retry is retained; no second retry is permitted. A reserved but unimported retry is explicitly reported as such and does not count as a valid response.

Continuation validation: **18 Node tests and 5 Python tests passed**, targeted lint and scoped TypeScript passed, user-script syntax passed. Tests demonstrate immutable SP-008 bytes/status, separate accounting for a valid retry, rejection of invalid retries and invalid accepted evidence, exact original prompt composition, and atomic rejection of a second retry. All tests are file/software checks; no model calls or target responses were generated.
