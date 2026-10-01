/** Saved synthetic candidates only. This never chooses a network or paid provider. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { runExactDeltaReconstruction } from "@/lib/reconstruction/verified-reconstruction";

const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), "utf8")) as T;
const map = (path: string) => new Map(read<{ id: string; data: unknown }[]>(path).map((row) => [row.id, row.data]));
const base = "data/fixtures";
const out = ".evaluations/exact-delta";
const cohort = process.argv[2];
const captureRepairs = process.argv[3] === "capture-repairs";
if (!["old", "new", "boundary", "fresh"].includes(cohort)) throw new Error("Use old|new|boundary|fresh");

function integrity(dir: string) {
  const manifest = read<{ files: Record<string, string> }>(`${dir}/manifest.json`);
  for (const [name, expected] of Object.entries(manifest.files)) {
    const actual = createHash("sha256").update(readFileSync(resolve(dir, name))).digest("hex");
    if (actual !== expected) throw new Error(`Frozen input changed: ${dir}/${name}`);
  }
}

function fake(respond: (user: string) => unknown): StructuredCaller {
  return { info: { mode: "demo", provider: "saved-account-agent-replay", model: "saved-response" },
    generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
    async callStructured<T>(schema: z.ZodType<T>, _name: string, _system: string, user: string) {
      return { data: schema.parse(respond(user)), meta: {} }; } };
}

async function main() {
  const dir = cohort === "boundary" ? `${base}/verification-boundary-development` :
    cohort === "fresh" ? `${base}/exact-delta-confirmation` : `${base}/editor-objective-focus`;
  integrity(dir);
  const cases = cohort === "boundary" || cohort === "fresh"
    ? read<{ id: string; source: string; objective: string; candidate: string }[]>(`${dir}/cases.json`)
    : read<{ rows: { id: string; source: string; objective: string; candidate: string }[] }>(`${dir}/${cohort}-replay.json`).rows;
  const previousFirst = cohort === "old" || cohort === "new" ? map(`${dir}/${cohort}-verifier-results.json`) :
    cohort === "boundary" ? map(`${dir}/v11-verifier-results.json`) : new Map<string, unknown>();
  const previousRepairs = cohort === "old" || cohort === "new" ? map(`${dir}/${cohort}-repair-results.json`) :
    cohort === "boundary" ? map(`${dir}/v11-repair-results.json`) : new Map<string, unknown>();
  const previousSecond = cohort === "old" || cohort === "new" ? map(`${dir}/${cohort}-reverify-results.json`) :
    cohort === "boundary" ? map(`${dir}/v11-reverify-results.json`) : new Map<string, unknown>();
  const independent = cohort === "fresh" ? map(`${out}/fresh-verifier-results.json`) :
    new Map(read<{ key: string; data: unknown }[]>(`${out}/semantic-review-results.json`).map((row) => [row.key, row.data]));
  const freshRepairs = cohort === "fresh" && !captureRepairs ? map(`${out}/fresh-repair-results.json`) : new Map<string, unknown>();
  const freshSecond = cohort === "fresh" && !captureRepairs ? map(`${out}/fresh-reverify-results.json`) : new Map<string, unknown>();
  const rows = [];
  const repairRequests: { id: string; request: unknown }[] = [];
  for (const item of cases) {
    let repaired = false;
    const firstKey = cohort === "old" || cohort === "new" ? `${cohort}-${item.id}` : item.id;
    const editor = fake(() => ({ text: item.candidate, changes: [] }));
    const verifier = fake(() => {
      const response = repaired ? previousSecond.get(item.id) ?? freshSecond.get(item.id) ?? independent.get(`${firstKey}-second`) :
        independent.get(firstKey) ?? previousFirst.get(item.id);
      if (response === undefined) throw new Error(`No saved verifier response for ${firstKey}${repaired ? "-second" : ""}`);
      return response;
    });
    const repairer = fake((user) => {
      repaired = true;
      if (captureRepairs) {
        repairRequests.push({ id: item.id, request: JSON.parse(user) });
        return { replacement: JSON.parse(user).affectedSpan.text };
      }
      const response = previousRepairs.get(item.id) ?? freshRepairs.get(`${firstKey}-repair`) ?? independent.get(`${firstKey}-repair`);
      if (response === undefined) throw new Error(`No saved repair response for ${firstKey}`);
      return response;
    });
    const result = await runExactDeltaReconstruction({ source: item.source, profile: PRESETS.natural }, item.objective,
      { editor, verifier, repairer });
    rows.push({ id: item.id, source: item.source, objective: item.objective, candidate: item.candidate,
      final: result.text, trace: result.trace, candidateVerification: result.candidateVerification,
      finalVerification: result.finalVerification, review: result.review });
  }
  mkdirSync(resolve(out), { recursive: true });
  if (captureRepairs) {
    writeFileSync(resolve(out, `${cohort}-repair-requests.json`), JSON.stringify(repairRequests, null, 2));
    process.stdout.write(JSON.stringify({ cohort, repairRequests: repairRequests.length }) + "\n");
    return;
  }
  writeFileSync(resolve(out, `${cohort}-replay.json`), JSON.stringify({ strategy: "reconstruction-v13", rows }, null, 2));
  const counts = { cases: rows.length, accepted: rows.filter((row) => row.trace.outcome === "accepted").length,
    repaired: rows.filter((row) => row.trace.outcome === "repaired").length,
    fallbacks: rows.filter((row) => row.trace.outcome === "source-fallback").length,
    malformed: rows.filter((row) => row.trace.fallbackReason === "verifier-malformed").length };
  process.stdout.write(JSON.stringify({ cohort, counts }) + "\n");
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Replay failed"}\n`); process.exitCode = 1; });
