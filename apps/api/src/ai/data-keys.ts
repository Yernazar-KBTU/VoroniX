// Keys of the VoroniX data server (format vxd_<id>_<secret>, the database keeps
// only a SHA-256 hash, same as the data server's own key tool). The CRM makes
// one for each business it sends to VoroniX AI, and one for the AI site link.
// A new key replaces the older one with the same label.
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import type { Tenant } from "../tenancy/context.js";

const cache = new Map<string, string>();

export async function dataKey(t: Tenant, label: "VoroniX CRM" | "VoroniX AI site" = "VoroniX CRM", fresh = false): Promise<string> {
  const ck = `${t.id}:${label}`;
  const hit = cache.get(ck);
  if (hit && !fresh) return hit;
  const keyId = randomBytes(8).toString("hex").slice(0, 12);
  const secret = randomBytes(24).toString("base64url");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`UPDATE public.ai_api_keys SET revoked_at = now() WHERE business_id = $1 AND label = $2 AND revoked_at IS NULL`, [t.id, label]);
    await c.query(`INSERT INTO public.ai_api_keys (key_id, business_id, secret_hash, label) VALUES ($1, $2, $3, $4)`, [keyId, t.id, createHash("sha256").update(secret).digest("hex"), label]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    if ((e as { code?: string }).code === "42P01") throw new Error("the VoroniX data server has not prepared the database yet (start it first)");
    throw e;
  } finally {
    c.release();
  }
  const key = `vxd_${keyId}_${secret}`;
  cache.set(ck, key);
  return key;
}
