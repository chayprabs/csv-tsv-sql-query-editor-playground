import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "components/__tests__/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["tests/e2e/**"],
    fileParallelism: false,
    hookTimeout: 120_000,
    pool: "threads",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/__tests__/**"],
      thresholds: {
        branches: 70,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
