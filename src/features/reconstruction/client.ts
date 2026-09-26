import { z } from "zod";
import { reconstructionResultSchema, type ReconstructionRequest } from "@/domain/document";
import { styleProfileSchema } from "@/domain/style";
import { observationSchema } from "@/domain/voiceprint";

/**
 * Browser-side API client. Responses are validated like any other untrusted
 * input before they reach component state.
 */

export const reconstructResponseSchema = reconstructionResultSchema.extend({ profile: styleProfileSchema });
export type ReconstructResponse = z.infer<typeof reconstructResponseSchema>;

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiError("Stopped.", "aborted");
    throw new ApiError("Whodunnit could not reach its server. Check your connection and try again.", "network");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorSchema.safeParse(json);
    throw new ApiError(parsed.success ? parsed.data.error.message : `The request failed (${res.status}).`, parsed.success ? parsed.data.error.code : "http");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError("The server returned something unexpected. Nothing was changed.", "invalid_response");
  return parsed.data;
}

export function requestReconstruction(request: ReconstructionRequest, signal?: AbortSignal) {
  return post("/api/reconstruct", request, reconstructResponseSchema, signal);
}

export function requestVoiceprintObservations(samples: string[], signal?: AbortSignal) {
  return post("/api/voiceprints/observe", { samples }, z.object({ observations: z.array(observationSchema) }), signal);
}
