import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeMediaClient } from '../src/media.mjs';

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

// One fake server plays both Meta (Graph + file host) and the OpenAI-compatible API.
function startFake(video) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      calls.push({ url: req.url, auth: req.headers.authorization, body });
      const base = `http://127.0.0.1:${srv.address().port}`;
      const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/graph/AUDIO1') return json({ url: `${base}/files/voice`, mime_type: 'audio/ogg; codecs=opus', file_size: 5 });
      if (req.url === '/graph/IMG1') return json({ url: `${base}/files/img`, mime_type: 'image/jpeg', file_size: JPEG.length });
      if (req.url === '/graph/VID1') return json({ url: `${base}/files/vid`, mime_type: 'video/mp4', file_size: video.length });
      if (req.url === '/graph/BIG') return json({ url: `${base}/files/big`, mime_type: 'image/jpeg', file_size: 999999999 });
      if (req.url === '/files/voice') return res.end(Buffer.from('OggS-fake'));
      if (req.url === '/files/img' || req.url === '/ig/photo.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(JPEG); }
      if (req.url === '/files/vid') return res.end(video);
      if (req.url === '/v1/audio/transcriptions') return json({ text: 'Хочу записаться на завтра' });
      if (req.url === '/v1/chat/completions') {
        const n = (body.toString().match(/"type":"image_url"/g) || []).length;
        return json({ choices: [{ message: { content: `Описание по ${n} изображ.` } }] });
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('voice, photo, video (WhatsApp) and Instagram photo become text', async () => {
  let video = Buffer.from('x');
  if (hasFfmpeg) {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 't-')), 'v.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=5:size=320x240:rate=10', '-pix_fmt', 'yuv420p', f]);
    video = readFileSync(f);
  }
  const { srv, calls, base } = await startFake(video);
  try {
    const mc = makeMediaClient({ apiKey: 'k', baseUrl: `${base}/v1`, graph: `${base}/graph`, allowHttp: true });
    const acc = { token: 'META_TOKEN' };
    const parts = await mc.understand([{ kind: 'audio', id: 'AUDIO1', mime: 'audio/ogg' }], acc);
    assert.deepEqual(parts, [{ kind: 'audio', transcript: 'Хочу записаться на завтра' }]);
    // the Meta token is used for the Graph call and for the file download
    assert.ok(calls.filter((c) => c.url.startsWith('/graph/') || c.url === '/files/voice').every((c) => c.auth === 'Bearer META_TOKEN'));

    assert.deepEqual(await mc.understand([{ kind: 'image', id: 'IMG1' }], acc), [{ kind: 'image', description: 'Описание по 1 изображ.' }]);

    const ig = await mc.understand([{ kind: 'image', url: `${base}/ig/photo.jpg` }], acc);
    assert.equal(ig[0].kind, 'image');
    // Instagram CDN downloads must not receive our token
    assert.equal(calls.find((c) => c.url === '/ig/photo.jpg').auth, undefined);

    const [v] = await mc.understand([{ kind: 'video', id: 'VID1' }], acc);
    assert.equal(v.transcript, 'Хочу записаться на завтра');
    if (hasFfmpeg) assert.match(v.description, /по [1-3] изображ/);
  } finally { srv.close(); }
});

test('failures become { failed: true } instead of throwing', async () => {
  const { srv, base } = await startFake(Buffer.from('x'));
  try {
    const mc = makeMediaClient({ apiKey: 'k', baseUrl: `${base}/v1`, graph: `${base}/graph`, maxBytes: 1000 });
    const acc = { token: 't' };
    assert.deepEqual(await mc.understand([{ kind: 'image', id: 'BIG' }], acc), [{ kind: 'image', failed: true }]);
    assert.deepEqual(await mc.understand([{ kind: 'image', id: 'NOPE' }], acc), [{ kind: 'image', failed: true }]);
    assert.deepEqual(await mc.understand([{ kind: 'image', url: 'http://evil/x.jpg' }], acc), [{ kind: 'image', failed: true }]);
  } finally { srv.close(); }
});

test('disabled without an API key', () => {
  assert.equal(makeMediaClient({ graph: 'x' }).enabled, false);
});
