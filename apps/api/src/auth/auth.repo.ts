import type { Db } from "../db/pool.js";
import type { BusinessRow } from "../tenancy/tenants.js";

// Shared tables are always written as public.<table>: during sign-up the same
// transaction also works inside the new business schema.

export type Business = BusinessRow;
export interface User {
  id: string;
  business_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "staff";
}
export type UserWithSecrets = User & { password_hash: string | null; google_sub: string | null; email_verified_at: Date | null };

const BIZ = `b.business_id AS id, b.name, b.country, b.timezone, b.currency`;
const USER = `u.user_id AS id, u.business_id, u.email, u.full_name, u.role`;

export async function getBusiness(db: Db, id: string): Promise<Business | null> {
  return (await db.query<Business>(`SELECT ${BIZ} FROM public.businesses b WHERE b.business_id = $1`, [id])).rows[0] ?? null;
}

export async function createUser(
  db: Db,
  u: { business_id: string; email: string; full_name: string; password_hash: string | null; role: User["role"]; google_sub?: string | null; verified?: boolean },
): Promise<User> {
  const { rows } = await db.query<User>(
    `INSERT INTO public.users AS u (business_id, email, full_name, password_hash, role, google_sub, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::boolean THEN now() END) RETURNING ${USER}`,
    [u.business_id, u.email, u.full_name, u.password_hash, u.role, u.google_sub ?? null, u.verified ?? false],
  );
  return rows[0];
}

export async function findUserByEmail(db: Db, email: string): Promise<UserWithSecrets | null> {
  return (
    (await db.query<UserWithSecrets>(`SELECT ${USER}, u.password_hash, u.google_sub, u.email_verified_at FROM public.users u WHERE u.email = $1`, [email])).rows[0] ?? null
  );
}

export async function findUserByGoogle(db: Db, sub: string): Promise<User | null> {
  return (await db.query<User>(`SELECT ${USER} FROM public.users u WHERE u.google_sub = $1`, [sub])).rows[0] ?? null;
}

/**
 * Links a Google account to an existing user. When the email was never
 * proven, a password someone else may have set for it is dropped and their
 * sessions end: the Google sign-in is the first proof of ownership.
 */
export async function linkGoogle(db: Db, userId: string, sub: string, wasVerified: boolean): Promise<void> {
  if (!wasVerified) await db.query(`DELETE FROM public.sessions WHERE user_id = $1`, [userId]);
  await db.query(
    `UPDATE public.users SET google_sub = $2, email_verified_at = COALESCE(email_verified_at, now()),
            password_hash = CASE WHEN $3::boolean THEN password_hash END
      WHERE user_id = $1`,
    [userId, sub, wasVerified],
  );
}

export async function setPassword(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.query(`UPDATE public.users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE user_id = $1`, [userId, passwordHash]);
}

export async function touchLogin(db: Db, userId: string): Promise<void> {
  await db.query(`UPDATE public.users SET last_login_at = now() WHERE user_id = $1`, [userId]);
}

export async function insertSession(db: Db, s: { token_hash: string; user_id: string; days: number; user_agent: string }): Promise<void> {
  await db.query(
    `INSERT INTO public.sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [s.token_hash, s.user_id, s.days, s.user_agent.slice(0, 200)],
  );
}

/** The user and business of a live session, or null when the token is unknown or expired. */
export async function sessionOwner(db: Db, tokenHash: string): Promise<{ user: User; business: Business } | null> {
  const row = (
    await db.query<User & { biz: Business }>(
      `SELECT ${USER}, json_build_object('id', b.business_id, 'name', b.name, 'country', b.country, 'timezone', b.timezone, 'currency', b.currency) AS biz
         FROM public.sessions s
         JOIN public.users u ON u.user_id = s.user_id
         JOIN public.businesses b ON b.business_id = u.business_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    )
  ).rows[0];
  if (!row) return null;
  const { biz, ...user } = row;
  return { user, business: biz };
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.query(`DELETE FROM public.sessions WHERE token_hash = $1 OR expires_at < now()`, [tokenHash]);
}

export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.query(`DELETE FROM public.sessions WHERE user_id = $1`, [userId]);
}

/* password reset links */

export async function insertReset(db: Db, tokenHash: string, userId: string, minutes: number): Promise<void> {
  await db.query(
    `INSERT INTO public.password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [tokenHash, userId, minutes],
  );
}

/** How many reset links this user got in the last hour, to stop mail flooding. */
export async function recentResets(db: Db, userId: string): Promise<number> {
  return (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM public.password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'`, [userId])).rows[0].n;
}

/** Marks a live, unused link as used and returns its user, or null. */
export async function useReset(db: Db, tokenHash: string): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    `UPDATE public.password_resets SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

export async function resetIsLive(db: Db, tokenHash: string): Promise<boolean> {
  return (await db.query(`SELECT 1 FROM public.password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`, [tokenHash])).rowCount === 1;
}
