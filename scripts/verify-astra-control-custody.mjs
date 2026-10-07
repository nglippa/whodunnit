#!/usr/bin/env node
// Offline contract check using inert one-character placeholders. No benchmark data or model call.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const base = "data/evaluation/astra-control-fresh-48-v1/pre-case";
const load = (name) => JSON.parse(readFileSync(resolve(root, base, name), "utf8"));
const protocol = JSON.parse(readFileSync(resolve(root, "data/evaluation/astra-control-fresh-48-v1/protocol.json"), "utf8"));
const caseCustody = load("case-custody.json");
const prelabel = load("prelabel-contract.json");
const judging = load("judging-contract.json");
const presentation = load("pairwise-randomization.json");
const trace = load("trace-custody.json");
const failure = load("technical-failure-policy.json");
const order = load("generation-order.json");
const id = "astra-control-fresh-48-v1";
for (const contract of [caseCustody, prelabel, judging, presentation, trace, failure, order])
  assert.equal(contract.experimentId, id);
assert.equal(protocol.experimentId, id);
assert.equal(caseCustody.caseCount, protocol.corpus.caseCount);
assert.equal(caseCustody.casesPerCreator * caseCustody.creatorSlots.length, 48);
assert.equal(protocol.corpus.primaryStrata.reduce((n, stratum) => n + stratum.count, 0), 48);
for (let creator = 0; creator < 4; creator++)
  assert.equal(protocol.corpus.primaryStrata.reduce((n, stratum) => n + stratum.byCreator[creator], 0), 12);
assert.deepEqual(prelabel.inputPacketFieldsExactly, ["caseId", "source", "objective"]);
assert.equal(prelabel.reviewersPerCase, 2);
assert.equal(prelabel.reviewSequence, undefined);
assert.equal(trace.rawCustody.independentCandidateEditorCall, "FORBIDDEN");
assert.equal(failure.astra.sdkMaxRetries, 0);
assert.equal(failure.astra.attemptsPerCase, 1);
assert.deepEqual(order.stages.map((step) => step.n), Array.from({ length: 20 }, (_, i) => i + 1));

function validate(value, schema, label) {
  if (schema.enum) assert(schema.enum.includes(value), `${label}: enum`);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type) assert(types.some((type) => type === "null" ? value === null
    : type === "array" ? Array.isArray(value)
      : type === "integer" ? Number.isInteger(value)
        : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
          : typeof value === type), `${label}: type`);
  if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `${label}: pattern`);
  if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${label}: minLength`);
  if (schema.minimum !== undefined) assert(value >= schema.minimum, `${label}: minimum`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${label}: minItems`);
    if (schema.uniqueItems) assert.equal(new Set(value.map((entry) => JSON.stringify(entry))).size, value.length, `${label}: uniqueItems`);
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, `${label}[${index}]`));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const field of schema.required ?? []) assert(Object.hasOwn(value, field), `${label}: missing ${field}`);
    if (schema.additionalProperties === false)
      for (const field of Object.keys(value)) assert(Object.hasOwn(schema.properties ?? {}, field), `${label}: extra ${field}`);
    for (const [field, subSchema] of Object.entries(schema.properties ?? {}))
      if (Object.hasOwn(value, field)) validate(value[field], subSchema, `${label}.${field}`);
  }
}

const key = Buffer.from(presentation.seedHex, "hex");
assert.equal(key.length, 32);
const hmac = (message) => createHmac("sha256", key).update(message, "utf8").digest();
const hex = (message) => hmac(message).toString("hex");
const cases = Array.from({ length: 48 }, (_, i) => `AC48-${String(i + 1).padStart(3, "0")}`);
const reviewers = ["J1", "J2"];
const arms = presentation.armIdsPrivate;
const pairs = presentation.pairCodesPrivate;
assert.deepEqual(pairs, protocol.presentation.pairwise);
assert.equal(pairs.length, 5);
const allOpaque = new Set();
for (const reviewer of reviewers) {
  const items = [];
  const pairPackets = [];
  for (const caseId of cases) {
    for (const arm of arms) {
      const opaqueItemId = hex(`item-id-v1|${reviewer}|${caseId}|${arm}`).slice(0, 24);
      assert(!allOpaque.has(opaqueItemId), "opaque item collision");
      allOpaque.add(opaqueItemId);
      const internal = { opaqueItemId, source: "S", objective: "O", text: "T", arm, caseId,
        status: "hidden", trace: "hidden", prelabel: "hidden", pathname: "hidden", primaryStratum: "hidden" };
      const packet = Object.fromEntries(presentation.packetProjection.primaryItem.map((field) => [field, internal[field]]));
      validate(packet, judging.packetSchemas.primaryItem, "primaryItem");
      assert.deepEqual(Object.keys(packet), ["opaqueItemId", "source", "objective", "text"]);
      items.push({ key: hex(`item-order-v1|${reviewer}|${caseId}|${arm}`), opaqueItemId, packet });
    }
    for (const pairCode of pairs) {
      const opaquePairId = hex(`pair-id-v1|${reviewer}|${caseId}|${pairCode}`).slice(0, 24);
      assert(!allOpaque.has(opaquePairId), "opaque pair collision");
      allOpaque.add(opaquePairId);
      const [first, second] = pairCode.split(":");
      const bit = hmac(`pair-left-v1|${reviewer}|${caseId}|${pairCode}`)[0] & 1;
      const [left, right] = bit === 0 ? [first, second] : [second, first];
      const internal = { opaquePairId, source: "S", objective: "O", textA: "T", textB: "T",
        caseId, left, right, pairCode, trace: "hidden", status: "hidden" };
      const packet = Object.fromEntries(presentation.packetProjection.primaryPair.map((field) => [field, internal[field]]));
      validate(packet, judging.packetSchemas.primaryPair, "primaryPair");
      assert.deepEqual(Object.keys(packet), ["opaquePairId", "source", "objective", "textA", "textB"]);
      pairPackets.push({ key: hex(`pair-order-v1|${reviewer}|${caseId}|${pairCode}`), opaquePairId, packet });
    }
  }
  assert.equal(items.length, 192);
  assert.equal(pairPackets.length, 240);
  const bytewise = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const sort = (a, b) => bytewise(a.key, b.key) || bytewise(a.opaqueItemId ?? a.opaquePairId, b.opaqueItemId ?? b.opaquePairId);
  items.sort(sort); pairPackets.sort(sort);
  assert.equal(new Set(items.map((entry) => entry.key)).size, 192);
  assert.equal(new Set(pairPackets.map((entry) => entry.key)).size, 240);
}
for (const reviewer of ["R1", "R2", "R3"])
  for (const caseId of cases) {
    const opaqueRawId = hex(`raw-id-v1|${reviewer}|${caseId}`).slice(0, 24);
    assert(!allOpaque.has(opaqueRawId), "opaque RAW collision");
    allOpaque.add(opaqueRawId);
    validate({ opaqueRawId, source: "S", objective: "O", raw: "T" }, judging.packetSchemas.raw, "raw");
  }
assert.deepEqual(Object.keys(judging.packetSchemas.primaryItem.properties), protocol.presentation.primaryTextOnlyPacketFields);
assert.deepEqual(Object.keys(judging.packetSchemas.primaryPair.properties), protocol.presentation.primaryPairwisePacketFields);
const requiredDimensions = ["meaningPreservation", "objectiveSatisfaction", "writingQuality", "voicePreservation", "restraint", "factualIntegrity", "collateralDamage", "overallPreference"];
for (const dimension of requiredDimensions) assert(judging.primaryItemFormSchema.required.includes(dimension), `missing ${dimension}`);
for (const form of [judging.primaryItemFormSchema, judging.rawFormSchema, judging.pairwiseFormSchema, judging.secondaryFormSchema, judging.traceAuditSchema, prelabel.recordSchema])
  assert.equal(form.additionalProperties, false);
const evidence = [{ field: "source", startByte: 0, endByte: 1, quote: "S", reason: "inert placeholder" }];
const primary = {
  opaqueItemId: "a".repeat(24), reviewerId: "J1", meaningPreservation: "PRESERVED",
  objectiveSatisfaction: "PARTIAL", writingQuality: "ABOUT_SAME", voicePreservation: "PRESERVED",
  restraint: "APPROPRIATE", factualIntegrity: "PRESERVED_OR_AUTHORIZED", collateralDamage: "NONE",
  overallPreference: "TIE", unnecessaryEditing: "NO", harmfulEditing: "NO",
  safetyClass1: "NOT_APPLICABLE_TO_OBJECTIVE", safetyClass2: "NOT_APPLICABLE_TO_OBJECTIVE",
  safetyClass3: "ABSENT", safetyClass4: "ABSENT", disputeFlag: false, confidence: "HIGH",
  evidence: [{ ...evidence[0], dimension: "objectiveSatisfaction" }], notes: "inert placeholder",
};
validate(primary, judging.primaryItemFormSchema, "primaryForm");
assert.throws(() => validate({ ...primary, arm: "ASTRA_DIRECT" }, judging.primaryItemFormSchema, "primaryLeak"));
validate({ opaqueRawId: "b".repeat(24), reviewerId: "R1", classification: "OTHER",
  safeEditSpans: [], materialDefectSpans: [], disputeFlag: false, confidence: "HIGH", evidence, notes: "" },
judging.rawFormSchema, "rawForm");
validate({ opaquePairId: "c".repeat(24), reviewerId: "J2", preferred: "TIE", textASafe: "YES",
  textBSafe: "YES", confidence: "HIGH", disputeFlag: false, evidence, notes: "" },
judging.pairwiseFormSchema, "pairwiseForm");
validate({ opaqueItemId: "a".repeat(24), reviewerId: "J1", honestCompletionClaim: "NO_CLAIM",
  incompleteOrAbstentionDisclosure: "NOT_APPLICABLE", staleFactPresentedAsCompleted: "NOT_APPLICABLE",
  productPackagePreference: "TIE", confidence: "HIGH", disputeFlag: false, evidence, notes: "" },
judging.secondaryFormSchema, "secondaryForm");
validate({ caseId: cases[0], arm: "V15", class5: "ABSENT", class6: "ABSENT",
  rawDefectEscapeSpans: [], acceptedHarmfulRepairSpans: [], evidence: [], auditStatus: "COMPLETE" },
judging.traceAuditSchema, "traceAuditForm");
validate({ caseId: cases[0], reviewerId: "P1", submittedAtUtc: "2026-01-01T00:00:00Z",
  intendedObjective: "O", acceptableEditScope: "O", stableFactsAndClaims: [], authorizedFactualChanges: [],
  protectedNamesNumbersDatesQuotesPhrases: [], requiredForm: "O", noOrMinimalEditExpected: false,
  ambiguity: [], missingPropositions: [], voiceConstraints: [], zeroToleranceTraps: [],
  sourceObjectiveEvidence: [{ supportsField: "intendedObjective", field: "objective", startByte: 0, endByte: 1, quote: "O" }] },
prelabel.recordSchema, "prelabelForm");
console.log("Astra control pre-case custody contracts: PASS (synthetic placeholders only; 48 IDs, 192 items/reviewer, 240 pairs/reviewer)");
