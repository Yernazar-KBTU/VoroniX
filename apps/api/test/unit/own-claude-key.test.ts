import { afterEach, describe, expect, it, vi } from "vitest";

// runner.ts picks its engines from the environment when it is imported.
describe("a business's own Claude key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers with Claude even when our own VoroniX AI is set up", async () => {
    vi.resetModules();
    vi.stubEnv("VORONIX_AI_URL", "http://ai.test");
    vi.stubEnv("VORONIX_DATA_URL", "http://data.test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const runner = await import("../../src/ai/runner.js");
    const { withTenant } = await import("../../src/tenancy/context.js");
    const t = { id: "t-own-key", schema: "biz_t_own_key", name: "Test", currency: "KZT" } as never;
    expect(withTenant(t, () => runner.getEngine().name)).not.toMatch(/^claude:/);
    runner.setBusinessKey("t-own-key", "sk-ant-test");
    expect(withTenant(t, () => runner.getEngine().name)).toMatch(/^claude:/);
    runner.setBusinessKey("t-own-key", null);
    expect(withTenant(t, () => runner.getEngine().name)).not.toMatch(/^claude:/);
  });
});
