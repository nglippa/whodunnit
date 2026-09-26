import { CORPUS_CATEGORIES, type EvaluationRecord, type StageRecord } from "@/domain/evaluation";
import type { StoredRun } from "./store";

/**
 * Markdown reports for a run, and comparisons between runs. They present
 * dimensions side by side and flag changes; they never compute a winner or a
 * composite score. What a change means is for a person to decide.
 */

const final = (r: EvaluationRecord) => r.stages[r.stages.length - 1];
const first = (r: EvaluationRecord) => r.stages[0];
const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(d));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
const introducedDet = (s: StageRecord) => s.rules.introducedDeterministic.length;
const expectationFailures = (r: EvaluationRecord) => r.stages.flatMap((s) => s.expectations.filter((e) => !e.passed).map((e) => ({ stage: s.index, ...e })));

export function renderRunReport(run: StoredRun): string {
  const { manifest: m, records, failures } = run;
  const L: string[] = [];
  L.push(`# Evaluation run ${m.runId}`, "");
  if (!m.realModel) L.push("> **Demo engine.** These outputs come from the deterministic rule-based engine, not a model. Nothing here measures real-model reconstruction.", "");
  L.push(
    `- Created ${m.createdAt}${m.finishedAt ? `, finished ${m.finishedAt}` : " (unfinished)"}`,
    `- Cases: ${m.caseIds.length} selected, ${m.completed.length} completed, ${m.failed.length} failed`,
    `- Corpus version ${m.corpusVersion}; git ${m.git.commit?.slice(0, 10) ?? "unknown"}${m.git.dirty ? " (uncommitted changes)" : ""}`,
    "",
  );

  L.push("## Configuration", "");
  const c0 = records[0]?.config;
  L.push(`- Provider: ${m.config.provider} (${m.mode}); model: ${m.config.model ?? "none"}; sampling: provider defaults`);
  L.push(`- Strategy: ${m.config.strategy}${c0 ? ` — ${c0.strategy.name} [${c0.strategy.status}]` : ""}`);
  if (c0) L.push(`- Prompt: ${c0.prompt.key} (fingerprint ${c0.prompt.fingerprint})`, `- Rule packs: ${c0.rulePacks.map((p) => `${p.id}@${p.version}`).join(", ")}`);
  L.push(`- Concurrency: ${m.concurrency}`, "");

  L.push("## Corpus results", "");
  L.push(
    table(
      ["case", "category", "stages", "semantic", "patterns", "resolved", "introduced (det)", "token retention", "edit dist.", "voice moved out", "retries", "latency ms", "review"],
      records.map((r) => {
        const s = final(r);
        const f0 = first(r);
        return [
          r.case.id,
          CORPUS_CATEGORIES[r.case.category].split(".")[0],
          r.stages.length,
          r.stages.map((x) => x.semantic.verdict).join("→"),
          `${f0.rules.before.length}→${s.rules.after.length}`,
          s.rules.resolved.length,
          `${s.rules.introduced.length} (${introducedDet(s)})`,
          fmt(s.retention.tokenRetention),
          fmt(s.retention.wordEditDistance),
          s.voice.movedOut.length,
          r.stages.reduce((a, x) => a + x.retries, 0),
          r.stages.reduce((a, x) => a + x.latencyMs, 0),
          r.review ? "reviewed" : "–",
        ];
      }),
    ),
    "",
  );

  L.push("## Semantic failures", "");
  const semFails = records.flatMap((r) => r.stages.filter((s) => s.semantic.verdict === "FAIL").map((s) => ({ r, s })));
  if (!semFails.length) L.push("None detected. (Deterministic checks catch concrete changes; they are not proof of equivalence.)");
  for (const { r, s } of semFails) {
    L.push(`- **${r.case.id}** stage ${s.index} (${s.label}):`);
    for (const f of s.semantic.deterministic.failures) L.push(`  - deterministic ${f.kind}: ${f.message}`);
    for (const a of s.semantic.caseAnchorsLost) L.push(`  - case anchor lost: “${a}”`);
    for (const f of s.semantic.model.failures) L.push(`  - model ${f.kind}: ${f.message}`);
  }
  const modelRan = records.some((r) => r.stages.some((s) => s.semantic.model.status !== "not-run"));
  L.push("", `Model meaning check: ${modelRan ? "ran where the deterministic checks passed" : "not run in this batch"}.`, "");

  L.push("## Rule changes", "");
  const introducedCount = new Map<string, number>();
  const resolvedCount = new Map<string, number>();
  for (const r of records) {
    const s = final(r);
    for (const id of s.rules.introduced) introducedCount.set(id, (introducedCount.get(id) ?? 0) + 1);
    for (const id of s.rules.resolved) resolvedCount.set(id, (resolvedCount.get(id) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ×${n}`).join(", ") || "none";
  L.push(`- Introduced (cases): ${top(introducedCount)}`, `- Resolved (cases): ${top(resolvedCount)}`, "");

  L.push("## Voiceprint behaviour", "");
  const vpRecords = records.filter((r) => r.config.voiceprint);
  for (const r of vpRecords) {
    const s = final(r);
    L.push(`**${r.case.id}** against Voiceprint “${r.config.voiceprint!.name}” (confidence ${r.config.voiceprint!.confidence}):`, "");
    L.push(table(["dimension", "range", "source", "output", "conf.", "in range"], s.voice.dimensions.map((d) => [d.label, `${fmt(d.expected.min)}–${fmt(d.expected.max)}`, fmt(d.source), fmt(d.actual), fmt(d.confidence), d.withinRange ? "yes" : "**no**"])), "");
  }
  const drift = new Map<string, number>();
  for (const r of records.filter((x) => !x.config.voiceprint)) for (const d of final(r).voice.movedOut) drift.set(d, (drift.get(d) ?? 0) + 1);
  L.push(`Against each source's own tendencies, dimensions that moved out of range (cases): ${top(drift)}.`, "");

  L.push("## Minimal-change cases", "");
  const minimal = records.filter((r) => first(r).plan.intensity === "minimal" || first(r).expectations.some((e) => e.id === "minimal-change"));
  if (!minimal.length) L.push("None in this batch.");
  else
    L.push(
      table(
        ["case", "intensity", "unchanged", "token retention", "trigram retention", "edit dist.", "expected"],
        minimal.map((r) => {
          const s = first(r);
          const exp = s.expectations.find((e) => e.id === "minimal-change");
          return [r.case.id, s.plan.intensity, s.output.text.trim() === r.source.text.trim() ? "yes" : "no", fmt(s.retention.tokenRetention), fmt(s.retention.trigramRetention), fmt(s.retention.wordEditDistance), exp ? (exp.passed ? "met" : `**not met** (${exp.description})`) : "–"];
        }),
      ),
    );
  L.push("");

  L.push("## Repeated refinement", "");
  const chains = records.filter((r) => r.stages.length > 1);
  if (!chains.length) L.push("No refinement chains in this batch.");
  for (const r of chains) {
    L.push(`**${r.case.id}** (every stage verified against the original):`, "");
    L.push(
      table(
        ["stage", "semantic", "retention vs original", "vs previous", "mean sentence", "sentence CV", "contractions/100", "introduced", "voice moved out"],
        r.stages.map((s) => {
          const d = (k: string) => s.metricDeltas.find((x) => x.metric === k)!;
          return [
            `${s.index}. ${s.label}`,
            s.semantic.verdict,
            fmt(s.retention.tokenRetention),
            fmt(s.retentionVsPrevious?.tokenRetention),
            `${fmt(d("sentence.mean").before)}→${fmt(d("sentence.mean").after)}`,
            `${fmt(d("sentence.cv").before)}→${fmt(d("sentence.cv").after)}`,
            `${fmt(d("contractions.per100").before)}→${fmt(d("contractions.per100").after)}`,
            s.rules.introduced.join(", ") || "–",
            s.voice.movedOut.length,
          ];
        }),
      ),
      "",
    );
  }

  L.push("## Constraint load", "");
  L.push(
    table(
      ["case", "intensity", "contract items", "omitted", "chars", "patterns after", "introduced", "token retention"],
      records.map((r) => {
        const s = first(r);
        return [r.case.id, s.plan.intensity, s.plan.size.total ?? 0, s.plan.size.omitted ?? 0, s.plan.contractChars, s.rules.after.length, s.rules.introduced.length, fmt(s.retention.tokenRetention)];
      }),
    ),
    "",
  );

  L.push("## Provider errors", "");
  if (!failures.length) L.push("None.");
  for (const f of failures) L.push(`- **${f.caseId}**${f.stage !== null ? ` stage ${f.stage}` : ""}: ${f.code}: ${f.message} (${f.attempts.length} attempt${f.attempts.length === 1 ? "" : "s"} recorded)`);
  L.push("");

  L.push("## Human review status", "");
  const reviewed = records.filter((r) => r.review);
  L.push(`${reviewed.length} of ${records.length} reviewed.`);
  for (const r of reviewed) {
    const v = r.review!;
    L.push(`- **${r.case.id}**: meaning ${v.meaningPreserved}, voice ${v.voicePreserved}, naturalness ${v.naturalness}, unnecessary rewrite ${v.unnecessaryRewrite}${v.notes ? ` — ${v.notes}` : ""}`);
  }
  L.push("");

  L.push("## Notable issues", "");
  const notes: string[] = [];
  for (const r of records) {
    for (const e of expectationFailures(r)) notes.push(`- ${r.case.id} stage ${e.stage}: expectation not met: ${e.description} (${e.detail || "missing"})`);
    for (const s of r.stages) if (introducedDet(s)) notes.push(`- ${r.case.id} stage ${s.index}: introduced deterministic pattern(s) ${s.rules.introducedDeterministic.join(", ")}`);
    const g = first(r).gold;
    if (g) notes.push(`- ${r.case.id}: reference rewrite (${g.author}) removed ${g.removedByGold.length} pattern(s), output removed ${g.removedByOutput.length}, both ${g.removedByBoth.length}; retention gold ${fmt(g.goldRetention.tokenRetention)} vs output ${fmt(first(r).retention.tokenRetention)}`);
  }
  L.push(notes.length ? notes.join("\n") : "None.", "");
  return L.join("\n");
}

// --------------------------------------------------------------- comparison

export interface Regression {
  scope: string;
  dimension: string;
  before: string;
  after: string;
}

const agg = (run: StoredRun) => {
  const recs = run.records;
  return {
    cases: recs.length,
    failures: run.failures.length,
    semanticFails: recs.filter((r) => r.stages.some((s) => s.semantic.verdict === "FAIL")).length,
    introduced: recs.reduce((a, r) => a + final(r).rules.introduced.length, 0),
    introducedDet: recs.reduce((a, r) => a + introducedDet(final(r)), 0),
    patternsAfter: recs.reduce((a, r) => a + final(r).rules.after.length, 0),
    retention: median(recs.map((r) => final(r).retention.tokenRetention)),
    editDistance: median(recs.flatMap((r) => (final(r).retention.wordEditDistance === null ? [] : [final(r).retention.wordEditDistance!]))),
    voiceOut: recs.reduce((a, r) => a + final(r).voice.movedOut.length, 0),
    retries: recs.reduce((a, r) => a + r.stages.reduce((b, s) => b + s.retries, 0), 0),
    latency: median(recs.map((r) => r.stages.reduce((b, s) => b + s.latencyMs, 0))),
    expectationFails: recs.reduce((a, r) => a + expectationFailures(r).length, 0),
    reviewed: recs.filter((r) => r.review).length,
  };
};

/** Changes that look like regressions from `base` to `run`. Flags, not verdicts. */
export function findRegressions(base: StoredRun, run: StoredRun): Regression[] {
  const a = agg(base);
  const b = agg(run);
  const out: Regression[] = [];
  const flag = (scope: string, dimension: string, before: unknown, after: unknown) => out.push({ scope, dimension, before: String(before), after: String(after) });
  if (b.semanticFails > a.semanticFails) flag("run", "cases with a semantic failure increased", a.semanticFails, b.semanticFails);
  if (b.failures > a.failures) flag("run", "provider/case failures increased", a.failures, b.failures);
  if (a.retention !== null && b.retention !== null && b.retention < a.retention - 0.05) flag("run", "median source-token retention dropped", fmt(a.retention), fmt(b.retention));
  if (b.introduced > a.introduced) flag("run", "introduced-rule count increased", a.introduced, b.introduced);
  if (b.voiceOut > a.voiceOut) flag("run", "voice dimensions moved out of range increased", a.voiceOut, b.voiceOut);
  const rate = (x: ReturnType<typeof agg>) => (x.cases ? x.retries / x.cases : 0);
  if (rate(b) > rate(a)) flag("run", "retries per case increased", fmt(rate(a)), fmt(rate(b)));
  if (a.latency && b.latency && b.latency > a.latency * 1.25 && b.latency - a.latency >= 500) flag("run", "median latency increased >25% (and ≥500 ms)", a.latency, b.latency);
  if (b.expectationFails > a.expectationFails) flag("run", "case expectations not met increased", a.expectationFails, b.expectationFails);

  const byId = new Map(base.records.map((r) => [r.case.id, r]));
  for (const r of run.records) {
    const p = byId.get(r.case.id);
    if (!p) continue;
    const [x, y] = [final(p), final(r)];
    if (x.semantic.verdict === "PASS" && y.semantic.verdict === "FAIL") flag(r.case.id, "semantic PASS → FAIL", "PASS", "FAIL");
    if (y.retention.tokenRetention < x.retention.tokenRetention - 0.1) flag(r.case.id, "token retention dropped >0.10", fmt(x.retention.tokenRetention), fmt(y.retention.tokenRetention));
    const newDet = y.rules.introducedDeterministic.filter((id) => !x.rules.introducedDeterministic.includes(id));
    if (newDet.length) flag(r.case.id, "new introduced deterministic patterns", x.rules.introducedDeterministic.join(", ") || "none", newDet.join(", "));
    if (y.voice.movedOut.length > x.voice.movedOut.length) flag(r.case.id, "voice dimensions moved out", x.voice.movedOut.join(", ") || "none", y.voice.movedOut.join(", "));
  }
  return out;
}

/** Things that differ between two runs' configurations or inputs; results on changed inputs are not like for like. */
export function comparabilityNotes(a: StoredRun, b: StoredRun): string[] {
  const notes: string[] = [];
  const [ca, cb] = [a.records[0]?.config, b.records[0]?.config];
  if (a.manifest.realModel !== b.manifest.realModel) notes.push(`One run used a real model and the other the demo engine (${a.manifest.mode} vs ${b.manifest.mode}).`);
  if (!a.manifest.realModel && !b.manifest.realModel)
    notes.push("Both runs used the demo engine, which applies deterministic rules and does not read the contract: strategy and prompt differences show up only with a real model.");
  if (a.manifest.corpusVersion !== b.manifest.corpusVersion) notes.push(`Corpus version differs (${a.manifest.corpusVersion} vs ${b.manifest.corpusVersion}).`);
  if (ca && cb) {
    if (ca.strategy.key !== cb.strategy.key) notes.push(`Strategy: ${ca.strategy.key} vs ${cb.strategy.key}.`);
    if (ca.model !== cb.model) notes.push(`Model: ${ca.model ?? "none"} vs ${cb.model ?? "none"}.`);
    if (ca.prompt.fingerprint !== cb.prompt.fingerprint) notes.push(`Prompt: ${ca.prompt.key}#${ca.prompt.fingerprint} vs ${cb.prompt.key}#${cb.prompt.fingerprint}.`);
    const packs = (c: typeof ca) => c.rulePacks.map((p) => `${p.id}@${p.version}`).join(",");
    if (packs(ca) !== packs(cb)) notes.push(`Rule packs differ: ${packs(ca)} vs ${packs(cb)}.`);
  }
  const hashes = new Map(a.records.map((r) => [r.case.id, r.case.textHash]));
  const changed = b.records.filter((r) => hashes.has(r.case.id) && hashes.get(r.case.id) !== r.case.textHash).map((r) => r.case.id);
  if (changed.length) notes.push(`Case text changed between runs: ${changed.join(", ")}.`);
  const missing = a.records.filter((r) => !b.records.some((x) => x.case.id === r.case.id)).map((r) => r.case.id);
  if (missing.length) notes.push(`Only in ${a.manifest.runId}: ${missing.join(", ")}.`);
  return notes;
}

export function renderComparison(a: StoredRun, b: StoredRun, options: { baseline?: boolean } = {}): string {
  const [x, y] = [agg(a), agg(b)];
  const L: string[] = [];
  const nameA = options.baseline ? `baseline ${a.manifest.runId}` : a.manifest.runId;
  L.push(`# Comparison: ${nameA} vs ${b.manifest.runId}`, "", "Dimensions side by side. No winner is computed: which differences matter depends on what the change was for.", "");
  const notes = comparabilityNotes(a, b);
  if (notes.length) L.push("## What differs", "", ...notes.map((n) => `- ${n}`), "");
  L.push("## Summary", "");
  L.push(
    table(
      ["dimension", "A", "B"],
      [
        ["mode", a.manifest.mode, b.manifest.mode],
        ["strategy", a.manifest.config.strategy, b.manifest.config.strategy],
        ["cases completed / failed", `${x.cases} / ${x.failures}`, `${y.cases} / ${y.failures}`],
        ["cases with a semantic failure", x.semanticFails, y.semanticFails],
        ["patterns remaining (sum)", x.patternsAfter, y.patternsAfter],
        ["introduced rules (of which deterministic)", `${x.introduced} (${x.introducedDet})`, `${y.introduced} (${y.introducedDet})`],
        ["median token retention", fmt(x.retention), fmt(y.retention)],
        ["median word edit distance", fmt(x.editDistance), fmt(y.editDistance)],
        ["voice dimensions moved out (sum)", x.voiceOut, y.voiceOut],
        ["retries (sum)", x.retries, y.retries],
        ["median latency ms", fmt(x.latency, 0), fmt(y.latency, 0)],
        ["case expectations not met", x.expectationFails, y.expectationFails],
        ["human-reviewed", x.reviewed, y.reviewed],
      ],
    ),
    "",
  );
  L.push("## Per case", "");
  const byId = new Map(b.records.map((r) => [r.case.id, r]));
  L.push(
    table(
      ["case", "semantic A/B", "anchors lost A/B", "patterns A/B", "resolved A/B", "introduced A/B", "retention A/B", "voice out A/B", "retries A/B", "latency A/B", "review A/B"],
      a.records.flatMap((r) => {
        const o = byId.get(r.case.id);
        if (!o) return [];
        const [p, q] = [final(r), final(o)];
        const anchorsLost = (s: StageRecord) => s.semantic.deterministic.failures.length + s.semantic.caseAnchorsLost.length;
        const lat = (e: EvaluationRecord) => e.stages.reduce((n, s) => n + s.latencyMs, 0);
        const ret = (e: EvaluationRecord) => e.stages.reduce((n, s) => n + s.retries, 0);
        return [
          [
            r.case.id,
            `${p.semantic.verdict}/${q.semantic.verdict}`,
            `${anchorsLost(p)}/${anchorsLost(q)}`,
            `${p.rules.after.length}/${q.rules.after.length}`,
            `${p.rules.resolved.length}/${q.rules.resolved.length}`,
            `${p.rules.introduced.length}/${q.rules.introduced.length}`,
            `${fmt(p.retention.tokenRetention)}/${fmt(q.retention.tokenRetention)}`,
            `${p.voice.movedOut.length}/${q.voice.movedOut.length}`,
            `${ret(r)}/${ret(o)}`,
            `${lat(r)}/${lat(o)}`,
            `${r.review ? "yes" : "–"}/${o.review ? "yes" : "–"}`,
          ],
        ];
      }),
    ),
    "",
  );
  const regs = findRegressions(a, b);
  L.push(options.baseline ? "## Regressions against the baseline" : "## Possible regressions (A → B)", "");
  L.push(regs.length ? table(["scope", "change", "A", "B"], regs.map((r) => [r.scope, r.dimension, r.before, r.after])) : "None flagged.", "");
  return L.join("\n");
}
