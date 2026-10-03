/** Frozen V3 request capture/replay. No provider selection or generation calls. */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runDirectiveScopedTemporalReconstruction } from "@/lib/reconstruction/verified-reconstruction";

export const V3_MANIFEST_SHA256 = "e207982e7b05c3d99bad5930ee8b63ef9884ecef427e77ece5f03a9d6ea61ad2";
const base = resolve("data/evaluation/holdout-v3");
const frozenRoot = resolve(base, "frozen");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const caseSchema = z.object({ id: z.string(), source: z.string(), objective: z.string(), creatorId: z.string(),
  genre: z.string(), lengthBand: z.string(), provenance: z.string(), categoryTags: z.array(z.string()) }).strict();
const responseSchema = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
export function responseMap(raw: unknown, expectedIds: ReadonlySet<string>, stage: string) {
  const rows = responseSchema.parse(raw);
  const map = new Map<string, unknown>();
  for (const row of rows) {
    if (map.has(row.id)) throw new Error(`duplicate ${stage} response: ${row.id}`);
    if (!expectedIds.has(row.id)) throw new Error(`extra ${stage} response: ${row.id}`);
    map.set(row.id, row.data);
  }
  return map;
}
export function verifyV3Integrity() {
  const manifestBytes = readFileSync(resolve(frozenRoot, "manifest.json"));
  if (digest(manifestBytes) !== V3_MANIFEST_SHA256) throw new Error("frozen V3 manifest changed");
  if (readFileSync(resolve(base, "frozen-manifest.sha256"), "utf8").trim().split(/\s+/)[0] !== V3_MANIFEST_SHA256)
    throw new Error("external frozen V3 anchor changed");
  const manifest = z.object({ version: z.literal("3.0.0"), marker: z.literal("FROZEN_HOLDOUT_DO_NOT_TUNE"),
    frozenBeforeGeneration: z.literal(true), caseCount: z.literal(119),
    files: z.record(z.string(), z.string()), cases: z.record(z.string(), z.object({ sourceSha256: z.string(), objectiveSha256: z.string() }).strict())
  }).passthrough().parse(JSON.parse(manifestBytes.toString("utf8")));
  // Reviews/labels are hashed as opaque bytes only; never parsed or joined here.
  for (const [name, expected] of Object.entries(manifest.files)) {
    const path = resolve(frozenRoot, name);
    if (dirname(path) !== frozenRoot || digest(readFileSync(path)) !== expected) throw new Error(`frozen V3 input changed: ${name}`);
  }
  const cases = z.array(caseSchema).length(119).parse(JSON.parse(readFileSync(resolve(frozenRoot, "cases.json"), "utf8")));
  if (new Set(cases.map(item => item.id)).size !== 119 || Object.keys(manifest.cases).length !== 119) throw new Error("V3 case IDs changed");
  for (const item of cases) {
    const pinned = manifest.cases[item.id];
    if (!pinned || digest(item.source) !== pinned.sourceSha256 || digest(item.objective) !== pinned.objectiveSha256)
      throw new Error(`frozen V3 case changed: ${item.id}`);
  }
  return cases;
}
const stages = ["editor", "verifier", "repair", "reverify"] as const;
type Stage = typeof stages[number];
type Mode = `${Stage}-requests` | "replay" | "integrity";
/** Reject links before creating any artifact directory, including nested run paths. */
export function prepareRunDirectory(runDirectory: string, baseDirectory = base): string {
  const intendedBase = realpathSync(baseDirectory);
  const allowed = resolve(intendedBase, "run");
  const run = resolve(runDirectory);
  if (run !== allowed && !run.startsWith(`${allowed}${sep}`))
    throw new Error("artifacts must be under data/evaluation/holdout-v3/run/");
  let current = intendedBase;
  for (const component of relative(intendedBase, run).split(sep)) {
    current = resolve(current, component);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe artifact directory: symlink or non-directory");
    } else mkdirSync(current);
    const resolved = realpathSync(current);
    if (resolved !== allowed && !resolved.startsWith(`${allowed}${sep}`)) throw new Error("unsafe artifact directory: escaped run root");
  }
  return run;
}
export async function runV3(mode: Mode, runDirectory = resolve(base, "run")) {
  const cases = verifyV3Integrity();
  if (mode === "integrity") return { valid: true, caseCount: cases.length, manifestSha256: V3_MANIFEST_SHA256 };
  const run = prepareRunDirectory(runDirectory);
  const target = mode === "replay" ? null : mode.replace("-requests", "") as Stage;
  const stop = target === null ? stages.length : stages.indexOf(target);
  const ids = new Set(cases.map(item => item.id));
  const maps = new Map<Stage, Map<string, unknown>>();
  const used = new Map<Stage, Set<string>>();
  for (const stage of stages.slice(0, stop)) {
    const map = responseMap(JSON.parse(readFileSync(resolve(run, `${stage}-results.json`), "utf8")), ids, stage);
    if (stage === "editor" && (map.size !== ids.size || [...ids].some(id => !map.has(id)))) throw new Error("exactly one editor response per frozen ID required");
    maps.set(stage, map); used.set(stage, new Set());
  }
  const requests: { id: string; stage: Stage; schemaName: string; responseJsonSchema: unknown; system: string; user: string; requestSha256: string }[] = [];
  const rows = [];
  const errors: { id: string; stage: Stage; kind: string }[] = [];
  const contractErrors: string[] = [];
  for (const item of cases) {
    let repairCalled = false;
    const calls: { stage: Stage; schemaName: string; invoked: true; result: unknown; technicalFailure: string | null }[] = [];
    const caller = (stageForCall: () => Stage): StructuredCaller => ({
      // This identifies an offline adapter; it never executes the demo engine.
      info: { mode: "demo", provider: "saved-v3-offline-replay", model: "saved-account-backed-response" },
      generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
      async callStructured<T>(schema: z.ZodType<T>, schemaName: string, system: string, user: string) {
        const stage = stageForCall();
        if (stage === "repair") repairCalled = true;
        if (stage === target) {
          requests.push({ id: item.id, stage, schemaName, responseJsonSchema: z.toJSONSchema(schema), system, user,
            requestSha256: digest(JSON.stringify({ schemaName, system, user })) });
          // Abort at the captured stage, so invented responses cannot influence later requests.
          throw new Error("offline-request-captured");
        }
        // A capture mode never requires responses from stages beyond its target.
        if (target !== null && stages.indexOf(stage) > stop) throw new Error("offline-future-stage");
        const map = maps.get(stage);
        if (!map?.has(item.id)) {
          contractErrors.push(`missing ${stage} response: ${item.id}`);
          throw new Error("offline-response-missing");
        }
        used.get(stage)?.add(item.id);
        const data = map.get(item.id);
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          errors.push({ id: item.id, stage, kind: "schema-validation-failed" });
          calls.push({ stage, schemaName, invoked: true, result: data, technicalFailure: "schema-validation-failed" });
          throw parsed.error;
        }
        calls.push({ stage, schemaName, invoked: true, result: parsed.data, technicalFailure: null });
        return { data: parsed.data, meta: {} };
      },
    });
    const result = await runDirectiveScopedTemporalReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective,
      { editor: caller(() => "editor"), verifier: caller(() => repairCalled ? "reverify" : "verifier"), repairer: caller(() => "repair") });
    if (mode === "replay") rows.push({ id: item.id, source: item.source, objective: item.objective,
      candidate: result.candidate, final: result.text, candidateVerification: result.candidateVerification,
      finalVerification: result.finalVerification, review: result.review, semanticCalls: calls.filter(call => call.stage === "verifier" || call.stage === "reverify"),
      calls, trace: result.trace, technicalFailures: errors.filter(error => error.id === item.id) });
  }
  for (const [stage, map] of maps) {
    const consumed = used.get(stage)!;
    if (map.size !== consumed.size || [...map.keys()].some(id => !consumed.has(id))) contractErrors.push(`unused ${stage} responses`);
  }
  const artifact = { strategy: "reconstruction-v15", mode, manifestSha256: V3_MANIFEST_SHA256,
    caseCount: cases.length, technicalFailures: errors, contractErrors, ...(mode === "replay" ? { rows } : { requests }) };
  // Exclusive output prevents a later replay from silently replacing the recorded run.
  writeFileSync(resolve(run, `${mode}.json`), JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
  if (contractErrors.length) throw new Error(`response contract failed (${contractErrors.length}); see ${mode}.json`);
  return artifact;
}
async function main() {
  const mode = process.argv[2];
  if (!mode || !["integrity", ...stages.map(stage => `${stage}-requests`), "replay"].includes(mode))
    throw new Error("usage: holdout-v3-runner.ts integrity|editor-requests|verifier-requests|repair-requests|reverify-requests|replay [run-directory]");
  const artifact = await runV3(mode as Mode, process.argv[3]);
  process.stdout.write(JSON.stringify({ mode, caseCount: artifact.caseCount, manifestSha256: artifact.manifestSha256 }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "V3 runner failed"}\n`); process.exitCode = 1; });
