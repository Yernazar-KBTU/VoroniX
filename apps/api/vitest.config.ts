import { defineConfig } from "vitest/config";
import { randomBytes } from "node:crypto";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests share one test database, so files run one after another.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    reporters: ["default", "json"],
    outputFile: { json: "../../reports/vitest-results.json" },
    env: {
      TZ: "Asia/Almaty",
      NODE_ENV: "test",
      AI_ENGINE: "offline",
      AUTH_REQUIRED: "false",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://crm:crm@localhost:5432/crm_test",
      INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      INTEGRATION_ENCRYPTION_KEYS: "",
      INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID: "",
    },
  },
});
