import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { documentSchema, revisionSchema } from "@/domain/document";
import { voiceprintSchema, writingSampleSchema } from "@/domain/voiceprint";
import type { DocumentRepository, Repositories, VoiceprintRepository } from "./repositories";

/**
 * Supabase-backed repositories (see supabase/migrations). Requires an
 * authenticated client: row-level security scopes every query to the user.
 * Payloads are validated on the way out exactly like the browser store.
 */

function parseRows<T>(schema: z.ZodType<T>, rows: { payload: unknown }[] | null): T[] {
  return (rows ?? []).flatMap((r) => {
    const parsed = schema.safeParse(r.payload);
    return parsed.success ? [parsed.data] : [];
  });
}

function check(error: { message: string } | null) {
  if (error) throw new Error(`Storage error: ${error.message}`);
}

export function createSupabaseRepositories(client: SupabaseClient): Repositories {
  const documents: DocumentRepository = {
    async list() {
      const { data, error } = await client.from("documents").select("payload").order("updated_at", { ascending: false });
      check(error);
      return parseRows(documentSchema, data);
    },
    async get(id) {
      const { data, error } = await client.from("documents").select("payload").eq("id", id).maybeSingle();
      check(error);
      return data ? (parseRows(documentSchema, [data])[0] ?? null) : null;
    },
    async save(doc) {
      const payload = documentSchema.parse(doc);
      const { error } = await client.from("documents").upsert({ id: payload.id, payload, updated_at: payload.updatedAt });
      check(error);
    },
    async remove(id) {
      const { error } = await client.from("documents").delete().eq("id", id);
      check(error);
    },
    async listRevisions(documentId) {
      const { data, error } = await client.from("revisions").select("payload").eq("document_id", documentId).order("created_at");
      check(error);
      return parseRows(revisionSchema, data);
    },
    async saveRevision(revision) {
      const payload = revisionSchema.parse(revision);
      const { error } = await client
        .from("revisions")
        .upsert({ id: payload.id, document_id: payload.documentId, payload, created_at: payload.createdAt });
      check(error);
    },
  };

  const voiceprints: VoiceprintRepository = {
    async list() {
      const { data, error } = await client.from("voiceprints").select("payload").order("updated_at", { ascending: false });
      check(error);
      return parseRows(voiceprintSchema, data);
    },
    async get(id) {
      const { data, error } = await client.from("voiceprints").select("payload").eq("id", id).maybeSingle();
      check(error);
      return data ? (parseRows(voiceprintSchema, [data])[0] ?? null) : null;
    },
    async save(vp) {
      const payload = voiceprintSchema.parse(vp);
      const { error } = await client.from("voiceprints").upsert({ id: payload.id, payload, updated_at: payload.updatedAt });
      check(error);
    },
    async remove(id) {
      const { error } = await client.from("voiceprints").delete().eq("id", id);
      check(error);
    },
    async listSamples(voiceprintId) {
      const { data, error } = await client.from("writing_samples").select("payload").eq("voiceprint_id", voiceprintId).order("created_at");
      check(error);
      return parseRows(writingSampleSchema, data);
    },
    async saveSample(sample) {
      const payload = writingSampleSchema.parse(sample);
      const { error } = await client
        .from("writing_samples")
        .upsert({ id: payload.id, voiceprint_id: payload.voiceprintId, payload, created_at: payload.createdAt });
      check(error);
    },
    async removeSample(sampleId) {
      const { error } = await client.from("writing_samples").delete().eq("id", sampleId);
      check(error);
    },
  };

  return { documents, voiceprints, location: "supabase" };
}
