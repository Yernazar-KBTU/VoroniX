import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const LEGACY_PREFIX = "v1";
const KEYED_PREFIX = "v2";
const LEGACY_KEY_ID = "default";
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface IntegrationEncryptionEnv {
  INTEGRATION_ENCRYPTION_KEY?: string;
  INTEGRATION_ENCRYPTION_KEYS?: string;
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID?: string;
}

export interface IntegrationEncryptionConfig {
  keys: Map<string, Buffer>;
  activeKeyId: string;
  usesKeyring: boolean;
}

/** 64 hex characters mean exactly 32 bytes; other random strings are SHA-256 derived. */
export function integrationKeyFrom(value: string | undefined): Buffer {
  if (value && /^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (value && value.trim().length >= 32) return createHash("sha256").update(value.trim(), "utf8").digest();
  throw new Error("Set INTEGRATION_ENCRYPTION_KEY or INTEGRATION_ENCRYPTION_KEYS; key values must be 64 hex characters or random strings of at least 32 characters");
}

/** Parses the legacy single-key setup or a keyring used during/after rotation. */
export function integrationEncryptionConfigFrom(env: IntegrationEncryptionEnv): IntegrationEncryptionConfig {
  const keys = new Map<string, Buffer>();
  const keyringValue = env.INTEGRATION_ENCRYPTION_KEYS?.trim() || undefined;
  const legacyValue = env.INTEGRATION_ENCRYPTION_KEY?.trim() || undefined;
  const activeValue = env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID?.trim() || undefined;
  const usesKeyring = !!keyringValue;

  if (keyringValue) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keyringValue);
    } catch {
      throw new Error("INTEGRATION_ENCRYPTION_KEYS must be a JSON object mapping key IDs to key values");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("INTEGRATION_ENCRYPTION_KEYS must be a JSON object mapping key IDs to key values");
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (!KEY_ID_RE.test(id) || typeof value !== "string") throw new Error("Invalid integration encryption keyring entry");
      keys.set(id, integrationKeyFrom(value));
    }
    if (!keys.size) throw new Error("INTEGRATION_ENCRYPTION_KEYS must contain at least one key");
  }

  if (legacyValue) {
    const legacy = integrationKeyFrom(legacyValue);
    const ringDefault = keys.get(LEGACY_KEY_ID);
    if (ringDefault && !ringDefault.equals(legacy)) {
      throw new Error("INTEGRATION_ENCRYPTION_KEY conflicts with keyring entry 'default'; remove the legacy variable after configuring the keyring");
    }
    if (!ringDefault) keys.set(LEGACY_KEY_ID, legacy);
  }

  const activeKeyId = activeValue ?? LEGACY_KEY_ID;
  if (!KEY_ID_RE.test(activeKeyId)) throw new Error("INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID contains an invalid key ID");
  if (keys.size && !keys.has(activeKeyId)) throw new Error(`Active integration encryption key '${activeKeyId}' is not present in the keyring`);
  if (!usesKeyring && activeKeyId !== LEGACY_KEY_ID) {
    throw new Error("INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID requires INTEGRATION_ENCRYPTION_KEYS");
  }

  return { keys, activeKeyId, usesKeyring };
}

function config(): IntegrationEncryptionConfig {
  return integrationEncryptionConfigFrom(process.env);
}

export function activeIntegrationKeyId(): string {
  return config().activeKeyId;
}

/** Recognizes both the original payload and the key-ID format. */
export function isEncryptedIntegrationSecret(value: string): boolean {
  return value.startsWith(`${LEGACY_PREFIX}.`) || value.startsWith(`${KEYED_PREFIX}.`);
}

/** Returns null for legacy plaintext rows; throws if an encrypted envelope is malformed. */
export function integrationSecretKeyId(payload: string): string | null {
  const parts = payload.split(".");
  if (parts[0] === LEGACY_PREFIX && parts.length === 4) return LEGACY_KEY_ID;
  if (parts[0] === KEYED_PREFIX && parts.length === 5 && KEY_ID_RE.test(parts[1])) return parts[1];
  if (parts[0] === LEGACY_PREFIX || parts[0] === KEYED_PREFIX) throw new Error("Invalid encrypted integration secret format");
  return null;
}

function keyFor(id: string): Buffer {
  const key = config().keys.get(id);
  if (!key) throw new Error(`Integration encryption key '${id}' is not configured`);
  return key;
}

/** New writes use v1 until a keyring is explicitly enabled, then v2 carries a key ID. */
export function encryptIntegrationSecret(plaintext: string): string {
  const cfg = config();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFor(cfg.activeKeyId), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const fields = [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")];
  return cfg.usesKeyring ? [KEYED_PREFIX, cfg.activeKeyId, ...fields].join(".") : [LEGACY_PREFIX, ...fields].join(".");
}

/** Decrypts old v1 values with the default key and v2 values with their identified key. */
export function decryptIntegrationSecret(payload: string): string {
  const parts = payload.split(".");
  const version = parts[0];
  const keyId = integrationSecretKeyId(payload);
  if (!keyId) throw new Error("Invalid encrypted integration secret format");

  const [encodedIv, encodedTag, encodedCiphertext] = version === LEGACY_PREFIX ? parts.slice(1) : parts.slice(2);
  if (!encodedIv || !encodedTag || encodedCiphertext === undefined || !/^[A-Za-z0-9_-]*$/.test(encodedIv) || !/^[A-Za-z0-9_-]+$/.test(encodedTag) || !/^[A-Za-z0-9_-]*$/.test(encodedCiphertext)) {
    throw new Error("Invalid encrypted integration secret format");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Invalid encrypted integration secret format");

  const decipher = createDecipheriv(ALGORITHM, keyFor(keyId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}
