// The AI administrator end to end: a messenger webhook goes in, the offline
// engine answers from the live database, books the visit and sends a payment link.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { idle } from "../../src/ai/runner.js";
import { pool } from "../../src/db/pool.js";
import { freshDb, until } from "./helpers.js";

const api = request(createApp());
type Msg = { from: string; text: string; payment_id?: string };
type Conv = { id: string; stage: string; client_id: string | null; appointment_id: string | null; needs_human: boolean; ai_enabled: boolean; messages: Msg[] };

/** Sends one client message through the WhatsApp webhook and waits for the AI. */
async function say(ext: string, text: string, messenger = "whatsapp"): Promise<Conv> {
  const r = await api.post(`/api/channels/${messenger}/inbound`).send({ external_user_id: ext, name: "Тест", text }).expect((res) => {
    if (![200, 201].includes(res.status)) throw new Error(`inbound ${res.status}`);
  });
  await idle();
  return (await api.get(`/api/conversations/${r.body.conversation_id}`).expect(200)).body;
}
const lastAi = (c: Conv) => [...c.messages].reverse().find((m) => m.from === "ai")?.text ?? "";

beforeAll(freshDb);
afterAll(async () => {
  await idle();
  await pool.end();
});

describe("FR-01..03: chat to booking to payment", () => {
  let conv: Conv;

  it("answers price and free times from the database (BR-01: real prices only)", async () => {
    conv = await say("wa_e2e_1", "Здравствуйте! Сколько стоит VIP-ритуал? Можно в среду вечером?");
    const reply = lastAi(conv);
    expect(reply).toMatch(/VIP-ритуал стоит 22 000 ₸/);
    expect(reply).toMatch(/предоплата 6 600 ₸/);
    expect(reply).toMatch(/\b1[78]:[03]0\b/);
    expect(conv.stage).toBe("In dialog");
  });

  it("asks the name after the client picks a time", async () => {
    conv = await say("wa_e2e_1", "давайте первый вариант");
    expect(lastAi(conv)).toMatch(/Как вас зовут/);
  });

  it("creates the client card, books the visit and sends a prepayment link", async () => {
    conv = await say("wa_e2e_1", "Меня зовут Жанар, +7 701 555 11 22");
    expect(conv.client_id).toMatch(/^CL-\d{4}$/);
    expect(conv.appointment_id).toMatch(/^AP-\d+$/);
    expect(conv.stage).toBe("Booked");
    const pay = conv.messages.find((m) => m.from === "pay");
    expect(pay?.payment_id).toMatch(/^PM-\d{5}$/);

    const { rows } = await pool.query(
      `SELECT c.display_name, c.phone, a.service_code, a.status, p.amount_kzt, p.status AS pay_status
       FROM appointments a JOIN clients c USING (client_id) JOIN payments p USING (appointment_id)
       WHERE a.appointment_id = $1`,
      [conv.appointment_id],
    );
    expect(rows[0]).toMatchObject({ display_name: "Жанар", phone: "+7 701 555 1122", service_code: "VP-07", status: "Booked", amount_kzt: 6600, pay_status: "Pending" });
  });

  it("thanks the client after the payment and moves the deal to Paid", async () => {
    const pay = conv.messages.find((m) => m.from === "pay")!;
    await api.post(`/api/payments/${pay.payment_id}/pay`).expect(200);
    // The thank-you is written after the payment response, so wait for it.
    conv = await until(async () => (await api.get(`/api/conversations/${conv.id}`)).body as Conv, (c) => /Оплата получена/.test(lastAi(c)));
    await idle();
    expect(conv.stage).toBe("Paid");
    expect(lastAi(conv)).toMatch(/Оплата получена|спасибо/i);
  });

  it("recognises the same person on the next visit by the messenger id", async () => {
    const again = await say("wa_e2e_1", "А бороду оформить сколько стоит?");
    expect(again.id).toBe(conv.id);
    expect(again.client_id).toBe(conv.client_id);
    expect(lastAi(again)).toMatch(/5 000 ₸/);
  });
});

describe("safety rules", () => {
  it("hands a complaint to a human and stops answering", async () => {
    const c = await say("ig_e2e_2", "Вчера стригся у вас, фейд кривой, это ужас", "instagram");
    expect(c.needs_human).toBe(true);
    expect(c.ai_enabled).toBe(false);
    const after = await say("ig_e2e_2", "Алло?", "instagram");
    expect(after.messages.filter((m) => m.from === "ai")).toHaveLength(1);
  });

  it("does not invent a service the barbershop does not have", async () => {
    const c = await say("tg_e2e_3", "Сколько стоит массаж спины?", "telegram");
    const reply = lastAi(c);
    expect(reply).not.toMatch(/массаж[^?]*₸/i);
    expect(reply).toMatch(/мужская стрижка \(7 000 ₸\)/i);
  });

  it("answers in English when the client writes in English", async () => {
    const c = await say("tg_e2e_4", "Hi! How much is a beard trim tomorrow evening?", "telegram");
    expect(lastAi(c)).toMatch(/costs 5 000 ₸/i);
  });
});

describe("NFR-01: every reply is logged with its latency", () => {
  it("answers within 5 seconds", async () => {
    const r = await api.get("/api/analytics/ai").expect(200);
    const row = r.body[0];
    expect(row.engine).toBe("offline-rules");
    expect(+row.runs).toBeGreaterThanOrEqual(8);
    expect(+row.within_5s_pct).toBe(100);
    expect(+row.errors).toBe(0);
  });
});

describe("Teach the AI: free text becomes data the AI uses", () => {
  it("organises notes into entries and settings", async () => {
    const r = await api
      .post("/api/ai/teach")
      .send({ text: "До конца ноября скидка 15% на бритьё по будням. Наш слоган: «Борода — это характер»." })
      .expect(200);
    expect(r.body.entries).toEqual([expect.objectContaining({ category: "Promotions", content: "До конца ноября скидка 15% на бритьё по будням." })]);
    expect(r.body.settings).toEqual({ catchphrase: "Борода — это характер" });

    await api.post("/api/knowledge").send(r.body.entries[0]).expect(201);
    const biz = (await api.get("/api/settings").expect(200)).body;
    await api.put("/api/settings").send({ ...biz, ...r.body.settings }).expect(200);
  });

  it("greets with the brand phrase and mentions the saved promotion", async () => {
    const c = await say("wa_e2e_teach", "Здравствуйте! Сколько стоит королевское бритьё?");
    const reply = lastAi(c);
    expect(reply).toMatch(/^Здравствуйте! Борода — это характер/);
    expect(reply).toMatch(/6 000 ₸/);
    expect(reply).toContain("До конца ноября скидка 15% на бритьё по будням.");
  });

  it("rejects empty notes", async () => {
    await api.post("/api/ai/teach").send({ text: "  " }).expect(400);
  });
});
