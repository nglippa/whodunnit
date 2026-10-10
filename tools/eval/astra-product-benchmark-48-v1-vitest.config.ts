import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["tools/eval/astra-product-benchmark-48-v1.test.ts"] } });
