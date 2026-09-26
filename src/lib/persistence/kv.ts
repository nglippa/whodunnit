import type { z } from "zod";
import { documentSchema, revisionSchema } from "@/domain/document";
import { voiceprintSchema, writingSampleSchema } from "@/domain/voiceprint";
import type { Revision, WhodunnitDocument } from "@/domain/document";
import type { Voiceprint, WritingSample } from "@/domain/voiceprint";
import type { DocumentRepository, Repositories, VoiceprintRepository } from "./repositories";

/**
 * Repositories over a minimal key/value store. The browser uses localStorage;
 * tests and the server use an in-memory map. Records are validated on read, so
 * corrupted or outdated local data is skipped instead of crashing the app.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const PREFIX = "whodunnit:v1:";

class Collection<T extends { id: string }> {
  constructor(
    private readonly store: KeyValueStore,
    private readonly name: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  private key() {
    return `${PREFIX}${this.name}`;
  }

  all(): T[] {
    const raw = this.store.getItem(this.key());
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const r = this.schema.safeParse(item);
      return r.success ? [r.data] : [];
    });
  }

  write(items: T[]) {
    this.store.setItem(this.key(), JSON.stringify(items));
  }

  upsert(item: T) {
    const valid = this.schema.parse(item);
    const items = this.all();
    const i = items.findIndex((x) => x.id === valid.id);
    if (i >= 0) items[i] = valid;
    else items.push(valid);
    this.write(items);
  }

  removeWhere(pred: (item: T) => boolean) {
    this.write(this.all().filter((x) => !pred(x)));
  }
}

const byUpdatedDesc = <T extends { updatedAt: string }>(a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);

export function createKeyValueRepositories(store: KeyValueStore, location: Repositories["location"]): Repositories {
  const docs = new Collection<WhodunnitDocument>(store, "documents", documentSchema);
  const revisions = new Collection<Revision>(store, "revisions", revisionSchema);
  const voiceprints = new Collection<Voiceprint>(store, "voiceprints", voiceprintSchema);
  const samples = new Collection<WritingSample>(store, "samples", writingSampleSchema);

  const documents: DocumentRepository = {
    async list() {
      return docs.all().sort(byUpdatedDesc);
    },
    async get(id) {
      return docs.all().find((d) => d.id === id) ?? null;
    },
    async save(doc) {
      docs.upsert(doc);
    },
    async remove(id) {
      docs.removeWhere((d) => d.id === id);
      revisions.removeWhere((r) => r.documentId === id);
    },
    async listRevisions(documentId) {
      return revisions
        .all()
        .filter((r) => r.documentId === documentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async saveRevision(revision) {
      revisions.upsert(revision);
    },
  };

  const vps: VoiceprintRepository = {
    async list() {
      return voiceprints.all().sort(byUpdatedDesc);
    },
    async get(id) {
      return voiceprints.all().find((v) => v.id === id) ?? null;
    },
    async save(vp) {
      voiceprints.upsert(vp);
    },
    async remove(id) {
      voiceprints.removeWhere((v) => v.id === id);
      samples.removeWhere((s) => s.voiceprintId === id);
    },
    async listSamples(voiceprintId) {
      return samples
        .all()
        .filter((s) => s.voiceprintId === voiceprintId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async saveSample(sample) {
      samples.upsert(sample);
    },
    async removeSample(sampleId) {
      samples.removeWhere((s) => s.id === sampleId);
    },
  };

  return { documents, voiceprints: vps, location };
}

export function createMemoryRepositories(): Repositories {
  return createKeyValueRepositories(new MemoryStore(), "memory");
}
