/**
 * Whodunnit reconstruction evaluation CLI. Developer tooling only.
 * Run `pnpm eval:help` for the full guide.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORPUS_CATEGORIES, humanReviewSchema, type EvaluationRecord, type RunManifest } from "@/domain/evaluation";
import { strategyKey } from "@/domain/strategy";
import { renderContract } from "@/lib/prompts";
import { buildRewritePlan, planSize } from "@/lib/reconstruction/rewrite-plan";
import { STRATEGIES, getStrategy } from "@/lib/reconstruction/strategies";
import { runBatch } from "@/lib/evaluation/batch";
import { EvaluationConfigError, createEvaluationProvider, resolveConfig } from "@/lib/evaluation/config";
import { loadCorpus, selectCases } from "@/lib/evaluation/corpus";
import { renderComparison, renderRunReport } from "@/lib/evaluation/report";
import { baseProfile, evaluateCase } from "@/lib/evaluation/runner";
import { EvaluationStore } from "@/lib/evaluation/store";

const ROOT = resolve(process.cwd());
const [command = "help", ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const eq = rest.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : undefined;
}
const has = (name: string) => rest.includes(`--${name}`);
const BOOL = new Set(["--all", "--demo", "--dry-run", "--smoke", "--baseline-compare"]);
const positional = () => rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !rest[i - 1].includes("=") && !BOOL.has(rest[i - 1])));
const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const HELP = `Whodunnit evaluation: measure real reconstruction, compare strategies, catch regressions.

WHAT IT DOES
  Runs corpus cases (data/evaluation/corpus.json) through a rewrite strategy and a
  provider, then records meaning checks, rule changes, metric deltas, wording
  retention and Voiceprint behaviour per case. No composite score, no detectors.

RUN ONE CASE, A CATEGORY, THE SMOKE SET OR EVERYTHING
  pnpm eval:run --case anchors                  real model (needs ANTHROPIC_API_KEY)
  pnpm eval:run --case anchors,negations
  pnpm eval:run --category refinement-chain
  pnpm eval:run --smoke                         5 cases: formulaic, anchors, voiceprint, already-good, chain
  pnpm eval:run --all --concurrency 2           concurrency is capped at 2

CHOOSE WHAT IS TESTED
  --strategy reconstruction-v1 | reconstruction-v2   (default: production, ${strategyKey(STRATEGIES[0])})
  --provider anthropic --model claude-sonnet-5       (default provider anthropic; model from
                                                     --model, then WHODUNNIT_MODEL, then claude-sonnet-5)
  --demo                                             the deterministic demo engine, by request only.
                                                     Records say mode: demo, realModel: false.
  --label short-name                                 appended to the run id
  --dry-run                                          build plans and contracts only; no provider call,
                                                     nothing saved

  Without ANTHROPIC_API_KEY a real-model run stops with an error. It never falls
  back to the demo engine.

INSPECT
  pnpm eval:list                                cases, categories, gold references
  pnpm eval:contract <caseId> [--strategy s]    the exact contract the model would receive
  pnpm eval:runs                                runs, newest last, with baselines
  pnpm eval:show <run> [--case id]              a run's report, or one case's stages and outputs

COMPARE AND BASELINES
  pnpm eval:compare <runA> <runB>               dimensions side by side, possible regressions
  pnpm eval:baseline <run> [--name default]     mark a run as a baseline
  pnpm eval:compare --baseline default --run latest
  <run> is a run id, a unique prefix, "latest", or a baseline name.

HUMAN REVIEW (developer judgement, never a score)
  pnpm eval:review <run> <caseId> --meaning yes|no|uncertain --voice yes|no|uncertain \\
      --naturalness better|same|worse --unnecessary yes|no [--notes "..."] [--stage n] [--reviewer you]
  Or edit "review" in .evaluations/runs/<run>/records/<case>.json; it is validated on load.

WHERE RESULTS LIVE
  .evaluations/runs/<runId>/{run.json, records/*.json, failures.json, report.md}
  .evaluations/baselines.json, .evaluations/comparisons/*.md       (gitignored)
  Records contain fixture texts and outputs. Never point this tool at user documents.
`;

function gitInfo(): RunManifest["git"] {
  const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  const st = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  return { commit: rev.status === 0 ? rev.stdout.trim() : null, dirty: st.status === 0 ? st.stdout.trim().length > 0 : null };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

function oneLine(r: EvaluationRecord): string {
  const s = r.stages[r.stages.length - 1];
  const sem = r.stages.map((x) => x.semantic.verdict).join("→");
  const exp = r.stages.flatMap((x) => x.expectations).filter((e) => !e.passed).length;
  return `${sem.padEnd(9)} patterns ${r.stages[0].rules.before.length}→${s.rules.after.length}  introduced ${s.rules.introduced.length}  retention ${s.retention.tokenRetention}  voice-out ${s.voice.movedOut.length}  retries ${r.stages.reduce((a, x) => a + x.retries, 0)}${exp ? `  expectations missed ${exp}` : ""}`;
}

async function main() {
  const store = new EvaluationStore(ROOT);
  switch (command) {
    case "help":
      console.log(HELP);
      return;

    case "list": {
      const corpus = loadCorpus(ROOT);
      console.log(`Corpus v${corpus.manifest.version}: ${corpus.cases.length} cases\n`);
      for (const c of corpus.cases) {
        const extras = [c.smoke && "smoke", c.voiceprint && `voiceprint:${c.voiceprint}`, c.refinementChain && `chain×${c.refinementChain.length}`, corpus.gold.has(c.id) && "gold"].filter(Boolean).join(", ");
        console.log(`${c.id.padEnd(20)} ${CORPUS_CATEGORIES[c.category].padEnd(52)} ${c.style.padEnd(13)} ${extras}`);
      }
      for (const [id, vp] of corpus.voiceprints) console.log(`\nVoiceprint fixture ${id}: ${vp.totalWords} words in ${vp.sampleCount} samples, confidence ${vp.confidence}`);
      console.log(`\nStrategies: ${STRATEGIES.map((s) => `${strategyKey(s)} [${s.status}]`).join(", ")}`);
      return;
    }

    case "contract": {
      const id = positional()[0] ?? fail("Usage: eval:contract <caseId> [--strategy s]");
      const corpus = loadCorpus(ROOT);
      const c = corpus.cases.find((x) => x.id === id) ?? fail(`Unknown case "${id}"`);
      const strategy = getStrategy(flag("strategy") ?? strategyKey(STRATEGIES[0]));
      const vp = c.voiceprint ? corpus.voiceprints.get(c.voiceprint) : undefined;
      const plan = buildRewritePlan({ source: c.text, profile: baseProfile(c, vp), voiceprint: vp }, strategy);
      console.log(renderContract(plan, strategy.prompt));
      console.log(`\n--- ${strategyKey(strategy)}: intensity ${plan.intensity}; items ${JSON.stringify(planSize(plan))}`);
      for (const o of plan.budget.omitted) console.log(`  omitted ${o.section}: ${o.name} (${o.reason})`);
      return;
    }

    case "run": {
      const corpus = loadCorpus(ROOT);
      const cases = selectCases(corpus, { ids: list(flag("case")), categories: list(flag("category")), smoke: has("smoke"), all: has("all") });
      if (!cases.length) fail("Select cases with --case, --category, --smoke or --all. See pnpm eval:help.");
      let config;
      try {
        config = resolveConfig({ provider: flag("provider"), demo: has("demo"), model: flag("model"), strategy: flag("strategy") }, process.env);
      } catch (e) {
        return fail((e as Error).message);
      }
      const strategy = getStrategy(config.strategy);

      if (has("dry-run")) {
        console.log(`Dry run: ${cases.length} case(s), ${config.strategy}, ${config.provider}${config.model ? `/${config.model}` : ""}. No provider is called and nothing is saved.\n`);
        for (const c of cases) {
          const vp = c.voiceprint ? corpus.voiceprints.get(c.voiceprint) : undefined;
          const plan = buildRewritePlan({ source: c.text, profile: baseProfile(c, vp), voiceprint: vp }, strategy);
          const size = planSize(plan);
          console.log(`${c.id.padEnd(20)} intensity ${plan.intensity.padEnd(11)} contract ${String(size.total).padStart(3)} items, ${String(renderContract(plan, strategy.prompt).length).padStart(5)} chars, ${size.omitted} omitted${c.refinementChain ? `, then ${c.refinementChain.length} refinement stage(s)` : ""}`);
        }
        return;
      }

      let provider;
      try {
        provider = createEvaluationProvider(config, process.env);
      } catch (e) {
        return fail((e as Error).message);
      }
      const concurrency = Math.min(2, Math.max(1, Number(flag("concurrency") ?? 1) || 1));
      const label = flag("label")?.replace(/[^a-z0-9-]/gi, "").slice(0, 30);
      const runId = `${stamp()}-${config.strategy}-${config.provider}${label ? `-${label}` : ""}-${randomBytes(2).toString("hex")}`;
      const manifest: RunManifest = {
        schemaVersion: 1,
        runId,
        label: label ?? null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        config,
        mode: provider.info.mode,
        realModel: provider.info.mode === "live",
        corpusVersion: corpus.manifest.version,
        caseIds: cases.map((c) => c.id),
        completed: [],
        failed: [],
        concurrency,
        git: gitInfo(),
      };
      store.saveManifest(manifest);
      console.log(`Run ${runId}\n${manifest.realModel ? `REAL MODEL: ${config.provider}/${config.model}` : "DEMO ENGINE (not a model test)"} · ${config.strategy} · ${cases.length} case(s) · concurrency ${concurrency}\n`);

      const { records, failures } = await runBatch(cases, (c) => evaluateCase(c, { corpus, config, provider, runId }), {
        concurrency,
        onRecord: (r) => store.saveRecord(r),
        onProgress: (e) => {
          if (e.type === "done") console.log(`✓ ${e.caseId.padEnd(20)} ${oneLine(e.record)}`);
          if (e.type === "failed") console.log(`✗ ${e.caseId.padEnd(20)} ${e.failure.code}: ${e.failure.message}`);
        },
      });
      store.saveFailures(runId, failures);
      const done = { ...manifest, finishedAt: new Date().toISOString(), completed: records.map((r) => r.case.id), failed: failures.map((f) => f.caseId) };
      store.saveManifest(done);
      const reportPath = store.saveReport(runId, renderRunReport({ manifest: done, records, failures }));
      console.log(`\n${records.length} completed, ${failures.length} failed. Report: ${reportPath.replace(ROOT + "/", "")}`);
      if (failures.length && !records.length) process.exitCode = 1;
      return;
    }

    case "runs": {
      const baselines = store.baselines();
      const byRun = new Map(Object.entries(baselines).map(([n, id]) => [id, n]));
      const runs = store.listRuns();
      if (!runs.length) console.log("No runs yet. Start with pnpm eval:run --smoke --demo (or a real model).");
      for (const r of runs) console.log(`${r.runId.padEnd(56)} ${(r.realModel ? `live ${r.config.model}` : "demo").padEnd(24)} ${r.completed.length}/${r.caseIds.length} ok${r.failed.length ? `, ${r.failed.length} failed` : ""}${byRun.has(r.runId) ? `  [baseline: ${byRun.get(r.runId)}]` : ""}`);
      return;
    }

    case "show": {
      const ref = positional()[0] ?? "latest";
      const run = store.loadRun(ref);
      const caseId = flag("case");
      if (!caseId) {
        console.log(renderRunReport(run));
        return;
      }
      const r = run.records.find((x) => x.case.id === caseId) ?? fail(`No record for "${caseId}" in ${run.manifest.runId}`);
      console.log(`${r.case.id} · ${r.config.strategy.key} · ${r.config.mode}${r.config.model ? `/${r.config.model}` : ""}\n\nSOURCE\n${r.source.text}\n`);
      for (const s of r.stages) {
        console.log(`STAGE ${s.index}: ${s.label} · intensity ${s.plan.intensity} · semantic ${s.semantic.verdict} · retention ${s.retention.tokenRetention} · retries ${s.retries}`);
        for (const f of [...s.semantic.deterministic.failures, ...s.semantic.model.failures]) console.log(`  ! ${f.kind}: ${f.message}`);
        for (const a of s.semantic.caseAnchorsLost) console.log(`  ! anchor lost: ${a}`);
        for (const e of s.expectations.filter((x) => !x.passed)) console.log(`  ! expectation: ${e.description} ${e.detail}`);
        console.log(`  resolved: ${s.rules.resolved.join(", ") || "–"}\n  introduced: ${s.rules.introduced.join(", ") || "–"}\n  voice moved out: ${s.voice.movedOut.join(", ") || "–"}\n\n${s.output.text}\n`);
      }
      if (r.review) console.log(`REVIEW ${JSON.stringify(r.review)}`);
      return;
    }

    case "review": {
      const [ref, caseId] = positional();
      if (!ref || !caseId) fail("Usage: eval:review <run> <caseId> --meaning yes|no|uncertain --voice yes|no|uncertain --naturalness better|same|worse --unnecessary yes|no [--notes ...]");
      const parsed = humanReviewSchema.safeParse({
        reviewer: flag("reviewer"),
        reviewedAt: new Date().toISOString(),
        stage: flag("stage") !== undefined ? Number(flag("stage")) : undefined,
        meaningPreserved: flag("meaning"),
        voicePreserved: flag("voice"),
        naturalness: flag("naturalness"),
        unnecessaryRewrite: flag("unnecessary"),
        notes: flag("notes"),
      });
      if (!parsed.success) fail(`Invalid review: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      const rec = store.saveReview(ref, caseId, parsed.data!);
      console.log(`✓ review saved on ${rec.runId} / ${caseId}`);
      return;
    }

    case "baseline": {
      const ref = positional()[0] ?? fail("Usage: eval:baseline <run> [--name default]");
      const name = flag("name") ?? "default";
      const runId = store.setBaseline(name, ref);
      console.log(`✓ baseline "${name}" → ${runId}`);
      return;
    }

    case "compare": {
      const baseline = flag("baseline");
      const [x, y] = positional();
      const aRef = baseline ?? x;
      const bRef = baseline ? (flag("run") ?? x ?? "latest") : y;
      if (!aRef || !bRef) fail("Usage: eval:compare <runA> <runB>  or  eval:compare --baseline <name> --run <run>");
      const a = store.loadRun(aRef!);
      const b = store.loadRun(bRef!);
      const md = renderComparison(a, b, { baseline: Boolean(baseline) });
      const dir = join(store.dir, "comparisons");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${a.manifest.runId}__${b.manifest.runId}.md`);
      writeFileSync(path, md);
      console.log(md);
      console.log(`Saved: ${path.replace(ROOT + "/", "")}`);
      return;
    }

    default:
      console.log(HELP);
      fail(`Unknown command "${command}"`);
  }
}

main().catch((e) => {
  if (e instanceof EvaluationConfigError) fail(e.message);
  fail(e instanceof Error ? e.message : String(e));
});
