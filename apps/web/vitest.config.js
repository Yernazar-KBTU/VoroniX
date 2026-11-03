import { defineConfig } from "vitest/config";

// Unit tests for the browser code that has no DOM: the import readers and parsers.
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.js"] },
});
