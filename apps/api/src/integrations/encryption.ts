import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "v1";

/** True for values written by this module; used to migrate legacy plaintext rows. */
export function isEncryptedIntegrationSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

function encryptionKey(): Buffer {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be set to 32 bytes encoded as 64 hex characters");
  }
  return Buffer.from(value, "hex");
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
