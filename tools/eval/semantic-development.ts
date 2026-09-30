/** Development-only scope comparison. Never loads frozen holdouts or calls a model. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { semanticDevelopmentCorpusSchema, evaluateSemanticDevelopment } from "@/lib/reconstruction/semantic-development-eval";
import type { SemanticReviewClient } from "@/lib/reconstruction/semantic-review";

async function main() {
  const cases = semanticDevelopmentCorpusSchema.parse(JSON.parse(readFileSync(resolve("data/fixtures/semantic-review-development/corpus.json"), "utf8")));
  let reviewer: SemanticReviewClient | null = null;
  const reviewPath = process.argv[2];
  if (reviewPath) {
    const records = JSON.parse(readFileSync(resolve(reviewPath), "utf8")) as { id: string; review: unknown; model: string; meta?: { inputTokens?: number; outputTokens?: number; latencyMs?: number } }[];
    const bySource = new Map(cases.map((c) => [c.text, c.id]));
    const byId = new Map(records.map((r) => [r.id, r]));
    reviewer = {
      model: records[0]?.model ?? "unknown",
      async review(request) {
        const id = bySource.get(request.source);
        const record = id ? byId.get(id) : undefined;
        if (!record) throw new Error("missing development review");
        return { review: record.review, meta: record.meta };
      },
    };
  }
  const { report, rows } = await evaluateSemanticDevelopment(cases, reviewer);
  process.stdout.write(JSON.stringify({ report, rows }) + "\n");
}
main().catch(() => { process.stderr.write('{"error":"INVALID_DEVELOPMENT_DATA"}\n'); process.exitCode = 1; });
