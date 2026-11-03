import { Bot } from "grammy";
import { logger } from "../lib/logger.js";
import { bus, type BusEvent } from "../realtime/bus.js";
import { receiveInbound } from "../services/conversation.service.js";
import { replyTo } from "../ai/runner.js";
import { withTenant, type Tenant } from "../tenancy/context.js";

/**
 * Telegram adapter (FR-01). Each business connects its own bot. Incoming
 * messages go into that business's inbound flow like every other messenger;
 * AI and administrator replies of that business's Telegram chats are sent
 * back through its bot.
 */
export function startTelegram(token: string, tenant: Tenant): { stop: () => Promise<void> } {
  const bot = new Bot(token);

  bot.on("message:text", (ctx) =>
    withTenant(tenant, async () => {
      const from = ctx.from;
      const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `tg_${from.id}`;
      const { conversation } = await receiveInbound({ messenger: "Telegram", external_user_id: `tg_${from.id}`, name, text: ctx.message.text });
      if (conversation.ai_enabled) void replyTo(conversation.id);
    }),
  );
  bot.catch((err) => logger.error({ err: err.error, business: tenant.id }, "telegram update failed"));

  const forward = async (e: BusEvent) => {
    if (e.tenant !== tenant.id || e.type !== "message" || e.messenger !== "Telegram" || !e.external_user_id.startsWith("tg_")) return;
    const chatId = Number(e.external_user_id.slice(3));
    try {
      await bot.api.sendMessage(chatId, e.text);
    } catch (err) {
      logger.error({ err, chatId, business: tenant.id }, "telegram send failed");
    }
  };
  bus.on("event", forward);

  void bot.start({ drop_pending_updates: false, onStart: (me) => logger.info({ business: tenant.id }, `Telegram bot @${me.username} is listening`) });
  return {
    stop: async () => {
      bus.off("event", forward);
      await bot.stop();
    },
  };
}
