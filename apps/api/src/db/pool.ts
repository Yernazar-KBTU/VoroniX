import pg from "pg";
import { config } from "../config.js";

// TIMESTAMP (without time zone) holds local salon time. Keep it as the
// "YYYY-MM-DD HH:MM" string the rest of the app uses instead of a Date that
// would be shifted by the server time zone.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => v.slice(0, 16));
// DATE as plain "YYYY-MM-DD".
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// BIGINT ids and COUNT(*) fit into a JS number at this scale.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export type Db = pg.Pool | pg.PoolClient;

export function createPool(connectionString = config.DATABASE_URL): pg.Pool {
  // Session time zone = salon time zone, so now(), ::date and to_char agree with the app.
  return new pg.Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000, options: `-c timezone=${config.TZ}` });
}

export const pool = createPool();

/** Runs fn inside one transaction and commits, or rolls back on any error. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, db: pg.Pool = pool): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
