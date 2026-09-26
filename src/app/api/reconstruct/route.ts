import { NextResponse } from "next/server";
import { reconstructionRequestSchema } from "@/domain/document";
import { getProvider } from "@/lib/ai";
import { providerErrorResponse, readJson } from "@/lib/http/json";
import { logEvent } from "@/lib/privacy/log";
import { strategyKey } from "@/domain/strategy";
import { runReconstruction } from "@/lib/reconstruction/pipeline";
import { DEFAULT_STRATEGY } from "@/lib/reconstruction/strategies";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readJson(request, reconstructionRequestSchema);
  if (!body.ok) return body.response;

  const provider = getProvider();
  const started = Date.now();
  try {
    const strategy = DEFAULT_STRATEGY;
    const result = await runReconstruction(body.data, provider, { strategy });
    // Metadata only: lengths, timings and outcomes. Never the text.
    logEvent("reconstruct", {
      mode: provider.info.mode,
      strategy: strategyKey(strategy),
      refine: Boolean(body.data.refinement),
      sourceChars: body.data.source.length,
      attempts: result.attempts,
      status: result.verification.status,
      ms: Date.now() - started,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logEvent("reconstruct_failed", { mode: provider.info.mode, ms: Date.now() - started, code: err instanceof Error ? err.name : "unknown" });
    return providerErrorResponse(err);
  }
}
