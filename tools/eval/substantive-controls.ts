/** Synthetic development controls only. Optional saved reviewer replay; never calls a model. */
import { readFileSync } from "node:fs";
import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { RECONSTRUCTION_V6 } from "@/lib/reconstruction/strategies";
import { assessSemanticReview, reconcileSemanticReview, routeSemanticReview, semanticProgressionMap, semanticRequest, validateSemanticReview } from "@/lib/reconstruction/semantic-review";

type Control = { id: string; text: string; expected: string; reason: string; pairId: string };
const controls = JSON.parse(readFileSync("data/fixtures/semantic-review-development/substantive-controls.json", "utf8")) as Control[];
const reviewPath = process.argv[2];
const contractVersion = process.argv[3] === "v3" ? 3 : 2;
const saved = reviewPath ? JSON.parse(readFileSync(reviewPath, "utf8")) as { id: string; review: unknown }[] : [];
const reviews = new Map(saved.map((r) => [r.id, r.review]));
const rows = controls.map((c) => {
  const plan = buildRewritePlan({ source: c.text, profile: PRESETS.natural }, RECONSTRUCTION_V6);
  const deterministic = semanticRequest({ source: c.text, profile: PRESETS.natural }, plan).deterministicScope;
  const routed = routeSemanticReview(plan).requested;
  const raw = reviews.get(c.id);
  if (!raw) return { id: c.id, pairId: c.pairId, expected: c.expected, deterministic, routed, review: null, validation: "NO_REVIEW" };
  try {
    const review = validateSemanticReview(c.text, raw, contractVersion);
    const assessment = assessSemanticReview(c.text, plan, review);
    return { id: c.id, pairId: c.pairId, expected: c.expected, deterministic, routed, review: review.disposition,
      validation: "ACCEPTED", progression: semanticProgressionMap(c.text, review), ...(contractVersion === 2
        ? { v6: reconcileSemanticReview(c.text, plan, review), v7PolicyCounterfactual: assessment }
        : { v7: assessment }) };
  } catch {
    return { id: c.id, pairId: c.pairId, expected: c.expected, deterministic, routed, review: null, validation: "REJECTED" };
  }
});
process.stdout.write(JSON.stringify({ count: rows.length, rows }, null, 2) + "\n");
