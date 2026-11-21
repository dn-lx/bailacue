import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayTitle, filterVideos } from '../core.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const a = { id: 'drive:alpha123456789', provider: 'drive', providerId: 'alpha123456789', dance: 'Salsa', title: '0088', filename: '0088.mp4', addedAt: '2026-10-20', size: 100, duration: 40 };
const b = { id: 'drive:bravo123456789', provider: 'drive', providerId: 'bravo123456789', dance: 'Bachata', title: '0090', filename: '0090.mp4', addedAt: '2026-10-22', size: 200, duration: 120 };
const c = { id: 'drive:charlie123456', provider: 'drive', providerId: 'charlie123456', dance: 'Salsa', title: '0012', filename: '0012.mp4', addedAt: '2026-10-21', duration: 70 };
const labels = [{ id: 'move-copa', name: 'Copa', type: 'Moves' }, { id: 'style-on1', name: 'On1', type: 'Style' }];

test('Library replaces Discover as public landing page and old links redirect', () => {
  assert.doesNotMatch(html, /href="#today"|data-view="today"|>Discover</);
  assert.match(html, /id="breadcrumb">Library</);
  assert.match(app, /let activeView = 'library'/);
  assert.match(app, /activeView = \['library', 'practice'/);
  assert.match(app, /history\.replaceState\(null, '', '#library'\)/);
});

test('Drive filenames never become public titles, even when numbered or copied as metadata', () => {
  const without = displayTitle(a, {}, labels);
  assert.match(without, /^Salsa · Video [A-Z0-9]{5}$/);
  assert.doesNotMatch(without, /0088|\.mp4/i);
  const meta = { [a.id]: { moveIds: ['move-copa'], styleTimingIds: ['style-on1'], level: 'Intermediate' } };
  assert.equal(displayTitle(a, meta, labels), 'Salsa · Copa · On1 · Intermediate');
  assert.equal(displayTitle(a, { [a.id]: { title: 'Copa combination' } }, labels), 'Copa combination');
  assert.notEqual(displayTitle(a, { [a.id]: { title: '0088' } }, labels), '0088');
  assert.doesNotMatch(app, /\['Original filename',v\.filename/);
});

test('random sort is stable for pagination and filters, and changes with the seed', () => {
  const videos = [a, b, c];
  const random = seed => filterVideos(videos, {}, { sort: 'random', randomSeed: seed }, labels).map(v => v.id);
  assert.deepEqual(random(123), random(123));
  assert.deepEqual([...random(123)].sort(), videos.map(v => v.id).sort());
  const sequences = new Set(Array.from({ length: 20 }, (_, seed) => random(seed).join(',')));
  assert.ok(sequences.size > 1);
});

test('sort options use genuine metadata, with missing numbers sorted last', () => {
  const videos = [a, b, c];
  const meta = { [a.id]: { rating: 7, level: 'Intermediate' }, [b.id]: { rating: 10, level: 'Advanced' }, [c.id]: { rating: 2, level: 'Basic' } };
  const sorted = sort => filterVideos(videos, meta, { sort }, labels).map(v => v.id);
  assert.deepEqual(sorted('recent'), [b.id, c.id, a.id]);
  assert.deepEqual(sorted('oldest'), [a.id, c.id, b.id]);
  assert.deepEqual(sorted('duration-short'), [a.id, c.id, b.id]);
  assert.deepEqual(sorted('size-large').slice(0, 2), [b.id, a.id]);
  assert.deepEqual(sorted('level-asc'), [c.id, a.id, b.id]);
  assert.deepEqual(sorted('rating-high'), [b.id, a.id, c.id]);
  assert.match(app, /id="sort-filter" aria-label="Sort videos"/);
  assert.match(app, /data-action="shuffle-videos"/);
});

test('searches find descriptive metadata, but not original Drive filenames', () => {
  assert.equal(filterVideos([a], {}, { query: '0088' }, labels).length, 0);
  assert.equal(filterVideos([a], { [a.id]: { moveIds: ['move-copa'] } }, { query: 'copa' }, labels).length, 1);
});
