import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "v1";

/** True for values written by this module; used to migrate legacy plaintext rows. */
export function isEncryptedIntegrationSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

/**
 * 64 hex characters are used as the 32 key bytes, as before. Any other value of at least 32
 * characters (for example a generated secret in another encoding) is turned into 32 bytes with
 * SHA-256, so a generated value works too. Keep the same value: changing it makes saved
 * credentials unreadable.
 */
export function integrationKeyFrom(value: string | undefined): Buffer {
  if (value && /^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (value && value.trim().length >= 32) return createHash("sha256").update(value.trim(), "utf8").digest();
  throw new Error("INTEGRATION_ENCRYPTION_KEY must be set: 64 hex characters (openssl rand -hex 32) or any random string of at least 32 characters");
}

function encryptionKey(): Buffer {
  return integrationKeyFrom(process.env.INTEGRATION_ENCRYPTION_KEY);
}

/** Encrypts an integration credential into a versioned, URL-safe string. */
export function encryptIntegrationSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypts a value produced by encryptIntegrationSecret. */
export function decryptIntegrationSecret(payload: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = payload.split(".");
  if (version !== PREFIX || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra.length) {
    throw new Error("Invalid encrypted integration secret format");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted integration secret format");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}
