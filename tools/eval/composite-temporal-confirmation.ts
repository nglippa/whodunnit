/** Saved candidate confirmation only: no network route and no candidate generation. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runCompositeTemporalReconstruction, runExactDeltaReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const root = resolve("data/fixtures/composite-temporal-confirmation");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const cases = z.array(z.object({ id: z.string().regex(/^ct0[1-8]$/), source: z.string(),
  objective: z.string(), candidate: z.string() }).strict()).length(8).parse(read("cases.json"));
const manifest = z.object({ schemaVersion: z.literal(1), status: z.literal("FROZEN_BEFORE_BLIND_REVIEW_AND_EXECUTION"),
  caseCount: z.literal(8), casesSha256: z.string() }).strict().parse(read("input-manifest.json"));
if (createHash("sha256").update(readFileSync(resolve(root, "cases.json"))).digest("hex") !== manifest.casesSha256)
  throw new Error("fresh temporal cases changed after freeze");
const frozen = z.object({ rows: z.array(z.object({ id: z.string(), source: z.string(), objective: z.string(), candidate: z.string() })) })
  .parse(JSON.parse(readFileSync(resolve("data/fixtures/v13-architecture-replay/run-v13.json"), "utf8"))).rows
  .find((item) => item.id === "ar04");
if (!frozen) throw new Error("frozen ar04 missing");

const mode = process.argv[2];
if (!mode || !["integrity", "verifier-requests", "replay"].includes(mode))
  throw new Error("usage: composite-temporal-confirmation.ts integrity|verifier-requests|replay");
const labels = mode === "verifier-requests" || mode === "integrity" ? null : ["labels-a.json", "labels-b.json"].map((file) =>
  z.array(z.object({ id: z.string(), authorization: z.enum(["AUTHORIZED", "UNAUTHORIZED", "MIXED"]),
    decision: z.enum(["ACCEPT", "REJECT", "REPAIRABLE"]) }).passthrough()).length(8).parse(read(file)));
if (labels && labels.some((set) => set.map((item) => item.id).join() !== cases.map((item) => item.id).join()))
  throw new Error("blind label IDs do not match frozen cases");
const replies = mode === "replay" ? new Map(z.array(z.object({ id: z.string(), data: z.unknown() }).strict())
  .parse(read("verifier-results.json")).map((item) => [item.id, item.data])) : new Map<string, unknown>();
const captured: { id: string; system: string; user: string }[] = [];
const reject = { verdict: "REJECT", meaningPreserved: false, objectiveSatisfied: false,
  voicePreserved: true, unsupportedInformation: false, reason: "Capture only; not an editorial verdict.", issue: null };
const fake = (respond: (system: string, user: string) => unknown): StructuredCaller => ({
  info: { mode: "demo", provider: "saved-account-agent-replay", model: "saved-response" },
  generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
  async callStructured<T>(schema: z.ZodType<T>, _name: string, system: string, user: string) {
    return { data: schema.parse(respond(system, user)), meta: {} };
  },
});

async function main() {
  if (mode === "integrity") { process.stdout.write(JSON.stringify({ valid: true, cases: 8, hash: manifest.casesSha256 }) + "\n"); return; }
  const rows = [];
  const used = new Set<string>();
  for (const item of [frozen!, ...cases]) {
    const editor = fake(() => ({ text: item.candidate, changes: [] }));
    const verifier = fake((system, user) => {
      if (mode === "verifier-requests") { captured.push({ id: item.id, system, user }); return reject; }
      if (!replies.has(item.id)) throw new Error(`missing saved semantic response for ${item.id}`);
      used.add(item.id);
      return replies.get(item.id);
    });
    const next = await runCompositeTemporalReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective,
      { editor, verifier });
    const old = item.id === "ar04" ? await runExactDeltaReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective,
      { editor: fake(() => ({ text: item.candidate, changes: [] })), verifier: fake(() => reject) }) : null;
    if (mode === "replay") rows.push({ id: item.id, source: item.source, objective: item.objective,
      candidate: item.candidate, final: next.text, trace: next.trace, findings: next.candidateVerification?.findings,
      review: next.review, ...(old ? { v13: { final: old.text, trace: old.trace,
        findings: old.candidateVerification?.findings } } : {}) });
  }
  if (mode === "replay" && (used.size !== replies.size || [...replies.keys()].some((id) => !used.has(id))))
    throw new Error("unused or missing semantic responses");
  process.stdout.write(JSON.stringify(mode === "replay" ? { strategy: "reconstruction-v14", rows } : { requests: captured }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "confirmation failed"}\n`); process.exitCode = 1; });
