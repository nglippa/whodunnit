/** Synthetic source/objective/candidate probe. Fake callers only; no provider or frozen holdout access. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runVerifiedReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/verification-boundary-development");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const caseSchema = z.object({ id: z.string().regex(/^vb\d{2}$/), source: z.string().min(15), objective: z.string().min(5), candidate: z.string().min(5) }).strict();
const cases = z.array(caseSchema).min(24).max(36).parse(read("cases.json"));
if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("duplicate case id");

const responseSchema = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const saved = (name: string) => new Map(responseSchema.parse(read(name)).map((item) => [item.id, item.data]));
const fake = (respond: (name: string, system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "frozen-account-agent-replay", model: "injected-candidate" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
    return { data: schema.parse(respond(name, system, user)), meta: {} };
  },
});
const captureReject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false,
  voicePreserved: false, unsupportedInformation: false, reason: "Evaluation request capture only.", issue: null };

function integrity() {
  const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_V10"),
    created: z.string(), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict().parse(read("manifest.json"));
  const expected = ["cases.json", "first-reviews.json", "second-reviews.json", "disputes.json"];
  if (Object.keys(manifest.files).sort().join() !== expected.sort().join()) throw new Error("frozen file list changed");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex") !== hash)
      throw new Error(`frozen input changed: ${name}`);
  }
  const labels = z.array(z.object({ id: z.string(), verdict: z.enum(["ACCEPT", "REPAIRABLE", "REJECT", "AMBIGUOUS"]),
    rationale: z.string().min(8) }).passthrough()).length(cases.length).parse(read("first-reviews.json"));
  if (labels.some((item, index) => item.id !== cases[index].id)) throw new Error("first review coverage changed");
  return { valid: true, cases: cases.length, frozenFiles: expected.length };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "integrity") { process.stdout.write(JSON.stringify(integrity()) + "\n"); return; }
  if (!["verifier-requests", "repair-requests", "reverify-requests", "replay"].includes(mode ?? ""))
    throw new Error("usage: verification-boundary.ts integrity|verifier-requests|repair-requests|reverify-requests|replay");
  integrity(); // The corpus and blind labels must be frozen before any V10 run.
  const first = mode === "verifier-requests" ? new Map<string, unknown>() : saved("verifier-results.json");
  const repairs = ["reverify-requests", "replay"].includes(mode!) ? saved("repair-results.json") : new Map<string, unknown>();
  const second = mode === "replay" ? saved("reverify-results.json") : new Map<string, unknown>();
  const consumed = { first: new Set<string>(), repairs: new Set<string>(), second: new Set<string>() };
  const requests: { id: string; system: string; user: string }[] = [];
  const rows = [];
  for (const item of cases) {
    let repairCalled = false;
    const editor = fake(() => ({ text: item.candidate, changes: [] }));
    const verifier = fake((_name, system, user) => {
      if (mode === "verifier-requests" || mode === "reverify-requests" && repairCalled) {
        requests.push({ id: item.id, system, user }); return captureReject;
      }
      const stage = repairCalled ? "second" : "first";
      const data = repairCalled ? second.get(item.id) : first.get(item.id);
      if (data === undefined) throw new Error(`missing ${stage} verifier response for ${item.id}`);
      if (mode === "replay") consumed[stage].add(item.id);
      return data;
    });
    const repairer = ["repair-requests", "reverify-requests", "replay"].includes(mode!) ? fake((_name, system, user) => {
      repairCalled = true;
      if (mode === "repair-requests") {
        requests.push({ id: item.id, system, user });
        return { replacement: JSON.parse(user).affectedSpan.text }; // Capture only; never accepted as repair.
      }
      const data = repairs.get(item.id);
      if (data === undefined) throw new Error(`missing repair response for ${item.id}`);
      if (mode === "replay") consumed.repairs.add(item.id);
      return data;
    }) : undefined;
    const result = await runVerifiedReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective, { editor, verifier, repairer });
    if (mode === "replay") rows.push({ id: item.id, source: item.source, objective: item.objective,
      candidate: item.candidate, final: result.text, trace: result.trace,
      candidateVerification: result.candidateVerification, finalVerification: result.finalVerification, review: result.review });
  }
  if (mode === "replay") {
    for (const [stage, map] of [["first", first], ["repairs", repairs], ["second", second]] as const)
      if (map.size !== consumed[stage].size || [...map.keys()].some((id) => !consumed[stage].has(id)))
        throw new Error(`unused or missing ${stage} response`);
  }
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: "reconstruction-v10", rows } : { mode, requests }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "verification probe failed"}\n`); process.exitCode = 1; });
