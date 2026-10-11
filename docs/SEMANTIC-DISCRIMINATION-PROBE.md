# Offline semantic discrimination probe

**NO-GO: insufficient discrimination evidence to begin claim-level semantic correspondence implementation.** Prepared October 10, 2026. Model invocations: **0**. Imported verifier responses: **0/12**. Actual model identity, usage, cost and latency: **unknown**. No evaluation results or semantic-verifier authorizations were fabricated.

This probe isolates EI-003, EI-004 and EI-005 from the completed editorial experiment. Each has its exact captured direct-editor text and three author-created, plausible single-proposition negative controls. Prior editorial SAFE/YES judgments define the reference candidates; they are not verifier PASS receipts. These twelve candidates are controls over three existing cases, not a new holdout benchmark.

## Protected propositions and mutations

| Case | A: unchanged reference | B: proposition changed | C: proposition deleted | D: scope, timing or attribution changed |
| --- | --- | --- | --- | --- |
| EI-003 | Free umbrellas; stand by reception; grounds only; return to WET tray for drying | Free borrowing → small borrowing fee | Free-borrowing statement removed | Grounds only → permission to take umbrella beyond grounds |
| EI-004 | First run without drums; second with drums; second felt steadier; no recording; tentative repeat plan | No recording → recording made | Lack-of-recording qualification removed | Steadier impression assigned to first run; second run explicitly remains unrecorded |
| EI-005 | Visitor token required before swimming; token returned on opening; floor wet; hooks usually full by seven; dry chatty voice | Token returned on opening → token not returned | Hooks usually full by seven removed; floor-wet fact retained | Visitor token required before swimming → after swimming |

The [control specification](../data/experiments/semantic-discrimination-probe-v1/controls.json) contains exact source evidence, mutations, originals and capture fingerprints. Validator checks every control is exactly one recorded replacement/deletion, each source evidence quote exists, and each original equals both the accepted import and raw capture. Source and objective must match the frozen holdout. Do not supply this specification or the private control key to the verifier.

The EI-004 attribution control explicitly names the second run in the recording sentence to avoid inadvertently moving the recording proposition along with the steadier impression. Two pre-execution packet drafts are retained locally; neither contains responses. The active packet is the unsuffixed directory below.

## Existing capability and execution blocker

Reuse the existing `verify` version 3 system prompt from [prompts](../src/lib/prompts/index.ts) and the strict `candidateReviewSchemaV10` from [verified-reconstruction](../src/lib/reconstruction/verified-reconstruction.ts). The file-only [probe utility](../tools/eval/semantic-discrimination-probe.ts) exports/imports that interface. It never invokes a model, editor, repairer, account CLI or Candidate D.

The existing full verification pipeline returns `hard-meaning-failure` before calling its semantic verifier when deterministic verification rejects a candidate. This standalone capability probe deliberately supplies empty deterministic findings and no factual authorizations. Empty arrays mean **no deterministic context supplied**, not evidence of deterministic PASS. Even a valid PASS here cannot override existing enforcement or authorize Candidate D. No contracts or production behavior changed.

No permitted authenticated automated path for the intended independent verifier was established. Existing [transport discovery](EDITORIAL-TRANSPORT-DISCOVERY.md) records the configured provider/model mismatch and account-CLI guard; current OpenAI credential/base-URL presence checks were negative. Account CLI execution from orchestration remains prohibited. Existing Claude review tooling and repository workers are not substituted for a neutral verifier.

Requested manual verifier: **gpt-6.1-sol**, reasoning **high**, one attempt per candidate, fresh context, no tools or session memory where supported, intended output budget **4096 tokens**. Availability and runtime identity are unverified. These are intended settings, not claims of enforced controls. An operator must establish a permitted authenticated path outside agent orchestration. Stop on reported substitution or unsupported model. Operator-attested identity can support exploratory execution but cannot establish independently verified discrimination evidence.

## Ready-to-run blinded packet and imports

Active packet: `.evaluations/semantic-discrimination-probe-v1/verification-packet.md`.

It contains all twelve opaque IDs, each with the exact existing system instruction, SOURCE, OBJECTIVE, candidate and response schema. No case IDs, control kinds, expected results, frozen editorial ratings or target propositions appear in the requests. Repeated sources are inherent to a matched-control probe; candidate order is shuffled once before execution. Send **one request per fresh context**, not the entire packet in one call.

The operator performs model calls manually through the permitted authenticated path. The agent can perform file validation/imports. Preserve the raw response bytes without edits, JSON extraction, fence stripping or repairs. Malformed responses remain invalid archived attempts. Do not retry selectively after inspecting outcomes.

From the project root:

```sh
cd /Users/nicholaslippa/Projects/Whodunnit
node --import tsx tools/eval/semantic-discrimination-probe.ts validate
```

For each ID `SP-001` through `SP-012`:

1. Submit `requests/SP-NNN/prompt.txt` unchanged to the intended verifier. Do not consult `private-control-key.json` or `controls.json`.
2. Save exact response bytes to `responses/SP-NNN.raw`.
3. Copy `requests/SP-NNN/metadata-template.json` to `responses/SP-NNN.metadata.json` and fill its explicit placeholders. Record the permitted path and non-secret operator label, requested model, reported model if observed, and actual settings/usage/cost/latency only when available. Leave unavailable values null and explain limitations. No tokens, credentials or account identifiers belong in these files.
4. Compute the raw response fingerprint and put it in `responseSha256`:

```sh
shasum -a 256 .evaluations/semantic-discrimination-probe-v1/responses/SP-001.raw
node --import tsx tools/eval/semantic-discrimination-probe.ts import SP-001 \
  .evaluations/semantic-discrimination-probe-v1/responses/SP-001.raw \
  .evaluations/semantic-discrimination-probe-v1/responses/SP-001.metadata.json
```

Repeat with the corresponding ID. Each import archives response and metadata byte-for-byte in an exclusive destination, validates strict UTF-8/JSON/schema, consistent PASS flags, REJECT shape and exact bounded UTF-16 repair spans, and binds request/prompt/response hashes. Reported model mismatch fails explicitly. Import validity is not independent confirmation that the declared model saw the request.

After all twelve imports are accepted:

```sh
node --import tsx tools/eval/semantic-discrimination-probe.ts validate
node --import tsx tools/eval/semantic-discrimination-probe.ts report
```

`report` refuses incomplete imports, freezes the complete validated review set and its SHA-256 **before** reading the private key, then produces `discrimination-report.json`. It retains reason and repair evidence verbatim. It does not perform repairs or claim authorization. Do not open the private key earlier.

## Measurement and decision

| Measurement | Current result |
| --- | --- |
| Legitimate paraphrases accepted | Not measured /3 |
| Meaning-changing controls withheld | Not measured /9 |
| False acceptance / false rejection | Unknown / unknown |
| Actual rejecting proposition identified | Not assessed |
| Exact input/output fingerprint binding | Twelve requests bound; no responses yet |

PASS counts as acceptance of the submitted candidate. REJECT and LOCAL_REPAIR both withhold it; report their dispositions separately when interpreting results. A deletion can fail objective completion even without inventing a fact. Correct verdicts alone do not establish semantic correspondence.

The existing schema has prose `reason` and optional candidate repair span/constraint; it lacks structured source-to-candidate proposition correspondence. After freezing/unblinding, audit these exact fields against each authored target proposition. Record correct, incorrect or uncertain localization, without automated keyword scoring or inferred evidence. All twelve classifications, nine correctly identified target propositions, credible model provenance and no false acceptances are the minimum evidence sought here. Perfect performance on this tiny, authored probe would justify only bounded implementation investigation, never production integration or general reliability claims.

**Smallest next step:** execute the twelve prepared independent verifier requests through a permitted path, validate/freeze them, and audit proposition localization. Until then: **NO-GO**.

Validation: 12/12 focused software tests; targeted lint passed; scoped TypeScript check passed; artifact validator passed (3 exact captured originals, 9 exact recorded controls, 12 bound requests, 0 imports). No application suite or browser checks were needed. Candidate D, V15, Candidate C and frozen benchmark files remain unchanged.

Prepared packet SHA-256: `5dd9dc05285c06da189ff1f2a6deca60e39ab7b3f7196cc01fe6ada1a6078637`. Manifest SHA-256: `ab40aa04d6be1f79c256c0f929ef592dd9dcd4e10c7d51b6ebe25c1c91e3918d`. Authored controls SHA-256: `551416438e03aef64ba547c736c8f7d1d9247e0ca81c756fd74cd2f1b71cb8ec`. No judgment fingerprint exists because no reviews have been imported.

## Prepared user-operated CLI execution

The existing account workflow is now prepared for these requests. See [SEMANTIC-DISCRIMINATION-MANUAL.md](SEMANTIC-DISCRIMINATION-MANUAL.md) for the single user command, separately fingerprinted evidence-format supplement, exact response destinations and automatic imports. The original manifest, packet and twelve requests remain byte-identical. Execution is still pending, so the NO-GO evidence decision above is unchanged.
