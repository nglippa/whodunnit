import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tools/editorial-intelligence/*.test.ts"], environment: "node" } });
