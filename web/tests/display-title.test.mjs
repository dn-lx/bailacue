import test from 'node:test';
import assert from 'node:assert/strict';
import { displayTitle, filterVideos } from '../core.mjs';
import { seedLabels } from '../studio-model.mjs';

const video = {
  id: 'drive:example123456', provider: 'drive', providerId: 'example123456', dance: 'Bachata',
  title: '191026-Bachata-Sensual-Bachata-Basic-Step-Intermediate-Natalia-Kianikova',
  filename: '0090.mp4', addedAt: '2026-10-18T12:00:00Z', updatedAt: '2026-10-19T12:00:00Z',
};
const labels = [...seedLabels(),
  { id: 'move-basic', name: 'Basic Step', type: 'Moves', dance: 'Bachata' },
  { id: 'technique', name: 'Body movement', type: 'Technique', dance: 'Both' },
  { id: 'position', name: 'Closed position', type: 'Position', dance: 'Both' },
  { id: 'teacher', name: 'Natalia Kianikova', type: 'Teacher', dance: 'Both' },
  { id: 'timing', name: 'On 2', type: 'Style & timing', dance: 'Both' },
];

test('the reported title contains only date, selected style names and level', () => {
  const meta = { [video.id]: {
    styleTimingIds: ['label-6', 'label-7'], labelIds: ['label-9', 'technique', 'position'],
    moveIds: ['move-basic'], moves: ['Basic Step'], artistIds: ['teacher'],
    title: 'Private display title', event: 'Workshop', location: 'Berlin', level: 'Intermediate',
  } };
  const before = structuredClone({ video, meta, labels });
  assert.equal(displayTitle(video, meta, labels),
    '191026 - Sensual Bachata, Dominican Bachata, Bachata Fusion - Intermediate');
  assert.deepEqual({ video, meta, labels }, before, 'Rendering must preserve filenames, IDs and all metadata');
});

test('legacy names and both style ID collections are combined without case, spacing or Unicode duplicates', () => {
  const meta = { [video.id]: {
    danceStyles: ['  Sensual   Bachata  ', 'sensual bachata', '', '  ', 'Café', 'Cafe\u0301'],
    styleTimingIds: ['label-6', 'timing', 'deleted-label', 'move-basic'],
    labelIds: ['label-6', 'timing', 'label-8', 'teacher'], level: 'Intermediate',
  } };
  assert.equal(displayTitle(video, meta, labels),
    '191026 - Sensual Bachata, Café, On 2, Modern Bachata - Intermediate');
});

test('human-readable style names keep accents, spaces and meaningful punctuation', () => {
  assert.equal(displayTitle(video, { [video.id]: {
    danceStyles: ['Afro-Cuban', 'Cuban / Casino', 'Rueda de Casino'],
  } }), '191026 - Afro-Cuban, Cuban / Casino, Rueda de Casino');
  assert.equal(displayTitle(video, { [video.id]: { danceStyles: ['Sensual'] } }), '191026 - Sensual');
});

test('empty title sections disappear without falling back to the dance category or stored title', () => {
  const undated = { ...video, updatedAt: '', addedAt: '' };
  for (const [source, details, expected] of [
    [video, {}, '191026'],
    [video, { level: 'Intermediate' }, '191026 - Intermediate'],
    [undated, { danceStyles: ['Sensual Bachata'], level: 'Intermediate' }, 'Sensual Bachata - Intermediate'],
    [undated, { danceStyles: ['Sensual Bachata'] }, 'Sensual Bachata'],
    [undated, { level: 'Intermediate' }, 'Intermediate'],
    [undated, { danceStyles: ['', '  '], styleTimingIds: ['deleted'], level: '  ' }, 'Video'],
  ]) assert.equal(displayTitle(source, { [source.id]: details }, labels), expected);
  assert.equal(displayTitle({ ...video, updatedAt: '' }), '181026');
});

test('YouTube and local previews use the same compact format', () => {
  for (const provider of ['youtube', 'local']) {
    const source = { ...video, provider, id: `${provider}:example123456` };
    assert.equal(displayTitle(source, { [source.id]: { styleTimingIds: ['timing'], level: 'Basic' } }, labels),
      '191026 - On 2 - Basic');
  }
});

test('search and title sorting use the same resolved style names shown on cards', () => {
  const other = { ...video, id: 'drive:other12345678' };
  const meta = {
    [video.id]: { styleTimingIds: ['label-6', 'label-7'], level: 'Intermediate', moveIds: ['move-basic'], artistIds: ['teacher'] },
    [other.id]: { styleTimingIds: ['label-9'], level: 'Intermediate' },
  };
  const title = displayTitle(video, meta, labels);
  assert.deepEqual(filterVideos([video, other], meta, { query: title }, labels), [video]);
  assert.deepEqual(filterVideos([video, other], meta, { sort: 'title' }, labels), [other, video]);
  for (const query of ['Basic Step', 'Natalia Kianikova']) {
    assert.deepEqual(filterVideos([video, other], meta, { query }, labels), [video], 'Omitted title details remain searchable');
  }
});
