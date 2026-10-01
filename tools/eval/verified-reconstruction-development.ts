/** Synthetic, account-agent replay harness. Never selects an API provider or reads frozen holdouts. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runVerifiedReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/verified-reconstruction-development");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const cases = z.array(z.object({ id: z.string(), category: z.string(), source: z.string(), objective: z.string(), editorialExpectation: z.string() }).strict()).min(30).max(50).parse(read("cases.json"));
const savedSchema = z.array(z.object({ id: z.string(), data: z.unknown() }).strict());
const saved = (name: string) => new Map(savedSchema.parse(read(name)).map((row) => [row.id, row.data]));
const fake = (respond: (schema: z.ZodType, name: string, system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "account-agent-replay", model: "account-agent" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
    return { data: schema.parse(respond(schema, name, system, user)), meta: {} };
  },
});
const reject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false, voicePreserved: false,
  unsupportedInformation: false, reason: "Evaluation request capture; not an editorial judgment.", issue: null };

async function main() {
  const mode = process.argv[2];
  if (!mode || !["integrity", "editor-requests", "verifier-requests", "repair-requests", "reverify-requests", "replay"].includes(mode))
    throw new Error("usage: verified-reconstruction-development.ts integrity|editor-requests|verifier-requests|repair-requests|reverify-requests|replay");
  if (mode === "integrity") {
    const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_DEVELOPMENT_REPLAY"), created: z.string(),
      route: z.literal("account-backed-no-metered-api"), strategy: z.literal("reconstruction-v10"),
      files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict().parse(read("manifest.json"));
    for (const [name, expected] of Object.entries(manifest.files)) {
      if (!/^[a-z0-9-]+\.json$/.test(name) || createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex") !== expected)
        throw new Error(`frozen v10 artifact mismatch: ${name}`);
    }
    const editorBundle = z.object({ requests: z.array(z.object({ id: z.string(), system: z.string(), user: z.string() })) }).passthrough().parse(read("editor-requests.json"));
    if (editorBundle.requests.length !== cases.length || editorBundle.requests.some((item, index) => item.id !== cases[index].id ||
      JSON.stringify(item).includes("editorialExpectation"))) throw new Error("editor request coverage or gold separation failed");
    process.stdout.write(JSON.stringify({ valid: true, cases: cases.length, artifacts: Object.keys(manifest.files).length }) + "\n");
    return;
  }
  const editors = mode === "editor-requests" ? new Map<string, unknown>() : saved("editor-results.json");
  const verifiers = ["repair-requests", "reverify-requests", "replay"].includes(mode) ? saved("verifier-results.json") : new Map<string, unknown>();
  const repairs = ["reverify-requests", "replay"].includes(mode) ? saved("repair-results.json") : new Map<string, unknown>();
  const reverifiers = mode === "replay" ? saved("reverify-results.json") : new Map<string, unknown>();
  const requests: { id: string; system: string; user: string }[] = [];
  const outputs = [];
  const consumed = { editor: new Set<string>(), verifier: new Set<string>(), repair: new Set<string>(), "post-repair verifier": new Set<string>() };
  for (const item of cases) {
    let missingResponse: string | null = null;
    const required = (items: Map<string, unknown>, stage: string) => {
      if (!items.has(item.id)) { missingResponse = stage; throw new Error(`missing saved ${stage} response for ${item.id}`); }
      if (mode === "replay") consumed[stage as keyof typeof consumed].add(item.id);
      return items.get(item.id);
    };
    let verificationCalls = 0;
    const editor = fake((_schema, _name, system, user) => {
      if (mode === "editor-requests") { requests.push({ id: item.id, system, user }); return { text: item.source, changes: [] }; }
      return required(editors, "editor");
    });
    const verifier = mode === "editor-requests" ? undefined : fake((_schema, _name, system, user) => {
      verificationCalls++;
      if (mode === "verifier-requests") { requests.push({ id: item.id, system, user }); return reject; }
      if (verificationCalls === 1 && verifiers.has(item.id)) return required(verifiers, "verifier");
      if (mode === "replay" && verificationCalls === 1 && !repairs.has(item.id)) return required(verifiers, "verifier");
      if (mode === "reverify-requests") { requests.push({ id: item.id, system, user }); return reject; }
      if (mode === "replay") return required(reverifiers, "post-repair verifier");
      return reject;
    });
    const repairer = ["repair-requests", "reverify-requests", "replay"].includes(mode) ? fake((_schema, _name, system, user) => {
      if (mode === "repair-requests") { requests.push({ id: item.id, system, user }); return { replacement: JSON.parse(user).affectedSpan.text }; }
      return required(repairs, "repair");
    }) : undefined;
    const result = await runVerifiedReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective, { editor, verifier, repairer });
    if (mode === "replay" && missingResponse) throw new Error(`missing saved ${missingResponse} response for ${item.id}`);
    if (mode === "replay") outputs.push({ id: item.id, category: item.category, objective: item.objective,
      source: item.source, candidate: result.candidate, final: result.text, trace: result.trace,
      candidateVerification: result.candidateVerification, finalVerification: result.finalVerification, review: result.review });
  }
  if (mode === "replay") {
    for (const [stage, items] of [["editor", editors], ["verifier", verifiers], ["repair", repairs], ["post-repair verifier", reverifiers]] as const) {
      if (items.size !== consumed[stage].size || [...items.keys()].some((id) => !consumed[stage].has(id)))
        throw new Error(`unused or missing saved ${stage} responses`);
    }
  }
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: "reconstruction-v10", rows: outputs } : { strategy: "reconstruction-v10", mode, requests }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "v10 development replay failed"}\n`); process.exitCode = 1; });
