import { defineConfig } from "vitest/config";

// Tests that need no DOM: the import readers and parsers, and static checks of the public pages' HTML.
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.js"] },
});
