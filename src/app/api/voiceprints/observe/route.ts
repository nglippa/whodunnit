import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/ai";
import { errorResponse, providerErrorResponse, readJson } from "@/lib/http/json";
import { logEvent } from "@/lib/privacy/log";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Optional, explicit, per-request model observations for a Voiceprint.
 * Samples are sent only when the author presses the button, and are not stored.
 */
const bodySchema = z
  .object({ samples: z.array(z.string().min(1).max(12_000)).min(2).max(8) })
  .strict();

export async function POST(request: Request) {
  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;
  const provider = getProvider();
  if (provider.info.mode !== "live") {
    return errorResponse(503, "unavailable", "Model observations need a connected writing model.");
  }
  try {
    const observations = await provider.analyzeVoiceprint(body.data.samples);
    logEvent("voiceprint_observe", { samples: body.data.samples.length, observations: observations.length });
    return NextResponse.json({ observations }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return providerErrorResponse(err);
  }
}
