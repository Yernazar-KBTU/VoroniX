import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The business a piece of work belongs to. A signed-in request, a messenger
 * webhook, a Telegram update or a reminder run each runs for exactly one
 * business, and the database pool points every query at that business's
 * schema. Code that runs without one only sees the shared public tables.
 */
export interface Tenant {
  /** businesses.business_id */
  id: string;
  /** Postgres schema with this business's CRM tables: t_<id without dashes>. */
  schema: string;
  name: string;
  /** IANA time zone. Visit times are wall-clock times in this zone. */
  timezone: string;
  /** ISO 4217 code, e.g. USD. */
  currency: string;
}

const store = new AsyncLocalStorage<Tenant>();
let fallback: Tenant | null = null;

/** The business of the current request or job. */
export function currentTenant(): Tenant | null {
  return store.getStore() ?? fallback;
}

export function requireTenant(): Tenant {
  const t = currentTenant();
  if (!t) throw new Error("No business is selected for this operation");
  return t;
}

/** Runs fn, and everything it starts, for one business. */
export function withTenant<T>(t: Tenant, fn: () => T): T {
  return store.run(t, fn);
}

/**
 * Business used when nothing else picked one. Only the test setup sets it,
 * so tests can call services directly. In production it stays empty and
 * such code fails instead of touching the wrong business.
 */
export function setFallbackTenant(t: Tenant | null): void {
  fallback = t;
}

const SCHEMA_RE = /^t_[0-9a-f]{32}$/;

export function schemaFor(businessId: string): string {
  const s = `t_${businessId.replace(/-/g, "").toLowerCase()}`;
  if (!SCHEMA_RE.test(s)) throw new Error(`Bad business id: ${businessId}`);
  return s;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
