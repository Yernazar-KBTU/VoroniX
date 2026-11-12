import type { Db } from "../db/pool.js";
import { activeIntegrationKeyId, decryptIntegrationSecret, encryptIntegrationSecret, integrationSecretKeyId, isEncryptedIntegrationSecret } from "../integrations/encryption.js";

export interface IntegrationRow {
  provider: string;
  enabled: boolean;
  settings: Record<string, string>;
  secret: string | null;
  status: "off" | "connected" | "error";
  status_detail: string;
  checked_at: string | null;
  updated_at: string;
}

const COLS = `provider, enabled, settings, secret, status, status_detail, checked_at, updated_at`;

export async function listIntegrations(db: Db): Promise<IntegrationRow[]> {
  const rows = (await db.query<IntegrationRow>(`SELECT ${COLS} FROM integrations ORDER BY provider`)).rows;
  return Promise.all(rows.map((row) => decodeAndMigrateSecret(db, row)));
}

export async function getIntegration(db: Db, provider: string): Promise<IntegrationRow | null> {
  const row = (await db.query<IntegrationRow>(`SELECT ${COLS} FROM integrations WHERE provider = $1`, [provider])).rows[0];
  return row ? decodeAndMigrateSecret(db, row) : null;
}

export async function saveIntegration(
  db: Db,
  row: Pick<IntegrationRow, "provider" | "enabled" | "settings" | "secret" | "status" | "status_detail">,
): Promise<IntegrationRow> {
  const { rows } = await db.query<IntegrationRow>(
    `INSERT INTO integrations (provider, enabled, settings, secret, status, status_detail, checked_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (provider) DO UPDATE SET enabled = $2, settings = $3, secret = $4, status = $5, status_detail = $6,
       checked_at = now(), updated_at = now()
     RETURNING ${COLS}`,
    [row.provider, row.enabled, JSON.stringify(row.settings), row.secret === null ? null : encryptIntegrationSecret(row.secret), row.status, row.status_detail],
  );
  return { ...rows[0], secret: row.secret };
}

export interface IntegrationSecretRotationResult {
  scanned: number;
  rotated: number;
  unchanged: number;
  changedDuringRotation: number;
}

/** Re-encrypts old-format or old-key secrets in the current tenant schema; safe to rerun. */
export async function rotateIntegrationSecrets(db: Db): Promise<IntegrationSecretRotationResult> {
  const rows = (await db.query<{ provider: string; secret: string | null }>(`SELECT provider, secret FROM integrations WHERE secret IS NOT NULL ORDER BY provider`)).rows;
  const activeKeyId = activeIntegrationKeyId();
  const result: IntegrationSecretRotationResult = { scanned: rows.length, rotated: 0, unchanged: 0, changedDuringRotation: 0 };

  for (const row of rows) {
    const oldKeyId = integrationSecretKeyId(row.secret!);
    if (oldKeyId === activeKeyId && isEncryptedIntegrationSecret(row.secret!)) {
      result.unchanged++;
      continue;
    }

    const plaintext = oldKeyId ? decryptIntegrationSecret(row.secret!) : row.secret!;
    const encrypted = encryptIntegrationSecret(plaintext);
    const updated = await db.query(
      `UPDATE integrations SET secret = $2, updated_at = now() WHERE provider = $1 AND secret = $3`,
      [row.provider, encrypted, row.secret],
    );
    if (updated.rowCount) result.rotated++;
    else result.changedDuringRotation++;
  }
  return result;
}

/** Decrypts stored credentials and upgrades legacy plaintext rows on first read. */
async function decodeAndMigrateSecret(db: Db, row: IntegrationRow): Promise<IntegrationRow> {
  if (row.secret === null) return row;
  if (isEncryptedIntegrationSecret(row.secret)) {
    return { ...row, secret: decryptIntegrationSecret(row.secret) };
  }

  const plaintext = row.secret;
  const encrypted = encryptIntegrationSecret(plaintext);
  await db.query(`UPDATE integrations SET secret = $2 WHERE provider = $1 AND secret = $3`, [row.provider, encrypted, plaintext]);
  return { ...row, secret: plaintext };
}

export async function deleteIntegration(db: Db, provider: string): Promise<void> {
  await db.query(`DELETE FROM integrations WHERE provider = $1`, [provider]);
}
