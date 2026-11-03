import { migrate, resetDatabase } from "../../src/db/migrate.js";
import { pool } from "../../src/db/pool.js";
import { createDemoBusiness } from "../../src/db/seed.js";
import { addDays, ymd } from "../../src/lib/time.js";
import { setFallbackTenant, type Tenant } from "../../src/tenancy/context.js";

export let demo: Tenant;

/**
 * Empty database, all migrations, and the demo business with demo data. The
 * demo business becomes the default one, so tests can call routes and
 * services without signing in. Every test file starts from here.
 */
export async function freshDb() {
  setFallbackTenant(null);
  await resetDatabase(pool);
  await migrate(pool);
  const { tenant, counts } = await createDemoBusiness(pool);
  demo = tenant;
  setFallbackTenant(tenant);
  return counts;
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
