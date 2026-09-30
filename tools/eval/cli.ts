/**
 * Whodunnit reconstruction evaluation CLI. Developer tooling only.
 * Run `pnpm eval:help` for the full guide.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { join, resolve } from "node:path";
import { CORPUS_CATEGORIES, humanReviewSchema, type EvaluationRecord, type RunManifest } from "@/domain/evaluation";
import { strategyKey } from "@/domain/strategy";
import { renderContract } from "@/lib/prompts";
import { buildRewritePlan, planSize } from "@/lib/reconstruction/rewrite-plan";
import { STRATEGIES, getStrategy } from "@/lib/reconstruction/strategies";
import { GEMINI_KEY_NAMES } from "@/lib/ai/select";
import { runBatch } from "@/lib/evaluation/batch";
import { EvaluationConfigError, createEvaluationOrchestration, createEvaluationProvider, createJudge, resolveConfig } from "@/lib/evaluation/config";
import { runSemanticFixtures } from "@/lib/evaluation/semantic-fixtures";
import { runVoiceFixtures } from "@/lib/evaluation/voice-fixtures";
import { loadCorpus, selectCases } from "@/lib/evaluation/corpus";
import { FileJudgeCache } from "@/lib/evaluation/judge-cache";
import { renderComparison, renderRunReport } from "@/lib/evaluation/report";
import { renderSeries } from "@/lib/evaluation/series";
import { baseProfile, evaluateCase } from "@/lib/evaluation/runner";
import { EvaluationStore } from "@/lib/evaluation/store";

const ROOT = resolve(process.cwd());

/**
 * Load the project's env files the way Next.js does for development
 * (.env.development.local, .env.local, .env.development, .env), without
 * overriding variables already set in the shell. Values are never printed.
 */
function loadProjectEnv(): string[] {
  const loaded: string[] = [];
  for (const name of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    const vars = parseEnv(readFileSync(path, "utf8"));
    for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined && v !== "") process.env[k] = v;
    loaded.push(name);
  }
  return loaded;
}
const envFiles = loadProjectEnv();
const [command = "help", ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const eq = rest.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : undefined;
}
const has = (name: string) => rest.includes(`--${name}`);
const BOOL = new Set(["--all", "--demo", "--dry-run", "--smoke", "--baseline-compare", "--force-model", "--no-judge-cache"]);
const positional = () => rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !rest[i - 1].includes("=") && !BOOL.has(rest[i - 1])));
const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
const num = (name: string) => {
  const v = flag(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`--${name} must be a number`);
  return n;
};
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
  pnpm eval:run --case anchors                  real model (needs a model API key)
  pnpm eval:run --case anchors,negations
  pnpm eval:run --category refinement-chain
  pnpm eval:run --smoke                         5 cases: formulaic, anchors, voiceprint, already-good, chain
  pnpm eval:run --all --concurrency 2           concurrency is capped at 2

CHOOSE WHAT IS TESTED
  --strategy reconstruction-v1 | reconstruction-v2 | reconstruction-v3 | reconstruction-v4 | reconstruction-v5
                                                     (default: production, ${strategyKey(STRATEGIES[0])})
  --worker-model <id> [--worker-provider anthropic|gemini|groq|local] [--worker-tier cheap|fast|strong]
                                                     v4 only; omitted = single frontier, supplied = bounded delegation
  --frontier-input-usd-per-mtok <n> --frontier-output-usd-per-mtok <n>
  --worker-input-usd-per-mtok <n> --worker-output-usd-per-mtok <n>
                                                     optional pricing for estimated run cost; both directions required
  --provider anthropic|gemini --model <id>           default provider: WHODUNNIT_AI_PROVIDER, else
                                                     whichever key is set (Anthropic first); model from
                                                     --model, then WHODUNNIT_MODEL, then claude-sonnet-5
                                                     or gemini-3.8-flash
  --provider local [--base-url http://127.0.0.1:8080/v1] --model bonsai-2-27b
                                                     any OpenAI-format server: a local llama.cpp/Bonsai
                                                     server, Ollama (:11434/v1), Groq... --model names it
                                                     in records. Local benchmarking is PAUSED UNTIL
                                                     64 GB M5 PRO ENVIRONMENT.
  --demo                                             the deterministic demo engine, by request only.
                                                     Records say mode: demo, realModel: false.
  --label short-name                                 appended to the run id
  --pace <seconds>                                   pause between cases (for provider rate limits)
  --dry-run                                          build plans and contracts only; no provider call,
                                                     nothing saved

  Keys come from the shell or the project's env files (.env.local etc., loaded
  like Next.js does; values are never printed): ANTHROPIC_API_KEY, GEMINI_API_KEY.
  Without the key a real-model run stops with an error. It never falls back to
  the demo engine.

GENERATION SETTINGS (recorded in every record; absent = provider/server default)
  --temperature n  --top-p n  --top-k n  --seed n  --max-tokens n
  --reasoning-budget n [--reasoning-control request|server-declared] [--reasoning-param thinking_budget_tokens]
                                                request (default): sent per request as the param (llama-server:
                                                thinking_budget_tokens, MLX server: thinking_budget).
                                                server-declared: you set it on the server; it is recorded, not sent.
                                                The budget is added to the run id; runs with different budgets
                                                are flagged as not comparable.
  --reasoning-effort low|medium|high            sent as reasoning_effort where supported
  Unsupported settings are listed in the record as unsupported, never silently dropped.

INDEPENDENT SEMANTIC JUDGE (evaluation only)
  --judge-provider anthropic|gemini|groq|local --judge-model <id> [--judge-base-url <url>]
      [--judge-reasoning-effort low|medium|high]   fixed for the whole run; recorded
  groq: GroqCloud (GROQ_API_KEY), an OpenAI-compatible hosted API, used only as a judge.
        --judge-model is required (the catalogue changes: GET https://api.groq.com/openai/v1/models).
  A different model checks meaning with the deterministic analysis in hand and must quote
  evidence. It supplements the deterministic checks; a deterministic FAIL always stands.
  Records say when the judge is the same model as the one under test (self-judged).
  --judge-prompt 1|2                            judge prompt version (default 2: shows the engine's intended
                                                removals as candidates, not guaranteed-safe deletions)
  Judge results are cached in .evaluations/judge-cache by the EXACT judge input (provider, model,
  settings, prompt version, full messages). Reuse is recorded per stage (provenance: cached, with
  the original run id). --no-judge-cache always calls the judge live.

FORCED-MODEL DIAGNOSTIC (evaluation only; never the product's behaviour)
  --force-model                                 call the model even where the strategy's planner would
                                                return the text unchanged. Records say forcedModel: true,
                                                the run id ends in -forced, and comparisons flag forced
                                                vs normal runs as not equivalent.

SERIES (the same configuration over several seeds)
  pnpm eval:series <run> <run> [<run>…]         per-case variability across runs of ONE configuration:
                                                failures on every seed vs intermittent, retention and
                                                latency median/range, refinement effect, voice damage

SEMANTIC REGRESSION FIXTURES
  pnpm eval:semantic                            run data/evaluation/semantic-fixtures.json against the
                                                deterministic meaning checks, and voice-fixtures.json
                                                against the voice-device checks (no model)

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
        const control = flag("reasoning-control");
        if (control && control !== "request" && control !== "server-declared") fail("--reasoning-control is request or server-declared");
        config = resolveConfig(
          {
            provider: flag("provider"),
            demo: has("demo"),
            model: flag("model"),
            strategy: flag("strategy"),
            baseUrl: flag("base-url"),
            generation: {
              temperature: num("temperature"),
              topP: num("top-p"),
              topK: num("top-k"),
              seed: num("seed"),
              maxTokens: num("max-tokens"),
              reasoningBudget: num("reasoning-budget"),
              reasoningControl: control as "request" | "server-declared" | undefined,
              reasoningParam: flag("reasoning-param"),
              reasoningEffort: flag("reasoning-effort"),
            },
            judge: { provider: flag("judge-provider"), model: flag("judge-model"), baseUrl: flag("judge-base-url"), reasoningEffort: flag("judge-reasoning-effort"), promptVersion: flag("judge-prompt") },
            forceModel: has("force-model"),
            worker: { provider: flag("worker-provider"), model: flag("worker-model"), tier: flag("worker-tier"), baseUrl: flag("worker-base-url") },
            pricing: { frontierInput: num("frontier-input-usd-per-mtok"), frontierOutput: num("frontier-output-usd-per-mtok"), workerInput: num("worker-input-usd-per-mtok"), workerOutput: num("worker-output-usd-per-mtok") },
          },
          process.env,
        );
      } catch (e) {
        return fail((e as Error).message);
      }
      const strategy = getStrategy(config.strategy);

      if (has("dry-run")) {
        console.log(envFiles.length ? `Environment from ${envFiles.join(", ")} (values not shown)` : "No project env files found; using the shell environment only.");
        const keys = ["ANTHROPIC_API_KEY", ...GEMINI_KEY_NAMES, "GROQ_API_KEY"].filter((k) => process.env[k]?.trim());
        console.log(`Model keys set: ${keys.length ? keys.join(", ") : "none (expected ANTHROPIC_API_KEY or GEMINI_API_KEY)"}`);
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
      let judge;
      let orchestration;
      let judgeCache: FileJudgeCache | null = null;
      try {
        provider = createEvaluationProvider(config, process.env);
        orchestration = config.strategy === "reconstruction-v4" ? createEvaluationOrchestration(config, provider, process.env) : undefined;
        judgeCache = config.judge && !has("no-judge-cache") ? new FileJudgeCache(ROOT) : null;
        judge = createJudge(config, process.env, { cache: judgeCache });
      } catch (e) {
        return fail((e as Error).message);
      }
      const generation = provider.generationReport?.();
      const concurrency = Math.min(2, Math.max(1, Number(flag("concurrency") ?? 1) || 1));
      const label = flag("label")?.replace(/[^a-z0-9-]/gi, "").slice(0, 30);
      const rb = config.generation?.reasoningBudget !== undefined ? `-rb${config.generation.reasoningBudget}` : "";
      const seed = config.generation?.seed !== undefined ? `-s${config.generation.seed}` : "";
      // Forced runs are marked in the id as well as in every record, so they cannot pass for normal runs.
      const forced = config.forceModel ? "-forced" : "";
      const runId = `${stamp()}-${config.strategy}-${config.provider}${rb}${seed}${forced}${label ? `-${label}` : ""}-${randomBytes(2).toString("hex")}`;
      const manifest: RunManifest = {
        schemaVersion: 2,
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
      if (envFiles.length) console.log(`Environment from ${envFiles.join(", ")} (values not shown)`);
      if (generation && (generation.applied.length || generation.unsupported.length || generation.declared.length))
        console.log(`Generation: sent ${generation.applied.join(", ") || "nothing"}${generation.declared.length ? `; declared ${generation.declared.join(", ")}` : ""}${generation.unsupported.length ? `; UNSUPPORTED (not sent) ${generation.unsupported.join(", ")}` : ""}`);
      if (judge) console.log(`Judge: ${judge.info.provider}/${judge.info.model} ${judge.prompt ?? ""}${judge.settings?.applied.length ? ` (${judge.settings.applied.join(", ")})` : ""}${judgeCache ? " · cache on" : " · cache off"}`);
      if (config.forceModel) console.log("FORCED-MODEL DIAGNOSTIC: the planner's minimal-change bypass is disabled. This measures the model, not the product.");
      console.log(`Run ${runId}\n${manifest.realModel ? `REAL MODEL: ${config.provider}/${config.model}` : "DEMO ENGINE (not a model test)"} · ${config.strategy} · ${cases.length} case(s) · concurrency ${concurrency}\n`);

      const { records, failures } = await runBatch(cases, (c) => evaluateCase(c, { corpus, config, provider, runId, judge, generation, orchestration }), {
        concurrency,
        paceMs: Math.max(0, Number(flag("pace") ?? 0) || 0) * 1000,
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
      if (judgeCache) console.log(`Judge cache: ${judgeCache.hits} reused (exact same input), ${judgeCache.misses} live.`);
      if (failures.length && !records.length) process.exitCode = 1;
      return;
    }

    case "series": {
      const refs = positional();
      if (refs.length < 2) fail("Usage: eval:series <run> <run> [<run>…] (runs of one configuration, e.g. three seeds)");
      const runs = refs.map((r) => store.loadRun(r));
      let md;
      try {
        md = renderSeries(runs);
      } catch (e) {
        return fail((e as Error).message);
      }
      const dir = join(store.dir, "series");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${runs.map((r) => r.manifest.runId.slice(-4)).join("_")}.md`);
      writeFileSync(path, md);
      console.log(md);
      console.log(`Saved: ${path.replace(ROOT + "/", "")}`);
      return;
    }

    case "semantic": {
      const res = runSemanticFixtures(ROOT);
      for (const r of res.results) console.log(`${r.passed ? "✓" : "✗"} ${r.id.padEnd(34)} ${r.class.padEnd(26)} expected ${r.expected.padEnd(28)} got ${r.got}`);
      console.log(`\n${res.passed}/${res.results.length} meaning fixtures behave as specified.\n`);
      const voice = runVoiceFixtures(ROOT);
      for (const r of voice.results) console.log(`${r.passed ? "✓" : "✗"} ${r.id.padEnd(34)} ${r.class.padEnd(40)} expected ${r.expected.padEnd(34)} got ${r.got}`);
      console.log(`\n${voice.passed}/${voice.results.length} voice fixtures behave as specified.`);
      if (res.passed !== res.results.length || voice.passed !== voice.results.length) process.exitCode = 1;
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
