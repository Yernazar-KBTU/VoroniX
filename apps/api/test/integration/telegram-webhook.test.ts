// Telegram in webhook mode: Telegram calls our address (which also wakes a
// sleeping server), only with the right secret, and the message lands in the CRM.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { hookSecret, startTelegram } from "../../src/channels/telegram.js";
import type { UserFromGetMe } from "grammy/types";
import { pool } from "../../src/db/pool.js";
import { demo, freshDb, until } from "./helpers.js";

const api = request(createApp());
const token = "123456:test-token";
let bot: { stop: () => Promise<void> };

beforeAll(async () => {
  await freshDb();
  const botInfo = { id: 123456, is_bot: true as const, first_name: "VoroniX", username: "voronix_test_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as unknown as UserFromGetMe;
  bot = startTelegram(token, demo, { mode: "webhook", botInfo });
});
afterAll(async () => {
  await bot.stop();
  await pool.end();
});

const update = (text: string) => ({
  update_id: 1,
  message: { message_id: 7, date: Math.floor(Date.now() / 1000), chat: { id: 4242, type: "private", first_name: "Aidos" }, from: { id: 4242, is_bot: false, first_name: "Aidos" }, text },
});

describe("Telegram webhook", () => {
  it("refuses a call without Telegram's secret", async () => {
    await api.post(`/api/channels/${demo.id}/telegram/webhook`).send(update("привет")).expect(401);
  });

  it("answers 404 for a business without a bot", async () => {
    await api.post(`/api/channels/00000000-0000-4000-8000-000000000000/telegram/webhook`).send(update("привет")).expect(404);
  });

  it("puts the client's message into the CRM", async () => {
    await api.post(`/api/channels/${demo.id}/telegram/webhook`).set("X-Telegram-Bot-Api-Secret-Token", hookSecret(token)).send(update("Сколько стоит стрижка?")).expect(200);
    const found = await until(
      async () => ((await api.get("/api/conversations").expect(200)).body as { external_user_id?: string; messenger?: string }[]).filter((c) => c.external_user_id === "tg_4242"),
      (rows) => rows.length > 0,
    );
    expect(found.length).toBeGreaterThan(0);
  });
});
