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
  if (m.type === 'image' || m.type === 'video') return m[m.type]?.caption ?? ''; // caption under a photo/video
  return ''; // location, contacts, stickers, documents... are not understood
}

const MEDIA_KINDS = ['image', 'audio', 'video'];

/** WhatsApp: the file itself is fetched later by media id (Graph API). */
function waMedia(m) {
  if (!MEDIA_KINDS.includes(m.type)) return null;
  const o = m[m.type];
  return o?.id ? { kind: m.type, id: o.id, mime: o.mime_type ?? null } : null;
}

/** Instagram: attachments carry a direct CDN url. */
function igMedia(msg) {
  return (msg.attachments ?? [])
    .filter((a) => MEDIA_KINDS.includes(a?.type) && typeof a.payload?.url === 'string')
    .map((a) => ({ kind: a.type, url: a.payload.url }));
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
          const item = {
            channel: 'whatsapp',
            accountId: v.metadata?.phone_number_id,
            from: m.from,
            name: names.get(m.from) ?? null,
            messageId: m.id,
            text: waText(m),
          };
          const media = waMedia(m);
          if (media) item.media = [media];
          out.push(item);
        }
      }
    } else if (body.object === 'instagram') {
      for (const ev of entry.messaging ?? []) {
        const msg = ev.message;
        if (!msg || msg.is_echo) continue; // skip our own outgoing messages
        const item = {
          channel: 'instagram',
          accountId: ev.recipient?.id ?? entry.id,
          from: ev.sender?.id,
          name: null,
          messageId: msg.mid,
          text: msg.text ?? '',
        };
        const media = igMedia(msg);
        if (media.length) item.media = media;
        out.push(item);
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

// ---------- media helpers (pure) ----------

/** "audio/ogg; codecs=opus" -> "audio/ogg" */
export function cleanMime(mime) {
  return String(mime ?? '').split(';')[0].trim().toLowerCase();
}

const EXT = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/wav': 'wav', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
const DEFAULT_EXT = { audio: 'ogg', video: 'mp4', image: 'jpg' };

/** File extension for a mime type; speech-to-text APIs decide the format by it. */
export function extForMime(mime, kind) {
  return EXT[cleanMime(mime)] ?? DEFAULT_EXT[kind] ?? 'bin';
}

const LABELS = { image: 'фото', audio: 'голосовое сообщение', video: 'видео' };
const clip = (s, n = 3000) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Builds the single text that VoroniX receives.
 * parts: [{kind, transcript?, description?, failed?}] from the media step; text: the caption/typed text.
 */
export function composeInboundText(text, parts = []) {
  const lines = [];
  for (const p of parts) {
    const t = clip(p.transcript);
    const d = clip(p.description);
    if (p.failed) {
      lines.push(`[Клиент прислал ${LABELS[p.kind] ?? 'файл'}, но разобрать его не удалось]`);
    } else if (p.kind === 'audio') {
      lines.push(t ? `[Голосовое сообщение клиента]: ${t}` : '[Голосовое сообщение без различимой речи]');
    } else if (p.kind === 'image') {
      lines.push(`[Клиент прислал фото. На фото: ${d}]`);
    } else {
      const bits = [t && `речь в видео: ${t}`, d && `в кадре: ${d}`].filter(Boolean);
      lines.push(bits.length ? `[Клиент прислал видео; ${bits.join('; ')}]` : '[Клиент прислал видео, содержимое разобрать не удалось]');
    }
  }
  const caption = clip(text, 4000);
  if (caption) lines.push(caption);
  return lines.join('\n');
}
