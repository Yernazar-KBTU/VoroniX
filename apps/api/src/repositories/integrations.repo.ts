import type { Db } from "../db/pool.js";

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
  return (await db.query<IntegrationRow>(`SELECT ${COLS} FROM integrations ORDER BY provider`)).rows;
}

export async function getIntegration(db: Db, provider: string): Promise<IntegrationRow | null> {
  return (await db.query<IntegrationRow>(`SELECT ${COLS} FROM integrations WHERE provider = $1`, [provider])).rows[0] ?? null;
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
    [row.provider, row.enabled, JSON.stringify(row.settings), row.secret, row.status, row.status_detail],
  );
  return rows[0];
}

export async function deleteIntegration(db: Db, provider: string): Promise<void> {
  await db.query(`DELETE FROM integrations WHERE provider = $1`, [provider]);
}
