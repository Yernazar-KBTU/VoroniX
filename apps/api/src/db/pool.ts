import pg from "pg";
import { config } from "../config.js";
import { currentTenant } from "../tenancy/context.js";

// TIMESTAMP (without time zone) holds local business time. Keep it as the
// "YYYY-MM-DD HH:MM" string the rest of the app uses instead of a Date that
// would be shifted by the server time zone.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => v.slice(0, 16));
// DATE as plain "YYYY-MM-DD".
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// BIGINT ids and COUNT(*) fit into a JS number at this scale.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export type Db = pg.Pool | pg.PoolClient;

/** What each pooled connection is currently set to, so it is only changed when needed. */
const scopeOf = new WeakMap<pg.PoolClient, string>();

/**
 * The search_path and time zone for the business of the current request:
 * its own schema first, then public. Without a business only public is
 * visible, so CRM queries fail instead of reading the wrong data.
 */
function wantedScope(): { path: string; tz: string } {
  const t = currentTenant();
  return t ? { path: `"${t.schema}", public`, tz: t.timezone } : { path: "public", tz: "UTC" };
}

type ConnectCallback = (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void;

/**
 * A pool that points every connection at the business of the caller before
 * handing it out. pg's Pool.query() also checks out through connect(), so
 * plain pool.query() calls are covered too.
 */
class ScopedPool extends pg.Pool {
  connect(): Promise<pg.PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const want = wantedScope(); // read now, while we are still in the caller's context
    const key = `${want.path}|${want.tz}`;
    const ready = (super.connect() as Promise<pg.PoolClient>).then(async (client) => {
      if (scopeOf.get(client) === key) return client;
      try {
        await client.query("SELECT set_config('search_path', $1, false), set_config('timezone', $2, false)", [want.path, want.tz]);
      } catch (err) {
        client.release(err as Error);
        throw err;
      }
      scopeOf.set(client, key);
      return client;
    });
    if (!callback) return ready;
    ready.then(
      (c) => callback(undefined, c, (e) => c.release(e as Error | boolean | undefined)),
      (e) => callback(e as Error, undefined, () => {}),
    );
  }
}

export function createPool(connectionString = config.DATABASE_URL): pg.Pool {
  return new ScopedPool({ connectionString, max: 20, idleTimeoutMillis: 30_000 });
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
