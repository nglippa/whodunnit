import { describe, expect, it } from "vitest";
import {
  adjudicateV2, evaluateV2Text, reviewAgreement, summarizeV2, validateV2Freeze, v2Band,
  v2Hash, type V2Document, type V2Review, type V2Outcome,
} from "./holdout-v2";

const documents: V2Document[] = Array.from({ length: 120 }, (_, i) => ({
  id: `${["A", "B", "C", "D"][Math.floor(i / 30)]}${String(i % 30 + 1).padStart(3, "0")}`,
  text: `Synthetic validation item ${i + 1}. This sentence supplies enough text for a schema check. The document contains distinct content ${i + 1}.`,
}));
const briefs = documents.map((d) => ({ id: d.id, creatorId: d.id[0], requestedDisposition: "LEAVE_ALONE", requestedConcepts: [], requestedGenre: "PROSE", requestedLengthBand: "VERY_SHORT", briefRationale: "Independent synthetic item" }));
const reviews: V2Review[] = documents.map((d) => ({ id: d.id, disposition: "LEAVE_ALONE", concepts: [], genre: "PROSE", confidence: .9, rationale: "No material change seems needed." }));
const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;
function frozen(a = reviews, b = reviews) {
  const labels = adjudicateV2(documents, a, b);
  const files = { "documents.json": json(documents), "briefs.json": json(briefs), "review-r1.json": json(a), "review-r2.json": json(b), "labels.json": json(labels) };
  const manifest = { version: "2.0.0", created: "2026-09-30", marker: "FROZEN_HOLDOUT_DO_NOT_TUNE", provenance: "synthetic-newly-authored", documentCount: 120, creatorIds: ["A", "B", "C", "D"], reviewerIds: ["R1", "R2"], frozenBeforeEvaluation: true, engineRevision: "a".repeat(40), engineSha256: v2Hash("synthetic-engine"), files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v2Hash(v)])), dispositionCounts: { LEAVE_ALONE: 120 }, lengthCounts: { VERY_SHORT: 120 }, genreCounts: { PROSE: 120 } };
  return { ...files, "manifest.json": json(manifest) };
}

describe("blind holdout V2 integrity and reporting", () => {
  it("validates exact frozen bytes and matching independent annotations", () => {
    const raw = frozen();
    expect(validateV2Freeze(raw).documents).toHaveLength(120);
    expect(() => validateV2Freeze({ ...raw, "documents.json": `${raw["documents.json"]} ` })).toThrow(/fingerprint/);
  });
  it("rejects missing review coverage, altered gold labels, and duplicate concepts", () => {
    expect(() => adjudicateV2(documents, reviews.slice(1), reviews)).toThrow(/IDs differ/);
    const changed = frozen();
    const labels = JSON.parse(changed["labels.json"]);
    labels[0].disposition = "LIGHT_EDIT";
    changed["labels.json"] = json(labels);
    const manifest = JSON.parse(changed["manifest.json"]);
    manifest.files["labels.json"] = v2Hash(changed["labels.json"]);
    changed["manifest.json"] = json(manifest);
    expect(() => validateV2Freeze(changed)).toThrow(/Gold labels/);
    const duplicate = reviews.map((r, i) => i === 0 ? { ...r, concepts: ["VOICE" as const, "VOICE" as const] } : r);
    const bad = frozen(duplicate, reviews);
    expect(() => validateV2Freeze(bad)).toThrow(/Duplicate concept/);
  });
  it("marks reviewer disagreement ambiguous, without importing a creator request as gold", () => {
    const second = reviews.map((r, i) => i === 0 ? { ...r, disposition: "LIGHT_EDIT" as const, rationale: "A light pass could help." } : r);
    const labels = adjudicateV2(documents, reviews, second);
    expect(labels[0]).toMatchObject({ disposition: "AMBIGUOUS", reviewerAgreement: false });
    const raw = frozen(reviews, second);
    const manifest = JSON.parse(raw["manifest.json"]);
    manifest.dispositionCounts = { AMBIGUOUS: 1, LEAVE_ALONE: 119 };
    raw["manifest.json"] = json(manifest);
    expect(validateV2Freeze(raw).labels[0].disposition).toBe("AMBIGUOUS");
    expect(reviewAgreement(documents, reviews, second).overall.dispositionAgreed).toBe(119);
  });
  it("reports length bands and distinct planning dispositions without a composite score", () => {
    expect([35, 100, 300, 1000].map(v2Band)).toEqual(["VERY_SHORT", "SHORT", "MEDIUM", "LONG"]);
    const labels = adjudicateV2(documents, reviews, reviews);
    const outcome: V2Outcome = { id: documents[0].id, words: 35, band: "VERY_SHORT", v1: { wouldCallModel: true, actionable: 0, findings: [] }, v3: { disposition: "UNCHANGED", actionable: 0, findings: [], permitted: [] }, v5: { disposition: "LIGHT_EDIT", scope: "LOCAL_EDIT", actionable: 1, findings: [{ id: "synthetic-rule", family: "other", severity: "warning", occurrences: 1 }], permitted: [], structure: { type: "PROSE", confidence: .7 }, discourse: [], uncertainty: "INSUFFICIENT_EVIDENCE" }, timingMs: { v1: 1, v3: 2, v5: 3, total: 6 } };
    const summary = summarizeV2([outcome], [labels[0]]);
    expect(summary.cleanFalsePositiveIds).toEqual([outcome.id]);
    expect(summary.v3.matrix.LEAVE_ALONE.UNCHANGED).toBe(1);
    expect(summary.v5.matrix.LEAVE_ALONE.LIGHT_EDIT).toBe(1);
    expect(summary.bands.VERY_SHORT.insufficient).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/compositeScore|qualityScore|aiProbability/i);
  });
  it("runs only deterministic planners with source text, even when network access throws", () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("A provider call would violate the holdout protocol"); };
    try {
      const result = evaluateV2Text("We moved the meeting to Thursday because the room was closed.", "A001");
      expect(result.id).toBe("A001");
      expect(result.v1.wouldCallModel).toBe(true);
      expect(result.v5.structure.type).toBeDefined();
      expect(JSON.stringify(result)).not.toContain("We moved the meeting");
    } finally { globalThis.fetch = oldFetch; }
  });
});
