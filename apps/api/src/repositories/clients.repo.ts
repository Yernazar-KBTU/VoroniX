import type { Db } from "../db/pool.js";
import type { Client, ClientChannel, Messenger } from "../domain/types.js";
import { currentTenant } from "../tenancy/context.js";

const COLS = `client_id AS id, display_name, COALESCE(phone, '') AS phone, notes,
  to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at`;

export async function listClients(db: Db): Promise<Client[]> {
  return (await db.query<Client>(`SELECT ${COLS} FROM clients ORDER BY client_id`)).rows;
}

export async function getClient(db: Db, id: string): Promise<Client | null> {
  return (await db.query<Client>(`SELECT ${COLS} FROM clients WHERE client_id = $1`, [id])).rows[0] ?? null;
}

/**
 * Stores phones in one format so the UNIQUE constraint catches duplicates.
 * Kazakhstan numbers of a tenge business keep the "+7 700 123 4567" form;
 * numbers typed with "+" or "00" become "+<digits>"; local numbers elsewhere
 * keep their digits, because the country code is not known for sure.
 */
export function normalizePhone(phone: string | null | undefined, currency = currentTenant()?.currency ?? "KZT"): string | null {
  const raw = String(phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const kz = currency === "KZT" && (digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits)));
  if (kz) {
    const ten = digits.slice(-10);
    return `+7 ${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  }
  if (raw.startsWith("+")) return `+${digits}`;
  if (raw.startsWith("00")) return `+${digits.slice(2)}`;
  return digits;
}

export async function createClient(db: Db, c: { display_name: string; phone?: string; notes?: string }): Promise<Client> {
  const { rows } = await db.query<Client>(
    `INSERT INTO clients (display_name, phone, notes) VALUES ($1, $2, $3) RETURNING ${COLS}`,
    [c.display_name.trim().slice(0, 50), normalizePhone(c.phone), c.notes ?? ""],
  );
  return rows[0];
}

export async function updateClient(db: Db, id: string, c: { display_name?: string; phone?: string; notes?: string }): Promise<Client | null> {
  const { rows } = await db.query<Client>(
    `UPDATE clients SET display_name = COALESCE($2, display_name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       notes = COALESCE($5, notes)
     WHERE client_id = $1 RETURNING ${COLS}`,
    [id, c.display_name?.trim().slice(0, 50) ?? null, c.phone !== undefined, normalizePhone(c.phone), c.notes ?? null],
  );
  return rows[0] ?? null;
}

export async function findClientByPhone(db: Db, phone: string): Promise<Client | null> {
  const p = normalizePhone(phone);
  if (!p) return null;
  return (await db.query<Client>(`SELECT ${COLS} FROM clients WHERE phone = $1`, [p])).rows[0] ?? null;
}

const CH_COLS = `channel_id AS id, client_id, messenger, external_user_id`;

export async function listChannels(db: Db): Promise<ClientChannel[]> {
  return (await db.query<ClientChannel>(`SELECT ${CH_COLS} FROM client_channels ORDER BY channel_id`)).rows;
}

export async function findChannel(db: Db, messenger: Messenger, externalUserId: string): Promise<ClientChannel | null> {
  return (
    (await db.query<ClientChannel>(`SELECT ${CH_COLS} FROM client_channels WHERE messenger = $1 AND external_user_id = $2`, [messenger, externalUserId]))
      .rows[0] ?? null
  );
}

export async function addChannel(db: Db, clientId: string, messenger: Messenger, externalUserId: string): Promise<void> {
  await db.query(
    `INSERT INTO client_channels (client_id, messenger, external_user_id) VALUES ($1, $2, $3)
     ON CONFLICT (messenger, external_user_id) DO NOTHING`,
    [clientId, messenger, externalUserId],
  );
}
