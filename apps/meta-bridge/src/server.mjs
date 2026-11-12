// VoroniX Meta bridge: WhatsApp Cloud API + Instagram DM  <->  VoroniX inbound webhook.
import http from 'node:http';
import {
  verifySignature, parseWebhook, buildInboundPayload, extractReply, chunkText, makeDedupe,
} from './lib.mjs';

const env = process.env;
const PORT = Number(env.PORT || 4000);
const VORONIX_URL = (env.VORONIX_URL || 'http://localhost:3000').replace(/\/$/, '');
const APP_SECRET = env.META_APP_SECRET || '';
const VERIFY_TOKEN = env.META_VERIFY_TOKEN || '';
const GRAPH = `https://graph.facebook.com/${env.GRAPH_VERSION || 'v21.0'}`;
const IG_GRAPH = `${env.INSTAGRAM_GRAPH_BASE || 'https://graph.facebook.com'}/${env.GRAPH_VERSION || 'v21.0'}`;
const FALLBACK_NON_TEXT = env.FALLBACK_NON_TEXT || 'Пока я понимаю только текстовые сообщения. Напишите, пожалуйста, текстом.';
const FALLBACK_ERROR = env.FALLBACK_ERROR || 'Сейчас не получается ответить. Администратор свяжется с вами.';

// {"whatsapp:<phone_number_id>": {"business":"<id>","secret":"<x-channel-secret>","token":"<Meta token>"},
//  "instagram:<ig_account_id>":  {...}}
let accounts = {};
try { accounts = JSON.parse(env.BUSINESS_MAP || '{}'); } catch { console.error('BUSINESS_MAP is not valid JSON'); }

const isDuplicate = makeDedupe();
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function sendToMeta(msg, acc, text) {
  const isWa = msg.channel === 'whatsapp';
  const url = isWa ? `${GRAPH}/${msg.accountId}/messages` : `${IG_GRAPH}/me/messages`;
  const body = isWa
    ? { messaging_product: 'whatsapp', to: msg.from, type: 'text', text: { body: text } }
    : { recipient: { id: msg.from }, message: { text } };
  for (const part of chunkText(text, isWa ? 4000 : 950)) {
    if (isWa) body.text.body = part; else body.message.text = part;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${acc.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function askVoronix(msg, acc) {
  const res = await fetch(`${VORONIX_URL}/api/channels/${acc.business}/${msg.channel}/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-channel-secret': acc.secret },
    body: JSON.stringify(buildInboundPayload(msg)),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`VoroniX ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const type = res.headers.get('content-type') || '';
  return extractReply(type.includes('json') ? await res.json() : await res.text());
}

async function handleMessage(msg) {
  const acc = accounts[`${msg.channel}:${msg.accountId}`];
  if (!acc) return log('no business for', msg.channel, msg.accountId);
  if (isDuplicate(msg.messageId)) return;
  try {
    if (!msg.text) return await sendToMeta(msg, acc, FALLBACK_NON_TEXT);
    const replies = await askVoronix(msg, acc);
    // Empty list is fine: VoroniX may deliver the answer itself (e.g. a human takes the chat).
    for (const r of replies) await sendToMeta(msg, acc, r);
    log('ok', msg.channel, acc.business, `replies=${replies.length}`);
  } catch (err) {
    log('error', msg.channel, err.message);
    try { await sendToMeta(msg, acc, FALLBACK_ERROR); } catch (e) { log('fallback failed', e.message); }
  }
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, text = '') => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(text); };

  if (req.method === 'GET' && url.pathname === '/health') return send(200, 'ok');

  if (url.pathname.startsWith('/webhook')) {
    if (req.method === 'GET') { // Meta's one-time verification
      const ok = url.searchParams.get('hub.mode') === 'subscribe'
        && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
      return ok ? send(200, url.searchParams.get('hub.challenge') || '') : send(403);
    }
    if (req.method === 'POST') {
      let raw;
      try { raw = await readBody(req); } catch { return send(413); }
      if (!verifySignature(raw, req.headers['x-hub-signature-256'], APP_SECRET)) return send(401);
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return send(400); }
      send(200, 'EVENT_RECEIVED'); // answer Meta fast, work afterwards
      for (const msg of parseWebhook(body)) await handleMessage(msg);
      return;
    }
  }
  send(404);
});

if (!APP_SECRET || !VERIFY_TOKEN) console.warn('Set META_APP_SECRET and META_VERIFY_TOKEN, otherwise every webhook is rejected.');
server.listen(PORT, () => log(`meta-bridge on :${PORT}, accounts: ${Object.keys(accounts).length}`));
