import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { config } from "../config.js";
import { pool, tx } from "../db/pool.js";
import { conflict, HttpError } from "../lib/errors.js";
import * as repo from "./auth.repo.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password.js";

export const COOKIE = "vx_session";
const LONG_DAYS = 30;
const SHORT_DAYS = 1;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const normEmail = (e: string) => e.trim().toLowerCase();

/** Reads one cookie from the Cookie header without a cookie-parser dependency. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function startSession(res: Response, userId: string, remember: boolean, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const days = remember ? LONG_DAYS : SHORT_DAYS;
  await repo.insertSession(pool, { token_hash: sha256(token), user_id: userId, days, user_agent: userAgent });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? days * 86_400_000 : undefined, // without "remember me" the cookie ends with the browser
  });
}

export async function register(
  res: Response,
  input: { business_name: string; full_name: string; email: string; password: string; country?: string; timezone: string; currency: string },
  userAgent: string,
) {
  const email = normEmail(input.email);
  if (await repo.findUserByEmail(pool, email)) throw conflict("An account with this email already exists. Sign in instead.", "email_taken");
  const password_hash = await hashPassword(input.password);
  const { user, business } = await tx(async (c) => {
    const business = await repo.createBusiness(c, { name: input.business_name.trim(), country: input.country, timezone: input.timezone, currency: input.currency });
    const user = await repo.createUser(c, { business_id: business.id, email, full_name: input.full_name.trim(), password_hash, role: "owner" });
    return { user, business };
  });
  await startSession(res, user.id, true, userAgent);
  return { user, business };
}

// Simple in-memory brake on password guessing: 10 failed tries per email and
// IP in 15 minutes. Enough for one server; move to Redis when scaling out.
const failures = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;

export async function login(res: Response, input: { email: string; password: string; remember: boolean }, ip: string, userAgent: string) {
  const email = normEmail(input.email);
  const key = `${ip}|${email}`;
  const f = failures.get(key);
  if (f && f.until > Date.now() && f.n >= MAX_FAILS) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.", "too_many_attempts");

  const user = await repo.findUserByEmail(pool, email);
  const ok = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW_MS };
    failures.set(key, { n: cur.n + 1, until: cur.until });
    throw new HttpError(401, "Email or password is incorrect.", "bad_credentials");
  }
  failures.delete(key);
  await repo.touchLogin(pool, user.id);
  await startSession(res, user.id, input.remember, userAgent);
  const { password_hash: _drop, ...safe } = user;
  return { user: safe, business: await repo.getBusiness(pool, user.business_id) };
}

export async function logout(res: Response, token: string | null) {
  if (token) await repo.deleteSession(pool, sha256(token));
  res.clearCookie(COOKIE, { path: "/" });
}

export async function currentUser(token: string | null): Promise<repo.User | null> {
  return token ? repo.userForSession(pool, sha256(token)) : null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: repo.User;
  }
}

/** Paths that work without signing in: health check, sign-in itself, messenger webhooks, the calendar feed. */
const PUBLIC = [/^\/api\/health$/, /^\/api\/auth\//, /^\/api\/channels\//, /^\/api\/integrations\/calendar\.ics$/];

/** Every other /api route needs a live session. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!config.AUTH_REQUIRED || !req.path.startsWith("/api/") || PUBLIC.some((p) => p.test(req.path))) return next();
  try {
    const user = await currentUser(readCookie(req.headers.cookie, COOKIE));
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "Please sign in." });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
