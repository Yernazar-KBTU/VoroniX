import type pg from "pg";
import { pool, type Db } from "../db/pool.js";
import { migrateBusinessSchema, scopeTo } from "../db/migrate.js";
import { isUuid, schemaFor, withTenant, type Tenant } from "./context.js";

export interface BusinessRow {
  id: string;
  name: string;
  country: string | null;
  timezone: string;
  currency: string;
}

const COLS = `business_id AS id, name, country, timezone, currency`;

export const tenantOf = (b: BusinessRow): Tenant => ({ id: b.id, schema: schemaFor(b.id), name: b.name, timezone: b.timezone, currency: b.currency });

export async function findTenant(id: string, db: Db = pool): Promise<Tenant | null> {
  if (!isUuid(id)) return null;
  const row = (await db.query<BusinessRow>(`SELECT ${COLS} FROM public.businesses WHERE business_id = $1`, [id])).rows[0];
  return row ? tenantOf(row) : null;
}

export async function listTenants(db: Db = pool): Promise<Tenant[]> {
  return (await db.query<BusinessRow>(`SELECT ${COLS} FROM public.businesses ORDER BY created_at`)).rows.map(tenantOf);
}

/** Runs fn once for every business, one after another, each in its own context. Errors of one business do not stop the others. */
export async function forEachTenant(fn: (t: Tenant) => Promise<void>, onError: (t: Tenant, err: unknown) => void): Promise<void> {
  for (const t of await listTenants()) {
    try {
      await withTenant(t, () => fn(t));
    } catch (err) {
      onError(t, err);
    }
  }
}

/** Postgres knows fewer zone names than some browsers; only accept ones it can use. */
export async function isKnownTimezone(tz: string, db: Db = pool): Promise<boolean> {
  return (await db.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [tz])).rowCount === 1;
}

export interface NewBusinessProfile {
  name: string;
  type: string;
  languages: string;
}

/**
 * Builds the CRM schema of a new business and its settings row. Runs inside
 * the sign-up transaction, so a failed sign-up leaves nothing behind.
 */
export async function provisionTenant(c: pg.PoolClient, t: Tenant, p: NewBusinessProfile): Promise<void> {
  await migrateBusinessSchema(c, t.schema);
  await scopeTo(c, t.schema);
  await c.query(
    `INSERT INTO business_settings (id, name, business_type, languages, tone, staff_label, service_label, prepay_percent, prepay_min_price_kzt, autopilot)
     VALUES (1, $1, $2, $3, 'Warm, short and polite. Use the client''s language.', 'Specialist', 'Service', 0, 0, TRUE)`,
    [p.name, p.type, p.languages],
  );
}

/**
 * Adds a business and builds its schema, on the caller's transaction. Used
 * by sign-up and by the demo seed.
 */
export async function openBusiness(
  c: pg.PoolClient,
  b: { name: string; country?: string | null; timezone: string; currency: string; type?: string; languages?: string },
): Promise<{ business: BusinessRow; tenant: Tenant }> {
  const business = (
    await c.query<BusinessRow>(
      `INSERT INTO public.businesses (name, country, timezone, currency) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
      [b.name, b.country ?? null, b.timezone, b.currency],
    )
  ).rows[0];
  const tenant = tenantOf(business);
  await provisionTenant(c, tenant, { name: b.name, type: b.type || "Appointment-based business", languages: b.languages || "English" });
  return { business, tenant };
}

/** Keeps the shared business row in step when the owner renames the business in Settings. */
export async function renameBusiness(t: Tenant, name: string, db: Db = pool): Promise<void> {
  await db.query(`UPDATE public.businesses SET name = $2 WHERE business_id = $1 AND name <> $2`, [t.id, name]);
}
