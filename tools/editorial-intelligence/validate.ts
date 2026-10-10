import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { EDIT_SYSTEM, DIAGNOSE_SYSTEM, JUDGE_SYSTEM, diagnosisSchema, finalSchema, judgmentSchema,
  protocol, validateHoldout } from "./experiment";
import { z } from "zod";

const root = "data/experiments/editorial-intelligence-v1";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const input = readFileSync(`${root}/holdout.json`, "utf8");
const files: string[] = [], priorSources: string[] = [];
function discover(directory: string) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) discover(path);
    else if (item.isFile() && /\.jsonl?$/.test(item.name)) files.push(path);
  }
}
function collect(value: unknown) {
  if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (key === "source" && typeof item === "string") priorSources.push(item);
    else collect(item);
  }
}
discover("data/evaluation");
const previousFiles = files.sort().map(path => {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".jsonl")) text.split("\n").filter(line => line.trim()).forEach(line => collect(JSON.parse(line)));
  else collect(JSON.parse(text));
  return { path, sha256: hash(text) };
});
const holdout = validateHoldout(JSON.parse(input), priorSources);
const availabilityText = readFileSync(`${root}/availability.json`, "utf8"), availability = JSON.parse(availabilityText);
if (availability.status !== "BLOCKED_BEFORE_GENERATION" ||
  [availability.editorCalls, availability.diagnosisCalls, availability.judgeCalls, availability.referenceCalls, availability.modelSubstitutions].some(value => value !== 0) ||
  [availability.actualEditorModel, availability.actualDiagnosisModel, availability.actualJudgeModel, availability.inferenceCostUsd, availability.latencyMs].some(value => value !== null))
  throw new Error("Incomplete status misrepresents execution");
for (const name of ["outputs.jsonl", "blinded-outputs.json", "judgments.json"])
  if (existsSync(`${root}/${name}`)) throw new Error("Unexpected generation/evaluation in blocked preparation");
const prepared = {
  decision: "C — EXPERIMENT INCOMPLETE", status: "PREPARED_BLOCKED", checkpoint: "250459c", protocol,
  caseCount: holdout.cases.length, sourceAuthorship: holdout.authorship,
  holdoutSha256: hash(input), availabilitySha256: hash(availabilityText),
  priorEvaluationInventory: { files: previousFiles.length, sourceFields: priorSources.length,
    sha256: hash(JSON.stringify(previousFiles)), collisionCheck: "normalized whitespace SOURCE equality; no semantic novelty claim" },
  blindSeedSha256: hash(protocol.blindSeed),
  promptsSha256: { directAndReconstruction: hash(EDIT_SYSTEM), diagnosis: hash(DIAGNOSE_SYSTEM), judge: hash(JUDGE_SYSTEM) },
  schemasSha256: { diagnosis: hash(JSON.stringify(z.toJSONSchema(diagnosisSchema))), final: hash(JSON.stringify(z.toJSONSchema(finalSchema))),
    judgment: hash(JSON.stringify(z.toJSONSchema(judgmentSchema))) },
  implementationSha256: Object.fromEntries(["experiment.ts", "experiment.test.ts", "validate.ts", "vitest.config.ts"]
    .map(name => [`tools/editorial-intelligence/${name}`, hash(readFileSync(`tools/editorial-intelligence/${name}`, "utf8"))])),
  outputsGenerated: 0, casesJudged: 0, results: null, costLatencyComparison: null,
  recommendation: "Do not accept or reject specialization from this preparation. Run once exact editor and independent judge transports are available; otherwise keep C.",
};
if (process.argv.includes("--prepare")) writeFileSync(`${root}/results.json`, JSON.stringify(prepared, null, 2) + "\n");
else if (!isDeepStrictEqual(JSON.parse(readFileSync(`${root}/results.json`, "utf8")), prepared)) throw new Error("Prepared manifest mismatch");
console.log("Validated: 12 fresh cases, 6 balanced strata, locked protocol/prompts/schemas, no model outputs or comparisons. C — EXPERIMENT INCOMPLETE.");
