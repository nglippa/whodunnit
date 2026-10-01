import { PRESETS } from "@/domain/style";
import { buildRewritePlan } from "@/lib/reconstruction/rewrite-plan";
import { semanticRequest, type SemanticReviewRequest } from "@/lib/reconstruction/semantic-review";
import { RECONSTRUCTION_V7 } from "@/lib/reconstruction/strategies";

/** Evaluation transport for an explicit objective through v3's existing rationale field. */
export function objectiveSemanticRequest(source: string, objective: string): SemanticReviewRequest {
  // The product refinement note is capped at 280 chars. The exact objective is
  // carried by the review request's existing rationale field below.
  const refinement = { directives: [] as [], note: objective.length <= 280 ? objective : "See the full author objective in planner rationale." };
  const input = { source, profile: PRESETS.natural, refinement };
  const plan = buildRewritePlan(input, RECONSTRUCTION_V7);
  const request = semanticRequest(input, plan);
  return { ...request, plannerRationale: [...request.plannerRationale, `Author's note: ${objective}`] };
}
