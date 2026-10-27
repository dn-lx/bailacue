import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseYoutube, cleanState, emptyState, dailyPicks, practiceQueue, filterVideos, rating, embedUrl, localDay } from '../core.mjs';

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
