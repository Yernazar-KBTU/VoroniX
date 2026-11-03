// Accounts: sign up, sign in, sessions, password reset by email, Google
// sign-in, and the API locked without a session.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/db/pool.js";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";
import { googleDeps } from "../../src/auth/auth.service.js";
import { outbox } from "../../src/lib/mailer.js";
import { freshDb } from "./helpers.js";

const app = createApp();
const owner = { business_name: "Fade Studio", full_name: "Jordan Lee", email: "Jordan@Example.com", password: "correct horse 42", timezone: "America/New_York", currency: "USD", country: "US" };
const cookieOf = (r: request.Response, name = "vx_session") =>
  ((r.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`)) ?? "";

beforeAll(async () => {
  await freshDb();
  config.AUTH_REQUIRED = true;
});
afterAll(async () => {
  config.AUTH_REQUIRED = false;
  await pool.end();
});

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("secret-pass");
    const b = await hashPassword("secret-pass");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("secret-pass", a)).toBe(true);
    expect(await verifyPassword("wrong-pass", a)).toBe(false);
  });
});

describe("accounts", () => {
  it("locks the API without a session but keeps health and sign-in open", async () => {
    await request(app).get("/api/bootstrap").expect(401);
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/auth/me").expect(401);
  });

  it("signs up a business and its owner, and starts a session", async () => {
    const r = await request(app).post("/api/auth/register").send(owner).expect(201);
    expect(r.body.user).toMatchObject({ email: "jordan@example.com", full_name: "Jordan Lee", role: "owner" });
    expect(r.body.business).toMatchObject({ name: "Fade Studio", timezone: "America/New_York", currency: "USD", country: "US" });
    expect(r.body.user.password_hash).toBeUndefined();
    const set = String(r.headers["set-cookie"]?.[0]);
    expect(set).toMatch(/vx_session=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    await request(app).get("/api/bootstrap").set("Cookie", cookieOf(r)).expect(200);
  });

  it("stores only a hash of the password and of the session token", async () => {
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE email = 'jordan@example.com'`);
    expect(rows[0].password_hash).not.toContain(owner.password);
    const s = await pool.query(`SELECT token_hash FROM sessions`);
    expect(s.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a second account with the same email", async () => {
    const r = await request(app).post("/api/auth/register").send({ ...owner, email: "jordan@EXAMPLE.com" }).expect(409);
    expect(r.body.error).toBe("email_taken");
  });

  it("validates sign-up fields", async () => {
    const r = await request(app).post("/api/auth/register").send({ ...owner, email: "nope", password: "short", timezone: "Mars/Base" }).expect(400);
    expect(r.body.message).toMatch(/email/);
    expect(r.body.message).toMatch(/8 characters/);
    expect(r.body.message).toMatch(/time zone/);
  });

  it("signs in, reads the profile, and signs out", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: " JORDAN@example.com ", password: owner.password }).expect(200);
    const cookie = cookieOf(r);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.business.name).toBe("Fade Studio");
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("without 'remember me' the cookie ends with the browser", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: owner.email, password: owner.password, remember: false }).expect(200);
    expect(String(r.headers["set-cookie"]?.[0])).not.toMatch(/Max-Age|Expires/i);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: owner.email, password: "wrong password" }).expect(401);
    const b = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrong password" }).expect(401);
    expect(a.body).toEqual(b.body);
  });

  it("slows down password guessing", async () => {
    for (let i = 0; i < 10; i++) await request(app).post("/api/auth/login").send({ email: "guess@example.com", password: `try-${i}` }).expect(401);
    const r = await request(app).post("/api/auth/login").send({ email: "guess@example.com", password: "try-x" }).expect(429);
    expect(r.body.error).toBe("too_many_attempts");
  });

  it("rejects an expired session", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: owner.email, password: owner.password }).expect(200);
    await pool.query(`UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'`);
    await request(app).get("/api/bootstrap").set("Cookie", cookieOf(r)).expect(401);
  });
});

describe("password reset by email", () => {
  const linkToken = () => /#reset=([\w-]+)/.exec(outbox.at(-1)?.text ?? "")?.[1] ?? "";

  it("answers the same for a known and an unknown address, and mails only the known one", async () => {
    const before = outbox.length;
    const a = await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" }).expect(202);
    expect(outbox.length).toBe(before);
    const b = await request(app).post("/api/auth/forgot").send({ email: "JORDAN@example.com" }).expect(202);
    expect(a.body).toEqual(b.body);
    expect(outbox.length).toBe(before + 1);
    expect(outbox.at(-1)).toMatchObject({ to: "jordan@example.com", subject: "Set a new VoroniX password" });
    expect(outbox.at(-1)!.html).toContain("Set a new password");
    const { rows } = await pool.query(`SELECT token_hash FROM password_resets`);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toContain(linkToken());
  });

  it("sets the new password once, signs out other browsers and signs this one in", async () => {
    const old = cookieOf(await request(app).post("/api/auth/login").send({ email: owner.email, password: owner.password }).expect(200));
    const token = linkToken();
    expect((await request(app).post("/api/auth/reset/check").send({ token }).expect(200)).body).toEqual({ valid: true });
    const r = await request(app).post("/api/auth/reset").send({ token, password: "brand new pass 7" }).expect(200);
    expect(r.body.business.name).toBe("Fade Studio");
    await request(app).get("/api/bootstrap").set("Cookie", cookieOf(r)).expect(200);
    await request(app).get("/api/bootstrap").set("Cookie", old).expect(401);
    await request(app).post("/api/auth/login").send({ email: owner.email, password: owner.password }).expect(401);
    await request(app).post("/api/auth/login").send({ email: owner.email, password: "brand new pass 7" }).expect(200);
    const again = await request(app).post("/api/auth/reset").send({ token, password: "another pass 8" }).expect(400);
    expect(again.body.error).toBe("reset_link_invalid");
    expect((await request(app).post("/api/auth/reset/check").send({ token }).expect(200)).body).toEqual({ valid: false });
    owner.password = "brand new pass 7";
  });

  it("refuses an expired link", async () => {
    await request(app).post("/api/auth/forgot").send({ email: owner.email }).expect(202);
    const token = linkToken();
    await pool.query(`UPDATE password_resets SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE used_at IS NULL`);
    await request(app).post("/api/auth/reset").send({ token, password: "too late pass 9" }).expect(400);
  });
});

describe("Continue with Google", () => {
  let claims: Record<string, unknown> = {};
  const idToken = (c: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(c)).toString("base64url")}.sig`;

  beforeAll(() => {
    config.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    config.GOOGLE_CLIENT_SECRET = "test-secret";
    googleDeps.exchange = async () => ({ id_token: idToken(claims) });
  });
  afterAll(() => {
    config.GOOGLE_CLIENT_ID = undefined;
    config.GOOGLE_CLIENT_SECRET = undefined;
  });

  /** Runs the redirect dance; `tamper` changes what Google "sends back". */
  async function signInWithGoogle(person: Record<string, unknown>, tamper: { state?: string } = {}) {
    const start = await request(app).get("/api/auth/google/start?tz=Asia/Singapore&currency=SGD").expect(302);
    const url = new URL(start.headers.location);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    const oauth = cookieOf(start, "vx_oauth");
    const saved = JSON.parse(Buffer.from(oauth.split("=")[1], "base64url").toString());
    claims = { iss: "https://accounts.google.com", aud: config.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, nonce: saved.nonce, email_verified: true, ...person };
    return request(app)
      .get(`/api/auth/google/callback?code=abc&state=${tamper.state ?? url.searchParams.get("state")}`)
      .set("Cookie", oauth)
      .expect(302);
  }

  it("is offered only when the keys are set", async () => {
    expect((await request(app).get("/api/auth/config").expect(200)).body).toMatchObject({ google: true });
  });

  it("opens a new business for a new person, in the time zone and currency of the browser", async () => {
    const r = await signInWithGoogle({ sub: "g-100", email: "Mei@Example.com", name: "Mei Tan", given_name: "Mei" });
    expect(r.headers.location).toBe("/app");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookieOf(r)).expect(200);
    expect(me.body.user).toMatchObject({ email: "mei@example.com", full_name: "Mei Tan" });
    expect(me.body.business).toMatchObject({ name: "Mei's business", timezone: "Asia/Singapore", currency: "SGD" });
  });

  it("signs the same person in again without a second business, also when Google sends email_verified as a string", async () => {
    const r = await signInWithGoogle({ sub: "g-100", email: "mei@example.com", name: "Mei Tan", email_verified: "true" });
    expect(r.headers.location).toBe("/app");
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE email = 'mei@example.com'`);
    expect(rows[0].n).toBe(1);
  });

  it("refuses a forged state and an unverified Google email", async () => {
    expect((await signInWithGoogle({ sub: "g-200", email: "x@example.com" }, { state: "forged" })).headers.location).toBe("/app#signin?error=google_failed");
    expect((await signInWithGoogle({ sub: "g-201", email: "y@example.com", email_verified: false })).headers.location).toBe("/app#signin?error=google_unverified");
  });

  it("takes over an address someone registered without proving it: their password stops working", async () => {
    await request(app).post("/api/auth/register").send({ ...owner, email: "victim@example.com", business_name: "Squatter" }).expect(201);
    const r = await signInWithGoogle({ sub: "g-300", email: "victim@example.com", name: "Real Owner" });
    expect(r.headers.location).toBe("/app");
    await request(app).post("/api/auth/login").send({ email: "victim@example.com", password: owner.password }).expect(401);
    const { rows } = await pool.query(`SELECT password_hash, google_sub, email_verified_at FROM users WHERE email = 'victim@example.com'`);
    expect(rows[0]).toMatchObject({ password_hash: null, google_sub: "g-300" });
    expect(rows[0].email_verified_at).not.toBeNull();
  });
});
