import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceQueue } from '../core.mjs';

const videos = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: `salsa-${i}`, dance: 'Salsa', provider: 'drive' })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `bachata-${i}`, dance: 'Bachata', provider: 'drive' })),
];

test('Salsa-only mix selects only Salsa videos', () => {
  const selected = videos.filter(v => v.dance === 'Salsa');
  const ids = practiceQueue(selected, {}, () => 0.5).slice(0, 10);
  assert.equal(ids.length, 10);
  assert.ok(ids.every(id => id.startsWith('salsa-')));
});

test('Bachata-only mix selects only Bachata videos', () => {
  const selected = videos.filter(v => v.dance === 'Bachata');
  const ids = practiceQueue(selected, {}, () => 0.5).slice(0, 10);
  assert.equal(ids.length, 10);
  assert.ok(ids.every(id => id.startsWith('bachata-')));
});

test('Combined mix includes both Salsa and Bachata', () => {
  const ids = practiceQueue(videos, {}, () => 0.5).slice(0, 10);
  assert.equal(ids.length, 10);
  assert.ok(ids.some(id => id.startsWith('salsa-')));
  assert.ok(ids.some(id => id.startsWith('bachata-')));
});
