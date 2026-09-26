import type { Revision, WhodunnitDocument } from "@/domain/document";
import type { Voiceprint, WritingSample } from "@/domain/voiceprint";

/**
 * Persistence boundaries. The UI and domain code depend on these interfaces
 * only; storage (browser, memory, Supabase) is chosen at the edge.
 */

export interface DocumentRepository {
  list(): Promise<WhodunnitDocument[]>;
  get(id: string): Promise<WhodunnitDocument | null>;
  save(doc: WhodunnitDocument): Promise<void>;
  remove(id: string): Promise<void>;
  listRevisions(documentId: string): Promise<Revision[]>;
  saveRevision(revision: Revision): Promise<void>;
}

export interface VoiceprintRepository {
  list(): Promise<Voiceprint[]>;
  get(id: string): Promise<Voiceprint | null>;
  save(voiceprint: Voiceprint): Promise<void>;
  /** Removes the voiceprint and all of its samples. */
  remove(id: string): Promise<void>;
  listSamples(voiceprintId: string): Promise<WritingSample[]>;
  saveSample(sample: WritingSample): Promise<void>;
  removeSample(sampleId: string): Promise<void>;
}

export interface Repositories {
  documents: DocumentRepository;
  voiceprints: VoiceprintRepository;
  /** Where the data lives, for honest privacy copy in the UI. */
  location: "browser" | "memory" | "supabase";
}
