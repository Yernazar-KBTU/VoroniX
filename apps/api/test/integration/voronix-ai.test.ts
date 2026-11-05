// Week 10: the CRM's AI administrator uses VoroniX AI, our own intent model
// served by a separate service (apps/voronix-ai), and talks Kazakh.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiServer } from "../../../voronix-ai/src/server.js";
import { createApp } from "../../src/app.js";
import { idle } from "../../src/ai/runner.js";
import { understand, VoronixDown } from "../../src/ai/voronix-ai.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/db/pool.js";
import { freshDb } from "./helpers.js";

const api = request(createApp());
type Msg = { from: string; text: string };
type Conv = { id: string; stage: string; client_id: string | null; appointment_id: string | null; needs_human: boolean; messages: Msg[] };

const KEY = "test-key";
let ai: Server;
let url: string;
const cfg = config as { VORONIX_AI_URL?: string; VORONIX_AI_KEY?: string };

async function say(ext: string, text: string): Promise<Conv> {
  const r = await api.post("/api/channels/telegram/inbound").send({ external_user_id: ext, name: "Тест", text });
  expect([200, 201]).toContain(r.status);
  await idle();
  return (await api.get(`/api/conversations/${r.body.conversation_id}`).expect(200)).body;
}
const lastAi = (c: Conv) => [...c.messages].reverse().find((m) => m.from === "ai")?.text ?? "";

beforeAll(async () => {
  await freshDb();
  ai = createAiServer({ apiKey: KEY });
  await new Promise<void>((ok) => ai.listen(0, ok));
  url = `http://127.0.0.1:${(ai.address() as AddressInfo).port}`;
  cfg.VORONIX_AI_URL = url;
  cfg.VORONIX_AI_KEY = KEY;
});
afterAll(async () => {
  cfg.VORONIX_AI_URL = undefined;
  cfg.VORONIX_AI_KEY = undefined;
  await idle();
  await new Promise((ok) => ai.close(ok));
  await pool.end();
});

describe("VoroniX AI API", () => {
  it("understands a Kazakh message: intents and language", async () => {
    const u = await understand("Сәлеметсіз бе! VIP ритуал қанша тұрады? Сәрсенбі кешке бола ма?");
    expect(u?.lang).toBe("kk");
    expect([...(u?.intents ?? [])].sort()).toEqual(["booking", "greeting", "price"]);
  });

  it("needs the key, and a failure is an error, never a quiet fallback", async () => {
    await expect(understand("Привет", url, "wrong")).rejects.toThrow(/key is wrong \(401\)/);
    await expect(understand("Привет", "http://127.0.0.1:9", KEY)).rejects.toBeInstanceOf(VoronixDown);
  });

  it("health and bootstrap say whether VoroniX AI works", async () => {
    const ok = (await api.get("/api/health").expect(200)).body;
    expect(ok.status).toBe("ok");
    expect(ok.voronix_ai).toMatchObject({ state: "ok", error: null });
    cfg.VORONIX_AI_URL = "http://127.0.0.1:9";
    try {
      const bad = (await api.get("/api/health").expect(200)).body;
      expect(bad.status).toBe("degraded");
      expect(bad.voronix_ai.state).toBe("down");
      expect(bad.voronix_ai.error).toBeTruthy();
      const boot = (await api.get("/api/bootstrap").expect(200)).body;
      expect(boot.voronix_ai.state).toBe("down");
    } finally {
      cfg.VORONIX_AI_URL = url;
    }
  });
});

describe("the AI administrator in Kazakh", () => {
  let conv: Conv;

  it("answers the price and free times in Kazakh", async () => {
    conv = await say("tg_kk_1", "Сәлеметсіз бе! VIP ритуал қанша тұрады? Сәрсенбі кешке бола ма?");
    const reply = lastAi(conv);
    expect(reply).toMatch(/^Сәлеметсіз бе!/);
    expect(reply).toMatch(/VIP-ритуал бағасы 22 000 ₸, алдын ала төлем 6 600 ₸/);
    expect(reply).toMatch(/бос уақыт: .*1[789]:[03]0/);
    expect(reply).toMatch(/Қай уақытты таңдайсыз\?$/);
  });

  it("takes the first offer and asks the name in Kazakh", async () => {
    conv = await say("tg_kk_1", "Бірінші нұсқа болсын");
    expect(lastAi(conv)).toMatch(/^Керемет: (дүйсенбі|сейсенбі|сәрсенбі|бейсенбі|жұма|сенбі) \d\d\.\d\d, сағат \d\d:\d\d, шебер: .+ Атыңыз кім\?$/);
  });

  it("books the visit: a new row in appointments, prepayment link sent", async () => {
    conv = await say("tg_kk_1", "Менің атым Әлия, +7 701 555 11 22");
    expect(conv.appointment_id).toMatch(/^AP-\d+$/);
    expect(lastAi(conv)).toMatch(/^Сізді (дүйсенбі|сейсенбі|сәрсенбі|бейсенбі|жұма|сенбі) .* уақытына жаздым, шебер: .+ 6 600 ₸ алдын ала төлем керек/);
    const { rows } = await pool.query(
      `SELECT a.status, a.source, c.display_name FROM appointments a JOIN clients c ON c.client_id = a.client_id WHERE a.appointment_id = $1`,
      [conv.appointment_id],
    );
    expect(rows).toEqual([{ status: "Booked", source: "Telegram", display_name: "Әлия" }]);
  });

  it("cancels in Kazakh", async () => {
    conv = await say("tg_kk_1", "Кешіріңіз, келе алмаймын");
    expect(lastAi(conv)).toBe("Жазылуыңызды өшірдім. Басқа уақыт керек болса, жаза салыңыз.");
    const { rows } = await pool.query(`SELECT status FROM appointments WHERE appointment_id = $1`, [conv.appointment_id]);
    expect(rows[0].status).toBe("Cancelled");
  });
});

describe("our model understands what the rules miss", () => {
  const complaint = "Маған мүлдем ұнамады, қызмет нашар";

  it("with VoroniX AI the complaint goes to a human", async () => {
    const conv = await say("tg_kk_2", complaint);
    expect(conv.needs_human).toBe(true);
    expect(lastAi(conv)).toMatch(/әкімшіге жіберемін/);
  });

  it("when VoroniX AI is down there is no rule answer: the chat shows why and waits for a person", async () => {
    cfg.VORONIX_AI_URL = "http://127.0.0.1:9";
    try {
      const conv = await say("tg_kk_3", complaint);
      expect(lastAi(conv)).toBe("");
      expect(conv.needs_human).toBe(true);
      expect(conv.messages.some((m) => m.from === "system" && /VoroniX AI is down/.test(m.text))).toBe(true);
      const { rows } = await pool.query(`SELECT outcome FROM ai_runs WHERE conversation_id = $1 ORDER BY 1`, [conv.id]);
      expect(rows.map((r) => r.outcome)).toContain("error");
    } finally {
      cfg.VORONIX_AI_URL = url;
    }
  });

  it("not connected at all: the basic rules answer, as before VoroniX AI", async () => {
    cfg.VORONIX_AI_URL = undefined;
    try {
      const conv = await say("tg_kk_4", "Сәлеметсіз бе! VIP ритуал қанша тұрады?");
      expect(lastAi(conv)).not.toBe("");
    } finally {
      cfg.VORONIX_AI_URL = url;
    }
  });
});
