// Pure helpers: no network, easy to test.
import crypto from 'node:crypto';

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function waText(m) {
  if (m.type === 'text') return m.text?.body ?? '';
  if (m.type === 'button') return m.button?.text ?? '';
  if (m.type === 'interactive') {
    return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
  }
  return ''; // image, audio, location... are not understood yet
}

/** Turns a Meta webhook body into a flat list of incoming messages. */
export function parseWebhook(body) {
  const out = [];
  if (!body || typeof body !== 'object') return out;
  for (const entry of body.entry ?? []) {
    if (body.object === 'whatsapp_business_account') {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          out.push({
            channel: 'whatsapp',
            accountId: v.metadata?.phone_number_id,
            from: m.from,
            name: names.get(m.from) ?? null,
            messageId: m.id,
            text: waText(m),
          });
        }
      }
    } else if (body.object === 'instagram') {
      for (const ev of entry.messaging ?? []) {
        const msg = ev.message;
        if (!msg || msg.is_echo) continue; // skip our own outgoing messages
        out.push({
          channel: 'instagram',
          accountId: ev.recipient?.id ?? entry.id,
          from: ev.sender?.id,
          name: null,
          messageId: msg.mid,
          text: msg.text ?? '',
        });
      }
    }
  }
  return out.filter((m) => m.accountId && m.from);
}

/**
 * Body sent to VoroniX: POST /api/channels/:business/:messenger/inbound
 * If the inbound route expects other field names, change ONLY this function.
 */
export function buildInboundPayload(msg) {
  return {
    channel: msg.channel,
    from: msg.from,
    externalId: msg.from,
    name: msg.name,
    text: msg.text,
    messageId: msg.messageId,
  };
}

/** Finds the AI's reply text(s) in the inbound route's JSON answer. */
export function extractReply(data) {
  if (data == null) return [];
  if (typeof data === 'string') return data.trim() ? [data.trim()] : [];
  const candidates = [data.reply, data.replies, data.text, data.message, data.messages, data.answer, data.response];
  for (const c of candidates) {
    const list = (Array.isArray(c) ? c : [c])
      .map((x) => (typeof x === 'string' ? x : (x?.text ?? x?.body ?? '')))
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (list.length) return list;
  }
  return [];
}

/** Splits long text on line or word boundaries (WhatsApp max 4096, Instagram max 1000). */
export function chunkText(text, max) {
  const parts = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Meta retries webhooks; this remembers message ids for a while. */
export function makeDedupe(ttlMs = 10 * 60 * 1000) {
  const seen = new Map();
  return (id) => {
    const now = Date.now();
    for (const [k, t] of seen) if (now - t > ttlMs) seen.delete(k);
    if (!id) return false;
    if (seen.has(id)) return true;
    seen.set(id, now);
    return false;
  };
}
