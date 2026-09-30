import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";
import { assertEvaluationCostPermission } from "./cost-guard";

describe("evaluation cost guard", () => {
  it("denies an implicit paid frontier even when a key is configured", () => {
    const config = resolveConfig({}, { ANTHROPIC_API_KEY: "fake" });
    expect(() => assertEvaluationCostPermission(config)).toThrow(/deny-by-default/);
    expect(() => assertEvaluationCostPermission(config, { allowPaidProvider: true })).not.toThrow();
  });

  it("allows demo and loopback transport but denies unknown remote compatible hosts", () => {
    expect(() => assertEvaluationCostPermission(resolveConfig({ demo: true }, {}))).not.toThrow();
    expect(() => assertEvaluationCostPermission(resolveConfig({ provider: "local", model: "fake" }, {}))).not.toThrow();
    expect(() => assertEvaluationCostPermission(resolveConfig({ provider: "local", model: "fake", baseUrl: "https://model.example/v1" }, {}))).toThrow(/may incur API charges/);
  });

  it("checks workers and judges independently of the frontier route", () => {
    const worker = resolveConfig({ provider: "local", strategy: "reconstruction-v4", worker: { provider: "anthropic", model: "fake" } }, {});
    expect(() => assertEvaluationCostPermission(worker)).toThrow(/worker route anthropic/);
    const judge = resolveConfig({ demo: true, judge: { provider: "groq", model: "fake" } }, {});
    expect(() => assertEvaluationCostPermission(judge)).toThrow(/judge route groq/);
    expect(() => assertEvaluationCostPermission(judge, { confirmedFreeGroq: true })).not.toThrow();
    const gemini = resolveConfig({ provider: "gemini" }, {});
    expect(() => assertEvaluationCostPermission(gemini, { confirmedFreeGroq: true })).toThrow(/frontier route gemini/);
  });
});
