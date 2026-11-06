// INTEGRATION_ENCRYPTION_KEY: 64 hex characters as before, or a generated secret in another format.
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret, integrationKeyFrom } from "../../src/integrations/encryption.js";

const saved = process.env.INTEGRATION_ENCRYPTION_KEY;
afterEach(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = saved;
});

describe("integration encryption key", () => {
  it("uses 64 hex characters as the key bytes, unchanged", () => {
    const hex = randomBytes(32).toString("hex");
    expect(integrationKeyFrom(hex).equals(Buffer.from(hex, "hex"))).toBe(true);
  });

  it("accepts a generated secret that is not hex (base64 style) and round-trips", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(integrationKeyFrom(process.env.INTEGRATION_ENCRYPTION_KEY)).toHaveLength(32);
    const box = encryptIntegrationSecret("123:telegram-token");
    expect(decryptIntegrationSecret(box)).toBe("123:telegram-token");
  });

  it("refuses a missing or short value", () => {
    expect(() => integrationKeyFrom(undefined)).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
    expect(() => integrationKeyFrom("short")).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });
});
