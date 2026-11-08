import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPTIMIZED_ROOT, OPTIMIZED_FOLDERS, OPTIMIZED_PRESET,
  parseOptimizedManifest, optimizedForSource, asOptimizedFile,
} from '../optimized-delivery.mjs';
import { createMediaHandler } from '../drive-stream.mjs';

const source = { id: 'drive:publicDriveVideo123', providerId: 'publicDriveVideo123', provider: 'drive', dance: 'Salsa', folderId: '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm', size: 10000, filename: '0001.mp4' };
const copy = { sourceId: source.id, driveId: 'derivedDriveVideo123', dance: 'Salsa', folderId: OPTIMIZED_FOLDERS.Salsa, filename: '0001-publicDriv.mp4', size: 2048 };
const manifest = { version: 1, rootFolderId: OPTIMIZED_ROOT, preset: OPTIMIZED_PRESET, entries: [copy] };

test('validated free Drive manifest preserves stable original IDs', () => {
  const value = parseOptimizedManifest(manifest);
  assert.deepEqual(value?.entries, [copy]);
  assert.equal(optimizedForSource(value, source.id)?.driveId, copy.driveId);
  assert.deepEqual(asOptimizedFile(copy), {
    id: 'drive:derivedDriveVideo123',
    provider: 'drive', providerId: 'derivedDriveVideo123', dance: 'Salsa',
    folderId: copy.folderId, filename: copy.filename, size: copy.size,
    sourceId: source.id, optimizedPreset: OPTIMIZED_PRESET,
  });
});

test('manifest rejects unapproved derived folders, duplicate mappings and malformed IDs', () => {
  const bad = [
    { ...manifest, rootFolderId: 'untrustedFolder' },
    { ...manifest, preset: 'arbitrary' },
    { ...manifest, entries: [copy, copy] },
    { ...manifest, entries: [{ ...copy, driveId: 'https://evil.test/video' }] },
    { ...manifest, entries: [{ ...copy, folderId: 'someOtherFolder' }] },
    { ...manifest, entries: [{ ...copy, dance: 'Bachata' }] },
    { ...manifest, entries: [{ ...copy, size: 0 }] },
    { ...manifest, entries: [{ ...copy, filename: '0001.mkv' }] },
  ];
  for (const candidate of bad) assert.equal(parseOptimizedManifest(candidate), null);
});

test('verified derived MP4 is playable through bounded Drive ranges', async () => {
  const calls = [];
  const catalogue = { rootFolderId: '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P', videos: [source] };
  const handler = createMediaHandler(catalogue, async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(new Uint8Array(8), {
      status: 206,
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-7/2048' },
    });
  }, async () => null, async id => id === copy.driveId ? asOptimizedFile(copy) : null);
  const response = await handler(new Request('https://baila.test/api/drive-video/' + copy.driveId, { headers: { Range: 'bytes=0-7' } }));
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('id'), copy.driveId);
  assert.equal(calls[0].options.headers.Range, 'bytes=0-7');
});

test('unknown or mismatched source ID does not authorize arbitrary Drive proxy', async () => {
  const catalogue = { rootFolderId: '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P', videos: [source] };
  let upstreamCalled = false;
  const handler = createMediaHandler(catalogue, async () => { upstreamCalled = true; throw new Error('never'); },
    async () => null,
    async () => ({ ...asOptimizedFile(copy), sourceId: 'drive:notCataloguedOriginal123' }));
  const response = await handler(new Request('https://baila.test/api/drive-video/' + copy.driveId, { headers: { Range: 'bytes=0-7' } }));
  assert.equal(response.status, 404);
  assert.equal(upstreamCalled, false);
});
