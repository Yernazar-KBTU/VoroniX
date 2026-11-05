import { config } from "../config.js";
import { logger } from "../lib/logger.js";

/** What VoroniX AI understood in a client message. */
export type Intent = "greeting" | "price" | "booking" | "cancel" | "complaint" | "address" | "hours" | "confirm" | "thanks" | "other";

export interface Understanding {
  intents: Set<Intent>;
  lang: "ru" | "kk" | "en";
}

let warned = false;

/**
 * Asks the VoroniX AI service what the client wants. Returns null when the
 * service is not configured, is asleep or answers with an error: the caller
 * then relies on its own rules, so a chat never waits on this call.
 */
export async function understand(text: string, url = config.VORONIX_AI_URL, key = config.VORONIX_AI_KEY): Promise<Understanding | null> {
  if (!url || !text.trim()) return null;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/v1/classify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ text: text.slice(0, 1000) }),
      signal: AbortSignal.timeout(config.VORONIX_AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`VoroniX AI answered ${res.status}`);
    const body = (await res.json()) as { intents?: { label: Intent }[]; lang?: Understanding["lang"] };
    if (!Array.isArray(body.intents) || !body.lang) throw new Error("VoroniX AI sent an unexpected answer");
    warned = false;
    return { intents: new Set(body.intents.map((i) => i.label)), lang: body.lang };
  } catch (err) {
    if (!warned) logger.warn({ err: (err as Error).message }, "VoroniX AI is not reachable, the built-in rules answer alone");
    warned = true;
    return null;
  }
}
