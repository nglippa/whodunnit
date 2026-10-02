/** V15-only saved-candidate replay. No model, network route, or candidate generation. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import {
  runCompositeTemporalReconstruction,
  runDirectiveScopedTemporalReconstruction,
  type VerifiedResultV14,
  type VerifiedResultV15,
} from "@/lib/reconstruction/verified-reconstruction";

const scopedRoot = resolve("data/fixtures/directive-scoping-confirmation");
const compositeRoot = resolve("data/fixtures/composite-temporal-confirmation");
const boundaryRoot = resolve("data/fixtures/verification-boundary-development");
const architectureRoot = resolve("data/fixtures/v13-architecture-replay");
const read = (root: string, name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const hash = (root: string, name: string): string =>
  createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");
const caseSchema = z.object({ id: z.string(), source: z.string(), objective: z.string(), candidate: z.string() }).passthrough();
type Case = z.infer<typeof caseSchema>;
const cases = (root: string, name: string): Case[] => z.array(caseSchema).parse(read(root, name));
const responseSchema = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const responses = (root: string, name: string): Map<string, unknown> => {
  const rows = responseSchema.parse(read(root, name));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`duplicate response ID in ${name}`);
  return new Map(rows.map((row) => [row.id, row.data]));
};
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true,
  voicePreserved: true, unsupportedInformation: false, reason: "Synthetic PASS probes the deterministic authorization boundary.", issue: null };

function integrity() {
  const input = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_BLIND_REVIEW_AND_EXECUTION"),
    caseCount: z.literal(10), casesSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
    .parse(read(scopedRoot, "input-manifest.json"));
  const labelsManifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_VERIFIER_EXECUTION"),
    caseCount: z.literal(10), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
    agreement: z.object({ authorization: z.literal(10), disposition: z.literal(10), both: z.literal(10) }).strict() }).strict()
    .parse(read(scopedRoot, "labels-manifest.json"));
  const expectedFiles = ["cases.json", "blind-labels-a.json", "blind-labels-b.json"];
  if (Object.keys(labelsManifest.files).sort().join() !== expectedFiles.sort().join())
    throw new Error("unexpected directive-scoping frozen input list");
  for (const [name, expected] of Object.entries(labelsManifest.files))
    if (hash(scopedRoot, name) !== expected) throw new Error(`directive-scoping input changed: ${name}`);
  if (hash(scopedRoot, "cases.json") !== input.casesSha256) throw new Error("directive-scoping cases changed");
  const fresh = cases(scopedRoot, "cases.json");
  if (fresh.length !== 10 || fresh.some((item, index) => item.id !== `ds${String(index + 1).padStart(2, "0")}`))
    throw new Error("directive-scoping case count or order changed");
  const labelFields = { id: z.string(), authorization: z.enum([
    "AUTHORIZED", "UNAUTHORIZED", "CONFLICTING", "INSUFFICIENT_INFORMATION"]),
    rationale: z.string() };
  const disposition = z.enum(["ACCEPT", "REJECT", "FAIL_CLOSED"]);
  const a = z.array(z.object({ ...labelFields, expectedDisposition: disposition }).strict()).length(10)
    .parse(read(scopedRoot, "blind-labels-a.json"));
  const b = z.array(z.object({ ...labelFields, disposition }).strict()).length(10)
    .parse(read(scopedRoot, "blind-labels-b.json"));
  for (let i = 0; i < 10; i++) {
    if (a[i].id !== fresh[i].id || b[i].id !== fresh[i].id ||
      a[i].authorization !== b[i].authorization || a[i].expectedDisposition !== b[i].disposition)
      throw new Error(`blind label mismatch at ${fresh[i].id}`);
  }
  const adversarialManifest = z.object({ schemaVersion: z.literal(1),
    status: z.literal("FROZEN_AFTER_INITIAL_REPLAY_BEFORE_ADVERSARIAL_REPLAY"),
    caseCount: z.literal(6), provenance: z.string(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict()
    .parse(read(scopedRoot, "adversarial-manifest.json"));
  if (Object.keys(adversarialManifest.files).sort().join() !==
    ["adversarial-cases.json", "adversarial-labels.json"].sort().join())
    throw new Error("unexpected adversarial input list");
  for (const [name, expected] of Object.entries(adversarialManifest.files))
    if (hash(scopedRoot, name) !== expected) throw new Error(`adversarial input changed: ${name}`);
  const adversarial = cases(scopedRoot, "adversarial-cases.json");
  const adversarialLabels = z.array(z.object({ ...labelFields, expectedDisposition: disposition }).strict()).length(6)
    .parse(read(scopedRoot, "adversarial-labels.json"));
  if (adversarial.length !== 6 || adversarial.some((item, index) =>
    item.id !== `da${String(index + 1).padStart(2, "0")}` || adversarialLabels[index].id !== item.id))
    throw new Error("adversarial case count, order, or labels changed");
  const punctuationManifest = z.object({ schemaVersion: z.literal(1),
    status: z.literal("FROZEN_AFTER_SIX_CASE_ADVERSARIAL_REPLAY_BEFORE_PUNCTUATION_REPLAY"),
    caseCount: z.literal(3), provenance: z.string(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict()
    .parse(read(scopedRoot, "punctuation-adversarial-manifest.json"));
  if (Object.keys(punctuationManifest.files).sort().join() !==
    ["punctuation-adversarial-cases.json", "punctuation-adversarial-labels.json"].sort().join())
    throw new Error("unexpected punctuation adversarial input list");
  for (const [name, expected] of Object.entries(punctuationManifest.files))
    if (hash(scopedRoot, name) !== expected) throw new Error(`punctuation adversarial input changed: ${name}`);
  const punctuation = cases(scopedRoot, "punctuation-adversarial-cases.json");
  const punctuationLabels = z.array(z.object({ ...labelFields, expectedDisposition: disposition }).strict()).length(3)
    .parse(read(scopedRoot, "punctuation-adversarial-labels.json"));
  if (punctuation.length !== 3 || punctuation.some((item, index) =>
    item.id !== `dp${String(index + 1).padStart(2, "0")}` || punctuationLabels[index].id !== item.id))
    throw new Error("punctuation adversarial case count, order, or labels changed");
  const sharedManifest = z.object({ schemaVersion: z.literal(1),
    status: z.literal("FROZEN_AFTER_PUNCTUATION_REPLAY_BEFORE_SHARED_EXPRESSION_REPLAY"),
    caseCount: z.literal(2), provenance: z.string(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict()
    .parse(read(scopedRoot, "shared-expression-adversarial-manifest.json"));
  if (Object.keys(sharedManifest.files).sort().join() !==
    ["shared-expression-adversarial-cases.json", "shared-expression-adversarial-labels.json"].sort().join())
    throw new Error("unexpected shared-expression adversarial input list");
  for (const [name, expected] of Object.entries(sharedManifest.files))
    if (hash(scopedRoot, name) !== expected) throw new Error(`shared-expression adversarial input changed: ${name}`);
  const shared = cases(scopedRoot, "shared-expression-adversarial-cases.json");
  const sharedLabels = z.array(z.object({ ...labelFields, expectedDisposition: disposition }).strict()).length(2)
    .parse(read(scopedRoot, "shared-expression-adversarial-labels.json"));
  if (shared.length !== 2 || shared.some((item, index) =>
    item.id !== `de${String(index + 1).padStart(2, "0")}` || sharedLabels[index].id !== item.id))
    throw new Error("shared-expression adversarial case count, order, or labels changed");
  const ambiguityManifest = z.object({ schemaVersion: z.literal(1),
    status: z.literal("FROZEN_AFTER_SHARED_EXPRESSION_REPLAY_BEFORE_AMBIGUITY_REPLAY"),
    caseCount: z.literal(2), provenance: z.string(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict()
    .parse(read(scopedRoot, "ambiguity-adversarial-manifest.json"));
  if (Object.keys(ambiguityManifest.files).sort().join() !==
    ["ambiguity-adversarial-cases.json", "ambiguity-adversarial-labels.json"].sort().join())
    throw new Error("unexpected ambiguity adversarial input list");
  for (const [name, expected] of Object.entries(ambiguityManifest.files))
    if (hash(scopedRoot, name) !== expected) throw new Error(`ambiguity adversarial input changed: ${name}`);
  const ambiguity = cases(scopedRoot, "ambiguity-adversarial-cases.json");
  const ambiguityLabels = z.array(z.object({ ...labelFields, expectedDisposition: disposition }).strict()).length(2)
    .parse(read(scopedRoot, "ambiguity-adversarial-labels.json"));
  if (ambiguity.length !== 2 || ambiguity.some((item, index) =>
    item.id !== `du${String(index + 1).padStart(2, "0")}` || ambiguityLabels[index].id !== item.id))
    throw new Error("ambiguity adversarial case count, order, or labels changed");

  const compositeManifest = z.object({ casesSha256: z.string() }).passthrough()
    .parse(read(compositeRoot, "input-manifest.json"));
  if (hash(compositeRoot, "cases.json") !== compositeManifest.casesSha256)
    throw new Error("frozen V14 composite cases changed");
  const composite = cases(compositeRoot, "cases.json");
  if (composite.length !== 8) throw new Error("frozen V14 case count changed");
  const ar04 = z.object({ rows: z.array(caseSchema) })
    .parse(read(architectureRoot, "run-v13.json")).rows.find((item) => item.id === "ar04");
  if (!ar04) throw new Error("saved ar04 candidate missing");
  const boundaryManifest = z.object({ files: z.record(z.string(), z.string()) }).passthrough()
    .parse(read(boundaryRoot, "manifest.json"));
  for (const [name, expected] of Object.entries(boundaryManifest.files))
    if (hash(boundaryRoot, name) !== expected) throw new Error(`frozen boundary input changed: ${name}`);
  const unsafe = cases(boundaryRoot, "cases.json").filter((item) => /^vb(?:0[1-9]|1[0-4])$/.test(item.id));
  if (unsafe.length !== 14) throw new Error("original unsafe cohort is incomplete");
  return { fresh, labels: a, adversarial, adversarialLabels, punctuation, punctuationLabels,
    shared, sharedLabels, ambiguity, ambiguityLabels,
    composite: [ar04, ...composite], unsafe };
}

const fake = (respond: (name: string, system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "saved-response-replay", model: "injected-candidate" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
    return { data: schema.parse(respond(name, system, user)), meta: {} };
  },
});

type Cohort = "fresh" | "adversarial" | "punctuation" | "shared" | "ambiguity" | "composite" | "unsafe";
function callers(item: Case, cohort: Cohort, saved: {
  composite: Map<string, unknown>; first: Map<string, unknown>; second: Map<string, unknown>;
  repairs: Map<string, unknown>;
}) {
  let repairCalled = false;
  const calls = { semantic: 0, repair: 0, syntheticPass: 0, missingRepair: 0 };
  const editor = fake(() => ({ text: item.candidate, changes: [] }));
  const verifier = fake(() => {
    calls.semantic++;
    if (cohort === "fresh" || cohort === "adversarial" || cohort === "punctuation" ||
      cohort === "shared" || cohort === "ambiguity") {
      calls.syntheticPass++; return pass;
    }
    const response = cohort === "composite" ? saved.composite.get(item.id)
      : (repairCalled ? saved.second : saved.first).get(item.id);
    if (response !== undefined) return response;
    // Unexpectedly reaching semantic review on a previously hard-blocked
    // candidate must expose a deterministic authorization bypass, not hide it.
    calls.syntheticPass++;
    return pass;
  });
  const repairer = cohort !== "unsafe" ? undefined : fake((_name, _system, user) => {
    repairCalled = true; calls.repair++;
    const response = saved.repairs.get(item.id);
    if (response !== undefined) return response;
    calls.missingRepair++;
    return { replacement: JSON.parse(user).affectedSpan.text };
  });
  return { config: { editor, verifier, repairer }, calls };
}

function summary(result: VerifiedResultV14 | VerifiedResultV15) {
  return {
    final: result.text, findings: result.candidateVerification?.findings ?? null,
    finalFindings: result.finalVerification.findings, review: result.review,
    trace: result.trace,
  };
}

async function replay() {
  const frozen = integrity();
  const saved = {
    composite: responses(compositeRoot, "verifier-results.json"),
    first: responses(boundaryRoot, "verifier-results.json"),
    second: responses(boundaryRoot, "reverify-results.json"),
    repairs: responses(boundaryRoot, "repair-results.json"),
  };
  const rows: {
    cohort: Cohort;
    id: string;
    source: string;
    objective: string;
    candidate: string;
    blindLabel?: { id: string; authorization: string;
      expectedDisposition: "ACCEPT" | "REJECT" | "FAIL_CLOSED"; rationale: string };
    v14: ReturnType<typeof summary> & { calls: ReturnType<typeof callers>["calls"] };
    v15: ReturnType<typeof summary> & { calls: ReturnType<typeof callers>["calls"] };
    changedVerdict: boolean;
  }[] = [];
  for (const [cohort, items] of [
    ["fresh", frozen.fresh], ["adversarial", frozen.adversarial], ["punctuation", frozen.punctuation],
    ["shared", frozen.shared], ["ambiguity", frozen.ambiguity],
    ["composite", frozen.composite], ["unsafe", frozen.unsafe],
  ] as const) {
    for (const item of items) {
      const oldCallers = callers(item, cohort, saved);
      const currentCallers = callers(item, cohort, saved);
      const request = { source: item.source, profile: PRESETS.natural };
      const old = await runCompositeTemporalReconstruction(request, item.objective, oldCallers.config);
      const current = await runDirectiveScopedTemporalReconstruction(request, item.objective, currentCallers.config);
      const label = cohort === "fresh" ? frozen.labels.find((row) => row.id === item.id)
        : cohort === "adversarial" ? frozen.adversarialLabels.find((row) => row.id === item.id)
          : cohort === "punctuation" ? frozen.punctuationLabels.find((row) => row.id === item.id)
            : cohort === "shared" ? frozen.sharedLabels.find((row) => row.id === item.id)
              : cohort === "ambiguity" ? frozen.ambiguityLabels.find((row) => row.id === item.id) : undefined;
      rows.push({
        cohort, id: item.id, source: item.source, objective: item.objective, candidate: item.candidate,
        ...(label ? { blindLabel: label } : {}),
        v14: { ...summary(old), calls: oldCallers.calls },
        v15: { ...summary(current), calls: currentCallers.calls },
        changedVerdict: old.trace.outcome !== current.trace.outcome || old.text !== current.text,
      });
    }
  }
  const unsafe = rows.filter((row) => row.cohort === "unsafe");
  const fresh = rows.filter((row) => row.cohort === "fresh");
  const adversarial = rows.filter((row) => row.cohort === "adversarial");
  const punctuation = rows.filter((row) => row.cohort === "punctuation");
  const shared = rows.filter((row) => row.cohort === "shared");
  const ambiguity = rows.filter((row) => row.cohort === "ambiguity");
  const composite = rows.filter((row) => row.cohort === "composite");
  const labelMismatch = (row: typeof rows[number]): boolean =>
    row.blindLabel?.expectedDisposition === "ACCEPT"
      ? row.v15.final !== row.candidate
      : row.v15.final !== row.source;
  const unexpectedRepair = rows.filter((row) => row.v14.calls.missingRepair || row.v15.calls.missingRepair);
  if (unexpectedRepair.length) throw new Error(`saved repair unavailable: ${unexpectedRepair.map((row) => row.id).join(", ")}`);
  return {
    strategy: "reconstruction-v15", route: "saved-candidates-and-fake-callers-no-network",
    counts: {
      fresh: fresh.length, adversarial: adversarial.length, punctuation: punctuation.length,
      shared: shared.length, ambiguity: ambiguity.length,
      compositeIncludingAr04: frozen.composite.length, unsafe: unsafe.length,
      unsafeV14Escapes: unsafe.filter((row) => row.v14.final !== row.source).length,
      unsafeV15Escapes: unsafe.filter((row) => row.v15.final !== row.source).length,
      freshExpectedAccept: fresh.filter((row) => row.blindLabel?.expectedDisposition === "ACCEPT").length,
      freshAccepted: fresh.filter((row) => row.v15.final === row.candidate).length,
      freshLabelMismatches: fresh.filter(labelMismatch).map((row) => row.id),
      adversarialExpectedAccept: adversarial.filter((row) => row.blindLabel?.expectedDisposition === "ACCEPT").length,
      adversarialAccepted: adversarial.filter((row) => row.v15.final === row.candidate).length,
      adversarialLabelMismatches: adversarial.filter(labelMismatch).map((row) => row.id),
      punctuationLabelMismatches: punctuation.filter(labelMismatch).map((row) => row.id),
      sharedLabelMismatches: shared.filter(labelMismatch).map((row) => row.id),
      ambiguityLabelMismatches: ambiguity.filter(labelMismatch).map((row) => row.id),
      compositeHistoricalRegressions: composite.filter((row) =>
        row.v14.final === row.candidate && row.v15.final !== row.candidate).map((row) => row.id),
      changedVerdicts: rows.filter((row) => row.changedVerdict).map((row) => row.id),
      repairs: rows.filter((row) => row.v15.calls.repair).map((row) => row.id),
    },
    rows,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "integrity") {
    const frozen = integrity();
    process.stdout.write(JSON.stringify({ valid: true, fresh: frozen.fresh.length,
      adversarial: frozen.adversarial.length, punctuation: frozen.punctuation.length,
      shared: frozen.shared.length, ambiguity: frozen.ambiguity.length,
      compositeIncludingAr04: frozen.composite.length, unsafe: frozen.unsafe.length,
      blindAgreement: 10, freshCasesSha256: hash(scopedRoot, "cases.json") }) + "\n");
  } else if (mode === "replay") process.stdout.write(JSON.stringify(await replay()) + "\n");
  else throw new Error("usage: directive-scoping-confirmation.ts integrity|replay");
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "directive-scoping confirmation failed"}\n`);
  process.exitCode = 1;
});
