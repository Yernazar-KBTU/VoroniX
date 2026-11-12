import { logger } from "../lib/logger.js";
import { bus, type BusEvent } from "../realtime/bus.js";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
}

/** The test setup of Meta (WhatsApp Cloud API) keeps one token and one phone number id for the whole server. */
export function whatsappConfigFromEnv(): WhatsAppConfig | null {
  const accessToken = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

/** Sends one text message to a client through the WhatsApp Cloud API. Returns true when Meta accepted it. */
export async function sendWhatsAppText(
  cfg: WhatsAppConfig,
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(`https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) }, // WhatsApp refuses longer texts
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) logger.error({ status: res.status }, "whatsapp send failed");
  return res.ok;
}

type Send = (cfg: WhatsAppConfig, to: string, text: string) => Promise<boolean>;

/**
 * Listens to CRM events and sends every message of a WhatsApp chat (AI or administrator) to the client.
 * Only chats that came through the Meta webhook are answered: their id is "wa_" + the client's number.
 */
export function whatsappForwarder(cfg: WhatsAppConfig, send: Send = sendWhatsAppText) {
  return async (e: BusEvent) => {
    if (e.type !== "message" || e.messenger !== "WhatsApp" || !e.external_user_id.startsWith("wa_")) return;
    const to = e.external_user_id.slice(3);
    try {
      await send(cfg, to, e.text);
    } catch (err) {
      logger.error({ err, to }, "whatsapp send failed");
    }
  };
}

export function startWhatsApp(cfg: WhatsAppConfig): { stop: () => Promise<void> } {
  const forward = whatsappForwarder(cfg);
  bus.on("event", forward);
  logger.info("WhatsApp replies are sent through the Cloud API");
  return {
    stop: async () => {
      bus.off("event", forward);
    },
  };
}