import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotosSession, selectedPhotosVideos, endPhotosSession } from '../photos-picker.mjs';

test('Photos picker imports only selected videos, pages results and skips already imported IDs', async t => {
  const fetched = [];
  t.mock.method(globalThis, 'fetch', async (raw, options) => {
    const url = new URL(raw);
    fetched.push([url, options]);
    assert.equal(options.headers.Authorization, 'Bearer photos-token');
    if (url.pathname.endsWith('/sessions')) return Response.json({ id: 'session-one', pickerUri: 'https://photos.google.com/picker/example' });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/session-one')) return Response.json({ mediaItemsSet: true });
    if (url.pathname === '/api/photos-picker/download') return new Response('video bytes');
    if (url.searchParams.get('pageToken')) return Response.json({ mediaItems: [{ id: 'video-one', type: 'VIDEO', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/example', filename: 'dance.mov', mimeType: 'video/quicktime' } }] });
    return Response.json({ nextPageToken: 'next', mediaItems: [{ id: 'photo-one', type: 'PHOTO' }] });
  });
  const session = await createPhotosSession({ authorize: async scope => {
    assert.match(scope, /photospicker.mediaitems.readonly$/);
    return { access_token: 'photos-token' };
  } });
  const picked = [];
  assert.equal(await selectedPhotosVideos(session, file => picked.push(file)), 1);
  assert.equal(await selectedPhotosVideos(session, file => picked.push(file)), 0);
  assert.equal(picked[0].name, 'dance.mov');
  assert.equal(picked[0].type, 'video/quicktime');
  assert.equal(fetched.filter(([url]) => url.pathname === '/api/photos-picker/download').length, 1);
  await endPhotosSession(session);
  assert.equal(fetched.at(-1)[1].method, 'DELETE');
});

test('Photos picker waits until selection is complete', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ mediaItemsSet: false }));
  await assert.rejects(selectedPhotosVideos({ id: 'test', token: 'token' }, () => assert.fail()), /tap Done/);
});
