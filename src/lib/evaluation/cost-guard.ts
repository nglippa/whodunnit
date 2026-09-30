import type { EvaluationConfig } from "@/domain/evaluation";
import { EvaluationConfigError } from "./config";

/** Evaluation CLI preflight. A configured key says nothing about billing status. */
export function assertEvaluationCostPermission(
  config: EvaluationConfig,
  permission: { allowPaidProvider?: boolean; confirmedFreeGroq?: boolean } = {},
): void {
  const routes = [
    { role: "frontier", provider: config.provider, baseUrl: config.baseUrl },
    ...(config.worker ? [{ role: "worker", provider: config.worker.provider, baseUrl: config.worker.baseUrl }] : []),
    ...(config.judge ? [{ role: "judge", provider: config.judge.provider, baseUrl: config.judge.baseUrl }] : []),
  ];
  for (const route of routes) {
    if (route.provider === "demo") continue;
    if (route.provider === "openai-compatible") {
      let url: URL;
      try { url = new URL(route.baseUrl ?? ""); }
      catch { throw new EvaluationConfigError(`${route.role} has an invalid OpenAI-compatible URL.`); }
      if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) continue;
    }
    if (route.provider === "groq" && permission.confirmedFreeGroq) continue;
    if (!permission.allowPaidProvider) throw new EvaluationConfigError(
      `${route.role} route ${route.provider} may incur API charges. Evaluation is deny-by-default: use --allow-paid-provider only with explicit authorization, or --confirm-free-groq after verifying a zero-cost Groq quota. No provider was called.`,
    );
  }
}
