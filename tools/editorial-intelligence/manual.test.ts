import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportManualRun, importEditorResponse, blindManualRun, importJudgeResponse } from "./manual";

const roots: string[] = [];
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
function setup() {
  const root = mkdtempSync(resolve(tmpdir(), "editorial-manual-test-")); roots.push(root);
  const { run } = exportManualRun("test", root);
  return { root, run, cases: read(resolve(run, "holdout.json")).cases as { id: string; source: string }[] };
}
function response(run: string, id: string, stage: string, data: unknown, override: Record<string, unknown> = {}) {
  const raw = resolve(run, `${id}-${stage}-input.json`), meta = resolve(run, `${id}-${stage}-meta.json`);
  writeFileSync(raw, "  " + JSON.stringify(data) + "\n\n");
  const template = stage === "judge" ? resolve(run, "blind", "metadata-templates", `${id}.json`)
    : resolve(run, "requests", `${id}-${stage}.metadata.json`);
  writeFileSync(meta, JSON.stringify({ ...read(template), ...override }));
  return { raw, meta };
}
function diagnosis(source: string) {
  return { naturalness: "ALREADY_NATURAL", naturalnessEvidence: [{ quote: source, reason: "Fixture" }],
    objectiveChangeNeed: "OPTIONAL", objectiveReason: "Fixture", defects: [], voiceToPreserve: [{ quote: source, reason: "Fixture" }],
    untouched: [], scope: "KEEP", scopeReason: "Fixture" };
}
function complete() {
  const state = setup();
  for (const [index, row] of state.cases.entries()) {
    for (const stage of index % 2 ? ["diagnosis", "reconstruction", "direct"] as const : ["direct", "diagnosis", "reconstruction"] as const) {
      const data = stage === "diagnosis" ? diagnosis(row.source) : { disposition: "UNCHANGED", text: row.source };
      const { raw, meta } = response(state.run, row.id, stage, data);
      importEditorResponse("test", row.id, stage, raw, meta, state.root);
    }
  }
  return state;
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe("manual Astra experiment workflow", () => {
  it("pins exports, preserves exact raw bytes and unlocks reconstruction with the bound diagnosis", () => {
    const { root, run, cases } = setup(), row = cases[1], data = diagnosis(row.source);
    expect(existsSync(resolve(run, "requests", `${row.id}-reconstruction.json`))).toBe(false);
    const { raw, meta } = response(run, row.id, "diagnosis", data);
    const original = readFileSync(raw);
    importEditorResponse("test", row.id, "diagnosis", raw, meta, root);
    expect(readFileSync(resolve(run, "attempts", row.id, "diagnosis", "response.raw"))).toEqual(original);
    const request = read(resolve(run, "requests", `${row.id}-reconstruction.json`));
    expect(request.payload.diagnosis).toEqual(data);
    expect(request.model).toBe("gpt-6-astra");
    expect(() => importEditorResponse("test", row.id, "diagnosis", raw, meta, root)).toThrow("already attempted");
    const next = response(run, row.id, "reconstruction", { disposition: "UNCHANGED", text: row.source });
    expect(importEditorResponse("test", row.id, "reconstruction", next.raw, next.meta, root).nextStage).toBe("direct");
  });

  it("rejects ordering, wrong models, reported budget deviations and changed prompts", () => {
    for (const kind of ["model", "config", "prompt"] as const) {
      const { root, run, cases } = setup(), row = cases[0];
      expect(() => importEditorResponse("test", row.id, "reconstruction", "none", "none", root)).toThrow("order");
      const input = response(run, row.id, "direct", { disposition: "UNCHANGED", text: row.source },
        kind === "model" ? { returnedModel: "different" } : kind === "config" ?
          { actualConfig: { reasoningEffort: "low", maxOutputTokens: null, attempts: null, tools: null, sessionMemory: null } } : {});
      if (kind === "prompt") {
        const path = resolve(run, "requests", `${row.id}-direct.json`), request = read(path);
        request.payload.source = "changed"; writeFileSync(path, JSON.stringify(request));
      }
      expect(() => importEditorResponse("test", row.id, "direct", input.raw, input.meta, root)).toThrow();
    }
  });

  it("archives malformed first attempts without repair or replacement", () => {
    const { root, run, cases } = setup(), row = cases[0];
    const { raw, meta } = response(run, row.id, "direct", {});
    writeFileSync(raw, "```json\n{}\n```");
    expect(() => importEditorResponse("test", row.id, "direct", raw, meta, root)).toThrow("rejected permanently");
    expect(readFileSync(resolve(run, "attempts", row.id, "direct", "response.raw"), "utf8")).toBe("```json\n{}\n```");
    writeFileSync(raw, JSON.stringify({ disposition: "UNCHANGED", text: row.source }));
    expect(() => importEditorResponse("test", row.id, "direct", raw, meta, root)).toThrow("already attempted");
    expect(() => blindManualRun("test", root)).toThrow("rejected");
  });

  it("requires all cases, detects stored output tampering, and exports balanced private blindness", () => {
    const incomplete = setup();
    expect(() => blindManualRun("test", incomplete.root)).toThrow("Incomplete");
    const { root, run, cases } = complete();
    blindManualRun("test", root);
    const maps = read(resolve(run, "private", "blind-mapping.json"));
    expect(maps.filter((map: { X: string }) => map.X === "A")).toHaveLength(6);
    for (const row of cases) {
      const request = read(resolve(run, "blind", "requests", `${row.id}.json`));
      expect(Object.keys(request.payload).sort()).toEqual(["X", "Y", "caseId", "objective", "schema", "source"]);
      expect(JSON.stringify(request)).not.toContain("selectedModel");
      expect(request.payload).not.toHaveProperty("diagnosis");
    }
    const path = resolve(run, "attempts", cases[0].id, "direct", "response.raw");
    writeFileSync(path, "{}");
    expect(() => blindManualRun("test", root)).toThrow("tampered");
  });

  it("imports independent blind judgments, binds candidates and reports manual evidence without fabricated receipts", () => {
    const { root, run, cases } = complete(); blindManualRun("test", root);
    for (const row of cases) {
      const assessment = { naturalness: 4, voiceFidelity: 4, restraint: 4, objectiveCompletion: "YES", factualIntegrity: "SAFE",
        evidence: [{ from: "SOURCE", quote: row.source, reason: "Fixture" }] };
      const value = { caseId: row.id, X: assessment, Y: assessment, safePreference: "TIE", reason: "Fixture" };
      const { raw, meta } = response(run, row.id, "judge", value);
      importJudgeResponse("test", row.id, raw, meta, root);
    }
    expect(read(resolve(run, "manual-report.json"))).toMatchObject({ status: "MANUAL_UNAUDITED", cases: 12,
      preference: { ties: 12 }, observedSuccessCriterion: false,
      inference: { A: { importedCalls: 12, costUsd: null, inputTokens: null },
        B: { importedCalls: 24, costUsd: null, providerLatencyMs: null }, judge: { importedCalls: 12, returnedModels: [null] } } });
    const other = complete(); blindManualRun("test", other.root);
    const row = other.cases[0], path = resolve(other.run, "blind", "requests", `${row.id}.json`), request = read(path);
    request.payload.X = "tampered"; writeFileSync(path, JSON.stringify(request));
    expect(() => importJudgeResponse("test", row.id, "none", "none", other.root)).toThrow("tampered");
  });
});
