/** Frozen synthetic editor replay. No live provider or frozen holdout access. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runObjectiveAwareReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/objective-aware-replay");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const cases = z.array(z.object({ id: z.string().regex(/^oa\d{2}$/), category: z.string(), source: z.string().min(15), objective: z.string().min(5) }).strict()).length(32).parse(read("cases.json"));
if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("duplicate editor case ID");
const responseSchema = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const saved = (name: string) => {
  const items = responseSchema.parse(read(name));
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`duplicate response ID in ${name}`);
  return new Map(items.map((item) => [item.id, item.data]));
};
const fake = (respond: (name: string, system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "frozen-account-agent-replay", model: "account-agent" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
    return { data: schema.parse(respond(name, system, user)), meta: {} };
  },
});
const captureReject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false,
  voicePreserved: false, unsupportedInformation: false, reason: "Request capture only; no editorial judgment.", issue: null };

function integrity() {
  const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_EDITING"),
    created: z.string(), casesSha256: z.string().regex(/^[a-f0-9]{64}$/), count: z.literal(32) }).strict().parse(read("manifest.json"));
  if (createHash("sha256").update(readFileSync(resolve(root, "cases.json"))).digest("hex") !== manifest.casesSha256)
    throw new Error("editor corpus changed after freeze");
  return { valid: true, cases: cases.length };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "integrity") { process.stdout.write(JSON.stringify(integrity()) + "\n"); return; }
  if (!["editor-requests", "verifier-requests", "repair-requests", "reverify-requests", "replay"].includes(mode ?? ""))
    throw new Error("usage: objective-aware-development.ts integrity|editor-requests|verifier-requests|repair-requests|reverify-requests|replay");
  integrity();
  const editors = mode === "editor-requests" ? new Map<string, unknown>() : saved("editor-results.json");
  const first = ["repair-requests", "reverify-requests", "replay"].includes(mode!) ? saved("verifier-results.json") : new Map<string, unknown>();
  const repairs = ["reverify-requests", "replay"].includes(mode!) ? saved("repair-results.json") : new Map<string, unknown>();
  const second = mode === "replay" ? saved("reverify-results.json") : new Map<string, unknown>();
  const consumed = { editor: new Set<string>(), first: new Set<string>(), repair: new Set<string>(), second: new Set<string>() };
  const requests: { id: string; system: string; user: string }[] = [];
  const rows = [];
  for (const item of cases) {
    let repairCalled = false;
    const editor = fake((_name, system, user) => {
      if (mode === "editor-requests") { requests.push({ id: item.id, system, user }); return { text: item.source, changes: [] }; }
      if (!editors.has(item.id)) throw new Error(`missing editor response ${item.id}`);
      if (mode === "replay") consumed.editor.add(item.id);
      return editors.get(item.id);
    });
    const verifier = mode === "editor-requests" ? undefined : fake((_name, system, user) => {
      if (mode === "verifier-requests" || mode === "reverify-requests" && repairCalled) {
        requests.push({ id: item.id, system, user }); return captureReject;
      }
      const stage = repairCalled ? "second" : "first";
      const map = repairCalled ? second : first;
      if (!map.has(item.id)) throw new Error(`missing ${stage} verifier response ${item.id}`);
      if (mode === "replay") consumed[stage].add(item.id);
      return map.get(item.id);
    });
    const repairer = ["repair-requests", "reverify-requests", "replay"].includes(mode!) ? fake((_name, system, user) => {
      repairCalled = true;
      if (mode === "repair-requests") { requests.push({ id: item.id, system, user }); return { replacement: JSON.parse(user).affectedSpan.text }; }
      if (!repairs.has(item.id)) throw new Error(`missing repair response ${item.id}`);
      if (mode === "replay") consumed.repair.add(item.id);
      return repairs.get(item.id);
    }) : undefined;
    const result = await runObjectiveAwareReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective, { editor, verifier, repairer });
    if (mode === "replay") rows.push({ id: item.id, category: item.category, source: item.source,
      objective: item.objective, candidate: result.candidate, final: result.text, trace: result.trace,
      candidateVerification: result.candidateVerification, finalVerification: result.finalVerification, review: result.review });
  }
  if (mode === "replay") {
    for (const [stage, map] of [["editor", editors], ["first", first], ["repair", repairs], ["second", second]] as const)
      if (map.size !== consumed[stage].size || [...map.keys()].some((id) => !consumed[stage].has(id)))
        throw new Error(`unused or missing saved ${stage} response`);
  }
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: "reconstruction-v11", rows } : { mode, requests }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "editor replay failed"}\n`); process.exitCode = 1; });
