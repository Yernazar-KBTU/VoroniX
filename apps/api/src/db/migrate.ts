import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { pool, tx } from "./pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(here, "../../../../db/migrations");
/** Shared tables in public: businesses, users, sessions. */
export const CORE_DIR = path.join(MIGRATIONS_DIR, "core");
/** CRM tables, applied to the schema of every business. */
export const TENANT_DIR = path.join(MIGRATIONS_DIR, "tenant");

const SCHEMA_RE = /^t_[0-9a-f]{32}$/;
const cache = new Map<string, string>();

async function sqlFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
}

async function load(dir: string, file: string): Promise<string> {
  const p = path.join(dir, file);
  let sql = cache.get(p);
  if (sql === undefined) {
    sql = await readFile(p, "utf8");
    cache.set(p, sql);
  }
  return sql;
}

/** Points the rest of this transaction at one business schema. */
export async function scopeTo(c: pg.PoolClient, schema: string): Promise<void> {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Bad business schema name: ${schema}`);
  await c.query(`SELECT set_config('search_path', $1, true)`, [`"${schema}", public`]);
}

/**
 * Creates or updates the CRM tables of one business inside the caller's
 * transaction: every db/migrations/tenant file not yet recorded in that
 * schema's tenant_migrations, in file-name order.
 */
export async function migrateBusinessSchema(c: pg.PoolClient, schema: string): Promise<string[]> {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Bad business schema name: ${schema}`);
  await c.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await scopeTo(c, schema);
  await c.query(`CREATE TABLE IF NOT EXISTS "${schema}".tenant_migrations (
    version    VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
  )`);
  const done = new Set((await c.query<{ version: string }>(`SELECT version FROM "${schema}".tenant_migrations`)).rows.map((r) => r.version));
  const applied: string[] = [];
  for (const file of await sqlFiles(TENANT_DIR)) {
    if (done.has(file)) continue;
    try {
      await c.query(await load(TENANT_DIR, file));
    } catch (err) {
      throw new Error(`Migration tenant/${file} failed for ${schema}: ${(err as Error).message}`);
    }
    await c.query(`INSERT INTO "${schema}".tenant_migrations (version) VALUES ($1)`, [file]);
    applied.push(file);
  }
  if (applied.length) await grantConsole(c, schema);
  return applied;
}

/**
 * Lets the read-only SQL console role read this business's tables, except
 * the ones that hold secrets. Skipped when the role could not be created.
 */
async function grantConsole(c: pg.PoolClient, schema: string): Promise<void> {
  if (!(await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'crm_readonly'`)).rowCount) return;
  await c.query(`GRANT USAGE ON SCHEMA "${schema}" TO crm_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO crm_readonly;
    REVOKE ALL ON "${schema}".integrations, "${schema}".master_accounts, "${schema}".tenant_migrations, "${schema}".audit_log FROM crm_readonly;`);
}

async function migrateCore(db: pg.Pool, log: (m: string) => void): Promise<string[]> {
  const legacy = (await db.query<{ legacy: boolean }>(`SELECT to_regclass('public.clients') IS NOT NULL AS legacy`)).rows[0].legacy;
  if (legacy)
    throw new Error(
      "This database still has the old single-business layout (CRM tables in public). " +
        "Back up anything you need, run `npm run db:reset`, then sign up again: every business now gets its own schema.",
    );
  await db.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query<{ version: string }>("SELECT version FROM public.schema_migrations")).rows.map((r) => r.version));
  const applied: string[] = [];
  for (const file of await sqlFiles(CORE_DIR)) {
    if (done.has(file)) continue;
    const sql = await load(CORE_DIR, file);
    await tx(async (c) => {
      try {
        await c.query(sql);
      } catch (err) {
        throw new Error(`Migration core/${file} failed: ${(err as Error).message}`);
      }
      await c.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [file]);
    }, db);
    applied.push(`core/${file}`);
    log(`applied core/${file}`);
  }
  return applied;
}

/**
 * Applies pending shared migrations, then brings the schema of every business
 * up to date, each business in its own transaction.
 */
export async function migrate(db: pg.Pool = pool, log: (m: string) => void = () => {}): Promise<string[]> {
  const applied = await migrateCore(db, log);
  const { rows } = await db.query<{ business_schema: string }>(`SELECT business_schema FROM public.businesses ORDER BY created_at`);
  for (const { business_schema } of rows) {
    const done = await tx((c) => migrateBusinessSchema(c, business_schema), db);
    for (const f of done) {
      applied.push(`${business_schema}/${f}`);
      log(`applied tenant/${f} to ${business_schema}`);
    }
  }
  return applied;
}

/** Drops every business schema and the shared tables. For local development and tests only. */
export async function resetDatabase(db: pg.Pool = pool): Promise<void> {
  const { rows } = await db.query<{ nspname: string }>(`SELECT nspname FROM pg_namespace WHERE nspname ~ '^t_[0-9a-f]{32}$'`);
  for (const { nspname } of rows) await db.query(`DROP SCHEMA "${nspname}" CASCADE`);
  await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate(pool, console.log)
    .then((a) => console.log(a.length ? `${a.length} migration(s) applied` : "database is up to date"))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
