import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanState, emptyState, filterVideos, SOURCES } from '../core.mjs';
import { cleanLabels, cleanDetails, createLabel, seedLabels, nextNumber, numberedName } from '../studio-model.mjs';
import { DriveConnection, acknowledgedOffset } from '../drive.mjs';

test('labels distinguish their type, deduplicate Unicode/case/spacing and keep deleted suggestions deleted', () => {
  const labels = seedLabels();
  const first = createLabel(labels, ' José  y María ', 'Artist');
  assert.equal(createLabel(labels, 'JOSE\u0301 Y MARI\u0301A', 'Artist').id, first.id);
  assert.notEqual(createLabel(labels, 'José y María', 'Style').id, first.id);
  assert.deepEqual(cleanLabels([]), []);
  assert.equal(cleanLabels([{ id: '__proto__', name: 'Bad type', type: 'HTML' }]).length, 0);
});
test('old web backups migrate without losing ratings or inventing artists and recording dates', () => {
  const old = { version: 1, meta: { 'drive:abcdefghijk': { rating: 9, notes: 'Keep shoulders relaxed' } }, youtube: [] };
  const migrated = cleanState(old);
  assert.equal(migrated.meta['drive:abcdefghijk'].rating, 9);
  assert.equal(migrated.meta['drive:abcdefghijk'].notes, old.meta['drive:abcdefghijk'].notes);
  assert.deepEqual(migrated.meta['drive:abcdefghijk'].artistIds, []);
  assert.equal(migrated.meta['drive:abcdefghijk'].recordedAt, '');
  assert.ok(migrated.labels.length > 15);
  assert.deepEqual(migrated.drive, []);
});
test('metadata backups retain typed labels and valid loops, and discard invalid loop boundaries', () => {
  const state = emptyState(); state.meta['drive:abcdefghijk'] = { labelIds: ['label-1'], artistIds: ['artist-1'], recordedAt: '2026-10-24', event: 'Partnerwork class', bpm: 125, loops: [{ id: 'a', name: 'Turn', start: 3, end: 9 }, { id: 'b', name: 'Invalid', start: 9, end: 2 }] };
  const clean = cleanState(JSON.parse(JSON.stringify(state)));
  assert.equal(clean.meta['drive:abcdefghijk'].loops.length, 1);
  assert.equal(clean.meta['drive:abcdefghijk'].bpm, 125);
  assert.equal(cleanDetails({ bpm: 400, recordedAt: 'not a date' }).bpm, null);
});
test('dropdown filters combine all selected labels with any selected artist and text search includes metadata', () => {
  const labels = [{ id: 's', name: 'Salsa On2', type: 'Style', dance: 'Salsa' }, { id: 't', name: 'Musicality', type: 'Technique', dance: 'Both' }, { id: 'a', name: 'José y María', type: 'Artist', dance: 'Both' }];
  const video = { id: 'drive:abcdefghijk', provider: 'drive', providerId: 'abcdefghijk', dance: 'Salsa', title: '0001' };
  const meta = { [video.id]: { labelIds: ['s', 't'], artistIds: ['a'], event: 'Friday class' } };
  assert.equal(filterVideos([video], meta, { labelIds: ['s', 't'], artistIds: ['a'] }, labels).length, 1);
  assert.equal(filterVideos([video], meta, { labelIds: ['missing'] }, labels).length, 0);
  assert.equal(filterVideos([video], meta, { query: 'josé' }, labels).length, 1);
  assert.equal(filterVideos([video], meta, { query: 'friday' }, labels).length, 1);
});
test('new uploads number above observed names and reserved numbers, preserving the video extension', () => {
  assert.equal(nextNumber(['0001.mp4', '0114.mp4', 'class.mp4']), 115);
  assert.equal(nextNumber(['0005.mov'], 140), 141);
  assert.equal(numberedName(115, 'My dance.MOV'), '0115.mov');
  assert.equal(numberedName(10001, 'class.webm'), '10001.webm');
  assert.throws(() => numberedName(1, 'script.html'));
  assert.equal(acknowledgedOffset('bytes=0-8388607'), 8388608);
  assert.equal(acknowledgedOffset(null), 0);
});
test('Drive destination checks reject non-writable folders before allocating a new file', async () => {
  const connection = new DriveConnection();
  connection.request = async () => Response.json({ id: SOURCES[0].folderId, mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false } });
  await assert.rejects(() => connection.inspect('Salsa'), /cannot upload/);
  await assert.rejects(() => connection.inspect('Other'), /Choose Salsa/);
});
test('resumable upload sends the selected fixed parent and confirms a stable ID without overwriting', async () => {
  const connection = new DriveConnection(), requests = [];
  const job = { id: 'newDriveIdentity12', name: '0115.mp4', number: 115, dance: 'Salsa', folderId: SOURCES[0].folderId, file: new File([new Uint8Array(9 * 1024 * 1024)], 'original.mp4', { type: 'video/mp4' }), offset: 0, session: '', completed: false };
  connection.list = async () => ({ source: SOURCES[0], files: [], videos: [] });
  connection.request = async (url, options) => {
    requests.push({ url, ...options });
    if (options.method === 'POST') return new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } });
    if (requests.length === 2) return new Response(null, { status: 308, headers: { Range: 'bytes=0-8388607' } });
    return Response.json({ id: job.id, name: job.name, mimeType: 'video/mp4', parents: [job.folderId], size: String(job.file.size), createdTime: '2026-10-24T12:00:00Z' });
  };
  const progress = []; const result = await connection.upload(job, (bytes) => progress.push(bytes), new AbortController().signal);
  assert.deepEqual(JSON.parse(requests[0].body).parents, [SOURCES[0].folderId]);
  assert.equal(requests[1].headers['Content-Range'], `bytes 0-8388607/${job.file.size}`);
  assert.equal(requests[2].headers['Content-Range'], `bytes 8388608-${job.file.size - 1}/${job.file.size}`);
  assert.equal(result.id, `drive:${job.id}`); assert.equal(result.filename, '0115.mp4');
  assert.equal(progress.at(-1), job.file.size);
  await connection.upload(job, () => {}, new AbortController().signal);
  assert.equal(requests.length, 3, 'completed job retry must not make another request');
});
test('an interrupted Drive upload resumes the same ID from the provider acknowledged offset', async () => {
  const connection = new DriveConnection(), requests = [];
  const job = { id: 'newDriveIdentity12', name: '0115.mp4', dance: 'Salsa', folderId: SOURCES[0].folderId, file: new File([new Uint8Array(1024)], 'original.mp4', { type: 'video/mp4' }), offset: 0, session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test', completed: false };
  connection.request = async (url, options) => {
    requests.push(options);
    if (requests.length === 1) return new Response(null, { status: 308, headers: { Range: 'bytes=0-511' } });
    return Response.json({ id: job.id, name: job.name, parents: [job.folderId], size: '1024' });
  };
  const result = await connection.upload(job, () => {}, new AbortController().signal);
  assert.equal(requests[0].headers['Content-Range'], 'bytes */1024');
  assert.equal(requests[1].headers['Content-Range'], 'bytes 512-1023/1024');
  assert.equal(result.providerId, job.id);
});
test('an expired upload URL checks the reserved ID instead of creating a duplicate completed file', async () => {
  const connection = new DriveConnection(); let calls = 0;
  const job = { id: 'newDriveIdentity12', name: '0115.mp4', dance: 'Salsa', folderId: SOURCES[0].folderId, file: new File([new Uint8Array(1024)], 'original.mp4', { type: 'video/mp4' }), offset: 0, session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=expired', completed: false };
  connection.request = async () => { calls++; if (calls === 1) throw Object.assign(new Error('Session expired'), { status: 404 }); return Response.json({ id: job.id, name: job.name, size: '1024', parents: [job.folderId] }); };
  const result = await connection.upload(job, () => {}, new AbortController().signal);
  assert.equal(result.providerId, job.id); assert.equal(calls, 2);
});
