// VoroniX AI answers the chats itself (with the data server): the CRM sends the
// client's message to POST /v1/reply, shows the answer, and when the AI does
// not answer there is no fallback reply.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { idle, setEngine } from "../../src/ai/runner.js";
import { OfflineAgent } from "../../src/ai/offline-agent.js";
import { VoronixBrainAgent } from "../../src/ai/voronix-brain-agent.js";
import { pool } from "../../src/db/pool.js";
import { freshDb } from "./helpers.js";

const api = request(createApp());
const asked: { dataKey: string; text: string; client: { id: string; channel: string } }[] = [];
let down = false;
const fake: Server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (down) return res.writeHead(503).end("{}");
    const b = JSON.parse(body);
    asked.push(b);
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ reply: "VIP-ритуал стоит 22 000 ₸.", lang: "ru", intents: [{ label: "price", score: 0.99 }], unsure: false, actions: [{ type: "answer", text: "price" }], booking: null, cancelled: null, handoff: null, learned: 0, version: "v0" }),
    );
  });
});

beforeAll(async () => {
  await freshDb();
  // The data server's key table (it creates it in the CRM's database when it starts).
  await pool.query(`CREATE TABLE IF NOT EXISTS public.ai_api_keys (key_id VARCHAR(16) PRIMARY KEY, business_id UUID NOT NULL, secret_hash CHAR(64) NOT NULL, label VARCHAR(80) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)`);
  await new Promise<void>((ok) => fake.listen(0, ok));
  config.VORONIX_AI_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  setEngine(new VoronixBrainAgent());
});
afterAll(async () => {
  config.VORONIX_AI_URL = undefined;
  setEngine(new OfflineAgent());
  await idle();
  await new Promise((ok) => fake.close(ok));
  await pool.end();
});

const say = async (ext: string, text: string) => {
  const r = await api.post("/api/channels/telegram/inbound").send({ external_user_id: ext, name: "Aidos", text });
  await idle();
  return (await api.get(`/api/conversations/${r.body.conversation_id}`).expect(200)).body as { messages: { from: string; text: string }[]; needs_human: boolean };
};

describe("VoroniX AI answers the chats", () => {
  it("sends the message with this business's data key and shows the answer", async () => {
    const c = await say("tg_42", "Сколько стоит VIP ритуал?");
    expect(asked.at(-1)).toMatchObject({ text: "Сколько стоит VIP ритуал?", client: { id: "c-tg_42", channel: "Telegram" } });
    expect(asked.at(-1)!.dataKey).toMatch(/^vxd_[a-z0-9]{12}_/);
    expect(c.messages.at(-1)).toMatchObject({ from: "ai", text: "VIP-ритуал стоит 22 000 ₸." });
    const keys = await pool.query(`SELECT label FROM public.ai_api_keys WHERE revoked_at IS NULL`);
    expect(keys.rows).toEqual([{ label: "VoroniX CRM" }]);
  });

  it("does not answer on its own when VoroniX AI is down: a person takes the chat", async () => {
    down = true;
    const c = await say("tg_43", "привет");
    down = false;
    expect(c.messages.some((m) => m.from === "ai")).toBe(false);
    expect(c.messages.at(-1)!.text).toMatch(/VoroniX AI is down/);
    expect(c.needs_human).toBe(true);
  });
});
