import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StudioPlayer } from '../player.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../interface.css', import.meta.url), 'utf8');
const studioUi = readFileSync(new URL('../studio-ui.mjs', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('../assets/dance-favicon.svg', import.meta.url), 'utf8');

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
  assert.match(app, /Showing \$\{\(currentPage - 1\) \* (?:displayedPageSize|pageSize) \+ 1\}/);
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

test('mix queue supports touch and keyboard-friendly ordered editing', () => {
  assert.match(app, /data-action="mix-move-up"/);
  assert.match(app, /data-action="mix-move-down"/);
  assert.match(app, /aria-label="Move \$\{esc\(displayTitle\(v, state\.meta\)\)\} earlier"/);
  assert.match(app, /Moved video to position/);
  assert.match(app, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /\.queue-actions \.icon-button/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test('recent video list is clearly browser-local and user can clear it', () => {
  assert.match(app, /recentOpenings\(state\.history, videos\(\), 4\)/);
  assert.match(app, /Your last opened videos, saved only in this browser/);
  assert.match(app, /data-action="clear-recent"/);
  assert.match(app, /state\.history = recordRecent\(state\.history, v\.id\)/);
  assert.match(app, /if \(v\.provider !== 'local'\)/);
  assert.match(app, /state\.history = \[\]; save\(\); renderToday\(\)/);
});

test('public footer has branding but no create-your-own BailaCue promotion', () => {
  assert.match(html, /<footer><span>BailaCue<b>·<\/b>Dance together\.<\/span><\/footer>/);
  assert.doesNotMatch(html, /Create your own BailaCue/i);
  assert.doesNotMatch(html, /wa\.me\/491796932923/);
});

test('mix builder offers adjustable count with three visible dance choices and no timer', () => {
  assert.match(app, /id="mix-count" type="number" min="1" max="/);
  assert.match(app, /value="\$\{requested\}"/);
  assert.match(app, /state\.mixSize = requested/);
  assert.match(app, /clampMixCount\(requested, pool\.length\)/);
  for (const dance of ['Salsa', 'Bachata', 'Both']) {
    assert.match(app, new RegExp('data-action="mix" data-dance="' + dance + '"'));
  }
  assert.doesNotMatch(app, /timer-panel|timerText|sessionSeconds|sessionStarted|action === 'timer'/);
});

test('mix play button has explicit text contrast in both themes and responsive touch actions', () => {
  assert.match(app, /class="button subtle mix-play-button" data-action="start-queue"/);
  assert.match(css, /\.practice-start \.mix-play-button \{[^}]*color: var\(--text\)/);
  assert.match(css, /\.mix-options \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /\.practice-start \.mix-options \.button \{[^}]*min-height: 52px/);
});

test('browser tab renders the new compact BailaCue rhythm mark', () => {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" sizes="any" href="\/assets\/dance-favicon\.svg\?v=2">/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /aria-label="BailaCue rhythm and play icon"/);
  assert.match(favicon, /<linearGradient id="rhythm"/);
  assert.match(favicon, /<linearGradient id="flow"/);
  assert.match(favicon, /fill="#FFFFFF"/);
  assert.match(favicon, /fill="#0B1932"/);
  assert.doesNotMatch(favicon, /<script|<foreignObject|<image|onload\s*=|href\s*=/i);
});

test('native dropdowns share one styled arrow, readable sizing and accessible states', () => {
  assert.ok(css.includes('select:not([multiple]), .player-info .field select:not([multiple]) {'));
  assert.ok(css.includes('-webkit-appearance: none;'));
  assert.ok(css.includes('background-image: var(--bc-dropdown-arrow);'));
  assert.ok(css.includes('background-size: 18px 18px;'));
  assert.ok(css.includes('background-position: right 13px center;'));
  assert.ok(css.includes('min-height: 46px;'));
  assert.ok(css.includes('padding: 10px 44px 10px 13px;'));
  assert.ok(css.includes('[data-theme=dark] {\n  --bc-dropdown-arrow:'));
  assert.ok(css.includes('#media-controls #media-speed {'));
  assert.ok(css.includes('select:not([multiple]):focus-visible'));
});

test('filter, label, display and video disclosures share a consistent CSS chevron', () => {
  assert.ok(css.includes('details > summary::after {'));
  assert.ok(css.includes('details[open] > summary::after {'));
  assert.ok(css.includes('transform: rotate(45deg);'));
  assert.ok(css.includes('transform: rotate(225deg);'));
  assert.ok(css.includes('details > summary::-webkit-details-marker'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) {\n  details > summary::after'));
  assert.doesNotMatch(app, /class="filter-chevron"/);
  assert.doesNotMatch(studioUi, /<span aria-hidden="true">⌄<\/span>/);
  assert.doesNotMatch(css, /content:'[⌄⌃]'/);
  assert.ok(studioUi.includes('<details class="label-picker"><summary>'));
  assert.ok(app.includes('<summary class="filter-summary">More filters'));
  assert.ok(css.includes('.label-picker > summary > .picker-count:last-child'));
});

test('popup player gives the video more mobile space with an accessible resize handle', () => {
  assert.match(html, /id="video-resize" class="video-resize" role="slider" tabindex="0"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /id="video-resize-label">Drag to resize video/);
  assert.match(html, /id="player-height" type="range" min="220" max="840"/);
  assert.match(css, /#player:not\(\.fullscreen-mode\) #video-frame \{[\s\S]*?height: var\(--video-height, clamp\(380px, 58dvh, 680px\)\)/);
  assert.match(css, /height: var\(--video-height, min\(63dvh, 650px\)\)/);
  assert.match(css, /#player \.video-resize \{[\s\S]*?touch-action: none/);
  assert.match(css, /#player\.fullscreen-mode \.video-resize,/);
  assert.match(app, /videoResize\.addEventListener\('pointerdown'/);
  assert.match(app, /videoResize\.addEventListener\('pointermove'/);
  assert.match(app, /videoResize\.addEventListener\('pointerup'/);
  assert.match(app, /videoResize\.addEventListener\('pointercancel'/);
  assert.match(app, /videoResize\.addEventListener\('keydown'/);
  assert.match(app, /state\.playerHeight = height; save\(\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{ if \(\$\('#player'\)\.open\) applyVideoHeight\(state\.playerHeight\)/);
});

test('popup transport stays readable, speed arrow does not tile on Android', () => {
  assert.match(css, /#player #media-controls #media-speed \{[\s\S]*?background-image: none !important/);
  assert.match(css, /#player #media-controls #media-speed \{[\s\S]*?background-repeat: no-repeat !important/);
  assert.match(css, /#player #media-controls \.speed-label::after \{/);
  assert.match(css, /#player #media-controls \.player-utilities \{/);
  assert.match(css, /#player #media-controls \.media-play \{/);
  assert.match(css, /#player \.display-panel \.height-control \{ display: flex; \}/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(css, /#player #media-controls #media-volume \{ display: none; \}/);
});
