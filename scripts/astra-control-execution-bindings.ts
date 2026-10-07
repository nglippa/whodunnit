/** Offline custody proof for the preregistered V15 -> Candidate C shared-RAW path.
 * This does not supply a live model caller or authorize benchmark execution. */
import { createHash } from "node:crypto";
import type { z } from "zod";
import { reconstructionRequestSchema } from "@/domain/document";
import { PRESETS } from "@/domain/style";
import type { StructuredCaller } from "@/lib/ai/provider";
import { candidateSchema } from "@/lib/ai/schemas";
import { runDirectiveScopedTemporalReconstruction } from "@/lib/reconstruction/verified-reconstruction";
import { runCandidateC } from "@/lib/reconstruction/post-v3";

type DownstreamStage = "v15_verifier" | "v15_repairer" | "c_verifier" | "c_repairer";
type Kind = "v15_editor_request" | "v15_editor_response" | "v15_raw" | "v15_final" | "c_final"
  | `${DownstreamStage}_${"request" | "response"}_${1 | 2}`;

/** A real implementation must durably write, fsync, then read back exact bytes. */
export interface ExactStore {
  persistAndReadback(kind: Kind, bytes: Uint8Array): Promise<Uint8Array>;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const utf8 = (text: string) => Buffer.from(text, "utf8");
const allowlistedMeta = (meta: Record<string, unknown>) => ({
  latencyMs: meta.latencyMs ?? null,
  inputTokens: meta.inputTokens ?? null,
  outputTokens: meta.outputTokens ?? null,
  stopReason: meta.stopReason ?? null,
  requestId: meta.requestId ?? null,
  httpStatus: meta.httpStatus ?? null,
});

async function persistExact(store: ExactStore, kind: Kind, bytes: Uint8Array) {
  const copy = await store.persistAndReadback(kind, bytes);
  if (!Buffer.from(bytes).equals(Buffer.from(copy))) throw new Error(`custody byte mismatch: ${kind}`);
  return { bytes: Buffer.from(copy), sha256: sha256(copy) };
}

/** Reject schema transformations instead of silently changing the SOURCE arm. */
export function assertCaseInputExact(source: string, objective: string) {
  const parsed = reconstructionRequestSchema.parse({ source, profile: PRESETS.natural });
  if (parsed.source !== source || objective !== objective.trim()) throw new Error("case input would be normalized by frozen V15/C");
  if (!objective || objective.length > 500) throw new Error("invalid objective for frozen V15/C");
  return parsed;
}

export function sourceFinal(source: string) { return source; }

export interface OfflinePairCallers {
  editor: StructuredCaller;
  v15Verifier: StructuredCaller;
  v15Repairer: StructuredCaller;
  cVerifier: StructuredCaller;
  cRepairer: StructuredCaller;
}

/**
 * Exercises frozen implementation bindings using only externally supplied saved
 * synthetic responses. Live callers deliberately fail this offline proof path.
 */
export async function runOfflineV15CPair(source: string, objective: string, callers: OfflinePairCallers, store: ExactStore) {
  const request = assertCaseInputExact(source, objective);
  if (Object.values(callers).some((caller) => caller.info.mode !== "demo")) throw new Error("offline binding rejects live callers");
  if (callers.editor === callers.v15Verifier) throw new Error("V15 editor and verifier must be separate");
  if (callers.v15Verifier === callers.cVerifier || callers.v15Repairer === callers.cRepairer)
    throw new Error("V15 and C downstream callers must be independent objects");

  let editorCalls = 0;
  let raw: Awaited<ReturnType<typeof persistExact>> | null = null;
  const recordingEditor: StructuredCaller = {
    info: callers.editor.info,
    generationReport: () => callers.editor.generationReport(),
    async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
      if (++editorCalls !== 1 || name !== "frontier-editor")
        throw new Error("unexpected V15 editor invocation");
      await persistExact(store, "v15_editor_request", utf8(JSON.stringify({ name, system, user })));
      const response = await callers.editor.callStructured(schema, name, system, user);
      // Capture the original schema object and exact returned data before V15 sees it.
      await persistExact(store, "v15_editor_response", utf8(JSON.stringify({ data: response.data,
        meta: allowlistedMeta(response.meta as Record<string, unknown>) })));
      const parsed = candidateSchema.parse(response.data);
      raw = await persistExact(store, "v15_raw", utf8(parsed.text));
      return response;
    },
  };
  const recordingDownstream = (caller: StructuredCaller, stage: DownstreamStage, budget: 1 | 2): StructuredCaller => {
    let count = 0;
    return {
      info: caller.info,
      generationReport: () => caller.generationReport(),
      async callStructured<T>(schema: z.ZodType<T>, name: string, system: string, user: string) {
        count++;
        if (count > budget) throw new Error(`stage budget exceeded: ${stage}`);
        const index = count as 1 | 2;
        await persistExact(store, `${stage}_request_${index}`, utf8(JSON.stringify({ name, system, user })));
        const response = await caller.callStructured(schema, name, system, user);
        await persistExact(store, `${stage}_response_${index}`, utf8(JSON.stringify({ data: response.data,
          meta: allowlistedMeta(response.meta as Record<string, unknown>) })));
        return response;
      },
    };
  };

  const v15 = await runDirectiveScopedTemporalReconstruction(request, objective, {
    editor: recordingEditor,
    verifier: recordingDownstream(callers.v15Verifier, "v15_verifier", 2),
    repairer: recordingDownstream(callers.v15Repairer, "v15_repairer", 1),
  });
  await persistExact(store, "v15_final", utf8(JSON.stringify(v15)));
  if (!raw || !v15.candidate) return { sourceFinal: sourceFinal(source), v15, c: null, rawSha256: null, technicalFailure: "missing-valid-v15-raw" as const };
  const savedRaw: { bytes: Buffer; sha256: string } = raw;
  if (!utf8(v15.candidate).equals(savedRaw.bytes)) throw new Error("V15 candidate differs from exact saved RAW");
  const c = await runCandidateC(request, objective, savedRaw.bytes.toString("utf8"), {
    verifier: recordingDownstream(callers.cVerifier, "c_verifier", 2),
    repairer: recordingDownstream(callers.cRepairer, "c_repairer", 1),
  });
  await persistExact(store, "c_final", utf8(JSON.stringify(c)));
  return { sourceFinal: sourceFinal(source), v15, c, rawSha256: savedRaw.sha256, technicalFailure: null };
}
