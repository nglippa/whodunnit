import { NextResponse } from "next/server";
import type { z } from "zod";
import { ProviderError } from "../ai/provider";

/** Shared request/response helpers so route handlers stay a few lines long. */

export const MAX_BODY_BYTES = 200_000;

export type ApiError = { error: { code: string; message: string } };

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, response: errorResponse(413, "too_large", "That text is too long to process in one go.") };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: errorResponse(400, "bad_json", "The request could not be read.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, response: errorResponse(422, "invalid_request", first?.message ?? "The request was not valid.") };
  }
  return { ok: true, data: parsed.data };
}

export function providerErrorResponse(err: unknown) {
  if (err instanceof ProviderError) {
    const status = err.code === "rate_limited" ? 429 : err.code === "unavailable" ? 503 : 502;
    return errorResponse(status, err.code, err.message);
  }
  return errorResponse(500, "internal", "Something went wrong on our side. Your text was not stored.");
}
