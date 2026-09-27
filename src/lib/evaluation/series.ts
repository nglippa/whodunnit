import type { EvaluationRecord, StageRecord } from "@/domain/evaluation";
import type { StoredRun } from "./store";

/**
 * A series: the SAME configuration run several times, differing only in the
 * sampling seed. It answers "how stable is this?", not "which is better?".
 *
 * Refuses to mix configurations: a forced-model run and a normal run, two
 * models, two strategies, two prompts, two judges or two reasoning budgets
 * are different experiments, and a variability figure across them would be
 * meaningless.
 */

const final = (r: EvaluationRecord) => r.stages[r.stages.length - 1];
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(d));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const range = (xs: number[]) => (xs.length ? `${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))}` : "–");

/** Everything that must match for runs to form one series (the seed is the only thing allowed to differ). */
export function seriesIdentity(run: StoredRun): Record<string, string> {
  const c = run.records[0]?.config;
  const gen: Record<string, unknown> = { ...(run.manifest.config.generation ?? {}) };
  delete gen.seed;
  return {
    mode: run.manifest.mode,
    provider: run.manifest.config.provider,
    model: String(run.manifest.config.model),
    strategy: run.manifest.config.strategy,
    prompt: c ? `${c.prompt.key}#${c.prompt.fingerprint}` : "?",
    analysis: c?.analysisVersion ?? "pre-semantics",
    generation: JSON.stringify(gen),
    judge: c?.judge ? `${c.judge.provider}/${c.judge.model} ${c.judge.prompt ?? "judge.v1"} ${JSON.stringify(run.manifest.config.judge?.reasoningEffort ?? null)}` : "none",
    forcedModel: String(Boolean(run.manifest.config.forceModel || c?.forcedModel)),
    corpus: String(run.manifest.corpusVersion),
  };
}

export function assertSeries(runs: StoredRun[]) {
  const [head, ...tail] = runs.map(seriesIdentity);
  for (const [i, id] of tail.entries()) {
    const diff = Object.keys(head).filter((k) => head[k] !== id[k]);
    if (diff.length)
      throw new Error(
        `${runs[i + 1].manifest.runId} is not the same configuration as ${runs[0].manifest.runId} (differs in: ${diff.map((k) => `${k} ${head[k]} vs ${id[k]}`).join("; ")}). A series varies only the seed; compare different configurations with eval:compare.`,
      );
  }
  const seeds = runs.map((r) => r.manifest.config.generation?.seed);
  if (new Set(seeds.map(String)).size !== seeds.length) throw new Error(`Seeds must differ across a series (got ${seeds.map((s) => s ?? "unset").join(", ")}).`);
}

type Outcome = { seed: string; record: EvaluationRecord | null };

export function renderSeries(runs: StoredRun[]): string {
  assertSeries(runs);
  const id = seriesIdentity(runs[0]);
  const seed = (r: StoredRun) => String(r.manifest.config.generation?.seed ?? "unset");
  const L: string[] = [];
  L.push(`# Series: ${id.provider}/${id.model} · ${id.strategy}${id.forcedModel === "true" ? " · FORCED MODEL" : ""}`, "");
  L.push(
    id.forcedModel === "true"
      ? "> **Forced-model diagnostic series.** The planner bypass was disabled: this measures BACKEND SAFETY, not PRODUCT QUALITY. Do not aggregate it with a normal series."
      : "> Normal product behaviour: text the planner considers finished is returned without a model call. This measures PRODUCT QUALITY.",
    "",
  );
  L.push(`- Runs (seed → run id): ${runs.map((r) => `${seed(r)} → ${r.manifest.runId}`).join("; ")}`);
  L.push(`- Judge: ${id.judge}`, `- Generation (other than seed): ${id.generation}`, "");

  const caseIds = [...new Set(runs.flatMap((r) => r.manifest.caseIds))];
  const outcomes = new Map<string, Outcome[]>(caseIds.map((c) => [c, runs.map((r) => ({ seed: seed(r), record: r.records.find((x) => x.case.id === c) ?? null }))]));
  const n = runs.length;

  const worst = (r: EvaluationRecord) => (r.stages.some((s) => s.semantic.verdict === "FAIL") ? "FAIL" : r.stages.some((s) => s.semantic.verdict === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : "PASS");
  const classify = (os: Outcome[], bad: (r: EvaluationRecord) => boolean) => {
    const k = os.filter((o) => o.record && bad(o.record)).length;
    const ran = os.filter((o) => o.record).length;
    return k === 0 ? "never" : k === ran && ran === n ? `every seed (${k}/${n})` : `intermittent (${k}/${n})`;
  };

  L.push("## Per case", "");
  L.push(
    table(
      ["case", "semantics per seed", "semantic FAIL", "voice DAMAGED", "refinement NOT_APPLIED", "retention median (range)", "latency ms median (range)", "errors"],
      caseIds.map((c) => {
        const os = outcomes.get(c)!;
        const recs = os.flatMap((o) => (o.record ? [o.record] : []));
        const ret = recs.map((r) => final(r).retention.tokenRetention);
        const lat = recs.map((r) => r.stages.reduce((a, s) => a + s.latencyMs, 0));
        return [
          c,
          os.map((o) => `${o.seed}:${o.record ? worst(o.record) : "ERROR"}`).join(" "),
          classify(os, (r) => worst(r) === "FAIL"),
          classify(os, (r) => r.stages.some((s) => s.voiceDevices?.verdict === "DAMAGED")),
          classify(os, (r) => r.stages.some((s) => s.refinementEffect?.status === "NOT_APPLIED")),
          `${fmt(median(ret))} (${range(ret)})`,
          `${fmt(median(lat), 0)} (${range(lat)})`,
          n - recs.length,
        ];
      }),
    ),
    "",
  );

  const every = caseIds.filter((c) => outcomes.get(c)!.every((o) => o.record && worst(o.record) === "FAIL"));
  const some = caseIds.filter((c) => !every.includes(c) && outcomes.get(c)!.some((o) => o.record && worst(o.record) === "FAIL"));
  L.push("## Semantic failures", "");
  L.push(`- On every seed (systematic): ${every.join(", ") || "none"}`, `- Intermittent (seed-dependent): ${some.join(", ") || "none"}`, "");

  const stages = (pred: (s: StageRecord) => boolean) => runs.map((r) => r.records.reduce((a, x) => a + x.stages.filter(pred).length, 0));
  L.push("## Totals per seed (not averaged into one number)", "");
  L.push(
    table(
      ["seed", "completed / failed", "cases FAIL", "cases NEEDS_REVIEW", "stages voice DAMAGED", "refinements APPLIED / NOT_APPLIED / total", "median retention", "median latency ms"],
      runs.map((r, i) => {
        const applied = stages((s) => s.refinementEffect?.status === "APPLIED" || s.refinementEffect?.status === "ALREADY_SATISFIED")[i];
        const notApplied = stages((s) => s.refinementEffect?.status === "NOT_APPLIED")[i];
        const total = stages((s) => Boolean(s.refinementEffect))[i];
        return [
          seed(r),
          `${r.records.length} / ${r.failures.length}`,
          r.records.filter((x) => worst(x) === "FAIL").length,
          r.records.filter((x) => worst(x) === "NEEDS_REVIEW").length,
          stages((s) => s.voiceDevices?.verdict === "DAMAGED")[i],
          `${applied} / ${notApplied} / ${total}`,
          fmt(median(r.records.map((x) => final(x).retention.tokenRetention))),
          fmt(median(r.records.map((x) => x.stages.reduce((a, s) => a + s.latencyMs, 0))), 0),
        ];
      }),
    ),
    "",
  );
  L.push("Variability is reported per case and per seed. No composite score is computed.", "");
  return L.join("\n");
}
