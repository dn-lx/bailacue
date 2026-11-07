import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseYoutube, cleanState, emptyState, dailyPicks, practiceQueue, filterVideos, rating, embedUrl, localDay, clampMixCount, clampPlayerHeight, recordRecent, recentOpenings, moveQueueItem } from '../core.mjs';

const data = JSON.parse(await readFile(new URL('../catalogue.json', import.meta.url), 'utf8'));
test('the real catalogue contains exactly the two locked sources and unique Drive identities', () => {
  assert.equal(data.rootFolderId, '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P');
  assert.deepEqual(data.sources.map(s => [s.dance, s.folderId]), [['Salsa', '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm'], ['Bachata', '17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1']]);
  assert.equal(data.videos.filter(v => v.dance === 'Salsa').length, 114);
  assert.equal(data.videos.filter(v => v.dance === 'Bachata').length, 152);
  assert.equal(new Set(data.videos.map(v => v.id)).size, 266);
});
test('YouTube accepts videos, short links, Shorts and playlists; rejects lookalike hosts and malformed ids', () => {
  for (const url of ['https://youtu.be/aqz-KE-bpKQ?t=10', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://m.youtube.com/shorts/aqz-KE-bpKQ']) assert.equal(parseYoutube(url).providerId, 'aqz-KE-bpKQ');
  assert.equal(parseYoutube('https://www.youtube.com/playlist?list=PL123456789_abc').kind, 'playlist');
  for (const bad of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ', 'https://evil.test/?v=aqz-KE-bpKQ', 'https://www.youtube.com/watch?v=bad', 'http://youtu.be/aqz-KE-bpKQ', 'https://www.youtube.com/@someone']) assert.throws(() => parseYoutube(bad));
});
test('ratings keep every integer from 1 to 10 and reject other values', () => {
  for (let n = 1; n <= 10; n++) assert.equal(rating(n), n);
  for (const n of [0, 11, 2.5, '10', null, NaN]) assert.equal(rating(n), null);
});
test('daily picks are stable per date, balanced, rating-first and exclude YouTube', () => {
  const samples = data.videos.filter(v => v.dance === 'Salsa').slice(0, 3).concat(data.videos.filter(v => v.dance === 'Bachata').slice(0, 3));
  const metadata = Object.fromEntries(samples.map((v, i) => [v.id, { rating: i % 3 === 1 ? 10 : 1 }]));
  const result = dailyPicks(samples, metadata, '2026-10-24');
  assert.deepEqual(result, [samples[1].id, samples[4].id]);
  assert.deepEqual(result, dailyPicks(samples, metadata, '2026-10-24'));
  const refreshed = dailyPicks(samples, metadata, '2026-10-24', result);
  assert.ok(refreshed.every(id => !result.includes(id)));
  assert.deepEqual(dailyPicks([{ ...samples[0], provider: 'youtube' }], {}, '2026-10-24'), []);
});
test('practice queues never duplicate or lose videos and balance dance turns', () => {
  const queue = practiceQueue(data.videos, {}, () => 0.5);
  assert.equal(queue.length, 266); assert.equal(new Set(queue).size, 266);
  for (let i = 0; i < 228; i++) assert.equal(data.videos.find(v => v.id === queue[i]).dance, i % 2 ? 'Bachata' : 'Salsa');
});
test('exact rating filters, unrated and favourites stay independent', () => {
  const [a, b, c] = data.videos;
  const metadata = { [a.id]: { rating: 10, favorite: true }, [b.id]: { rating: 1 }, [c.id]: { notes: 'Weight transfer' } };
  assert.deepEqual(filterVideos([a, b, c], metadata, { rating: '10' }).map(v => v.id), [a.id]);
  assert.deepEqual(filterVideos([a, b, c], metadata, { rating: 'unrated' }).map(v => v.id), [c.id]);
  assert.deepEqual(filterVideos([a, b, c], metadata, { query: 'weight' }).map(v => v.id), [c.id]);
  assert.equal(filterVideos([a, b, c], metadata, { favorite: true }).length, 1);
});
test('backup validation drops unsafe URLs, duplicates, invalid ratings and unexpected metadata', () => {
  const state = emptyState(); state.meta['drive:abcdefghijk'] = { rating: 11, notes: '<script>alert(1)</script>', status: 'Unknown' };
  state.youtube = [{ url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', dance: 'Salsa', title: 'A cue' }, { url: 'https://evil.test/', dance: 'Bachata' }, { url: 'https://youtu.be/aqz-KE-bpKQ', dance: 'Salsa' }];
  state.queue = ['drive:abcdefghijk', 'drive:abcdefghijk', 12];
  const clean = cleanState(state);
  assert.equal(clean.youtube.length, 1); assert.equal(clean.meta['drive:abcdefghijk'].rating, null); assert.equal(clean.meta['drive:abcdefghijk'].status, 'New'); assert.equal(clean.queue.length, 1);
  assert.equal(clean.meta['drive:abcdefghijk'].notes, '<script>alert(1)</script>');
  assert.throws(() => cleanState({ version: 2 }));
});
test('embeds only use validated provider URLs and calendar days use local time', () => {
  assert.equal(embedUrl(data.videos[0]), `https://drive.google.com/file/d/${data.videos[0].providerId}/preview`);
  assert.ok(embedUrl({ provider: 'youtube', url: 'https://youtu.be/aqz-KE-bpKQ' }).startsWith('https://www.youtube-nocookie.com/'));
  assert.equal(localDay(new Date(2026, 9, 24, 0, 1)), '2026-10-24');
});

test('recently opened shows newest valid sources only and stores them locally in a bounded list', () => {
  const a = data.videos[0], b = data.videos[1], c = data.videos[2];
  let history = recordRecent([], a.id, '2026-11-06T08:00:00Z');
  history = recordRecent(history, b.id, '2026-11-06T08:01:00Z');
  history = recordRecent(history, a.id, '2026-11-06T08:02:00Z');
  assert.deepEqual(history.map(row => row.id), [b.id, a.id]);
  assert.deepEqual(recentOpenings(history, [a, b, c]).map(video => video.id), [a.id, b.id]);
  assert.deepEqual(recentOpenings([{ id: 'drive:oldRemovedSource123', at: '2026-11-06' }, ...history], [a, b]).map(video => video.id), [a.id, b.id]);
  assert.deepEqual(recordRecent(history, 'https://untrusted.test/video'), history);
  const entries = Array.from({ length: 70 }, (_, n) => ({ id: 'drive:' + String(n).padStart(11, '0'), at: '2026-11-06T08:00:00Z' }));
  const bounded = recordRecent(entries, c.id);
  assert.equal(bounded.length, 50);
  assert.equal(bounded.at(-1).id, c.id);
  assert.deepEqual(recentOpenings(bounded, [c], 4).map(video => video.id), [c.id]);
});

test('mix reorder never loses videos or moves items outside queue bounds', () => {
  const ids = data.videos.slice(0, 3).map(video => video.id);
  assert.deepEqual(moveQueueItem(ids, ids[1], -1), [ids[1], ids[0], ids[2]]);
  assert.deepEqual(moveQueueItem(ids, ids[1], 1), [ids[0], ids[2], ids[1]]);
  assert.deepEqual(moveQueueItem(ids, ids[0], -1), ids);
  assert.deepEqual(moveQueueItem(ids, ids[2], 1), ids);
  assert.deepEqual(moveQueueItem(ids, 'drive:unlisted12345', 1), ids);
  assert.deepEqual(ids, data.videos.slice(0, 3).map(video => video.id));
});

test('mix count is configurable, bounded and kept when recovering saved browser state', () => {
  assert.equal(emptyState().mixSize, 10);
  assert.equal(clampMixCount(3, 266), 3);
  assert.equal(clampMixCount('20', 114), 20);
  assert.equal(clampMixCount(999, 114), 114);
  assert.equal(clampMixCount(-50, 266), 1);
  assert.equal(clampMixCount('not a number', 266), 10);
  assert.equal(clampMixCount(12.8, 266), 12);
  assert.equal(clampMixCount(8, 0), 0);
  const all = data.videos;
  const salsa = all.filter(v => v.dance === 'Salsa');
  const bachata = all.filter(v => v.dance === 'Bachata');
  const amount = 25;
  for (const pool of [all, salsa, bachata]) {
    const mix = practiceQueue(pool, {}).slice(0, clampMixCount(amount, pool.length));
    assert.equal(mix.length, amount);
    assert.equal(new Set(mix).size, mix.length);
  }
  assert.equal(practiceQueue(salsa, {}).slice(0, clampMixCount(1000, salsa.length)).length, salsa.length);
  assert.equal(cleanState({ ...emptyState(), mixSize: 24 }).mixSize, 24);
  assert.equal(cleanState({ ...emptyState(), mixSize: 0 }).mixSize, 1);
  assert.equal(cleanState({ ...emptyState(), mixSize: undefined }).mixSize, 10);
});

test('video resize heights stay bounded and the viewer preference survives backups', () => {
  assert.equal(clampPlayerHeight(0), 0);
  assert.equal(clampPlayerHeight(null), 0);
  assert.equal(clampPlayerHeight(undefined), 0);
  assert.equal(clampPlayerHeight(''), 0);
  assert.equal(clampPlayerHeight('not-height'), 0);
  assert.equal(clampPlayerHeight(540), 540);
  assert.equal(clampPlayerHeight('620'), 620);
  assert.equal(clampPlayerHeight(90), 220);
  assert.equal(clampPlayerHeight(1600), 840);
  assert.equal(clampPlayerHeight(740, 510), 510);
  assert.equal(clampPlayerHeight(-100, 180), 220);
  assert.equal(emptyState().playerHeight, 0);
  assert.equal(cleanState({ ...emptyState(), playerHeight: 580 }).playerHeight, 580);
  assert.equal(cleanState({ ...emptyState(), playerHeight: 99999 }).playerHeight, 840);
  assert.equal(cleanState({ ...emptyState(), playerHeight: null }).playerHeight, 0);
});
