import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySignature, parseWebhook, extractReply, chunkText, makeDedupe } from '../src/lib.mjs';

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
