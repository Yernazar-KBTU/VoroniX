import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { config } from "../config.js";
import { pool, tx } from "../db/pool.js";
import { badRequest, conflict, HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { buttonMail, mailer } from "../lib/mailer.js";
import { withTenant } from "../tenancy/context.js";
import { isKnownTimezone, openBusiness, tenantOf } from "../tenancy/tenants.js";
import * as repo from "./auth.repo.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password.js";

export const COOKIE = "vx_session";
const LONG_DAYS = 30;
const SHORT_DAYS = 1;
const RESET_MINUTES = 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const normEmail = (e: string) => e.trim().toLowerCase();
const newToken = () => randomBytes(32).toString("base64url");

/** Reads one cookie from the Cookie header without a cookie-parser dependency. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Small in-memory brake for one server: at most `max` hits per key in 15 minutes. Move to Redis when scaling out. */
class Limiter {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(private max: number, private windowMs = 15 * 60_000) {}
  blocked(key: string): boolean {
    const h = this.hits.get(key);
    return !!h && h.until > Date.now() && h.n >= this.max;
  }
  hit(key: string): void {
    const h = this.hits.get(key);
    const cur = h && h.until > Date.now() ? h : { n: 0, until: Date.now() + this.windowMs };
    this.hits.set(key, { n: cur.n + 1, until: cur.until });
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= Date.now()) this.hits.delete(k);
  }
  clear(key: string): void {
    this.hits.delete(key);
  }
}
const loginFailures = new Limiter(10);
const resetRequests = new Limiter(5);

async function startSession(res: Response, userId: string, remember: boolean, userAgent: string) {
  const token = newToken();
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

export interface NewAccount {
  business_name: string;
  business_type?: string;
  full_name: string;
  email: string;
  password: string | null;
  google_sub?: string | null;
  country?: string;
  timezone: string;
  currency: string;
}

/** Creates the business, its schema and its owner in one transaction. */
export async function createAccount(input: NewAccount): Promise<{ user: repo.User; business: repo.Business }> {
  const email = normEmail(input.email);
  if (await repo.findUserByEmail(pool, email)) throw conflict("An account with this email already exists. Sign in instead.", "email_taken");
  if (!(await isKnownTimezone(input.timezone))) throw badRequest("This time zone is not supported. Pick another city in the same zone.");
  const password_hash = input.password ? await hashPassword(input.password) : null;
  return tx(async (c) => {
    const { business } = await openBusiness(c, {
      name: input.business_name.trim(),
      type: input.business_type?.trim(),
      country: input.country,
      timezone: input.timezone,
      currency: input.currency,
    });
    const user = await repo.createUser(c, {
      business_id: business.id,
      email,
      full_name: input.full_name.trim(),
      password_hash,
      role: "owner",
      google_sub: input.google_sub ?? null,
      verified: !!input.google_sub,
    });
    return { user, business };
  });
}

export async function register(res: Response, input: NewAccount & { password: string }, userAgent: string) {
  const out = await createAccount(input);
  await startSession(res, out.user.id, true, userAgent);
  logger.info({ business: out.business.id }, "business signed up");
  return out;
}

export async function login(res: Response, input: { email: string; password: string; remember: boolean }, ip: string, userAgent: string) {
  const email = normEmail(input.email);
  const key = `${ip}|${email}`;
  if (loginFailures.blocked(key)) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.", "too_many_attempts");

  const user = await repo.findUserByEmail(pool, email);
  const ok = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !ok) {
    loginFailures.hit(key);
    throw new HttpError(401, "Email or password is incorrect.", "bad_credentials");
  }
  loginFailures.clear(key);
  await repo.touchLogin(pool, user.id);
  await startSession(res, user.id, input.remember, userAgent);
  const { password_hash: _p, google_sub: _g, email_verified_at: _v, ...safe } = user;
  return { user: safe, business: await repo.getBusiness(pool, user.business_id) };
}

export async function logout(res: Response, token: string | null) {
  if (token) await repo.deleteSession(pool, sha256(token));
  res.clearCookie(COOKIE, { path: "/" });
}

export async function currentSession(token: string | null) {
  return token ? repo.sessionOwner(pool, sha256(token)) : null;
}

/* ---------------------------------------------------------------------------
 * Password reset by email. The answer is the same whether or not the address
 * has an account, so the form cannot be used to find out who is a customer.
 * ------------------------------------------------------------------------- */

export async function requestReset(emailRaw: string, ip: string): Promise<void> {
  const email = normEmail(emailRaw);
  if (resetRequests.blocked(ip)) throw new HttpError(429, "Too many requests. Try again in 15 minutes.", "too_many_attempts");
  resetRequests.hit(ip);
  const user = await repo.findUserByEmail(pool, email);
  if (!user || (await repo.recentResets(pool, user.id)) >= 3) return;
  const token = newToken();
  await repo.insertReset(pool, sha256(token), user.id, RESET_MINUTES);
  const url = `${config.APP_URL}/app#reset=${token}`;
  await mailer
    .send(
      buttonMail({
        to: user.email,
        subject: "Set a new VoroniX password",
        greeting: `Hi ${user.full_name.split(" ")[0]},`,
        lines: ["Someone asked to reset the password of your VoroniX account. If it was you, set a new password with the button below. The link works once, for one hour."],
        button: "Set a new password",
        url,
        footer: "If you did not ask for this, ignore this email: your password stays the same.",
      }),
    )
    .catch((err) => logger.error({ err }, "password reset email failed"));
}

export async function resetLinkIsLive(token: string): Promise<boolean> {
  return repo.resetIsLive(pool, sha256(token));
}

/** Sets the new password, signs out every other browser and signs this one in. */
export async function resetPassword(res: Response, token: string, password: string, userAgent: string) {
  const userId = await repo.useReset(pool, sha256(token));
  if (!userId) throw new HttpError(400, "This link has expired or was already used. Ask for a new one.", "reset_link_invalid");
  await repo.setPassword(pool, userId, await hashPassword(password));
  await repo.deleteUserSessions(pool, userId);
  await startSession(res, userId, true, userAgent);
  const r = await pool.query<{ business_id: string }>(`SELECT business_id FROM public.users WHERE user_id = $1`, [userId]);
  return { business: await repo.getBusiness(pool, r.rows[0].business_id) };
}

/* ---------------------------------------------------------------------------
 * "Continue with Google": OpenID Connect authorization code flow. Off until
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 * ------------------------------------------------------------------------- */

export const googleEnabled = () => !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
const OAUTH_COOKIE = "vx_oauth";
const redirectUri = () => `${config.APP_URL}/api/auth/google/callback`;

interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
}

/** Network call, swapped out in tests. */
export const googleDeps = {
  async exchange(code: string): Promise<{ id_token?: string }> {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID!,
        client_secret: config.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`Google answered ${r.status}`);
    return (await r.json()) as { id_token?: string };
  },
};

/** First step: remember a random state and nonce in a short cookie and send the browser to Google. */
export function googleStart(res: Response, prefs: { timezone?: string; currency?: string }): string {
  const state = newToken();
  const nonce = newToken();
  res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, nonce, ...prefs })).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax", // Google sends the browser back with a top-level GET, which carries Lax cookies
    secure: config.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 10 * 60_000,
  });
  const q = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/**
 * The ID token comes straight from Google's token endpoint over HTTPS in
 * exchange for our client secret, so its origin is already proven; we still
 * check issuer, audience, expiry and the nonce we sent.
 */
function readIdToken(idToken: string, nonce: string): GoogleClaims {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Malformed ID token");
  const c = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as GoogleClaims;
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("Wrong token issuer");
  if (c.aud !== config.GOOGLE_CLIENT_ID) throw new Error("Token is for another app");
  if (!c.exp || c.exp * 1000 < Date.now()) throw new Error("Token expired");
  if (c.nonce !== nonce) throw new Error("Nonce does not match");
  if (!c.sub) throw new Error("Token has no subject");
  return c;
}

/** Second step: Google sent the browser back. Signs in, links, or opens a new business. Returns where to send the browser. */
export async function googleCallback(res: Response, q: { code?: string; state?: string; error?: string }, cookieHeader: string | undefined, userAgent: string): Promise<string> {
  const fail = (code: string) => `/app#signin?error=${code}`;
  const raw = readCookie(cookieHeader, OAUTH_COOKIE);
  res.clearCookie(OAUTH_COOKIE, { path: "/api/auth/google" });
  if (q.error) return fail("google_cancelled");
  if (!raw || !q.code || !q.state) return fail("google_failed");
  let saved: { state: string; nonce: string; timezone?: string; currency?: string };
  try {
    saved = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return fail("google_failed");
  }
  if (saved.state !== q.state) return fail("google_failed");

  let claims: GoogleClaims;
  try {
    const tokens = await googleDeps.exchange(q.code);
    claims = readIdToken(tokens.id_token ?? "", saved.nonce);
  } catch (err) {
    logger.warn({ err }, "Google sign-in failed");
    return fail("google_failed");
  }
  if (!claims.email || claims.email_verified !== true) return fail("google_unverified");

  const email = normEmail(claims.email);
  let user = await repo.findUserByGoogle(pool, claims.sub);
  if (!user) {
    const byEmail = await repo.findUserByEmail(pool, email);
    if (byEmail) {
      await repo.linkGoogle(pool, byEmail.id, claims.sub, !!byEmail.email_verified_at);
      user = byEmail;
    } else {
      const first = (claims.given_name || claims.name || email.split("@")[0]).slice(0, 40);
      const tz = saved.timezone && (await isKnownTimezone(saved.timezone)) ? saved.timezone : "UTC";
      const currency = /^[A-Z]{3}$/.test(saved.currency ?? "") ? saved.currency! : "USD";
      user = (
        await createAccount({
          business_name: `${first}'s business`,
          full_name: (claims.name || first).slice(0, 80),
          email,
          password: null,
          google_sub: claims.sub,
          timezone: tz,
          currency,
        })
      ).user;
    }
  }
  await repo.touchLogin(pool, user.id);
  await startSession(res, user.id, true, userAgent);
  return "/app";
}

/* ---------------------------------------------------------------------------
 * Request guard
 * ------------------------------------------------------------------------- */

declare module "express-serve-static-core" {
  interface Request {
    user?: repo.User;
    business?: repo.Business;
  }
}

/** Paths that work without signing in: health check, sign-in itself, messenger webhooks, the calendar feed. */
const PUBLIC = [/^\/api\/health$/, /^\/api\/auth\//, /^\/api\/channels\//, /^\/api\/integrations\/(?:[0-9a-f-]{36}\/)?calendar\.ics$/];

/**
 * Every other /api route needs a live session. The rest of the request then
 * runs for the user's business: every query goes to that business's schema.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/api/") || PUBLIC.some((p) => p.test(req.path))) return next();
  if (!config.AUTH_REQUIRED) return next(); // test setup: the fallback business answers
  try {
    const found = await currentSession(readCookie(req.headers.cookie, COOKIE));
    if (!found) {
      res.status(401).json({ error: "unauthorized", message: "Please sign in." });
      return;
    }
    req.user = found.user;
    req.business = found.business;
    withTenant(tenantOf(found.business), () => next());
  } catch (err) {
    next(err);
  }
};
