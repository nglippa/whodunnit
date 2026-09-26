/**
 * The one sanctioned logger for server code. It accepts an event name and
 * numeric/enum metadata only, so writing cannot end up in logs by accident.
 * There is no telemetry: this writes to the server console and nowhere else.
 */

type Meta = Record<string, number | boolean | null | string>;

const SAFE_STRING = /^[a-z0-9_.:-]{1,64}$/i;

export function logEvent(event: string, meta: Meta = {}): void {
  if (process.env.NODE_ENV === "test") return;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    // Strings are only allowed when they look like identifiers or enum values.
    if (typeof v === "string" && !SAFE_STRING.test(v)) continue;
    safe[k] = v;
  }
  console.info(`[whodunnit] ${event}`, safe);
}
