import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StudioPlayer } from '../player.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../interface.css', import.meta.url), 'utf8');

test('public authentication uses Sign in without exposing administrator controls', () => {
  assert.match(html, /id="admin-login"[^>]*>Sign in<\/button>/);
  assert.doesNotMatch(html, /Admin sign in/i);
  assert.match(html, /id="admin-dialog"[^>]*aria-describedby="admin-access-note"/);
  assert.match(html, /id="admin-title">Sign in to BailaCue/);
  assert.match(html, /id="toggle-password"[^>]*aria-controls="admin-password"[^>]*aria-pressed="false"/);
  assert.match(app, /password\.type = show \? 'text' : 'password'/);
  assert.match(app, /password\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /await admin\.signIn/);
  assert.match(app, /await admin\.signOut/);
});

test('Settings is keyboard reachable on mobile and production never shows a develop tag', () => {
  assert.match(html, /id="mobile-settings"[^>]*aria-label="Open settings"/);
  assert.match(css, /\.header-actions \.mobile-settings \{ display: inline-flex/);
  assert.match(app, /\['settings-nav', 'mobile-settings'\]/);
  assert.match(app, /aria-current', activeView === 'settings'/);
  assert.match(html, /class="develop-badge" hidden/);
  assert.match(app, /location\.hostname\.startsWith\('develop--'\)/);
  assert.match(css, /\.mobile-brand \{ display: flex; font-size: 19px/);
  assert.match(css, /\.header-actions #add-youtube, \.header-actions a\[href="#upload"\] \{ display: none/);
});

test('browser video mix actions and accessible result counts remain consistent', () => {
  assert.match(app, /aria-live="polite" aria-atomic="true"/);
  assert.match(app, /Showing \$\{\(currentPage - 1\) \* pageSize \+ 1\}/);
  assert.match(app, /In mix' : 'Add to mix'/);
  assert.doesNotMatch(app, /practice queue/i);
  assert.match(html, /id="nav-mix-count" class="mix-count" hidden/);
  assert.match(app, /mixCounter.hidden = mixSize === 0/);
  assert.match(app, /mixCounter.setAttribute\('aria-label'/);
  assert.match(app, /onEnded: video =>/);
  assert.match(app, /openPlayer\(following, playbackQueue, null, '', true\)/);
  assert.match(app, /if \(action === 'start-queue'\)/);
});

test('automatic next-video playback is attempted once with a useful blocked-autoplay fallback', async () => {
  let playCount = 0;
  const notices = [];
  const instance = {
    frame: { setAttribute(name, value) { assert.equal(name, 'aria-busy'); assert.equal(value, 'false'); } },
    setAvailable(available) { assert.equal(available, true); },
    status(message) { notices.push(message); },
    autoStartPending: true,
  };
  const media = { play() { playCount++; return Promise.resolve(); } };
  StudioPlayer.prototype.readyToPlay.call(instance, media, '');
  StudioPlayer.prototype.readyToPlay.call(instance, media, '');
  assert.equal(playCount, 1);
  assert.equal(instance.autoStartPending, false);
  instance.autoStartPending = true;
  const rejected = { play() { return Promise.reject(new Error('autoplay denied')); } };
  StudioPlayer.prototype.readyToPlay.call(instance, rejected, '');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(notices.some(message => /Tap Play to continue the mix/.test(message)));
});
