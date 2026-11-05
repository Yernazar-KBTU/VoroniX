import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { bus } from "../realtime/bus.js";

/** What VoroniX AI understood in a client message. */
export type Intent = "greeting" | "price" | "booking" | "cancel" | "complaint" | "address" | "hours" | "confirm" | "thanks" | "other";

export interface Understanding {
  intents: Set<Intent>;
  lang: "ru" | "kk" | "en";
}

/** Whether VoroniX AI answers: "off" when no address is set, "ok" after a good answer, "down" after a failed call. */
export interface VoronixHealth {
  state: "off" | "ok" | "down";
  error: string | null;
  at: string | null;
}

let health: VoronixHealth = { state: "off", error: null, at: null };

/**
 * Asks VoroniX AI's /health right now and returns its state. Called by the CRM's
 * /api/health, on first load of the app and every 30 seconds by the server, so a
 * fall is seen even when no client is writing.
 */
export async function checkVoronix(url = config.VORONIX_AI_URL): Promise<VoronixHealth> {
  if (!url) {
    record({ state: "off", error: null, at: null });
    return health;
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(config.VORONIX_AI_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`it answered ${res.status}`);
    record({ state: "ok", error: null, at: new Date().toISOString() });
  } catch (err) {
    record({ state: "down", error: reason(err as Error), at: new Date().toISOString() });
  }
  return health;
}

const reason = (e: Error) => (e.name === "TimeoutError" ? `no answer in ${config.VORONIX_AI_TIMEOUT_MS} ms` : e.message.replace(/^fetch failed$/, "it cannot be reached"));

function record(next: VoronixHealth) {
  const changed = next.state !== health.state || next.error !== health.error;
  health = next;
  if (changed) bus.publish({ type: "voronix", state: next.state, error: next.error });
}

/** VoroniX AI was asked and did not answer. The chat stops and a person sees why: no fallback answers. */
export class VoronixDown extends Error {
  constructor(reason: string) {
    super(`VoroniX AI is down: ${reason}`);
    this.name = "VoronixDown";
  }
}

/**
 * Asks the VoroniX AI service what the client wants. With no address set
 * (demos, tests without the service) it returns null and the rules work alone.
 * With an address set, a failure is not hidden: it throws VoronixDown, the
 * chat gets no automatic answer, and the CRM shows that the AI is down.
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
    if (!res.ok) throw new Error(res.status === 401 ? "the key is wrong (401)" : `it answered ${res.status}`);
    const body = (await res.json()) as { intents?: { label: Intent }[]; lang?: Understanding["lang"] };
    if (!Array.isArray(body.intents) || !body.lang) throw new Error("it sent an unexpected answer");
    record({ state: "ok", error: null, at: new Date().toISOString() });
    return { intents: new Set(body.intents.map((i) => i.label)), lang: body.lang };
  } catch (err) {
    const why = reason(err as Error);
    logger.error({ err: why, url }, "VoroniX AI is down");
    record({ state: "down", error: why, at: new Date().toISOString() });
    throw new VoronixDown(why);
  }
}
