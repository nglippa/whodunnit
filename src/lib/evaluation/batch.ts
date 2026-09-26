import type { EvaluationFailure, EvaluationRecord } from "@/domain/evaluation";
import type { LoadedCase } from "./corpus";
import { EvaluationCaseError } from "./runner";

/**
 * Runs cases with a small, fixed concurrency (1 or 2: no API spam). A failed
 * case is recorded and the batch continues; one provider error never costs
 * the rest of the run.
 */

export type ProgressEvent =
  | { type: "start"; caseId: string; index: number; total: number }
  | { type: "done"; caseId: string; record: EvaluationRecord }
  | { type: "failed"; caseId: string; failure: EvaluationFailure };

export interface BatchOptions {
  concurrency?: number;
  onProgress?: (e: ProgressEvent) => void;
  /** Called as each result lands, so partial runs are persisted. */
  onRecord?: (r: EvaluationRecord) => void;
  now?: () => string;
}

export async function runBatch(
  cases: LoadedCase[],
  evaluate: (c: LoadedCase) => Promise<EvaluationRecord>,
  options: BatchOptions = {},
): Promise<{ records: EvaluationRecord[]; failures: EvaluationFailure[] }> {
  const concurrency = Math.min(2, Math.max(1, options.concurrency ?? 1));
  const now = options.now ?? (() => new Date().toISOString());
  const records: EvaluationRecord[] = [];
  const failures: EvaluationFailure[] = [];
  let next = 0;

  const worker = async () => {
    while (next < cases.length) {
      const index = next++;
      const c = cases[index];
      options.onProgress?.({ type: "start", caseId: c.id, index, total: cases.length });
      try {
        const record = await evaluate(c);
        records.push(record);
        options.onRecord?.(record);
        options.onProgress?.({ type: "done", caseId: c.id, record });
      } catch (err) {
        const e = err instanceof EvaluationCaseError ? err : null;
        const failure: EvaluationFailure = {
          caseId: c.id,
          stage: e ? e.stage : null,
          code: e ? e.code : "error",
          message: (err instanceof Error ? err.message : String(err)).slice(0, 400),
          attempts: e ? e.attempts : [],
          at: now(),
        };
        failures.push(failure);
        options.onProgress?.({ type: "failed", caseId: c.id, failure });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  const order = new Map(cases.map((c, i) => [c.id, i]));
  records.sort((a, b) => order.get(a.case.id)! - order.get(b.case.id)!);
  return { records, failures };
}
