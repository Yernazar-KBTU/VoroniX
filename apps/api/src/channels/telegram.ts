import { Bot } from "grammy";
import { logger } from "../lib/logger.js";
import { bus, type BusEvent } from "../realtime/bus.js";
import { receiveInbound } from "../services/conversation.service.js";
import { replyTo } from "../ai/runner.js";

/**
 * Telegram adapter (FR-01). Incoming messages go into the same inbound flow
 * as every other messenger; AI and administrator replies for Telegram chats
 * are sent back through the Bot API.
 */
export function startTelegram(token: string): { stop: () => Promise<void> } {
  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `tg_${from.id}`;
    const { conversation } = await receiveInbound({ messenger: "Telegram", external_user_id: `tg_${from.id}`, name, text: ctx.message.text });
    if (conversation.ai_enabled) void replyTo(conversation.id);
  });
  bot.catch((err) => logger.error({ err: err.error }, "telegram update failed"));

  const forward = async (e: BusEvent) => {
    if (e.type !== "message" || e.messenger !== "Telegram" || !e.external_user_id.startsWith("tg_")) return;
    const chatId = Number(e.external_user_id.slice(3));
    try {
      await bot.api.sendMessage(chatId, e.text);
    } catch (err) {
      logger.error({ err, chatId }, "telegram send failed");
    }
  };
  bus.on("event", forward);

  void bot.start({ drop_pending_updates: false, onStart: (me) => logger.info(`Telegram bot @${me.username} is listening`) });
  return {
    stop: async () => {
      bus.off("event", forward);
      await bot.stop();
    },
  };
}
