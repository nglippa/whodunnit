/**
 * Whodunnit rule & source developer CLI.
 *
 *   pnpm source:scrape <url> [--id x] [--license MIT] [--usage adapt-with-attribution|reference-only|derived-rules-only] [--author name] [--refresh]
 *   pnpm source:add <file.md|txt|html> --title "..." [--id x] [--url u] [--license l] [--usage u]
 *   pnpm source:list
 *   pnpm source:show <id>
 *   pnpm source:compile <id> [--model] [--max-sections n]
 *   pnpm rules:review <sourceId>
 *   pnpm rules:activate <candidateId> [--name "..."] [--description "..."] [--guidance "..."] [--severity suggestion]
 *   pnpm rules:reject <candidateId>
 *   pnpm rules:list [--pack id] [--category c] [--determinism d]
 *   pnpm rules:validate
 *   pnpm rules:analyze <file | -> [--style natural]
 *
 * Developer tooling only. Scraped text is data; nothing here executes it, and
 * no command activates a rule without being asked to by name.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { PRESETS, isPresetId } from "@/domain/style";
import type { SourceDocument } from "@/domain/sources";
import { analyzeWriting } from "@/lib/rules/engine";
import { RULE_FAMILIES } from "@/lib/rules/families";
import { BUILTIN_PACKS, createRegistry, rulesForProfile } from "@/lib/rules/packs";
import { activateCandidate, rejectCandidate } from "@/lib/sources/activate";
import { compileHeuristic } from "@/lib/sources/compile";
import { SourceLibrary } from "@/lib/sources/library";
import { compileWithModel } from "@/lib/sources/model-compile";
import { normalizeMarkdown, normalizeScrape, normalizeText, slugify, type ScrapeRecord } from "@/lib/sources/normalize";
import { loadCleanCorpus, validateCandidate, validateRule } from "@/lib/sources/validate";
import { writingRuleSchema } from "@/domain/writing-rules";

const ROOT = resolve(process.cwd());
const lib = new SourceLibrary(ROOT);
const [command, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : undefined;
}
const has = (name: string) => rest.includes(`--${name}`);
const positional = () => rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !["--refresh", "--model"].includes(rest[i - 1])));
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const usage = (v: string | undefined): SourceDocument["usage"] =>
  v === "reference-only" || v === "derived-rules-only" || v === "adapt-with-attribution" ? v : "derived-rules-only";

function register(doc: Omit<SourceDocument, "status">, contentChanged?: boolean) {
  const { changed } = lib.upsert({ ...doc, status: "extracted" }, { reingest: true });
  console.log(`${changed ? "✓ stored" : "= unchanged (content hash identical; review status kept)"}: ${doc.id}  ${doc.contentHash.slice(0, 12)}`);
  if (contentChanged === false) console.log("  (scrape reported the same content as the cached copy)");
}

function printSections(id: string) {
  const s = lib.loadNormalized(id);
  console.log(`${s.title}\n${s.url ?? "(local)"}\n${s.sections.length} sections:`);
  for (const x of s.sections) console.log(`  ${"  ".repeat(Math.max(0, x.level - 1))}${x.anchor}  (${x.text.length} chars)${x.heading ? `  ${x.heading}` : ""}`);
}

async function main() {
  switch (command) {
    case "source:scrape": {
      const url = positional()[0] ?? fail("Usage: source:scrape <url>");
      const args = ["run", "--project", "tools/source-ingestion", "python", "tools/source-ingestion/scrape.py", url, "--cache-dir", "data/sources/cache"];
      if (has("refresh")) args.push("--refresh");
      const r = spawnSync("uv", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (r.error) fail(`Could not run uv (${r.error.message}). Install uv: https://docs.astral.sh/uv/`);
      const rec = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}") as ScrapeRecord & { error?: string };
      if (rec.error) fail(rec.error);
      const id = flag("id") ?? slugify(`${new URL(url).hostname.replace(/^www\./, "")}-${rec.title}`, 70);
      const normalized = normalizeScrape(id, rec);
      lib.saveNormalized(normalized);
      register(
        { id, type: "webpage", title: normalized.title, url, author: flag("author"), license: flag("license"), usage: usage(flag("usage")), retrievedAt: rec.retrievedAt, contentHash: normalized.contentHash },
        rec.cache === "unchanged" ? false : undefined,
      );
      console.log(`  cache: ${rec.cache}; ${rec.robots}`);
      printSections(id);
      return;
    }
    case "source:add": {
      const file = positional()[0] ?? fail("Usage: source:add <file> --title <title>");
      if (!existsSync(file)) fail(`No such file: ${file}`);
      const title = flag("title") ?? basename(file);
      const id = flag("id") ?? slugify(title, 70);
      const ext = extname(file).toLowerCase();
      let normalized;
      if (ext === ".html" || ext === ".htm") {
        const r = spawnSync("uv", ["run", "--project", "tools/source-ingestion", "python", "tools/source-ingestion/scrape.py", `https://local.invalid/${basename(file)}`, "--file", file, "--cache-dir", "data/sources/cache"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        const rec = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}") as ScrapeRecord & { error?: string };
        if (rec.error) fail(rec.error);
        normalized = normalizeMarkdown({ id, type: "html", title, markdown: rec.markdown, url: flag("url") });
      } else if (ext === ".md" || ext === ".markdown") {
        normalized = normalizeMarkdown({ id, type: "markdown", title, url: flag("url"), markdown: readFileSync(file, "utf8") });
      } else {
        normalized = normalizeText({ id, title, url: flag("url"), text: readFileSync(file, "utf8") });
      }
      lib.saveNormalized(normalized);
      register({ id, type: normalized.type, title, url: flag("url"), author: flag("author"), license: flag("license"), usage: usage(flag("usage")), retrievedAt: normalized.retrievedAt, contentHash: normalized.contentHash });
      printSections(id);
      return;
    }
    case "source:list": {
      const docs = lib.list();
      if (!docs.length) return console.log("No sources yet. Try: pnpm source:scrape <url>");
      for (const d of docs) console.log(`${d.status.padEnd(9)} ${d.id.padEnd(48)} ${d.type.padEnd(21)} ${d.license ?? "license?"}  (${d.usage})`);
      return;
    }
    case "source:show": {
      const id = positional()[0] ?? fail("Usage: source:show <id>");
      printSections(id);
      return;
    }
    case "source:compile": {
      const id = positional()[0] ?? fail("Usage: source:compile <id> [--model]");
      const doc = lib.get(id) ?? fail(`Unknown source "${id}"`);
      if (doc.usage === "reference-only") fail(`Source "${id}" is reference-only: its text may not be compiled into rules.`);
      const source = lib.loadNormalized(id);
      const registry = createRegistry();
      let candidates = compileHeuristic(source, doc, { registry });
      if (has("model")) {
        const key = process.env.ANTHROPIC_API_KEY?.trim() ?? fail("--model needs ANTHROPIC_API_KEY in the environment.");
        const { AnthropicCandidateExtractor } = await import("@/lib/sources/anthropic-extractor");
        const extractor = new AnthropicCandidateExtractor(key, process.env.WHODUNNIT_MODEL?.trim() || "claude-sonnet-5");
        const report = await compileWithModel(source, doc, extractor, { maxSections: Number(flag("max-sections") ?? 12) });
        for (const d of report.discarded) console.log(`  discarded (${d.section}): ${d.reason}`);
        candidates = [...candidates, ...report.candidates];
      }
      // Review decisions survive recompilation: same candidate id keeps its approved/rejected status.
      const previous = new Map(lib.loadCandidates(id).map((c) => [c.id, c.status]));
      candidates = candidates.map((c) => {
        const status = previous.get(c.id);
        return status && status !== "candidate" ? { ...c, status, proposedRule: { ...c.proposedRule, enabled: status === "approved" } } : c;
      });
      lib.saveCandidates(id, candidates);
      lib.setStatus(id, "compiled");
      console.log(`✓ ${candidates.length} candidates for ${id} (all disabled). Review with: pnpm rules:review ${id}`);
      return;
    }
    case "rules:review": {
      const id = positional()[0] ?? fail("Usage: rules:review <sourceId>");
      const corpus = loadCleanCorpus(ROOT);
      const registry = createRegistry();
      const candidates = lib.loadCandidates(id);
      if (!candidates.length) fail(`No candidates for "${id}". Run source:compile first.`);
      for (const c of candidates) {
        const v = validateCandidate(c, corpus, registry);
        const r = c.proposedRule;
        const d = r.detection;
        const detail = d.kind === "phrase" ? `phrases: ${d.phrases.slice(0, 8).join(", ")}${d.phrases.length > 8 ? ", …" : ""}` : d.kind === "density" ? `density: ${d.lexicon.slice(0, 8).join(", ")}…` : d.kind === "regex" ? `regex: ${d.pattern}` : "no detector";
        console.log(`\n[${c.status}] ${c.id}\n  ${r.name}  ·  ${c.determinism}  ·  confidence ${c.confidence}  ·  ${c.origin}`);
        console.log(`  ${detail}`);
        console.log(`  anchor (${c.anchor.sectionAnchor}): “${c.anchor.excerpt.slice(0, 140)}${c.anchor.excerpt.length > 140 ? "…" : ""}”`);
        if (v.falsePositivesPer1000 !== null) console.log(`  clean-prose matches: ${v.falsePositivesPer1000} per 1,000 words`);
        for (const e of v.errors) console.log(`  ✗ ${e}`);
        for (const w of v.warnings) console.log(`  ! ${w}`);
      }
      console.log(`\nActivate one with: pnpm rules:activate <candidateId> [--name ... --description ... --guidance ...]`);
      return;
    }
    case "rules:activate": {
      const id = positional()[0] ?? fail("Usage: rules:activate <candidateId>");
      const severity = flag("severity");
      const res = activateCandidate(lib, id, {
        name: flag("name"),
        description: flag("description"),
        guidance: flag("guidance"),
        severity: severity === "info" || severity === "suggestion" || severity === "warning" ? severity : undefined,
      });
      console.log(`✓ activated ${res.ruleId} in data/rules/packs/imported.json`);
      for (const w of res.warnings) console.log(`  ! ${w}`);
      return;
    }
    case "rules:reject": {
      const id = positional()[0] ?? fail("Usage: rules:reject <candidateId>");
      rejectCandidate(lib, id);
      console.log(`✓ rejected ${id}`);
      return;
    }
    case "rules:list": {
      const registry = createRegistry();
      const rules = registry.query({
        packIds: flag("pack") ? [flag("pack")!] : undefined,
        category: flag("category") as never,
        determinism: flag("determinism") as never,
      });
      for (const r of rules) console.log(`${r.enabled ? " " : "×"} ${r.packId.padEnd(18)} ${r.id.padEnd(34)} ${r.determinism.padEnd(14)} ${r.severity.padEnd(10)} ${r.name}`);
      const by = (k: "determinism" | "packId") => Object.entries(rules.reduce<Record<string, number>>((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {})).map(([x, n]) => `${x} ${n}`).join(", ");
      console.log(`\n${rules.length} rules  ·  ${by("determinism")}\n${by("packId")}`);
      return;
    }
    case "rules:validate": {
      let failed = false;
      let registry;
      try {
        registry = createRegistry();
      } catch (e) {
        fail(`Registry failed to load: ${e instanceof Error ? e.message : e}`);
      }
      const corpus = loadCleanCorpus(ROOT);
      console.log(`Clean corpus: ${corpus.map((c) => c.name).join(", ")}`);
      let n = 0;
      for (const pack of BUILTIN_PACKS) {
        for (const input of pack.rules) {
          const parsedRule = writingRuleSchema.parse(input);
          const rule = { ...parsedRule, layer: parsedRule.layer ?? pack.layer };
          const v = validateRule(rule, corpus, { registry, allowExisting: true });
          n++;
          for (const e of v.errors) {
            failed = true;
            console.log(`✗ ${rule.id}: ${e}`);
          }
          for (const w of v.warnings) console.log(`! ${rule.id}: ${w}`);
        }
      }
      for (const fam of RULE_FAMILIES)
        for (const m of fam.members)
          if (!registry!.get(m)) {
            failed = true;
            console.log(`✗ family ${fam.id}: member ${m} is not a registered rule`);
          }
      console.log(`Rule families: ${RULE_FAMILIES.length} (${RULE_FAMILIES.filter((f) => f.removable).map((f) => f.id).join(", ")} removable)`);
      const formulaic = existsSync(resolve(ROOT, "data/fixtures/prose/a-formulaic.md")) ? readFileSync(resolve(ROOT, "data/fixtures/prose/a-formulaic.md"), "utf8") : "";
      if (formulaic) {
        const a = analyzeWriting(formulaic, rulesForProfile(PRESETS.natural, registry));
        console.log(`Formulaic fixture: ${a.summary.patternCount} patterns detected (sanity check).`);
      }
      console.log(failed ? `\n✗ validation failed (${n} rules checked)` : `\n✓ ${n} rules valid; registry loads; no clean-prose false positives above the error threshold`);
      process.exit(failed ? 1 : 0);
    }
    case "rules:analyze": {
      const file = positional()[0] ?? fail("Usage: rules:analyze <file | ->");
      const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
      const styleId = flag("style") ?? "natural";
      if (!isPresetId(styleId)) fail(`Unknown style "${styleId}"`);
      const a = analyzeWriting(text, rulesForProfile(PRESETS[styleId as keyof typeof PRESETS]));
      const m = a.metrics;
      console.log(`${m.words} words · ${m.sentences} sentences · ${m.paragraphs} paragraphs`);
      console.log(`sentence length mean ${m.sentenceLength.mean}, median ${m.sentenceLength.median}, sd ${m.sentenceLength.stdDev}, CV ${m.sentenceLength.cv}; paragraph CV ${m.paragraphLength.cv}`);
      console.log(`per 100 words: contractions ${m.per100.contractions}, first person ${m.per100.firstPerson}, hedges ${m.per100.hedges}, intensifiers ${m.per100.intensifiers}, dashes ${m.per100.dashes}, semicolons ${m.per100.semicolons}`);
      console.log(`shares: questions ${m.shares.questions}, fragments ${m.shares.fragments}, stock openers ${m.shares.transitionOpeners}, likely passive ${m.shares.likelyPassive}`);
      if (m.repeatedOpeners.length) console.log(`repeated openers: ${m.repeatedOpeners.map((o) => `${o.word}×${o.count}`).join(", ")}`);
      console.log(`\n${a.summary.patternCount} patterns (${a.summary.matchCount} matches):`);
      for (const f of a.findings) {
        console.log(`  ${f.rule.severity.padEnd(10)} ${f.rule.name} ×${f.matches.length}  [${f.rule.determinism}; ${f.rule.id}]`);
        for (const x of f.matches.slice(0, 2)) console.log(`      “${x.excerpt.slice(0, 90)}”  (${x.evidence})`);
      }
      return;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*?/, "").replace(/^ \* ?/gm, ""));
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
