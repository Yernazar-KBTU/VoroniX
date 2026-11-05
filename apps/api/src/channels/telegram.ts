import { createHash } from "node:crypto";
import { Bot, webhookCallback } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { RequestHandler } from "express";
import { config } from "../config.js";
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
 *
 * On a public https address the bot uses a webhook: Telegram calls
 * /api/channels/<business>/telegram/webhook, which also wakes a server that
 * fell asleep (Render free plan). Elsewhere (local runs) it polls Telegram.
 */

/** Webhook handlers of running bots, by business id. */
export const telegramHooks = new Map<string, RequestHandler>();

/** A secret Telegram sends back on every webhook call; stable across restarts, never the token itself. */
export const hookSecret = (token: string) => createHash("sha256").update(`voronix-telegram:${token}`).digest("hex").slice(0, 48);
export const hookUrl = (business: string) => `${config.APP_URL}/api/channels/${encodeURIComponent(business)}/telegram/webhook`;
export function startTelegram(
  token: string,
  tenant: Tenant,
  opts: { mode?: "webhook" | "polling"; botInfo?: UserFromGetMe } = {},
): { stop: () => Promise<void> } {
  const bot = new Bot(token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);

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

  if ((opts.mode ?? config.TELEGRAM_MODE) === "webhook") {
    telegramHooks.set(tenant.id, webhookCallback(bot, "express", { secretToken: hookSecret(token) }));
    void bot.api
      .setWebhook(hookUrl(tenant.id), { secret_token: hookSecret(token), allowed_updates: ["message"] })
      .then(() => logger.info({ business: tenant.id }, "Telegram webhook is set"))
      .catch((err) => logger.error({ err, business: tenant.id }, "could not set the Telegram webhook"));
    return {
      stop: async () => {
        bus.off("event", forward);
        telegramHooks.delete(tenant.id);
      },
    };
  }
  void bot.api
    .deleteWebhook()
    .catch(() => {})
    .then(() => bot.start({ drop_pending_updates: false, onStart: (me) => logger.info({ business: tenant.id }, `Telegram bot @${me.username} is listening`) }));
  return {
    stop: async () => {
      bus.off("event", forward);
      await bot.stop();
    },
  };
}
