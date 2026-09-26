import { describe, expect, it } from "vitest";
import type { Revision, WhodunnitDocument } from "@/domain/document";
import type { Voiceprint, WritingSample } from "@/domain/voiceprint";
import { PRESETS } from "@/domain/style";
import { createKeyValueRepositories, MemoryStore } from "./kv";

const now = "2026-03-01T10:00:00.000Z";
const doc = (id: string, updatedAt = now): WhodunnitDocument => ({
  id,
  title: "Draft",
  source: "Some text.",
  target: { kind: "preset", presetId: "natural" },
  revisionIds: [],
  currentRevisionId: null,
  resultDraft: null,
  createdAt: now,
  updatedAt,
});
const revision = (id: string, documentId: string, createdAt: string): Revision => ({
  id,
  documentId,
  parentRevisionId: null,
  text: "Rewritten.",
  target: { kind: "preset", presetId: "natural" },
  profileLabel: "Natural",
  profile: PRESETS.natural,
  refinement: null,
  verification: { status: "preserved", findings: [], checks: ["protected_spans"] },
  engine: { mode: "demo", provider: "demo", model: null },
  promptVersion: "reconstruct.v1",
  editedByAuthor: false,
  createdAt,
});
const vp = (id: string): Voiceprint => ({
  id, name: "Me", description: "", sampleCount: 0, totalWords: 0, stats: null, observations: [], confidence: 0, createdAt: now, updatedAt: now,
});
const sample = (id: string, voiceprintId: string): WritingSample => ({ id, voiceprintId, title: "", text: "A sample.", wordCount: 2, createdAt: now });

describe("key/value repositories", () => {
  it("round-trips documents, newest first", async () => {
    const r = createKeyValueRepositories(new MemoryStore(), "memory");
    await r.documents.save(doc("a", "2026-03-01T10:00:00.000Z"));
    await r.documents.save(doc("b", "2026-03-02T10:00:00.000Z"));
    expect((await r.documents.list()).map((d) => d.id)).toEqual(["b", "a"]);
    await r.documents.save({ ...doc("a", "2026-03-03T10:00:00.000Z"), title: "Renamed" });
    expect((await r.documents.get("a"))?.title).toBe("Renamed");
    expect(await r.documents.list()).toHaveLength(2);
  });

  it("cascades deletes to revisions and samples", async () => {
    const r = createKeyValueRepositories(new MemoryStore(), "memory");
    await r.documents.save(doc("a"));
    await r.documents.saveRevision(revision("r2", "a", "2026-03-01T10:00:02.000Z"));
    await r.documents.saveRevision(revision("r1", "a", "2026-03-01T10:00:01.000Z"));
    expect((await r.documents.listRevisions("a")).map((x) => x.id)).toEqual(["r1", "r2"]);
    await r.documents.remove("a");
    expect(await r.documents.listRevisions("a")).toEqual([]);

    await r.voiceprints.save(vp("v"));
    await r.voiceprints.saveSample(sample("s1", "v"));
    await r.voiceprints.remove("v");
    expect(await r.voiceprints.listSamples("v")).toEqual([]);
  });

  it("refuses to write invalid records", async () => {
    const r = createKeyValueRepositories(new MemoryStore(), "memory");
    await expect(r.documents.save({ ...doc("a"), target: { kind: "preset" } } as unknown as WhodunnitDocument)).rejects.toThrow();
  });

  it("skips corrupted or outdated stored data instead of crashing", async () => {
    const store = new MemoryStore();
    store.setItem("whodunnit:v1:documents", JSON.stringify([doc("ok"), { id: "broken" }, 7]));
    store.setItem("whodunnit:v1:voiceprints", "{not json");
    const r = createKeyValueRepositories(store, "browser");
    expect((await r.documents.list()).map((d) => d.id)).toEqual(["ok"]);
    expect(await r.voiceprints.list()).toEqual([]);
  });
});
