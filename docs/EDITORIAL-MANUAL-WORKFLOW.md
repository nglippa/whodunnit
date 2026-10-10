# Manual Astra experiment workflow

The original 12-case holdout, Astra model, prompts, schemas, blind seed, output budgets and success criterion are preserved. [manual.ts](../tools/editorial-intelligence/manual.ts) exports prompts and imports manual responses; it never invokes a model, extracts authentication, changes a guard or substitutes a provider. The original prepared manifests and transport evidence remain historical records. Manual run artifacts live separately under `.evaluations/editorial-intelligence-manual-v1/`.

## Prepared first run

Run ID: `astra-manual-12-v1`. Directory: `.evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1/`.

For a new run, export once:

```sh
node --import tsx tools/editorial-intelligence/manual.ts export astra-manual-12-v1
```

The exporter creates a pinned manifest, a byte-identical holdout copy and the first request for each of 12 cases. Existing run directories cannot be overwritten. Per-case order alternates: odd-numbered cases use direct → diagnosis → reconstruction; even-numbered cases use diagnosis → reconstruction → direct. Importing a successful stage exports the next. Reconstruction is unavailable until its SOURCE-bound diagnosis validates.

## Execute manually and import unchanged responses

Use the authenticated session you operate yourself. Select exactly `gpt-6-astra` for every direct, diagnosis and reconstruction request. Start a fresh session per request, without tools, repository context, prior conversation or memory. Request `high` reasoning and the stage's output cap: direct 6,144; diagnosis 2,048; reconstruction 4,096. One attempt per stage; no repair, regeneration or choosing between outputs. If the interface cannot establish a setting, record it as unknown rather than claiming compliance. The harness does not launch account CLIs or override their guards.

Send the entire `requests/EI-001-direct.prompt.txt` unchanged. Its companion `.json` records the selected target, exact system/payload, intended settings and hashes. Save the delivered JSON response body verbatim to a separate file; preserve whitespace and final text. Do not strip fences, edit prose or repair JSON. Keep any available session receipt locally, excluding authentication headers, tokens, credentials and unrelated conversation. If the CLI wraps the answer in a receipt envelope, retain that envelope separately and export the answer body without changing its content.

Copy the companion `requests/EI-001-direct.metadata.json` to a separate metadata file. Record the actual selected model; fill `returnedModel`, request ID, tokens, cost, latency, timestamps and actual configuration only when available. Leave unknown values `null`. `configEvidence` can describe how settings were checked; never include credentials. The importer distinguishes operator-attested selected identity from operator-supplied provider-reported identity; it does not independently authenticate a receipt. Hash binding detects accidental changes, not a malicious operator who rewrites all local evidence.

```sh
node --import tsx tools/editorial-intelligence/manual.ts import astra-manual-12-v1 EI-001 direct /absolute/path/response.json /absolute/path/metadata.json
```

Follow the generated next-stage request. For diagnosis use stage `diagnosis`; for reconstruction use `reconstruction`. Complete all 36 editor calls. The importer archives response bytes and metadata, hashes them, validates the existing strict schemas and SOURCE quotations, and rejects model substitutions and disclosed configuration/budget deviations. A malformed or unsafe-schema first response is archived as rejected; overwrite/retry is prohibited. Retain rejected attempts and report the run incomplete. Missing account capacity produces no placeholder outputs.

## Blind comparison

After all 12 pairs have been imported:

```sh
node --import tsx tools/editorial-intelligence/manual.ts blind astra-manual-12-v1
```

Only share `blind/requests/*.prompt.txt` with a fresh independent judge session selecting exactly `gpt-6.1-sol`, high effort, 4,096 output cap, no tools or memory. These prompts contain SOURCE, OBJECTIVE, X/Y finals and the judgment schema. Do not give the judge this document, editor prompts, diagnosis, receipts, arm identities or `private/blind-mapping.json`. The fixed seed shuffles cases and counterbalances X/Y six each. Confirm the intended judge is genuinely selectable before generation; do not substitute it.

Fill a copy of the matching `blind/metadata-templates/EI-001.json`, retain the judge's response unchanged, and import:

```sh
node --import tsx tools/editorial-intelligence/manual.ts judge import astra-manual-12-v1 EI-001 /absolute/path/judgment.json /absolute/path/judge-metadata.json
```

All 12 valid judgments produce `manual-report.json`: blind preferences, dimension totals, paired safety/completion regressions, the original numerical success criterion and per-arm available usage/cost/latency accounting. Any missing accounting keeps the aggregate `null`. Operator-recorded wall duration is separate from provider latency. SAFE/PARTIAL is not full objective success. This is descriptive manual evidence with explicit provenance limits; it never fabricates the strict live receipts required by the original automated summarizer or establishes verified API identity from model selection alone.

## Validation and current execution status

21 targeted harness/discovery/manual tests pass; targeted lint and typecheck pass. Tests use synthetic software controls, not experimental outputs. The original prepared manifest validator still passes. Browser testing adds no signal for this file-based workflow.

The first run contains 12 initial prompt packets and **zero imported model responses**. No direct, diagnosis, reconstruction or judge inference has been executed by this workflow. The next action is manual execution of the exported requests, not another inference integration. Candidate D, V15, Candidate C and frozen benchmarks are unchanged. No quality conclusion exists yet.
