// Every business sees only its own data: separate schemas, numbering, time
// zone, currency, webhooks, calendar feed and live events.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { idle } from "../../src/ai/runner.js";
import { pool } from "../../src/db/pool.js";
import { money } from "../../src/domain/pricing.js";
import { wallClock } from "../../src/lib/time.js";
import { bus, sseHandler } from "../../src/realtime/bus.js";
import { setFallbackTenant, withTenant, type Tenant } from "../../src/tenancy/context.js";
import { findTenant } from "../../src/tenancy/tenants.js";
import { getIntegration } from "../../src/repositories/integrations.repo.js";
import { demo, freshDb } from "./helpers.js";

const app = createApp();
const cookieOf = (r: request.Response) =>
  ((r.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("vx_session=")) ?? "";

let cookie = "";
let other: Tenant;
const as = <T>(t: Tenant, fn: () => Promise<T>) => withTenant(t, fn);
const count = (t: Tenant, table: string) => as(t, async () => (await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);

beforeAll(async () => {
  await freshDb();
  config.AUTH_REQUIRED = true;
  const r = await request(app)
    .post("/api/auth/register")
    .send({ business_name: "Glow Nails NYC", business_type: "Nail studio", full_name: "Ana Ruiz", email: "ana@glow.example", password: "nails nails 12", timezone: "America/New_York", currency: "USD" })
    .expect(201);
  cookie = cookieOf(r);
  other = (await findTenant(r.body.business.id))!;
});
afterAll(async () => {
  config.AUTH_REQUIRED = false;
  await idle();
  await pool.end();
});

describe("separate data", () => {
  it("gives a new business its own empty CRM, named after it", async () => {
    const r = await request(app).get("/api/bootstrap").set("Cookie", cookie).expect(200);
    expect(r.body.settings).toMatchObject({ name: "Glow Nails NYC", type: "Nail studio", prepay_percent: 0 });
    expect(r.body.business).toMatchObject({ name: "Glow Nails NYC", timezone: "America/New_York", currency: "USD" });
    for (const k of ["services", "masters", "clients", "appointments", "payments", "conversations", "knowledge"]) expect(r.body[k]).toEqual([]);
  });

  it("keeps the demo business untouched and invisible", async () => {
    expect(await count(demo, "clients")).toBe(30);
    const r = await request(app).get("/api/clients").set("Cookie", cookie).expect(200);
    expect(r.body).toEqual([]);
    await request(app).get("/api/conversations/CV-0001").set("Cookie", cookie).expect(404);
  });

  it("numbers records per business", async () => {
    const r = await request(app).post("/api/clients").set("Cookie", cookie).send({ display_name: "Kim Park", phone: "+1 212 555 0101" }).expect(201);
    expect(r.body.id).toBe("CL-0001"); // the demo business already has its own CL-0001
    expect(await count(other, "clients")).toBe(1);
    expect(await count(demo, "clients")).toBe(30);
    const demoFirst = await as(demo, async () => (await pool.query(`SELECT display_name FROM clients WHERE client_id = 'CL-0001'`)).rows[0].display_name);
    expect(demoFirst).toBe("Арман Т.");
  });

  it("allows the same phone number in two businesses", async () => {
    const phone = await as(demo, async () => (await pool.query(`SELECT phone FROM clients WHERE phone IS NOT NULL LIMIT 1`)).rows[0].phone);
    await request(app).post("/api/clients").set("Cookie", cookie).send({ display_name: "Same Phone", phone }).expect(201);
  });

  it("refuses CRM queries that run for no business at all", async () => {
    setFallbackTenant(null);
    try {
      await expect(pool.query("SELECT 1 FROM clients")).rejects.toMatchObject({ code: "42P01" });
    } finally {
      setFallbackTenant(demo);
    }
  });

  it("renames the shared business row with the settings", async () => {
    const s = (await request(app).get("/api/settings").set("Cookie", cookie).expect(200)).body;
    await request(app).put("/api/settings").set("Cookie", cookie).send({ ...s, name: "Glow Nails SoHo" }).expect(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200)).body.business.name).toBe("Glow Nails SoHo");
  });
});

describe("own clock and currency", () => {
  it("runs database sessions in the business time zone", async () => {
    const tz = (t: Tenant) => as(t, async () => (await pool.query(`SELECT current_setting('timezone') AS tz`)).rows[0].tz);
    expect(await tz(other)).toBe("America/New_York");
    expect(await tz(demo)).toBe("Asia/Almaty");
  });

  it("reads the wall clock of each business", () => {
    const at = new Date("2026-07-01T12:00:00Z");
    expect(withTenant(other, () => wallClock(at)).getHours()).toBe(8); // New York, summer time
    expect(withTenant(demo, () => wallClock(at)).getHours()).toBe(17); // Almaty, UTC+5
  });

  it("formats prices in the business currency", () => {
    expect(withTenant(other, () => money(45))).toBe("$45");
    expect(withTenant(demo, () => money(7000))).toBe("7 000 ₸");
  });
});

describe("webhooks and feeds per business", () => {
  it("accepts messenger messages only for a connected channel, with its secret", async () => {
    const msg = { external_user_id: "wa_1", name: "Lia", text: "Hi, how much is a gel manicure?" };
    await request(app).post(`/api/channels/${other.id}/whatsapp/inbound`).send(msg).expect(404);
    await request(app).post(`/api/channels/00000000-0000-4000-8000-000000000000/whatsapp/inbound`).send(msg).expect(404);
    await request(app).put("/api/integrations/whatsapp").set("Cookie", cookie).send({ settings: { phone: "+1 212 555 0100" } }).expect(200);
    const secret = (await as(other, () => getIntegration(pool, "whatsapp")))!.secret!;
    await request(app).post(`/api/channels/${other.id}/whatsapp/inbound`).set("x-channel-secret", "wrong").send(msg).expect(401);
    await request(app).post(`/api/channels/${other.id}/whatsapp/inbound`).set("x-channel-secret", secret).send(msg).expect(201);
    await idle();
    expect(await count(other, "conversations")).toBe(1);
    expect(await count(demo, "conversations")).toBe(4);
  });

  it("serves each calendar feed in its own time zone, and only with its own token", async () => {
    await request(app).put("/api/integrations/google_calendar").set("Cookie", cookie).send({}).expect(200);
    const token = (await as(other, () => getIntegration(pool, "google_calendar")))!.secret!;
    const r = await request(app).get(`/api/integrations/${other.id}/calendar.ics?token=${token}`).expect(200);
    expect(r.text).toContain("X-WR-TIMEZONE:America/New_York");
    await request(app).get(`/api/integrations/${demo.id}/calendar.ics?token=${token}`).expect(404);
  });
});

describe("live events", () => {
  it("stamps events with their business and streams each browser only its own", () => {
    const written: string[] = [];
    const closers: (() => void)[] = [];
    const req = { on: (_e: string, fn: () => void) => closers.push(fn) } as unknown as Request;
    const res = { writeHead: () => {}, write: (s: string) => written.push(s) } as unknown as Response;
    withTenant(demo, () => sseHandler(req, res));
    withTenant(other, () => bus.changed("clients"));
    expect(written.filter((w) => w.startsWith("data:"))).toEqual([]);
    withTenant(demo, () => bus.changed("clients"));
    expect(written.filter((w) => w.startsWith("data:"))).toEqual([`data: ${JSON.stringify({ type: "changed", resources: ["clients"] })}\n\n`]);
    closers.forEach((f) => f());
  });
});

describe("demo data", () => {
  it("renames the business after the demo it loads, and leaves other businesses alone", async () => {
    await request(app).post("/api/admin/reset-demo").set("Cookie", cookie).expect(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200)).body.business.name).toBe("Barberista");
    expect(await count(other, "clients")).toBe(30);
    expect(await count(demo, "conversations")).toBe(4);
  });
});
