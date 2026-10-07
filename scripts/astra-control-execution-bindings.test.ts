import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { z } from "zod";
import type { StructuredCaller } from "@/lib/ai/provider";
import { assertCaseInputExact, runOfflineV15CPair, sourceFinal, type ExactStore } from "./astra-control-execution-bindings";

const source = "Synthetic custody marker alpha.";
const objective = "Keep the synthetic marker intact.";
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function caller(data: unknown, label: string): StructuredCaller {
  return {
    info: { mode: "demo", provider: `offline-${label}`, model: `saved-${label}` },
    generationReport: () => ({ applied: [], unsupported: [], declared: [] }),
    async callStructured<T>(schema: z.ZodType<T>) { return { data: schema.parse(data), meta: {} }; },
  };
}

const v15Pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true,
  voicePreserved: true, unsupportedInformation: false, reason: "Synthetic marker remains unchanged.", issue: null };
const cPass = { safety: "SAFE", objectiveSatisfied: "YES", voicePreserved: true,
  unsupportedInformation: false, usefulPartial: false, reason: "Synthetic marker remains unchanged.", issue: null };

function callers() {
  return { editor: caller({ text: source, changes: [] }, "editor"),
    v15Verifier: caller(v15Pass, "v15-review"), v15Repairer: caller({ replacement: "marker" }, "v15-repair"),
    cVerifier: caller(cPass, "c-review"), cRepairer: caller({ replacement: "marker" }, "c-repair") };
}

test("SOURCE is byte-identical and admission rejects silent schema trimming", () => {
  assert.strictEqual(sourceFinal(source), source);
  assert.equal(hash(sourceFinal(source)), hash(source));
  assert.equal(assertCaseInputExact(source, objective).source, source);
  assert.throws(() => assertCaseInputExact(` ${source}`, objective), /normalized/);
  assert.throws(() => assertCaseInputExact(source, `${objective} `), /normalized/);
});

test("one saved V15 RAW feeds C exactly; separate final records follow it", async () => {
  const order: string[] = [];
  const saved = new Map<string, Buffer>();
  const store: ExactStore = { async persistAndReadback(kind, bytes) {
    order.push(kind);
    if (saved.has(kind)) throw new Error(`duplicate ${kind}`);
    saved.set(kind, Buffer.from(bytes));
    return Buffer.from(saved.get(kind)!);
  } };
  const result = await runOfflineV15CPair(source, objective, callers(), store);
  assert.equal(result.technicalFailure, null);
  assert.equal(result.rawSha256, hash(source));
  assert.equal(result.v15.candidate, source);
  assert.ok(result.c);
  assert.deepEqual(order, ["v15_editor_request", "v15_editor_response", "v15_raw",
    "v15_verifier_request_1", "v15_verifier_response_1", "v15_final",
    "c_verifier_request_1", "c_verifier_response_1", "c_final"]);
  assert.deepEqual(saved.get("v15_raw"), Buffer.from(source, "utf8"));
  assert.equal(result.sourceFinal, source);
});

test("RAW custody mismatch prevents C invocation", async () => {
  let cCalls = 0;
  const fake = callers();
  fake.cVerifier = { ...fake.cVerifier, async callStructured<T>(schema: z.ZodType<T>) { void schema; cCalls++; throw new Error("C must not run"); } };
  const store: ExactStore = { async persistAndReadback(kind, bytes) {
    return kind === "v15_raw" ? Buffer.from("altered") : Buffer.from(bytes);
  } };
  const result = await runOfflineV15CPair(source, objective, fake, store);
  assert.equal(result.technicalFailure, "missing-valid-v15-raw");
  assert.equal(cCalls, 0);
});

test("live caller metadata is rejected before any execution", async () => {
  const fake = callers();
  fake.editor = { ...fake.editor, info: { mode: "live", provider: "account-backed", model: "unverified" } };
  const store: ExactStore = { async persistAndReadback(_kind, bytes) { return bytes; } };
  await assert.rejects(runOfflineV15CPair(source, objective, fake, store), /rejects live callers/);
});
