/** Frozen source/objective editor experiment. Saved account-backed responses only; never selects an API provider. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runObjectiveAwareEditorReconstruction, runObjectiveAwareReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/editor-objective-focus");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const caseSchema = z.object({ id: z.string().regex(/^ea\d{2}$/), source: z.string().min(20), objective: z.string().min(5) }).strict();
const cases = z.array(caseSchema).length(14).parse(read("cases.json"));
if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("duplicate case ID");
const responses = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const saved = (name: string) => {
  const items = responses.parse(read(name));
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`duplicate response ID: ${name}`);
  return new Map(items.map((item) => [item.id, item.data]));
};
const fake = (respond: (system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "frozen-account-agent-replay", model: "account-agent" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
    return { data: schema.parse(respond(system, user)), meta: {} };
  },
});
const captureReject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false,
  voicePreserved: false, unsupportedInformation: false, reason: "Request capture only; no editorial judgment.", issue: null };

function integrity() {
  const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_GENERATION"),
    created: z.string(), caseCount: z.literal(14), creatorRoles: z.array(z.string()), annotationRoles: z.array(z.string()),
    files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)) }).strict().parse(read("manifest.json"));
  const expected = ["cases.json", "labels-first.json", "labels-second.json", "pairs.json"];
  if (Object.keys(manifest.files).sort().join() !== expected.sort().join()) throw new Error("frozen file list changed");
  for (const [name, hash] of Object.entries(manifest.files))
    if (createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex") !== hash) throw new Error(`frozen input changed: ${name}`);
  const labels = z.array(z.object({ id: z.string(), executable: z.boolean(), authorizedUpdate: z.boolean(),
    authorizedDimensions: z.array(z.string()), protectedFacts: z.array(z.string()), alreadySatisfied: z.boolean(),
    vagueMissingTarget: z.boolean(), rationale: z.string() }).passthrough()).length(cases.length);
  for (const file of ["labels-first.json", "labels-second.json"]) {
    const reviewed = labels.parse(read(file));
    if (reviewed.some((item, index) => item.id !== cases[index].id)) throw new Error(`annotation coverage changed: ${file}`);
  }
  const pairs = z.array(z.object({ ids: z.tuple([z.string(), z.string()]), relationship: z.string() })).length(3).parse(read("pairs.json"));
  for (const pair of pairs)
    if (cases.find((item) => item.id === pair.ids[0])?.source !== cases.find((item) => item.id === pair.ids[1])?.source)
      throw new Error(`same-source pair differs: ${pair.ids.join("/")}`);
  return { valid: true, cases: cases.length, pairs: pairs.length, frozenFiles: expected.length };
}

async function main() {
  const version = process.argv[2];
  const mode = process.argv[3];
  if (version !== "old" && version !== "new") throw new Error("usage: editor-objective-focus.ts old|new integrity|editor-requests|verifier-requests|repair-requests|reverify-requests|replay");
  if (mode === "integrity") { process.stdout.write(JSON.stringify(integrity()) + "\n"); return; }
  if (!["editor-requests", "verifier-requests", "repair-requests", "reverify-requests", "replay"].includes(mode ?? "")) throw new Error("invalid replay mode");
  integrity();
  const editors = mode === "editor-requests" ? new Map<string, unknown>() : saved(`${version}-editor-results.json`);
  const first = ["repair-requests", "reverify-requests", "replay"].includes(mode!) ? saved(`${version}-verifier-results.json`) : new Map<string, unknown>();
  const repairs = ["reverify-requests", "replay"].includes(mode!) ? saved(`${version}-repair-results.json`) : new Map<string, unknown>();
  const second = mode === "replay" ? saved(`${version}-reverify-results.json`) : new Map<string, unknown>();
  const consumed = { editor: new Set<string>(), first: new Set<string>(), repair: new Set<string>(), second: new Set<string>() };
  const requests: { id: string; system: string; user: string }[] = [];
  const rows = [];
  for (const item of cases) {
    let repairCalled = false;
    const editor = fake((system, user) => {
      if (mode === "editor-requests") { requests.push({ id: item.id, system, user }); return { text: item.source, changes: [] }; }
      if (!editors.has(item.id)) throw new Error(`missing editor response: ${item.id}`);
      if (mode === "replay") consumed.editor.add(item.id);
      return editors.get(item.id);
    });
    const verifier = mode === "editor-requests" ? undefined : fake((system, user) => {
      if (mode === "verifier-requests" || mode === "reverify-requests" && repairCalled) {
        requests.push({ id: item.id, system, user }); return captureReject;
      }
      const stage = repairCalled ? "second" : "first";
      const map = repairCalled ? second : first;
      if (!map.has(item.id)) throw new Error(`missing ${stage} verifier response: ${item.id}`);
      if (mode === "replay") consumed[stage].add(item.id);
      return map.get(item.id);
    });
    const repairer = ["repair-requests", "reverify-requests", "replay"].includes(mode!) ? fake((system, user) => {
      repairCalled = true;
      if (mode === "repair-requests") { requests.push({ id: item.id, system, user }); return { replacement: JSON.parse(user).affectedSpan.text }; }
      if (!repairs.has(item.id)) throw new Error(`missing repair response: ${item.id}`);
      if (mode === "replay") consumed.repair.add(item.id);
      return repairs.get(item.id);
    }) : undefined;
    const config = { editor, verifier, repairer };
    const request = { source: item.source, profile: PRESETS.natural };
    const result = version === "old" ? await runObjectiveAwareReconstruction(request, item.objective, config)
      : await runObjectiveAwareEditorReconstruction(request, item.objective, config);
    if (mode === "replay") rows.push({ id: item.id, source: item.source, objective: item.objective,
      candidate: result.candidate, final: result.text, trace: result.trace,
      candidateVerification: result.candidateVerification, finalVerification: result.finalVerification, review: result.review });
  }
  if (mode === "replay") for (const [stage, map] of [["editor", editors], ["first", first], ["repair", repairs], ["second", second]] as const)
    if (map.size !== consumed[stage].size || [...map.keys()].some((id) => !consumed[stage].has(id))) throw new Error(`unused or missing ${stage} response`);
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: version === "old" ? "reconstruction-v11" : "reconstruction-v12", rows } : { mode, requests }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "editor focus failed"}\n`); process.exitCode = 1; });
