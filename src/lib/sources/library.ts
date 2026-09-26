import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  normalizedSourceSchema,
  ruleCandidateSchema,
  sourceDocumentSchema,
  type NormalizedSource,
  type RuleCandidate,
  type SourceDocument,
} from "@/domain/sources";

/**
 * File-backed source library for rule development. Deliberately simple:
 *
 *   data/sources/library.json          source metadata (committed)
 *   data/sources/normalized/<id>.json  extracted content (gitignored: may be copyrighted)
 *   data/sources/cache/                raw scrape cache (gitignored)
 *   data/rules/candidates/<id>.json    compiled candidates (gitignored until reviewed)
 *
 * Everything read back is validated; a corrupted file is an error, not a guess.
 */

export class SourceLibrary {
  constructor(readonly root: string) {}

  private path(...parts: string[]) {
    return join(this.root, ...parts);
  }

  private readJson<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
    if (!existsSync(file)) return fallback;
    return schema.parse(JSON.parse(readFileSync(file, "utf8")));
  }

  private writeJson(file: string, value: unknown) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  list(): SourceDocument[] {
    return this.readJson(this.path("data/sources/library.json"), z.array(sourceDocumentSchema), []);
  }

  get(id: string): SourceDocument | undefined {
    return this.list().find((d) => d.id === id);
  }

  /**
   * Insert or update a source. Returns whether its content changed since it was
   * last stored. On re-ingestion (`reingest`), unchanged content keeps its review
   * status; changed content goes back to "extracted" and must be re-reviewed.
   */
  upsert(doc: SourceDocument, options: { reingest?: boolean } = {}): { changed: boolean; previous?: SourceDocument } {
    const valid = sourceDocumentSchema.parse(doc);
    const docs = this.list();
    const i = docs.findIndex((d) => d.id === valid.id);
    const previous = i >= 0 ? docs[i] : undefined;
    const changed = !previous || previous.contentHash !== valid.contentHash;
    // Unchanged content keeps its review status; changed content must be recompiled and re-reviewed.
    const next = options.reingest && previous && !changed ? { ...valid, status: previous.status } : valid;
    if (i >= 0) docs[i] = next;
    else docs.push(next);
    docs.sort((a, b) => a.id.localeCompare(b.id));
    this.writeJson(this.path("data/sources/library.json"), docs);
    return { changed, previous };
  }

  setStatus(id: string, status: SourceDocument["status"]) {
    const doc = this.get(id);
    if (!doc) throw new Error(`Unknown source "${id}"`);
    this.upsert({ ...doc, status });
  }

  saveNormalized(source: NormalizedSource) {
    this.writeJson(this.path("data/sources/normalized", `${source.id}.json`), normalizedSourceSchema.parse(source));
  }

  loadNormalized(id: string): NormalizedSource {
    const file = this.path("data/sources/normalized", `${id}.json`);
    if (!existsSync(file)) throw new Error(`No normalized content for "${id}". Run source:scrape or source:add first.`);
    return normalizedSourceSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  }

  saveCandidates(sourceId: string, candidates: RuleCandidate[]) {
    this.writeJson(this.path("data/rules/candidates", `${sourceId}.json`), z.array(ruleCandidateSchema).parse(candidates));
  }

  loadCandidates(sourceId: string): RuleCandidate[] {
    return this.readJson(this.path("data/rules/candidates", `${sourceId}.json`), z.array(ruleCandidateSchema), []);
  }

  findCandidate(candidateId: string): { sourceId: string; candidate: RuleCandidate } | undefined {
    for (const doc of this.list()) {
      const c = this.loadCandidates(doc.id).find((x) => x.id === candidateId);
      if (c) return { sourceId: doc.id, candidate: c };
    }
    return undefined;
  }
}
