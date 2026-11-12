// INTEGRATION_ENCRYPTION_KEY: 64 hex characters as before, or a generated secret in another format.
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret, integrationEncryptionConfigFrom, integrationKeyFrom } from "../../src/integrations/encryption.js";
import { rotateIntegrationSecrets } from "../../src/repositories/integrations.repo.js";
import type { Db } from "../../src/db/pool.js";

const saved = {
  INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY,
  INTEGRATION_ENCRYPTION_KEYS: process.env.INTEGRATION_ENCRYPTION_KEYS,
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID: process.env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID,
};
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

  it("decrypts a legacy value and writes with the active key during rotation", () => {
    const oldKey = randomBytes(32).toString("hex");
    const newKey = randomBytes(32).toString("base64");
    process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
    delete process.env.INTEGRATION_ENCRYPTION_KEYS;
    delete process.env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID;
    const legacy = encryptIntegrationSecret("legacy-token");

    process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({ default: oldKey, next: newKey });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID = "next";

    expect(decryptIntegrationSecret(legacy)).toBe("legacy-token");
    const rotated = encryptIntegrationSecret("new-token");
    expect(rotated.startsWith("v2.next.")).toBe(true);
    expect(decryptIntegrationSecret(rotated)).toBe("new-token");
  });

  it("rejects a keyring whose active key is missing", () => {
    expect(() => integrationEncryptionConfigFrom({ INTEGRATION_ENCRYPTION_KEYS: '{"old":"12345678901234567890123456789012"}', INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID: "new" })).toThrow(/not present/);
  });

  it("re-encrypts old database values and is safe to rerun", async () => {
    const oldKey = randomBytes(32).toString("hex");
    const newKey = randomBytes(32).toString("hex");
    process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
    delete process.env.INTEGRATION_ENCRYPTION_KEYS;
    delete process.env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID;
    let stored = encryptIntegrationSecret("database-token");
    const db = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.startsWith("SELECT provider, secret")) return { rows: [{ provider: "telegram", secret: stored }] };
        if (sql.startsWith("UPDATE integrations SET secret")) {
          if (stored === params[2]) {
            stored = params[1] as string;
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        }
        throw new Error("Unexpected query in key rotation test");
      },
    } as unknown as Db;

    process.env.INTEGRATION_ENCRYPTION_KEYS = JSON.stringify({ default: oldKey, next: newKey });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID = "next";
    const firstRun = await rotateIntegrationSecrets(db);
    const secondRun = await rotateIntegrationSecrets(db);

    expect(firstRun.rotated).toBe(1);
    expect(stored.startsWith("v2.next.")).toBe(true);
    expect(decryptIntegrationSecret(stored)).toBe("database-token");
    expect(secondRun.rotated).toBe(0);
    expect(secondRun.unchanged).toBe(1);
  });
});
