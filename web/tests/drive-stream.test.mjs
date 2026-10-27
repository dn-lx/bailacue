import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaHandler, byteRange, MAX_CHUNK } from '../drive-stream.mjs';
const id = 'publicDriveVideo123';
const file = { id: `drive:${id}`, providerId: id, provider: 'drive', dance: 'Salsa', filename: '0001.mp4', size: 32 };
const catalogue = videos => ({ rootFolderId: '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P', videos });
const request = (range = 'bytes=0-7', options = {}) => new Request(`https://baila.test/api/drive-video/${id}`, { ...options, headers: range ? { Range: range } : {} });
const media = (start = 0, end = 7, size = 32) => new Response(new Uint8Array(end - start + 1), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
test('range windows cover start, middle and suffix seeks without exceeding the binary response limit', () => {
  assert.deepEqual(byteRange('bytes=0-', MAX_CHUNK * 20), { start: 0, end: MAX_CHUNK - 1, partial: true });
  assert.deepEqual(byteRange(`bytes=${MAX_CHUNK}-`, MAX_CHUNK * 20), { start: MAX_CHUNK, end: MAX_CHUNK * 2 - 1, partial: true });
  assert.deepEqual(byteRange('bytes=-10', 32), { start: 22, end: 31, partial: true });
  assert.deepEqual(byteRange('bytes=20-99', 32), { start: 20, end: 31, partial: true });
  for (const value of ['bytes=40-', 'bytes=9-2', 'bytes=0-1,4-8', 'bytes=-0', 'bytes=9007199254740992-', 'bytes=-99999999999999999999']) assert.equal(byteRange(value, 32), null);
  assert.equal(byteRange('', MAX_CHUNK + 1), null);
});
test('public original bytes use only the fixed Google URL and never forward caller cookies or authorization', async () => {
  const handler = createMediaHandler(catalogue([file]), async (url, options) => {
    assert.equal(new URL(url).origin, 'https://drive.usercontent.google.com');
    assert.equal(new URL(url).searchParams.get('id'), id);
    assert.deepEqual(options.headers, { Range: 'bytes=0-7' }); assert.equal(options.redirect, 'error');
    return media();
  });
  const req = request(); req.headers.set('Cookie', 'private-cookie'); req.headers.set('Authorization', 'private-token');
  const response = await handler(req);
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 0-7/32');
  assert.equal((await response.arrayBuffer()).byteLength, 8);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Content-Disposition'), null);
});
test('unknown IDs, wrong folders, injected URLs and non-read methods never fetch', async () => {
  let calls = 0;
  const handler = createMediaHandler(catalogue([file, { ...file, providerId: 'otherDriveVideo123', id: 'drive:otherDriveVideo123', folderId: 'unapproved' }]), async () => { calls++; throw Error('must not fetch'); });
  for (const path of ['/api/drive-video/unknownDriveVideo', '/api/drive-video/otherDriveVideo123', `/api/drive-video/${id}?url=https://attacker.test`, '/api/drive-video/https%3A%2F%2Fattacker.test']) assert.equal((await handler(new Request(`https://baila.test${path}`))).status, 404);
  assert.equal((await handler(request(null, { method: 'POST' }))).status, 405); assert.equal(calls, 0);
});
test('HEAD and invalid ranges avoid downloading original bytes', async () => {
  let calls = 0; const handler = createMediaHandler(catalogue([file]), async () => { calls++; return media(); });
  const head = await handler(request(null, { method: 'HEAD' })); assert.equal(head.status, 200); assert.equal(head.headers.get('Content-Length'), '32'); assert.equal(await head.text(), '');
  const invalid = await handler(request('bytes=32-')); assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('Content-Range'), 'bytes */32'); assert.equal(calls, 0);
});
test('a small complete file supports a normal GET', async () => {
  const handler = createMediaHandler(catalogue([file]), async () => new Response(new Uint8Array(32), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '32' } }));
  const result = await handler(request(null)); assert.equal(result.status, 200); assert.equal((await result.arrayBuffer()).byteLength, 32);
});
test('large open-ended range requests fetch bounded chunks and preserve total size for browser seeking', async () => {
  const large = { ...file, size: MAX_CHUNK * 25 };
  const handler = createMediaHandler(catalogue([large]), async (_, options) => {
    assert.equal(options.headers.Range, `bytes=0-${MAX_CHUNK - 1}`); return media(0, MAX_CHUNK - 1, large.size);
  });
  const result = await handler(request('bytes=0-')); assert.equal(result.status, 206); assert.equal((await result.arrayBuffer()).byteLength, MAX_CHUNK);
});
test('Google sign-in pages, ignored ranges and changed file sizes never reach the video player', async () => {
  for (const upstream of [new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }), media(1, 8), media(0, 7, 64), new Response(new Uint8Array(8), { headers: { 'Content-Type': 'video/mp4' } })]) {
    const handler = createMediaHandler(catalogue([file]), async () => upstream); const result = await handler(request()); assert.equal(result.status, 502); assert.ok(!(await result.text()).includes('<html>'));
  }
});
test('truncated and oversized upstream bodies are rejected even without a content-length header', async () => {
  for (const length of [7, 9]) {
    const handler = createMediaHandler(catalogue([file]), async () => new Response(new Uint8Array(length), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-7/32' } }));
    assert.equal((await handler(request())).status, 502);
  }
});
test('permission, quota and timeout failures return actionable errors without raw provider diagnostics', async () => {
  for (const status of [403, 404, 429, 500]) {
    const handler = createMediaHandler(catalogue([file]), async () => new Response('private-provider-diagnostic', { status }));
    const response = await handler(request()); assert.equal(response.status, status === 500 ? 502 : status); assert.ok(!(await response.text()).includes('private-provider'));
  }
  const handler = createMediaHandler(catalogue([file]), async () => { throw new Error('private diagnostic'); }); assert.equal((await handler(request())).status, 502);
});
