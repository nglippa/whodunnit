/** Development-only trace of substantive labels. No provider or frozen holdout imports. */
import { readFileSync } from "node:fs";
import { PRESETS } from "@/domain/style";
import { semanticDevelopmentCorpusSchema } from "@/lib/reconstruction/semantic-development-eval";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { RECONSTRUCTION_V6 } from "@/lib/reconstruction/strategies";
import { assessSemanticReview, reconcileSemanticReview, routeSemanticReview, semanticRequest, validateSemanticReview } from "@/lib/reconstruction/semantic-review";

const corpus = semanticDevelopmentCorpusSchema.parse(JSON.parse(readFileSync("data/fixtures/semantic-review-development/corpus.json", "utf8")));
const records = JSON.parse(readFileSync("data/fixtures/semantic-review-development/gpt-family-reviews.json", "utf8")) as { id: string; model: string; review: unknown }[];
const byId = new Map(records.map((r) => [r.id, r]));
const trace = corpus.filter((c) => c.annotation.disposition === "SUBSTANTIVE_RECONSTRUCTION").map((c) => {
  const plan = buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V6);
  const deterministicScope = semanticRequest({ source: c.text, profile: PRESETS.natural }, plan).deterministicScope;
  const routed = routeSemanticReview(plan).requested;
  const record = byId.get(c.id);
  if (!record) return { id: c.id, gold: c.annotation.disposition, deterministicScope, routed, reviewerDisposition: null, validation: "NO_REVIEW", v6All: deterministicScope, v6Selective: deterministicScope };
  try {
    const review = validateSemanticReview(c.text, record.review);
    const v6All = reconcileSemanticReview(c.text, plan, review);
    const v7 = assessSemanticReview(c.text, plan, review);
    return {
      id: c.id, gold: c.annotation.disposition, deterministicScope, routed,
      reviewerDisposition: review.disposition, reviewerConfidence: review.confidence,
      evidence: review.findings.map((f) => ({ phenomenon: f.phenomenon, scope: f.scope, severity: f.severity, confidence: f.confidence, spans: f.evidence })),
      counterevidence: review.counterevidence, missingInformation: review.missingInformation,
      safeToRewriteWithoutNewFacts: review.safeToRewriteWithoutNewFacts,
      recommendedScope: review.disposition,
      validation: "ACCEPTED", postValidationDisposition: review.disposition,
      reconciliation: v6All, v6All, v6Selective: routed ? v6All : deterministicScope,
      v7Diagnosis: v7.diagnosis, v7Feasibility: v7.feasibility, v7Execution: v7.execution, v7FinalScope: v7.finalScope,
    };
  } catch {
    return { id: c.id, gold: c.annotation.disposition, deterministicScope, routed, reviewerDisposition: null, validation: "REJECTED", v6All: deterministicScope, v6Selective: deterministicScope };
  }
});
process.stdout.write(JSON.stringify({ schemaVersion: 1, corpus: "semantic-review-development", trace }, null, 2) + "\n");
