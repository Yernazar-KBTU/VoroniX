import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests share one test database, so files run one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    reporters: ["default", "json"],
    outputFile: { json: "../../reports/vitest-results.json" },
    env: {
      TZ: "Asia/Almaty",
      NODE_ENV: "test",
      AI_ENGINE: "offline",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://crm:crm@localhost:5432/crm_test",
    },
  },
});
