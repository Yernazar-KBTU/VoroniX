import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifySignature, parseWebhook, extractReply, chunkText, makeDedupe, composeInboundText, extForMime,
} from '../src/lib.mjs';

test('signature: valid and invalid', () => {
  const raw = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(raw).digest('hex');
  assert.equal(verifySignature(raw, sig, 's3cret'), true);
  assert.equal(verifySignature(raw, sig, 'other'), false);
  assert.equal(verifySignature(raw, undefined, 's3cret'), false);
});

test('parses a WhatsApp text message', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '111' },
    contacts: [{ wa_id: '7700', profile: { name: 'Aigerim' } }],
    messages: [{ from: '7700', id: 'wamid.1', type: 'text', text: { body: 'Hi' } }],
  } }] }] };
  assert.deepEqual(parseWebhook(body), [{ channel: 'whatsapp', accountId: '111', from: '7700', name: 'Aigerim', messageId: 'wamid.1', text: 'Hi' }]);
});

test('parses Instagram DM and skips echoes', () => {
  const body = { object: 'instagram', entry: [{ id: '999', messaging: [
    { sender: { id: 'u1' }, recipient: { id: '999' }, message: { mid: 'm1', text: 'Hello' } },
    { sender: { id: '999' }, recipient: { id: 'u1' }, message: { mid: 'm2', text: 'bot', is_echo: true } },
  ] }] };
  const r = parseWebhook(body);
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'Hello');
});

test('non-text WhatsApp message gets empty text', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '1' }, messages: [{ from: '2', id: 'x', type: 'image' }] } }] }] };
  assert.equal(parseWebhook(body)[0].text, '');
});

test('extractReply handles several shapes', () => {
  assert.deepEqual(extractReply({ reply: 'Hi' }), ['Hi']);
  assert.deepEqual(extractReply({ replies: [{ text: 'a' }, { text: 'b' }] }), ['a', 'b']);
  assert.deepEqual(extractReply({}), []);
  assert.deepEqual(extractReply('ok'), ['ok']);
});

test('chunkText respects the limit', () => {
  const parts = chunkText('word '.repeat(500), 100);
  assert.ok(parts.every((p) => p.length <= 100));
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), 'word '.repeat(500).trim());
});

test('dedupe', () => {
  const d = makeDedupe();
  assert.equal(d('a'), false);
  assert.equal(d('a'), true);
});

test('parses WhatsApp voice, photo with caption and video', () => {
  const mk = (m) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '1' }, messages: [{ from: '2', id: 'x', ...m }] } }] }] });
  const voice = parseWebhook(mk({ type: 'audio', audio: { id: 'A1', mime_type: 'audio/ogg; codecs=opus', voice: true } }))[0];
  assert.deepEqual(voice.media, [{ kind: 'audio', id: 'A1', mime: 'audio/ogg; codecs=opus' }]);
  const photo = parseWebhook(mk({ type: 'image', image: { id: 'I1', mime_type: 'image/jpeg', caption: 'Смотрите' } }))[0];
  assert.equal(photo.text, 'Смотрите');
  assert.equal(photo.media[0].kind, 'image');
  assert.equal(parseWebhook(mk({ type: 'video', video: { id: 'V1', mime_type: 'video/mp4' } }))[0].media[0].kind, 'video');
  assert.equal(parseWebhook(mk({ type: 'sticker', sticker: { id: 'S1' } }))[0].media, undefined);
});

test('parses Instagram attachments (image, audio, video; ignores shares)', () => {
  const body = { object: 'instagram', entry: [{ id: '9', messaging: [{ sender: { id: 'u' }, recipient: { id: '9' }, message: { mid: 'm', attachments: [
    { type: 'image', payload: { url: 'https://cdn/x.jpg' } },
    { type: 'audio', payload: { url: 'https://cdn/a.mp4' } },
    { type: 'share', payload: { url: 'https://instagram.com/p/1' } },
  ] } }] }] };
  const [m] = parseWebhook(body);
  assert.equal(m.text, '');
  assert.deepEqual(m.media, [{ kind: 'image', url: 'https://cdn/x.jpg' }, { kind: 'audio', url: 'https://cdn/a.mp4' }]);
});

test('composeInboundText builds one text for VoroniX', () => {
  const t = composeInboundText('Сколько стоит ремонт?', [
    { kind: 'audio', transcript: 'Здравствуйте, хочу записаться' },
    { kind: 'image', description: 'Разбитый экран телефона' },
    { kind: 'video', transcript: '', description: 'Стиральная машина течёт' },
    { kind: 'image', failed: true },
  ]);
  assert.equal(t.split('\n').length, 5);
  assert.match(t, /Голосовое сообщение клиента\]: Здравствуйте/);
  assert.match(t, /На фото: Разбитый экран/);
  assert.match(t, /в кадре: Стиральная машина/);
  assert.match(t, /не удалось/);
  assert.ok(t.endsWith('Сколько стоит ремонт?'));
  assert.equal(composeInboundText('', []), '');
});

test('extForMime', () => {
  assert.equal(extForMime('audio/ogg; codecs=opus', 'audio'), 'ogg');
  assert.equal(extForMime(null, 'video'), 'mp4');
});
