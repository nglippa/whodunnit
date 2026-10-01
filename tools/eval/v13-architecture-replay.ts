/** Frozen, synthetic account-agent replay. Never selects a metered provider. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runExactDeltaReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/v13-architecture-replay");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const caseSchema = z.object({ id: z.string().regex(/^ar\d{2}$/), source: z.string().min(20), objective: z.string().min(5),
  provenance: z.string(), writingCategory: z.string(), objectiveCategory: z.string(), alreadyGood: z.boolean(),
  explicitUpdate: z.boolean(), vagueUpdate: z.boolean(), protectedAnchors: z.array(z.string()) }).strict();
const cases = z.array(caseSchema).length(40).parse(read("cases.json"));
const responses = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const saved = (name: string) => {
  const rows = responses.parse(read(name));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`duplicate response ID: ${name}`);
  return new Map(rows.map((row) => [row.id, row.data]));
};
const fake = (respond: (system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "saved-account-agent-replay", model: "account-backed-frontier-agent" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
    return { data: schema.parse(respond(system, user)), meta: {} };
  },
});
const captureReject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false,
  voicePreserved: false, unsupportedInformation: false, reason: "Request capture only; no editorial judgment.", issue: null };

function integrity() {
  const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_GENERATION"),
    created: z.string(), caseCount: z.literal(40), strategy: z.literal("reconstruction-v13"),
    editorPrompt: z.literal("reconstruct.v8"), route: z.literal("account-backed-no-metered-api"),
    provenance: z.object({ creatorA: z.string(), creatorB: z.string(), replacements: z.string(), humanText: z.string() }).strict(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict().parse(read("manifest.json"));
  if (Object.keys(manifest.files).sort().join() !== ["cases.json", "review-rubric.json"].sort().join())
    throw new Error("unexpected frozen input list");
  for (const [name, expected] of Object.entries(manifest.files))
    if (createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex") !== expected)
      throw new Error(`frozen V13 input changed: ${name}`);
  if (new Set(cases.map((item) => item.id)).size !== 40) throw new Error("duplicate case ID");
  if (cases.some((item, index) => item.id !== `ar${String(index + 1).padStart(2, "0")}`)) throw new Error("case order changed");
  return { valid: true, cases: cases.length, fingerprint: manifest.files["cases.json"] };
}

async function main() {
  const mode = process.argv[2];
  if (!mode || !["integrity", "editor-requests", "verifier-requests", "repair-requests", "reverify-requests", "replay"].includes(mode))
    throw new Error("usage: v13-architecture-replay.ts integrity|editor-requests|verifier-requests|repair-requests|reverify-requests|replay");
  const frozen = integrity();
  if (mode === "integrity") { process.stdout.write(JSON.stringify(frozen) + "\n"); return; }
  const editors = mode === "editor-requests" ? new Map<string, unknown>() : saved("editor-results.json");
  const first = ["repair-requests", "reverify-requests", "replay"].includes(mode) ? saved("verifier-results.json") : new Map<string, unknown>();
  const repairs = ["reverify-requests", "replay"].includes(mode) ? saved("repair-results.json") : new Map<string, unknown>();
  const second = mode === "replay" ? saved("reverify-results.json") : new Map<string, unknown>();
  const used = { editor: new Set<string>(), first: new Set<string>(), repair: new Set<string>(), second: new Set<string>() };
  const requests: { id: string; system: string; user: string }[] = [];
  const rows = [];
  for (const item of cases) {
    let repairCalled = false;
    const required = (map: Map<string, unknown>, stage: keyof typeof used) => {
      if (!map.has(item.id)) throw new Error(`missing ${stage} response: ${item.id}`);
      if (mode === "replay") used[stage].add(item.id);
      return map.get(item.id);
    };
    const editor = fake((system, user) => {
      if (mode === "editor-requests") { requests.push({ id: item.id, system, user }); return { text: item.source, changes: [] }; }
      return required(editors, "editor");
    });
    const verifier = mode === "editor-requests" ? undefined : fake((system, user) => {
      if (mode === "verifier-requests" || mode === "reverify-requests" && repairCalled) {
        requests.push({ id: item.id, system, user }); return captureReject;
      }
      return required(repairCalled ? second : first, repairCalled ? "second" : "first");
    });
    const repairer = ["repair-requests", "reverify-requests", "replay"].includes(mode) ? fake((system, user) => {
      repairCalled = true;
      if (mode === "repair-requests") { requests.push({ id: item.id, system, user }); return { replacement: JSON.parse(user).affectedSpan.text }; }
      return required(repairs, "repair");
    }) : undefined;
    const result = await runExactDeltaReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective,
      { editor, verifier, repairer });
    if (mode === "replay") rows.push({ id: item.id, category: item.writingCategory, provenance: item.provenance,
      objectiveCategory: item.objectiveCategory, alreadyGood: item.alreadyGood, explicitUpdate: item.explicitUpdate,
      vagueUpdate: item.vagueUpdate, source: item.source, objective: item.objective, candidate: result.candidate,
      final: result.text, candidateVerification: result.candidateVerification, finalVerification: result.finalVerification,
      review: result.review, trace: result.trace });
  }
  if (mode === "replay") for (const [stage, map] of [["editor", editors], ["first", first], ["repair", repairs], ["second", second]] as const)
    if (map.size !== used[stage].size || [...map.keys()].some((id) => !used[stage].has(id))) throw new Error(`unused ${stage} responses`);
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: "reconstruction-v13", rows }
    : { strategy: "reconstruction-v13", mode, requests }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "V13 replay failed"}\n`); process.exitCode = 1; });
