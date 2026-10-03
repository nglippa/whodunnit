import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: { environment: "node", include: ["tools/eval/holdout-v3-runner.test.ts", "tools/eval/holdout-v3-generate.test.ts", "tools/eval/holdout-v3-stages.test.ts", "tools/eval/holdout-v3-blind.test.ts", "tools/eval/holdout-v3-reviews.test.ts", "tools/eval/holdout-v3-postreview.test.ts", "tools/eval/holdout-v3-audit.test.ts", "tools/eval/holdout-v3-supplemental.test.ts", "tools/eval/holdout-v3-finalize-audit.test.ts", "tools/eval/holdout-v3-report.test.ts"] },
});
