import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { semanticRequest } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V7 } from "@/lib/reconstruction/strategies";
import { editingJobDocumentSchema, editingJobLabelSchema, validateEditingJobLabels } from "./editing-job-schema";

const root = resolve("data/fixtures/editing-job-validation");
const pinned = {
  "documents.json": "38a40775f3287699da857fbfba24c910e5834c003dbc0fd75dc48f652321f149",
  "labels.json": "ba1ecbe9a8c2cb6186245a74318f472dc7c92c1d514098c411f4e751db9b9a52",
  "blind-reviews.json": "b7dd61eed320bca9f9584d513f4985b65d39a47517ef8b3299a64de311316c46",
} as const;
const json = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const digest = (name: string): string => createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");

describe("frozen editing-job development input", () => {
  it("pins the corpus, labels, and blind reviews before semantic execution", () => {
    const manifest = json("manifest.json") as { status: string; files: Record<string, string> };
    expect(manifest.status).toBe("FROZEN_DEVELOPMENT");
    for (const [name, hash] of Object.entries(pinned)) {
      expect(manifest.files[name]).toBe(hash);
      expect(digest(name)).toBe(hash);
    }
    for (const [name, hash] of Object.entries(manifest.files)) expect(digest(name)).toBe(hash);
  });

  it("keeps job evidence text-bound and gold metadata out of semantic requests", () => {
    const documents = editingJobDocumentSchema.array().parse(json("documents.json"));
    const labels = editingJobLabelSchema.array().parse(json("labels.json"));
    expect(documents).toHaveLength(90);
    validateEditingJobLabels(documents, labels);
    const [first] = documents;
    const input = { source: first.text, profile: PRESETS.natural };
    const request = semanticRequest(input, buildRewritePlan(input, RECONSTRUCTION_V7));
    expect(request.source).toBe(first.text);
    expect(Object.keys(request)).not.toContain("gold");
    expect(Object.keys(request)).not.toContain("jobs");
    expect(Object.keys(request)).not.toContain("creator");
    expect(Object.keys(request)).not.toContain("requestedFeasibility");
  });

  it("binds saved review evidence and the initial baseline to the frozen inputs", () => {
    const execution = json("review-execution.json") as { reviewCount: number; savedOutputSha256: string };
    const baseline = json("baseline-summary.json") as { inputManifestSha256: string; reviewOutputSha256: string };
    expect(execution.reviewCount).toBe(90);
    expect(execution.savedOutputSha256).toBe(digest("reviewer-output.json"));
    expect(baseline.reviewOutputSha256).toBe(execution.savedOutputSha256);
    expect(baseline.inputManifestSha256).toBe(digest("manifest.json"));
    const documents = editingJobDocumentSchema.array().parse(json("documents.json"));
    const byId = new Map(documents.map((document) => [document.id, document]));
    const blind = json("blind-reviews.json") as { annotations: unknown[] }[];
    for (const review of blind) {
      for (const raw of review.annotations) {
        const label = editingJobLabelSchema.parse(raw);
        const document = byId.get(label.id);
        expect(document).toBeDefined();
        validateEditingJobLabels([document!], [label]);
      }
    }
  });

  it("rejects a different ordered review file before replay", () => {
    const changed = JSON.parse(readFileSync(resolve(root, "reviewer-output.json"), "utf8")) as { model: string }[];
    changed[0].model = "different-account-agent";
    const temporary = mkdtempSync(join(tmpdir(), "whodunnit-editing-job-"));
    try {
      const path = join(temporary, "changed-reviews.json");
      writeFileSync(path, JSON.stringify(changed));
      const result = spawnSync(process.execPath, ["--import", "tsx", "tools/eval/editing-job-validation.ts", "audit", path], {
        cwd: process.cwd(), encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("saved semantic-review output fingerprint mismatch");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
