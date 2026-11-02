import type { Db } from "../db/pool.js";

export interface Business {
  id: string;
  name: string;
  country: string | null;
  timezone: string;
  currency: string;
}
export interface User {
  id: string;
  business_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "staff";
}

const BIZ = `business_id AS id, name, country, timezone, currency`;
const USER = `user_id AS id, business_id, email, full_name, role`;

export async function createBusiness(db: Db, b: { name: string; country?: string | null; timezone: string; currency: string }): Promise<Business> {
  const { rows } = await db.query<Business>(
    `INSERT INTO businesses (name, country, timezone, currency) VALUES ($1, $2, $3, $4) RETURNING ${BIZ}`,
    [b.name, b.country ?? null, b.timezone, b.currency],
  );
  return rows[0];
}

export async function getBusiness(db: Db, id: string): Promise<Business | null> {
  return (await db.query<Business>(`SELECT ${BIZ} FROM businesses WHERE business_id = $1`, [id])).rows[0] ?? null;
}

export async function createUser(db: Db, u: { business_id: string; email: string; full_name: string; password_hash: string; role: User["role"] }): Promise<User> {
  const { rows } = await db.query<User>(
    `INSERT INTO users (business_id, email, full_name, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING ${USER}`,
    [u.business_id, u.email, u.full_name, u.password_hash, u.role],
  );
  return rows[0];
}

export async function findUserByEmail(db: Db, email: string): Promise<(User & { password_hash: string }) | null> {
  return (await db.query<User & { password_hash: string }>(`SELECT ${USER}, password_hash FROM users WHERE email = $1`, [email])).rows[0] ?? null;
}

export async function touchLogin(db: Db, userId: string): Promise<void> {
  await db.query(`UPDATE users SET last_login_at = now() WHERE user_id = $1`, [userId]);
}

export async function insertSession(db: Db, s: { token_hash: string; user_id: string; days: number; user_agent: string }): Promise<void> {
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [s.token_hash, s.user_id, s.days, s.user_agent.slice(0, 200)],
  );
}

/** The user of a live session, or null when the token is unknown or expired. */
export async function userForSession(db: Db, tokenHash: string): Promise<User | null> {
  return (
    await db.query<User>(
      `SELECT u.user_id AS id, u.business_id, u.email, u.full_name, u.role
         FROM sessions s JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    )
  ).rows[0] ?? null;
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1 OR expires_at < now()`, [tokenHash]);
}
