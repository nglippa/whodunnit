import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  evaluationFailureSchema,
  evaluationRecordSchema,
  humanReviewSchema,
  runManifestSchema,
  type EvaluationFailure,
  type EvaluationRecord,
  type HumanReview,
  type RunManifest,
} from "@/domain/evaluation";

/**
 * Local, gitignored storage for evaluation runs (default: .evaluations/).
 *
 *   runs/<runId>/run.json            manifest: configuration, cases, outcome
 *   runs/<runId>/records/<case>.json one EvaluationRecord per case
 *   runs/<runId>/failures.json       isolated failures
 *   runs/<runId>/report.md           the batch report
 *   baselines.json                   { name: runId }
 *
 * Separate from the app's persistence on purpose: nothing here is a user
 * document, and nothing the app stores ever lands here.
 */

export const EVALUATIONS_DIR = ".evaluations";
const baselinesSchema = z.record(z.string(), z.string());

export interface StoredRun {
  manifest: RunManifest;
  records: EvaluationRecord[];
  failures: EvaluationFailure[];
}

export class EvaluationStore {
  readonly dir: string;
  constructor(root: string, dir = EVALUATIONS_DIR) {
    this.dir = join(root, dir);
  }

  private runDir(runId: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error(`Invalid run id "${runId}"`);
    return join(this.dir, "runs", runId);
  }

  private write(path: string, data: unknown) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
  }

  saveManifest(m: RunManifest) {
    this.write(join(this.runDir(m.runId), "run.json"), runManifestSchema.parse(m));
  }

  saveRecord(r: EvaluationRecord) {
    this.write(join(this.runDir(r.runId), "records", `${r.case.id}.json`), evaluationRecordSchema.parse(r));
  }

  saveFailures(runId: string, failures: EvaluationFailure[]) {
    this.write(join(this.runDir(runId), "failures.json"), failures.map((f) => evaluationFailureSchema.parse(f)));
  }

  saveReport(runId: string, markdown: string, name = "report.md") {
    const path = join(this.runDir(runId), name);
    this.write(path, markdown);
    return path;
  }

  listRuns(): RunManifest[] {
    const runs = join(this.dir, "runs");
    if (!existsSync(runs)) return [];
    return readdirSync(runs)
      .filter((id) => existsSync(join(runs, id, "run.json")))
      .map((id) => runManifestSchema.parse(JSON.parse(readFileSync(join(runs, id, "run.json"), "utf8"))))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** "latest", a baseline name, a full run id, or a unique prefix. */
  resolve(ref: string): string {
    const runs = this.listRuns();
    if (ref === "latest") {
      const last = runs.at(-1);
      if (!last) throw new Error("No evaluation runs yet.");
      return last.runId;
    }
    const baselines = this.baselines();
    if (baselines[ref]) return baselines[ref];
    const exact = runs.find((r) => r.runId === ref);
    if (exact) return exact.runId;
    const prefixed = runs.filter((r) => r.runId.startsWith(ref));
    if (prefixed.length === 1) return prefixed[0].runId;
    throw new Error(prefixed.length ? `"${ref}" matches several runs: ${prefixed.map((r) => r.runId).join(", ")}` : `No run or baseline named "${ref}".`);
  }

  loadRun(ref: string): StoredRun {
    const runId = this.resolve(ref);
    const dir = this.runDir(runId);
    const manifest = runManifestSchema.parse(JSON.parse(readFileSync(join(dir, "run.json"), "utf8")));
    const recDir = join(dir, "records");
    const records = existsSync(recDir)
      ? readdirSync(recDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => evaluationRecordSchema.parse(JSON.parse(readFileSync(join(recDir, f), "utf8"))))
      : [];
    const order = new Map(manifest.caseIds.map((id, i) => [id, i]));
    records.sort((a, b) => (order.get(a.case.id) ?? 0) - (order.get(b.case.id) ?? 0));
    const fPath = join(dir, "failures.json");
    const failures = existsSync(fPath) ? z.array(evaluationFailureSchema).parse(JSON.parse(readFileSync(fPath, "utf8"))) : [];
    return { manifest, records, failures };
  }

  saveReview(ref: string, caseId: string, review: HumanReview): EvaluationRecord {
    const run = this.loadRun(ref);
    const record = run.records.find((r) => r.case.id === caseId);
    if (!record) throw new Error(`Run ${run.manifest.runId} has no record for case "${caseId}".`);
    const updated = { ...record, review: humanReviewSchema.parse(review) };
    this.saveRecord(updated);
    return updated;
  }

  baselines(): Record<string, string> {
    const p = join(this.dir, "baselines.json");
    return existsSync(p) ? baselinesSchema.parse(JSON.parse(readFileSync(p, "utf8"))) : {};
  }

  setBaseline(name: string, ref: string): string {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error("Baseline names are lowercase words and dashes.");
    const runId = this.resolve(ref);
    this.write(join(this.dir, "baselines.json"), { ...this.baselines(), [name]: runId });
    return runId;
  }
}
