import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const bytes = (path) => readFileSync(new URL(path, root));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (path) => JSON.parse(bytes(path).toString("utf8"));
const evidence = json("data/evaluation/astra-control-fresh-48-v1/pre-case/execution-bindings.json");
const protocol = json("data/evaluation/astra-control-fresh-48-v1/protocol.json");
const freeze = json("data/evaluation/post-v3-comparison/frozen/implementations.json");

function pin(path, expected, label) {
  assert.match(expected, /^[a-f0-9]{64}$/, `${label} malformed hash`);
  assert.equal(hash(bytes(path)), expected, `${label} changed`);
}
function anchor(commit, path, expected, label) {
  const historical = execFileSync("git", ["show", `${commit}:${path}`], { cwd: new URL(".", root) });
  assert.equal(hash(historical), expected, `${label} historical anchor differs`);
}

assert.equal(evidence.experimentId, protocol.experimentId);
assert.equal(evidence.status, "BLOCKED_LIVE_EXECUTION");
pin(evidence.authority.protocolPath, evidence.authority.protocolSha256, "protocol");
pin(evidence.authority.editorInstructionPath, evidence.authority.editorInstructionSha256, "Astra instruction");
pin(evidence.source.callerPath, evidence.source.callerFileSha256, "SOURCE caller");
pin(evidence.v15.entrypoint.split(":")[0], evidence.v15.implementationSha256, "V15 implementation");
pin(evidence.candidateC.entrypoint.split(":")[0], evidence.candidateC.implementationSha256, "Candidate C implementation");
pin(evidence.offlineProof.binderPath, evidence.offlineProof.binderSha256, "offline binder");
pin(evidence.offlineProof.testPath, evidence.offlineProof.testSha256, "offline tests");
anchor(evidence.v15.anchorCommit, evidence.v15.entrypoint.split(":")[0], evidence.v15.implementationSha256, "V15");
anchor(evidence.candidateC.anchorCommit, evidence.candidateC.entrypoint.split(":")[0], evidence.candidateC.implementationSha256, "C");
assert.equal(freeze.sharedV15DependencyHashes["src/lib/reconstruction/verified-reconstruction.ts"], evidence.v15.implementationSha256);
assert.equal(freeze.implementationFiles["src/lib/reconstruction/post-v3/index.ts"], evidence.candidateC.implementationSha256);
assert.equal(freeze.arms.find((arm) => arm.id === "C")?.artifactSha256, evidence.candidateC.frozenArmArtifactSha256);
for (const [path, expected] of Object.entries({ ...freeze.sharedV15DependencyHashes, ...freeze.implementationFiles }))
  pin(path, expected, `frozen dependency ${path}`);
assert.deepEqual(protocol.arms.map((arm) => arm.id), ["SOURCE", "V15", "C_DOWNSTREAM", "ASTRA_DIRECT"]);
assert.equal(evidence.astraDirect.requestedModel, protocol.astra.requestedModel);
assert.deepEqual(evidence.astraDirect.reasoning, { effort: protocol.astra.reasoning.effort, mode: "OMITTED" });
assert.equal(evidence.astraDirect.accountAccess, "UNVERIFIED");
assert.equal(evidence.spendAuthorization.status, "ABSENT");
assert.equal(evidence.offlineProof.liveCallersRejected, true);
assert.deepEqual(evidence.counts, { benchmarkCases: 0, prelabels: 0, armOutputs: 0, experimentalModelCalls: 0, experimentalSpendUsd: 0 });
process.stdout.write(JSON.stringify({ experimentId: evidence.experimentId, status: evidence.status, sha256: hash(bytes("data/evaluation/astra-control-fresh-48-v1/pre-case/execution-bindings.json")) }) + "\n");
