import { createHmac } from "node:crypto";
import { safeEqual } from "./safe-equal.js";

/** Meta signs the raw body: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(body, App Secret). */
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(header, expected);
}

export interface WhatsAppText {
  id: string;
  from: string;
  name: string;
  text: string;
}

/** Pulls text messages out of Meta's nested payload: entry -> changes -> value -> messages. Other event types are ignored. */
export function parseWhatsAppPayload(body: unknown): WhatsAppText[] {
  const out: WhatsAppText[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const names = new Map<string, string>();
      for (const c of value?.contacts ?? []) {
        if (c?.wa_id) names.set(String(c.wa_id), String(c?.profile?.name ?? ""));
      }
      for (const m of value?.messages ?? []) {
        if (m?.type !== "text" || typeof m?.text?.body !== "string" || !m?.id || !m?.from) continue;
        out.push({
          id: String(m.id),
          from: String(m.from),
          name: names.get(String(m.from)) || `wa_${m.from}`,
          text: m.text.body,
        });
      }
    }
  }
  return out;
}

/** Meta retries a delivery when it does not get a quick 200, so the same message id can arrive twice. Kept in memory: enough for one server process. */
const seen = new Set<string>();
const MAX_SEEN = 5000;

export function firstTime(id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value as string);
  return true;
}