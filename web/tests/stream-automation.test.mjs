import test from 'node:test';
import assert from 'node:assert/strict';
import { readDriveChunk, backfillStreamLibrary, streamServiceEnabled } from '../stream-admin.mjs';

const video = {
  provider: 'drive', providerId: 'publicDriveVideo123', id: 'drive:publicDriveVideo123',
  dance: 'Salsa', filename: '0001.mp4', size: 32, duration: 15,
};

test('existing-library conversion remains disabled until the paid provider is explicitly enabled', async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ enabled: false });
  try {
    assert.equal(await streamServiceEnabled(), false);
    const result = await backfillStreamLibrary({
      videos: [video], connection: null, admin: null,
      isPublished: () => false, onPublished() {}, onProgress() {},
    });
    assert.deepEqual(result, { status: 'disabled', total: 0, completed: 0, skipped: 0 });
  } finally { globalThis.fetch = prior; }
});

test('Drive source download sends only a bounded Range to the authorized fixed Drive API', async () => {
  let called = false;
  const connection = {
    async request(url, options) {
      called = true;
      assert.match(url, /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/publicDriveVideo123\?alt=media/);
      assert.equal(options.headers.Range, 'bytes=0-7');
      return new Response(new Uint8Array(8), { status: 206, headers: { 'Content-Range': 'bytes 0-7/32' } });
    },
  };
  const chunk = await readDriveChunk(connection, video, 0, 8);
  assert.equal(called, true);
  assert.equal(chunk.size, 8);
});

test('malformed Drive ranges and ignored upstream Range responses cannot be published', async () => {
  const connection = { request: async () => new Response(new Uint8Array(32), { status: 200 }) };
  await assert.rejects(readDriveChunk(connection, video, 0, 8), /requested video bytes/);
  await assert.rejects(readDriveChunk(connection, video, -1, 8), /Invalid original video range/);
  await assert.rejects(readDriveChunk(connection, video, 0, 33), /Invalid original video range/);
  await assert.rejects(readDriveChunk(connection, { ...video, providerId: 'https://attacker.test' }, 0, 8), /Invalid original video range/);
});

test('a short Drive response is detected before forwarding any bytes to the video encoder', async () => {
  const connection = {
    request: async () => new Response(new Uint8Array(7), { status: 206, headers: { 'Content-Range': 'bytes 0-7/32' } }),
  };
  await assert.rejects(readDriveChunk(connection, video, 0, 8), /incomplete/);
});
