import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { compressionSize, pendingCopies, renderBrowserCompressor } from '../browser-compressor.mjs';
import { DriveConnection } from '../drive.mjs';
import { COMPRESSED_FOLDERS, QUALITIES } from '../optimized-delivery.mjs';

const original = {
  id: 'drive:originalClip01', providerId: 'originalClip01', provider: 'drive',
  filename: '0072.mp4', dance: 'Salsa', folderId: '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm',
  width: 1920, height: 1080, size: 180 * 1024 ** 2, duration: 690,
};

test('resolution profiles preserve aspect ratio and upscale smaller originals when needed', () => {
  assert.deepEqual(compressionSize(1080, 1920, '1080p'), { width: 1080, height: 1920 });
  assert.deepEqual(compressionSize(320, 240, '360p'), { width: 480, height: 360 });
  assert.deepEqual(compressionSize(1280, 720, '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(pendingCopies(original, { renditions: [{ quality: '720p' }] }), ['360p', '1080p']);
});

test('Drive copy naming is simple and older names are recovered by original ID and quality', async () => {
  const connection = new DriveConnection();
  let files = [];
  connection.request = async url => {
    const q = new URL(url).searchParams.get('q');
    assert.match(q, /name = '0072-720p.mp4'/);
    assert.match(q, /bailacueSourceId' and value='originalClip01'/);
    return Response.json({ files });
  };
  assert.equal((await connection.browserCopy(original, '720p')).name, '0072-720p.mp4');
  files = [{ id: 'existingCopy01', name: 'bailacue-browser-originalClip01-720p.mp4', size: '2048',
    mimeType: 'video/mp4', appProperties: { bailacueSourceId: original.providerId, bailacueQuality: '720p', bailacuePreset: 'h264-aac-ladder-v2' } }];
  assert.equal((await connection.browserCopy(original, '720p')).existing.providerId, 'existingCopy01');
  files = [{ name: '0072-720p.mp4' }];
  assert.equal((await connection.browserCopy(original, '720p')).name, '0072-originalClip01-720p.mp4');
});

function fixture(files, beforeCopy = () => {}) {
  const { window } = new JSDOM('<section hidden></section>');
  const panel = window.document.querySelector('section');
  const calls = [], registered = [];
  let manifest;
  const ctx = {
    admin: { isAdmin: true, readContent: async () => manifest ? [{ key: 'optimized:manifest', payload: manifest }] : [] },
    connection: { connected: true, list: async dance => ({ videos: files.filter(video => video.dance === dance) }), browserCopy: async (video, quality) => {
      calls.push([video.id, quality]);
      beforeCopy(quality);
      return { existing: { providerId: `${video.providerId}-${quality}`, filename: `0072-${quality}.mp4`,
        folderId: COMPRESSED_FOLDERS[video.dance], size: 2048 } };
    } },
    videos: () => [],
    optimizedFor: video => manifest?.entries.find(entry => entry.sourceId === video.id),
    ensureDriveOriginal: async video => registered.push(video.id),
    publishOptimizedManifest: async value => { manifest = value; },
  };
  renderBrowserCompressor(panel, ctx);
  return { window, panel, calls, registered, manifest: () => manifest };
}

test('all-video batch includes uncatalogued, long, large originals and resumes without duplicates', async () => {
  const f = fixture([original]);
  const start = f.panel.querySelector('#browser-compress-start');
  await start.onclick();
  assert.deepEqual(f.registered, [original.id]);
  assert.deepEqual(f.manifest().entries[0].renditions.map(item => item.quality), QUALITIES);
  assert.equal(f.manifest().entries[0].sourceId, original.id);
  await start.onclick();
  assert.equal(f.calls.length, 3);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.panel.querySelector('#browser-compress-pending').textContent, /All videos have/);
});

test('upload notification starts a batch for the uploaded original only', async () => {
  const old = { ...original, id: 'drive:olderOriginal01', providerId: 'olderOriginal01' };
  const f = fixture([old, original]);
  f.panel.dispatchEvent(new f.window.CustomEvent('bailacue-uploaded', { detail: [original] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.registered, [original.id]);
  assert.deepEqual(f.calls.map(([id]) => id), [original.id, original.id, original.id]);
});


test('one failed rendition leaves the others published and retries only the missing one', async () => {
  let failing = true;
  const f = fixture([original], quality => {
    if (failing && quality === '720p') throw new Error('temporary upload failure');
  });
  const start = f.panel.querySelector('#browser-compress-start');
  await start.onclick();
  assert.deepEqual(f.manifest().entries[0].renditions.map(item => item.quality), ['360p', '1080p']);
  assert.match(f.panel.querySelector('[role=status]').textContent, /temporary upload failure/);
  failing = false;
  await start.onclick();
  assert.deepEqual(f.calls.map(([, quality]) => quality), ['360p', '720p', '1080p', '720p']);
  assert.equal(f.manifest().entries[0].renditions.length, 3);
});
