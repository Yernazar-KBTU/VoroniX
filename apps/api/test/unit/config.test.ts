import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads the environment once, when it is imported.
const tz = process.env.TZ;
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return (await import("../../src/config.js")).config;
}

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.TZ = tz;
  });

  it("takes the public address from Render when APP_URL is not set", async () => {
    const config = await load({ APP_URL: "", RENDER_EXTERNAL_URL: "https://voronix.onrender.com" });
    expect(config.APP_URL).toBe("https://voronix.onrender.com");
  });

  it("prefers APP_URL over the Render address", async () => {
    const config = await load({ APP_URL: "https://app.example.com/", RENDER_EXTERNAL_URL: "https://voronix.onrender.com" });
    expect(config.APP_URL).toBe("https://app.example.com");
  });

  it("treats empty values as not set", async () => {
    const config = await load({ SUPPORT_EMAIL: "", RENDER_EXTERNAL_URL: "" });
    expect(config.SUPPORT_EMAIL).toBeUndefined();
  });
});
