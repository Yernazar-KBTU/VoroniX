import { migrate } from "../../src/db/migrate.js";
import { pool } from "../../src/db/pool.js";
import { seedDemo } from "../../src/db/seed.js";
import { addDays, ymd } from "../../src/lib/time.js";

/** Empty schema, all migrations, demo data. Every test file starts from here. */
export async function freshDb() {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  return seedDemo(pool);
}

/** A Wednesday about six weeks ahead: every master works, no demo bookings yet. */
export function quietWednesday(): string {
  let d = addDays(new Date(), 42);
  while (d.getDay() !== 3) d = addDays(d, 1);
  return ymd(d);
}

/** Polls until the condition holds, for work the API finishes after it responds. */
export async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}
