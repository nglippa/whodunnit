import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["tools/eval/post-v3-raw-runner.test.ts"] } });
