# Post-V3 freeze verification scopes

The corpus/prelabel gate in `scripts/verify-post-v3-freeze.mjs` was committed at
`0bace0834bf5f85b4bc9ae3d29311badcd2adacc`, before candidate and RAW
artifacts existed. Its current-tree run still returns **FAIL** because it forbids
those later files. That result must not be relabeled as a current-tree PASS.

Run `node scripts/verify-post-v3-freeze-historical.mjs` to check the original
gate at its intended historical scope. The wrapper requires the nine original
frozen files and the verifier script to match their exact bytes at the corpus
freeze commit. It copies those verified bytes to a private temporary directory,
runs the unchanged verifier against them, and removes the copy. The verifier
still checks the current operational manifest against the corpus anchor. This is
an archival corpus/prelabel verdict, not a successor lock or a current-output
verdict.

For the later RAW freeze, run
`node --import tsx tools/eval/post-v3-raw-freeze-verify.ts`. That independent
gate checks the committed RAW artifact, attempt journal, implementation anchors
and absence of comparison outputs. Neither command proves the successor native
request capture, independent dispatch guard, sixteen profiles or five efforts.

The current successor registration has its own read-only gate:
`node scripts/verify-post-v3-successor-preregistration.mjs`. It compares the
integrity sidecar with its preregistration commit, checks exact bytes for the
four protected registration files, and verifies the fresh-40 and old-input
exclusion fields. Later authorized documentation and evidence descendants are
outside the original corpus inventory; they do not change the historical gate.
Run `node --test scripts/verify-post-v3-freezes.test.mjs` for isolated mutation
regressions; the test uses temporary copies and leaves the frozen tree intact.

On 2026-10-06 the historical wrapper returned `valid:true`, `caseCount:40`,
`reviewerCounts:[40,40]` and byte equality for all nine original files. The RAW
gate returned `valid:true`, 40 attempts, 36 successes and four technical
failures. No frozen artifact, original verifier, model request or target pulse was
changed or invoked by this check.
