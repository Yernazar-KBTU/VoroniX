// VoroniX.ai, the third AI: the CRM sends its prompt, the chat and its tool
// schemas; VoroniX.ai asks the CRM to run each tool here, so the client card
// and bookings are written to this CRM's own database.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { idle, setEngine } from "../../src/ai/runner.js";
import { OfflineAgent } from "../../src/ai/offline-agent.js";
import { VoronixAiAgent } from "../../src/ai/voronixai-agent.js";
import { pool } from "../../src/db/pool.js";
import { freshDb } from "./helpers.js";

const api = request(createApp());
const seen: { path: string; auth: string | undefined; body: Record<string, any> }[] = [];
let down = false;
const fake: Server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (down) return res.writeHead(503).end("{}");
    const body = JSON.parse(raw);
    seen.push({ path: req.url ?? "", auth: req.headers.authorization, body });
    const send = (o: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
    if (req.url === "/v1/crm/turns")
      return send({ status: "tool", turnId: "t1", call: { id: "call_1", name: "link_client", input: { name: "Aidos", phone: "+7 701 555 12 34" } } });
    send({ status: "done", turnId: "t1", outcome: "answered", text: "Aidos, вы в базе, подберу время.", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } });
  });
});

beforeAll(async () => {
  await freshDb();
  await new Promise<void>((ok) => fake.listen(0, ok));
  config.VORONIXAI_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  config.VORONIXAI_KEY = "test-crm-key-123456";
  setEngine(new VoronixAiAgent());
});
afterAll(async () => {
  config.VORONIXAI_URL = undefined;
  config.VORONIXAI_KEY = undefined;
  setEngine(new OfflineAgent());
  await idle();
  await new Promise((ok) => fake.close(ok));
  await pool.end();
});

const say = async (ext: string, text: string) => {
  const r = await api.post("/api/channels/telegram/inbound").send({ external_user_id: ext, name: "Aidos", text });
  await idle();
  return (await api.get(`/api/conversations/${r.body.conversation_id}`).expect(200)).body as {
    messages: { from: string; text: string }[];
    needs_human: boolean;
    client_id: string | null;
  };
};

describe("VoroniX.ai answers the chats as the third AI", () => {
  it("sends the business prompt and CRM tools with the key, runs the tool in the CRM and shows the answer", async () => {
    const c = await say("tg_77", "Хочу записаться, мой номер +7 701 555 12 34");
    const start = seen.find((s) => s.path === "/v1/crm/turns")!;
    expect(start.auth).toBe("Bearer test-crm-key-123456");
    expect(start.body.messages.at(-1)).toMatchObject({ role: "user" });
    expect(start.body.tools.map((t: { name: string }) => t.name)).toContain("create_appointment");
    expect(typeof start.body.system).toBe("string");
    const result = seen.find((s) => s.path === "/v1/crm/turns/result")!;
    expect(result.body).toMatchObject({ turnId: "t1", callId: "call_1", isError: false });
    expect(c.client_id).toBeTruthy();
    expect(c.messages.at(-1)).toMatchObject({ from: "ai", text: "Aidos, вы в базе, подберу время." });
    const runs = await pool.query(`SELECT engine, outcome FROM ai_runs WHERE engine = $1`, ["voronixai"]);
    expect(runs.rows[0]).toEqual({ engine: "voronixai", outcome: "replied" });
  });

  it("has no fallback answer when VoroniX.ai is down: a person takes the chat", async () => {
    down = true;
    const c = await say("tg_78", "привет");
    down = false;
    expect(c.messages.some((m) => m.from === "ai")).toBe(false);
    expect(c.messages.at(-1)!.text).toMatch(/VoroniX\.ai is down/);
    expect(c.needs_human).toBe(true);
  });

  it("lets a business pick VoroniX.ai in Business setup only when it is connected", async () => {
    const current = (await api.get("/api/settings").expect(200)).body;
    await api.put("/api/settings").send({ ...current, ai_engine: "voronixai" }).expect(200);
    const url = config.VORONIXAI_URL;
    config.VORONIXAI_URL = undefined;
    const r = await api.put("/api/settings").send({ ...current, ai_engine: "voronixai" });
    config.VORONIXAI_URL = url;
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("voronixai_missing");
  });
});
