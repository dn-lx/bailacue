import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalogue = JSON.parse(readFileSync(new URL('../catalogue.json', import.meta.url), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 150; i++) { if (check()) return; await pause(20); }
  assert.fail('The interface did not reach the expected state.');
}

test('metadata editing works from guest sign-in through publishing, retry and reopening', async () => {
  const dom = new JSDOM(html, { url: 'https://bailacue.test/#library', pretendToBeVisual: true });
  const { window } = dom;
  const descriptors = new Map();
  const timers = new Set();
  const intervals = new Set();
  const originalTimeout = globalThis.setTimeout;
  const originalInterval = globalThis.setInterval;
  const expose = (key, value) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  for (const key of ['window', 'document', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLDialogElement', 'HTMLMediaElement', 'Event']) expose(key, key === 'window' ? window : window[key]);
  window.matchMedia = query => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  expose('setTimeout', (fn, ms, ...args) => { const id = originalTimeout(fn, ms, ...args); timers.add(id); return id; });
  expose('setInterval', (fn, ms, ...args) => { const id = originalInterval(fn, ms, ...args); intervals.add(id); return id; });
  expose('requestAnimationFrame', fn => setTimeout(fn, 0));
  const rows = new Map([['labels', { items: [
    { id: 'qa-style', name: 'Partnerwork', type: 'Technique', dance: 'Both' },
    { id: 'qa-artist', name: 'Test teacher', type: 'Artist', dance: 'Both' },
  ] }]]);
  let failPublication = false;
  let writes = 0;
  expose('fetch', async (url, options = {}) => {
    const path = String(url);
    if (path === '/public-config.json') return Response.json({ supabaseUrl: 'https://qa.supabase.co', supabasePublishableKey: 'sb_publishable_fixture' });
    if (path === '/catalogue.json') return Response.json(catalogue);
    if (path.includes('/auth/v1/token')) {
      if (JSON.parse(options.body).password !== 'fixture-password') return Response.json({ message: 'Invalid login credentials' }, { status: 400 });
      return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
    }
    if (path.includes('/auth/v1/user')) return Response.json({ id: 'fixture-owner' });
    if (path.includes('bailacue_web_admins')) return Response.json([{ user_id: 'fixture-owner' }]);
    if (path.includes('bailacue_web_content')) {
      if (options.method === 'POST') {
        assert.equal(options.headers.Authorization, 'Bearer fixture-access');
        if (failPublication) return Response.json({ message: 'Fixture offline' }, { status: 503 });
        for (const row of JSON.parse(options.body)) { rows.set(row.key, row.payload); writes++; }
        return new Response(null, { status: 204 });
      }
      return Response.json([...rows].map(([key, payload]) => ({ key, payload })));
    }
    return Response.json({});
  });
  const $ = selector => window.document.querySelector(selector);
  const fill = (selector, value, event = 'input') => { $(selector).value = value; $(selector).dispatchEvent(new window.Event(event, { bubbles: true })); };
  try {
    await import(`../app.js?metadata-regression=${Date.now()}`);
    try { await until(() => $('#page [data-action="open"]')); }
    catch (error) { throw new Error($('#page').textContent + ' · ' + $('#toast').textContent, { cause: error }); }
    const videoId = $('#page [data-action="open"]').dataset.id;
    $('#page [data-action="open"]').click();
    const video = $('#video-frame video');
    video.currentTime = 15;
    assert.equal($('#video-details-editor').hidden, true);
    assert.equal($('[data-action="edit-video-details"]').textContent, 'Edit metadata');
    assert.equal(writes, 0);
    $('[data-action="edit-video-details"]').click();
    assert.equal($('#admin-dialog').open, true);
    assert.equal($('#player').open, true);
    fill('#admin-email', 'owner@example.test');
    fill('#admin-password', 'wrong-password');
    $('#admin-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => $('#admin-error').textContent.includes('Invalid login'));
    assert.equal($('#video-details-editor').hidden, true);
    fill('#admin-password', 'fixture-password');
    $('#admin-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => !$('#video-details-editor').hidden);
    assert.equal($('#player').open, true);
    assert.equal($('#video-frame video'), video, 'Sign-in must preserve the playing video');
    assert.equal(video.currentTime, 15);
    assert.equal(window.document.body.classList.contains('is-admin'), true);
    assert.equal(window.document.activeElement, $('#personal-title'));
    fill('#personal-title', 'Editable partnerwork');
    fill('#notes', 'Keep the weight transfer smooth.');
    fill('#detail-event', 'Evening class', 'change');
    fill('#detail-location', 'Valencia', 'change');
    fill('#detail-recorded', '2026-11-06', 'change');
    $('#detail-labels [data-id="qa-style"]').click();
    $('#detail-artists [data-id="qa-artist"]').click();
    $('[data-action="rate"][data-rating="8"]').click();
    await until(() => $('#note-status').textContent === 'All changes saved');
    assert.deepEqual(rows.get('meta:' + videoId), {
      title: 'Editable partnerwork', notes: 'Keep the weight transfer smooth.',
      labelIds: ['qa-style'], artistIds: ['qa-artist'], recordedAt: '2026-11-06',
      event: 'Evening class', location: 'Valencia', rating: 8,
    });
    assert.equal($('#player-title').textContent, 'Editable partnerwork');
    assert.equal($('#video-details-editor').hidden, false, 'Edits must not collapse the editor');
    failPublication = true;
    fill('#notes', 'Retry this change.');
    await until(() => !$('#retry-video-save').hidden);
    assert.match($('#note-status').textContent, /could not be published/);
    failPublication = false;
    $('#retry-video-save').click();
    await until(() => $('#note-status').textContent === 'All changes saved');
    assert.equal(rows.get('meta:' + videoId).notes, 'Retry this change.');
    $('[data-action="edit-video-details"]').click();
    assert.equal($('#video-details-editor').hidden, true);
    assert.match($('#video-details-summary').textContent, /Partnerwork/);
    assert.match($('#video-details-summary').textContent, /Test teacher/);
    $('#player').close();
    fill('#search', 'Editable partnerwork');
    await until(() => $(`#page [data-action="open"][data-id="${videoId}"]`));
    $(`#page [data-action="open"][data-id="${videoId}"]`).click();
    assert.equal($('#video-details-editor').hidden, false, 'Owners see editable fields as soon as a video opens');
    assert.equal($('#personal-title').value, 'Editable partnerwork');
    assert.equal($('#notes').value, 'Retry this change.');
  } finally {
    for (const timer of timers) clearTimeout(timer);
    for (const interval of intervals) clearInterval(interval);
    dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
