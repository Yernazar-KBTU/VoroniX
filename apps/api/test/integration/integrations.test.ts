// Integrations page: connecting services, keeping secrets out of responses,
// the messenger webhook secret, the calendar feed and the outgoing webhook.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { getEngine, idle, setEngine } from "../../src/ai/runner.js";
import { OfflineAgent } from "../../src/ai/offline-agent.js";
import { pool } from "../../src/db/pool.js";
import { bootIntegrations, deps, stopIntegrations } from "../../src/integrations/manager.js";
import { freshDb, quietWednesday, until } from "./helpers.js";

const api = request(createApp());
const started: string[] = [];
const posted: { url: string; body: { event: string; data: Record<string, unknown> }; secret: string }[] = [];

beforeAll(async () => {
  await freshDb();
  deps.checkTelegram = async (token) => (token.startsWith("123:") ? { ok: true, detail: "Bot @barberista_bot is answering clients" } : { ok: false, detail: "Unauthorized" });
  deps.checkClaude = async (key) => (key === "sk-ant-good" ? { ok: true, detail: "Claude writes the replies" } : { ok: false, detail: "The API key was not accepted" });
  deps.startTelegram = (token) => {
    started.push(token);
    return { stop: async () => {} };
  };
  deps.post = async (url, body, secret) => {
    posted.push({ url, body: body as (typeof posted)[number]["body"], secret });
    return { ok: true, detail: `Delivered, ${url} answered 200` };
  };
  await bootIntegrations();
});
afterAll(async () => {
  await stopIntegrations();
  setEngine(new OfflineAgent());
  await idle();
  await pool.end();
});

const card = async (id: string) => ((await api.get("/api/integrations").expect(200)).body as { id: string; status: string; secret_hint: string; settings: Record<string, string>; status_detail: string }[]).find((x) => x.id === id)!;

describe("catalogue", () => {
  it("lists every service, all off on a fresh install", async () => {
    const r = await api.get("/api/integrations").expect(200);
    expect(r.body.map((x: { id: string }) => x.id)).toEqual(["telegram", "whatsapp", "instagram", "claude", "kaspi", "google_calendar", "webhook"]);
    expect(r.body.every((x: { status: string }) => x.status === "off")).toBe(true);
  });

  it("answers 404 for an unknown service and 400 without a required field", async () => {
    await api.put("/api/integrations/viber").send({}).expect(404);
    await api.put("/api/integrations/telegram").send({}).expect(400);
  });
});

describe("Telegram", () => {
  it("keeps a token Telegram refuses as an error and does not start the bot", async () => {
    const r = await api.put("/api/integrations/telegram").send({ secret: "bad-token" }).expect(200);
    expect(r.body).toMatchObject({ status: "error", status_detail: "Unauthorized" });
    expect(started).toEqual([]);
  });

  it("connects with a valid token, starts the bot and never returns the token", async () => {
    const r = await api.put("/api/integrations/telegram").send({ secret: "123:secret-token-abcd" }).expect(200);
    expect(r.body).toMatchObject({ status: "connected", secret_hint: "••••abcd" });
    expect(JSON.stringify((await api.get("/api/integrations")).body)).not.toContain("secret-token");
    expect(started).toEqual(["123:secret-token-abcd"]);
  });

  it("is hidden from the read-only SQL console", async () => {
    const r = await api.post("/api/sql").send({ query: "SELECT secret FROM integrations" }).expect(400);
    expect(r.body.message).toMatch(/permission denied/);
  });
});

describe("Claude", () => {
  it("switches the reply engine to Claude with a good key and back on disconnect", async () => {
    config.AI_ENGINE = "auto"; // the test environment pins the offline engine
    await api.put("/api/integrations/claude").send({ secret: "sk-ant-wrong" }).expect(200);
    expect(getEngine().name).toBe("offline-rules");
    await api.put("/api/integrations/claude").send({ secret: "sk-ant-good" }).expect(200);
    expect(getEngine().name).toMatch(/^claude/);
    await api.delete("/api/integrations/claude").expect(200);
    expect(getEngine().name).toBe("offline-rules");
    expect((await card("claude")).status).toBe("off");
    config.AI_ENGINE = "offline";
  });
});

describe("WhatsApp webhook", () => {
  it("gets its own secret and refuses messages without it", async () => {
    await api.put("/api/integrations/whatsapp").send({ settings: { phone: "+7 700 111 2233" } }).expect(200);
    const wa = await card("whatsapp");
    expect(wa.status).toBe("connected");
    const { rows } = await pool.query("SELECT secret FROM integrations WHERE provider = 'whatsapp'");
    const secret = rows[0].secret as string;
    expect(wa.secret_hint).toBe(`••••${secret.slice(-4)}`);

    const msg = { external_user_id: "wa_int_1", name: "Тест", text: "Сколько стоит стрижка?" };
    await api.post("/api/channels/whatsapp/inbound").send(msg).expect(401);
    await api.post("/api/channels/whatsapp/inbound").set("x-channel-secret", secret).send(msg).expect(201);
    await idle();
  });
});

describe("Google Calendar feed", () => {
  it("serves upcoming visits as iCal only with the right token", async () => {
    await api.get("/api/integrations/calendar.ics?token=x").expect(404);
    await api.put("/api/integrations/google_calendar").send({}).expect(200);
    const { rows } = await pool.query("SELECT secret FROM integrations WHERE provider = 'google_calendar'");
    const r = await api.get(`/api/integrations/calendar.ics?token=${rows[0].secret}`).expect(200);
    expect(r.headers["content-type"]).toMatch(/text\/calendar/);
    expect(r.text).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(r.text).toContain("X-WR-CALNAME:Barberista visits");
    expect(r.text).toMatch(/SUMMARY:VIP-ритуал · Арман Т\./);
    expect(r.text).toMatch(/DTSTART;TZID=Asia\/Almaty:\d{8}T180000/);
  });
});

describe("outgoing webhook", () => {
  it("sends a test event on connect", async () => {
    await api.put("/api/integrations/webhook").send({ settings: { url: "ftp://nope" } }).expect(200);
    expect((await card("webhook")).status).toBe("error");
    await api.put("/api/integrations/webhook").send({ settings: { url: "https://hook.example.com/crm", events: "appointment.created" } }).expect(200);
    expect(posted.at(-1)).toMatchObject({ url: "https://hook.example.com/crm", body: { event: "test" } });
  });

  it("forwards a new booking with the webhook secret and skips events that were not asked for", async () => {
    const before = posted.length;
    const r = await api
      .post("/api/appointments")
      .send({ client_id: "CL-0005", master_id: "MS-03", service_code: "HC-02", start_datetime: `${quietWednesday()} 13:00` })
      .expect(201);
    await until(async () => posted.length, (n) => n > before, 2000);
    const sent = posted.at(-1)!;
    expect(sent.body).toMatchObject({ event: "appointment.created", data: { id: r.body.id, service_code: "HC-02" } });
    const { rows } = await pool.query("SELECT secret FROM integrations WHERE provider = 'webhook'");
    expect(sent.secret).toBe(rows[0].secret);
    expect(posted.filter((p) => p.body.event === "payment.paid")).toHaveLength(0);
  });

  it("checks the connection again on Test", async () => {
    const r = await api.post("/api/integrations/webhook/test").expect(200);
    expect(r.body.status_detail).toMatch(/answered 200/);
  });
});
