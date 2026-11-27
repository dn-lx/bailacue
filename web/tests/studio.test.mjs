import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanState, emptyState, filterVideos, SOURCES } from '../core.mjs';
import { cleanLabels, cleanDetails, createLabel, seedLabels, nextNumber, numberedName, mapDriveFile } from '../studio-model.mjs';
import { DriveConnection, acknowledgedOffset } from '../drive.mjs';
import { JSDOM } from 'jsdom';
import { labelPicker, renderLabelManager } from '../studio-ui.mjs';

test('labels distinguish their type, deduplicate Unicode/case/spacing and keep deleted suggestions deleted', () => {
  const labels = seedLabels();
  const first = createLabel(labels, ' José  y María ', 'Artist');
  assert.equal(createLabel(labels, 'JOSE\u0301 Y MARI\u0301A', 'Artist').id, first.id);
  assert.notEqual(createLabel(labels, 'José y María', 'Style').id, first.id);
  assert.deepEqual(cleanLabels([]), []);
  assert.equal(cleanLabels([{ id: '__proto__', name: 'Bad type', type: 'HTML' }]).length, 0);
});
test('artist pickers show saved artists and legacy teachers across dances', () => {
  const labels = cleanLabels([
    { id: 'artist-salsa', name: 'Salsa artist', type: 'Artist', dance: 'Salsa' },
    { id: 'artist-bachata', name: 'Bachata artist', type: 'Artist', dance: 'Bachata' },
    { id: 'legacy-teacher', name: 'Legacy teacher', type: 'Teacher', dance: 'Bachata' },
    { id: 'move-salsa', name: 'Copa', type: 'Moves', dance: 'Salsa' },
  ]);
  assert(labels.some(label => label.id === 'legacy-teacher'), 'legacy teacher names must survive label cleanup');
  assert.equal(createLabel(labels, 'Legacy Teacher', 'Artist', 'Salsa').id, 'legacy-teacher');
  const dom = new JSDOM('<div id="artists"></div><div id="moves"></div>');
  try {
    labelPicker(dom.window.document.querySelector('#artists'), {
      title: 'Artists & teachers', labels: () => labels, artists: true, dance: 'Salsa',
    });
    assert.deepEqual(
      [...dom.window.document.querySelectorAll('#artists [role="option"]')].map(option => option.dataset.id),
      ['artist-salsa', 'artist-bachata', 'legacy-teacher'],
    );
    labelPicker(dom.window.document.querySelector('#moves'), {
      title: 'Moves/Technique', labels: () => labels.filter(label => label.type === 'Moves'), dance: 'Salsa',
    });
    assert.deepEqual(
      [...dom.window.document.querySelectorAll('#moves [role="option"]')].map(option => option.dataset.id),
      ['move-salsa'],
    );
  } finally {
    dom.window.close();
  }
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

test('uploaded Drive videos use the actual creation timestamp, not the optional recording date', () => {
  const video = mapDriveFile({
    id: '1abcdEFGHijKLmnopQrSTuvWXyZ_12345', name: '0116.mp4',
    createdTime: '2026-11-07T11:22:35.000Z',
    modifiedTime: '2026-11-07T11:22:45.000Z',
    mimeType: 'video/mp4', size: '10485760',
  }, 'Bachata', SOURCES[1].folderId);
  assert.equal(video.addedAt, '2026-11-07T11:22:35.000Z');
  assert.equal(video.updatedAt, '2026-11-07T11:22:45.000Z');
  assert.equal(video.dance, 'Bachata');
  assert.equal(video.filename, '0116.mp4');
  assert.equal(cleanDetails({}).recordedAt, '');
});

test('label directory uses exclusive category tabs, grouping legacy aliases without changing IDs', async () => {
  const dom = new JSDOM('<main></main>');
  const page = dom.window.document.querySelector('main');
  const state = { labels: [
    { id: 'legacy-style', name: 'Salsa On1', type: 'Style', dance: 'Salsa' },
    { id: 'style-timing', name: 'Salsa On2', type: 'Style & timing', dance: 'Salsa' },
    { id: 'move', name: 'Copa', type: 'Moves', dance: 'Salsa' },
    { id: 'tech', name: 'Footwork', type: 'Technique', dance: 'Both' },
    { id: 'position', name: 'Shadow', type: 'Position', dance: 'Both' },
    { id: 'music', name: 'Break', type: 'Musicality', dance: 'Both' },
    { id: 'artist', name: 'Teacher A', type: 'Artist', dance: 'Both' },
    { id: 'teacher', name: 'Teacher B', type: 'Teacher', dance: 'Salsa' },
    { id: 'video', name: 'Tutorial', type: 'Video type', dance: 'Both' },
    { id: 'level', name: 'Beginner', type: 'Level', dance: 'Both' },
  ], meta: { video: { moveIds: ['move'], labelIds: ['move','tech'] } } };
  let saves = 0;
  renderLabelManager(page, { state: () => state, save: () => { saves++; return true; }, toast: () => {} });
  const tabs = [...page.querySelectorAll('[role=tab]')];
  const rows = () => [...page.querySelectorAll('[data-edit]')].map(button => button.dataset.edit);
  const select = title => tabs.find(tab => tab.textContent.trim().startsWith(title)).click();
  assert.equal(tabs.length, 8);
  assert.deepEqual(rows(), ['legacy-style', 'style-timing']);
  select('Moves');
  assert.deepEqual(rows(), ['move']);
  assert.match(page.querySelector('.label-row-main').textContent, /1 videos/);
  select('Techniques');
  assert.deepEqual(rows(), ['tech']);
  select('Positions');
  assert.deepEqual(rows(), ['position']);
  select('Musicality');
  assert.deepEqual(rows(), ['music']);
  select('Artists');
  assert.deepEqual(rows(), ['artist','teacher']);
  select('Video types');
  assert.deepEqual(rows(), ['video']);
  select('Legacy levels');
  assert.deepEqual(rows(), ['level']);
  assert.equal(page.querySelector('#label-create-panel').hidden, true);
  tabs.at(-1).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(page.querySelector('#label-create-panel').hidden, false);
  assert.deepEqual(rows(), ['legacy-style','style-timing']);
  const search = page.querySelector('#manage-label-search');
  search.value = 'On2';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.deepEqual(rows(), ['style-timing']);
  select('Moves');
  assert.equal(search.value, '');
  assert.equal(page.querySelector('#label-create-heading').textContent, 'Add move');
  page.querySelector('#new-label-name').value = 'Titanic';
  page.querySelector('#label-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await Promise.resolve();
  const created = state.labels.find(label => label.name === 'Titanic');
  assert.equal(created.type, 'Moves');
  assert.ok(rows().includes(created.id));
  page.querySelector('[data-edit="move"]').click();
  page.querySelector('.inline-label-editor input').value = 'Copa turn';
  page.querySelector('.inline-label-editor').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await Promise.resolve();
  assert.equal(state.labels.find(label => label.id === 'move').name, 'Copa turn');
  assert.deepEqual(state.meta.video.moveIds, ['move']);
  select('Styles');
  page.querySelector('#new-label-name').value = 'Salsa On1';
  page.querySelector('#new-label-dance').value = 'Salsa';
  page.querySelector('#label-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.match(page.querySelector('#label-error').textContent, /already exists/);
  assert.equal(saves, 2);
  dom.window.close();
});
