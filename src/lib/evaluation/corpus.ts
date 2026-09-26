import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  corpusManifestSchema,
  goldRewriteSchema,
  voiceprintFixtureSchema,
  type CorpusCase,
  type CorpusManifest,
  type GoldRewrite,
} from "@/domain/evaluation";
import type { Voiceprint, WritingSample } from "@/domain/voiceprint";
import { countWords } from "../analysis/tokenize";
import { rebuildVoiceprint } from "../voiceprints/aggregate";
import { sha256 } from "./measures";

/**
 * The evaluation corpus lives in data/evaluation and is version-controlled:
 * corpus.json (case definitions), cases/*.md (texts), gold.json (optional
 * reference rewrites) and voiceprints/*.json (sample sets measured into
 * Voiceprints at load time, exactly as the product measures them).
 */

export const EVAL_DATA_DIR = "data/evaluation";

export interface LoadedCase extends CorpusCase {
  text: string;
  textHash: string;
}

export interface Corpus {
  manifest: CorpusManifest;
  cases: LoadedCase[];
  gold: Map<string, GoldRewrite>;
  voiceprints: Map<string, Voiceprint>;
}

const FIXED_TIME = "2026-01-01T00:00:00.000Z";

export function loadVoiceprintFixture(root: string, id: string): Voiceprint {
  const fx = voiceprintFixtureSchema.parse(JSON.parse(readFileSync(join(root, EVAL_DATA_DIR, "voiceprints", `${id}.json`), "utf8")));
  const samples: WritingSample[] = fx.sampleFiles.map((f, i) => {
    const text = readFileSync(join(root, f), "utf8");
    return { id: `${fx.id}-${i + 1}`, voiceprintId: fx.id, title: f, text, wordCount: countWords(text), createdAt: FIXED_TIME };
  });
  const empty: Voiceprint = { id: fx.id, name: fx.name, description: fx.provenance.slice(0, 240), sampleCount: 0, totalWords: 0, stats: null, observations: [], confidence: 0, createdAt: FIXED_TIME, updatedAt: FIXED_TIME };
  return rebuildVoiceprint(empty, samples, FIXED_TIME);
}

export function loadCorpus(root: string): Corpus {
  const manifest = corpusManifestSchema.parse(JSON.parse(readFileSync(join(root, EVAL_DATA_DIR, "corpus.json"), "utf8")));
  const cases = manifest.cases.map((c) => {
    const text = readFileSync(join(root, c.textFile), "utf8").trim();
    return { ...c, text, textHash: sha256(text) };
  });
  const goldRaw = JSON.parse(readFileSync(join(root, EVAL_DATA_DIR, "gold.json"), "utf8")) as { golds: unknown[] };
  const gold = new Map<string, GoldRewrite>();
  for (const g of goldRaw.golds.map((x) => goldRewriteSchema.parse(x))) {
    if (!manifest.cases.some((c) => c.id === g.corpusCaseId)) throw new Error(`Gold rewrite for unknown case "${g.corpusCaseId}"`);
    gold.set(g.corpusCaseId, g);
  }
  const voiceprints = new Map<string, Voiceprint>();
  for (const id of new Set(cases.flatMap((c) => (c.voiceprint ? [c.voiceprint] : [])))) voiceprints.set(id, loadVoiceprintFixture(root, id));
  return { manifest, cases, gold, voiceprints };
}

export interface CaseSelection {
  ids?: string[];
  categories?: string[];
  smoke?: boolean;
  all?: boolean;
}

export function selectCases(corpus: Corpus, sel: CaseSelection): LoadedCase[] {
  if (sel.all) return corpus.cases;
  let out = corpus.cases;
  if (sel.ids?.length) {
    const unknown = sel.ids.filter((id) => !corpus.cases.some((c) => c.id === id));
    if (unknown.length) throw new Error(`Unknown case id: ${unknown.join(", ")}`);
    out = out.filter((c) => sel.ids!.includes(c.id));
  }
  if (sel.categories?.length) out = out.filter((c) => sel.categories!.includes(c.category));
  if (sel.smoke) out = out.filter((c) => c.smoke);
  if (!sel.ids?.length && !sel.categories?.length && !sel.smoke) return [];
  return out;
}
