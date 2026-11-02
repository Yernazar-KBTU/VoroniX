// Accounts: sign up, sign in, sessions, and the API locked without a session.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/db/pool.js";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";
import { freshDb } from "./helpers.js";

const app = createApp();
const owner = { business_name: "Fade Studio", full_name: "Jordan Lee", email: "Jordan@Example.com", password: "correct horse 42", timezone: "America/New_York", currency: "USD", country: "US" };
const cookieOf = (r: request.Response) => String(r.headers["set-cookie"]?.[0] ?? "").split(";")[0];

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
