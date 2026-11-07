import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StudioPlayer } from '../player.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const playerSource = readFileSync(new URL('../player.mjs', import.meta.url), 'utf8');
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

test('popup player preserves a touch and keyboard accessible video-height drag handle', () => {
  assert.match(html, /id="video-resize" class="video-resize" role="slider" tabindex="0"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /id="video-resize-label">Drag to resize video/);
  assert.match(css, /#player \.video-resize \{[\s\S]*?touch-action: none/);
  assert.match(css, /#player\.browser-wide #video-resize \{[\s\S]*?min-height: 44px/);
  assert.match(app, /videoResize\.addEventListener\('pointerdown'/);
  assert.match(app, /videoResize\.addEventListener\('pointermove'/);
  assert.match(app, /videoResize\.addEventListener\('pointerup'/);
  assert.match(app, /videoResize\.addEventListener\('pointercancel'/);
  assert.match(app, /videoResize\.addEventListener\('keydown'/);
  assert.match(app, /state\.playerHeight = height; save\(\)/);
  assert.match(app, /videoResize\.addEventListener\('dblclick'/);
});

test('popup transport stays readable, speed arrow does not tile on Android', () => {
  assert.match(css, /#player #media-controls #media-speed \{[\s\S]*?background-image: none !important/);
  assert.match(css, /#player #media-controls #media-speed \{[\s\S]*?background-repeat: no-repeat !important/);
  assert.match(css, /#player #media-controls \.speed-label::after \{/);
  assert.match(css, /#player #media-controls \.player-utilities \{/);
  assert.match(css, /#player #media-controls \.media-play \{/);
  assert.doesNotMatch(html, /class="display-panel"/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(css, /#player #media-controls #media-volume \{ display: none; \}/);
});

test('player uses a media-first portrait layout without cropping', () => {
  assert.match(css, /#player:not\(\.fullscreen-mode\) #video-frame\.portrait-video \{/);
  assert.match(css, /height: var\(--video-height, min\(77dvh, 820px\)\)/);
  assert.match(css, /#player #video-frame > video \{ object-fit: contain; \}/);
  assert.match(css, /#player:not\(\.fullscreen-mode\) #video-frame \{[\s\S]*?max-height: min\(82dvh, 840px\)/);
  assert.match(css, /#player \.video-resize \{[^}]*min-height: 36px/);
  assert.match(playerSource, /this\.frame\.classList\.toggle\('portrait-video', media\.videoHeight > media\.videoWidth\)/);
  assert.match(playerSource, /this\.frame\.dispatchEvent\(new Event\('videoaspectchange'\)\)/);
  assert.match(app, /videoFrame\.addEventListener\('videoaspectchange'/);
});

test('player no longer exposes width presets, width drag or display settings', () => {
  for (const id of ['player-size','player-width-resize','player-reset-size','player-height','player-height-reset','theater-button']) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'));
    assert.doesNotMatch(app, new RegExp('\\$\\(\\x27#' + id + '\\x27\\)'));
  }
  assert.doesNotMatch(html, /<summary>Player settings<\/summary>/);
  assert.doesNotMatch(html, /class="display-options player-settings"/);
  assert.doesNotMatch(html, /class="display-panel"/);
});

test('video height uses the drag grip and can be reset without a settings section', () => {
  assert.match(app, /playerHeightMaximum = \(\) => Math\.max\(220, Math\.min\(840, Math\.floor\(window\.innerHeight \* 0\.82\)\)\)/);
  assert.match(app, /videoResize\.addEventListener\('dblclick', \(\) => applyVideoHeight\(0, true\)\)/);
  assert.match(app, /if \(playerDialog\.open\) applyVideoHeight\(state\.playerHeight\)/);
  assert.doesNotMatch(html, /Reset size|Auto height|Window width|Compact<\/option>|Comfortable<\/option>/);
});

test('opening any video uses browser viewport with a permanent close control', () => {
  assert.match(html, /<dialog id="player" aria-labelledby="player-title">/);
  assert.match(html, /data-close="player" aria-label="Close player"/);
  assert.match(app, /function openPlayer\(id, queue = null/);
  assert.match(app, /setPlayerViewport\(true\)/);
  assert.match(css, /#player\.browser-wide:not\(\.fullscreen-mode\) \{[\s\S]*?height: 100dvh !important/);
  assert.match(css, /#player\.browser-wide \#full-stage \{[\s\S]*?flex: 1 1 0/);
  assert.match(app, /classList\.toggle\('browser-wide', fill\)/);
  assert.match(playerSource, /this\.videoShell\.requestFullscreen\(\)/);
  assert.doesNotMatch(playerSource, /dialog\.requestFullscreen\(\)/);
});

test('player is settings-free while keeping visible source actions and owner editing', () => {
  const stage = html.indexOf('id="full-stage"'), actions = html.indexOf('class="player-actions"');
  const fallback = html.indexOf('id="drive-preview-button"'), provider = html.indexOf('id="provider-link"');
  assert.ok(stage > 0 && actions > stage && fallback > actions && provider > fallback);
  assert.match(html, /id="drive-preview-button" hidden/);
  assert.match(html, /class="player-owner-edit" data-admin-only/);
  assert.doesNotMatch(html, /class="player-settings"|<summary>Player settings<\/summary>/);
});

test('mobile playback controls align and retain usable volume and speed controls', () => {
  assert.match(playerSource, /id="media-volume-down"[^>]*aria-label="Decrease volume"/);
  assert.match(playerSource, /id="media-volume-up"[^>]*aria-label="Increase volume"/);
  assert.match(playerSource, /id="media-volume" aria-label="Adjust volume"/);
  assert.match(playerSource, /id="media-speed" aria-label="Playback speed"/);
  assert.match(playerSource, /this\.\$\('#media-volume-down'\)\.onclick/);
  assert.match(playerSource, /this\.\$\('#media-volume-up'\)\.onclick/);
  assert.match(playerSource, /setVolume\(value\) \{/);
  assert.ok(css.includes('grid-template-areas: "volume volume" "speed display";'));
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) max-content;'));
  assert.ok(css.includes('#player.browser-wide #media-controls #media-volume'));
  assert.ok(css.includes('display: block !important;'));
  assert.ok(css.includes('#player.browser-wide #media-controls .media-display-actions'));
  assert.ok(css.includes('#player #media-controls .transport'));
});

test('browser-wide resizing and owner-only editor stay functional without Player settings', () => {
  assert.ok(css.includes('#player.browser-wide:has(#video-frame[style*="--video-height"])'));
  assert.ok(css.includes('height: min(var(--video-height), 83dvh) !important'));
  assert.match(html, /class="player-owner-edit" data-admin-only/);
  assert.match(html, /id="detail-labels"/);
  assert.match(html, /id="detail-artists"/);
  assert.match(html, /id="rating-buttons"/);
  assert.match(app, /videoResize\.addEventListener\('pointermove'/);
  assert.match(app, /videoResize\.addEventListener\('keydown'/);
});

test('browser-wide player fills the viewport with Close and Escape support', () => {
  assert.match(app, /setPlayerViewport\(true\)/);
  assert.match(app, /classList\.toggle\('browser-wide', fill\)/);
  assert.match(html, /id="player" aria-labelledby="player-title"/);
  assert.match(html, /data-close="player" aria-label="Close player"/);
  assert.match(css, /#player\.browser-wide:not\(\.fullscreen-mode\) \{/);
  assert.match(css, /height: 100dvh !important;/);
  assert.match(css, /width: 100vw !important;/);
  assert.match(css, /#player\.browser-wide #full-stage \{/);
  assert.match(css, /flex: 1 1 0;/);
  assert.match(playerSource, /async fullscreen\(\) \{[\s\S]*?this\.videoShell\.requestFullscreen\(\)/);
});

test('preview and video metadata remain available without a settings accordion', () => {
  const stage = html.indexOf('id="full-stage"'), actions = html.indexOf('class="player-actions"');
  const preview = html.indexOf('id="drive-preview-button"');
  const provider = html.indexOf('id="provider-link"');
  assert.ok(stage > 0 && stage < actions && actions < preview && preview < provider);
  assert.match(html, /id="public-video-details"/);
  assert.match(html, /class="player-owner-edit" data-admin-only/);
  assert.match(app, /\$\('#public-video-details'\)\.innerHTML/);
  assert.doesNotMatch(html, /id="player-about"/);
  assert.doesNotMatch(html, /id="player-reset-size"|id="player-height-reset"|class="player-settings"/);
});

test('volume plus minus and slider remain usable on Android with separate speed row', () => {
  assert.match(playerSource, /id="media-volume-down"[^>]*aria-label="Decrease volume"/);
  assert.match(playerSource, /id="media-volume-up"[^>]*aria-label="Increase volume"/);
  assert.match(playerSource, /id="media-volume" aria-label="Adjust volume"/);
  assert.match(playerSource, /this\.setVolume\(Number\(this\.\$\('#media-volume'\)\.value\) - 10\)/);
  assert.match(playerSource, /this\.setVolume\(Number\(this\.\$\('#media-volume'\)\.value\) \+ 10\)/);
  assert.match(playerSource, /Math\.max\(0, Math\.min\(100, Math\.round/);
  assert.match(css, /#player\.browser-wide #media-controls #media-volume \{[\s\S]*?display: block !important/);
  assert.match(css, /grid-template-areas: "volume volume" "speed display"/);
  assert.match(css, /#player\.browser-wide #media-controls \.speed-label \{/);
  assert.match(css, /#player\.browser-wide #media-controls \.volume-control \{/);
});

test('owner-only editing remains scrollable outside the deleted viewer settings menu', () => {
  assert.match(html, /<details class="player-owner-edit" data-admin-only>/);
  assert.match(css, /#player > \.player-owner-edit \{/);
  assert.match(css, /#player\.browser-wide\[open\]:has\(> \.player-owner-edit\[open\]\)/);
  assert.match(css, /overflow-y: auto !important/);
  assert.match(css, /#player \.player-actions #drive-preview-button\[hidden\] \{ display: none !important; \}/);
});


test('fullscreen UI is a dedicated BailaCue overlay inside the video shell', () => {
  const shell = html.indexOf('id="video-only-shell"');
  const frame = html.indexOf('id="video-frame"');
  const tap = html.indexOf('id="fullscreen-tap-zone"');
  const overlay = html.indexOf('id="fullscreen-controls"');
  const exit = html.indexOf('id="fullscreen-button"');
  const resize = html.indexOf('id="video-resize"');
  assert.ok(shell > 0 && frame > shell && tap > frame && overlay > tap && exit > overlay && exit < resize);
  for (const id of ['fs-back', 'fs-play', 'fs-forward', 'fs-seek', 'fs-time', 'fs-mute', 'fs-volume', 'fs-speed']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /id="fullscreen-controls"[^>]*hidden/);
  assert.match(html, /aria-label="Fullscreen playback controls"/);
  assert.match(playerSource, /this\.fullscreenButton\.addEventListener\('click', \(\) => this\.fullscreen\(\)\)/);
  assert.match(css, /#player #video-only-shell:fullscreen #fullscreen-controls:not\(\[hidden\]\)/);
  assert.match(css, /#player #video-only-shell:fullscreen #fullscreen-tap-zone/);
});

test('video-only fullscreen uses BailaCue controls rather than native or Drive controls', () => {
  assert.match(playerSource, /if \(this\.media\) this\.media\.controls = false/);
  assert.doesNotMatch(playerSource, /this\.media\.controls = active/);
  assert.match(playerSource, /playerVars: \{ origin: location\.origin, playsinline: 1, controls: 0/);
  assert.match(playerSource, /frame\.allow = 'autoplay; encrypted-media; picture-in-picture'; frame\.allowFullscreen = false/);
  assert.match(playerSource, /this\.kind === 'native'/);
  assert.match(playerSource, /this\.kind === 'youtube'/);
  assert.match(playerSource, /this\.kind = 'stream'/);
  assert.match(playerSource, /this\.kind = 'preview'/);
  assert.match(playerSource, /Cross-origin Google Drive and Cloudflare player iframes cannot be controlled/);
  assert.doesNotMatch(playerSource, /webkitEnterFullscreen/);
  assert.match(css, /#player #video-only-shell #fullscreen-button\[hidden\] \{ display: none !important; \}/);
});

test('fullscreen has independent seek, volume, playback and speed interactions', () => {
  assert.match(playerSource, /this\.fsPlay\.onclick = \(\) => \{ this\.playPause\(\)/);
  assert.match(playerSource, /this\.fsBack\.onclick = \(\) => \{ this\.seek\(this\.current\(\) - 5\)/);
  assert.match(playerSource, /this\.fsForward\.onclick = \(\) => \{ this\.seek\(this\.current\(\) \+ 5\)/);
  assert.match(playerSource, /this\.fsSeek\.oninput = \(\) => \{ this\.seek\(Number\(this\.fsSeek\.value\)/);
  assert.match(playerSource, /this\.fsVolume\.oninput = \(\) => \{ this\.setVolume\(Number\(this\.fsVolume\.value\)\)/);
  assert.match(playerSource, /this\.fsSpeed\.onchange = \(\) => \{ this\.setSpeed\(Number\(this\.fsSpeed\.value\)\)/);
  assert.match(playerSource, /this\.fsMute\.onclick = \(\) => \{ this\.toggleMute\(\)/);
  assert.match(playerSource, /this\.fsTime\.textContent = /);
  assert.match(playerSource, /this\.updateFullscreenControls\(\)/);
});

test('fullscreen overlay reveals on tap or mouse, auto-hides after 3.5s, and respects keyboard focus', () => {
  assert.match(playerSource, /this\.fullscreenTapZone\.addEventListener\('click', \(\) => this\.showFullscreenControls\(\)\)/);
  assert.match(playerSource, /this\.videoShell\.addEventListener\('pointermove'/);
  assert.match(playerSource, /this\.fullscreenControls\.addEventListener\('focusin'/);
  assert.match(playerSource, /this\.fsScrubbing \|\| this\.fsPointerDown/);
  assert.match(playerSource, /this\.fsKeyboardActive && \(this\.fullscreenControls\.contains\(document\.activeElement\)/);
  assert.match(playerSource, /}, 3500\)/);
  assert.match(css, /#player #video-only-shell:fullscreen\.fullscreen-controls-visible #fullscreen-button/);
  assert.match(css, /#player #video-only-shell:fullscreen #fullscreen-button \{[\s\S]*?opacity: 0/);
  const previousDocument = globalThis.document;
  const classes = new Set();
  const shell = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } };
  const overlay = { hidden: true };
  const instance = {
    videoShell: shell,
    fullscreenControls: overlay,
    fullscreenHideTimer: null,
    updateFullscreenControls() { this.synced = true; },
    scheduleFullscreenHide() { this.scheduled = true; },
  };
  globalThis.document = { fullscreenElement: shell };
  try {
    StudioPlayer.prototype.showFullscreenControls.call(instance);
    assert.equal(overlay.hidden, false);
    assert.ok(classes.has('fullscreen-controls-visible'));
    assert.equal(instance.synced, true);
    assert.equal(instance.scheduled, true);
    StudioPlayer.prototype.hideFullscreenControls.call(instance);
    assert.equal(overlay.hidden, true);
    assert.ok(!classes.has('fullscreen-controls-visible'));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('fullscreen requests and exits video shell without changing the browser-wide viewer', async () => {
  const previousDocument = globalThis.document;
  const videoShell = {
    requestFullscreen() { globalThis.document.fullscreenElement = this; return Promise.resolve(); },
  };
  const doc = {
    fullscreenElement: null,
    exitFullscreen() { this.fullscreenElement = null; return Promise.resolve(); },
  };
  const notifications = [];
  const instance = {
    videoShell,
    customFullscreenAvailable() { return true; },
    toast: message => notifications.push(message),
    updateFullscreen() {},
  };
  globalThis.document = doc;
  try {
    await StudioPlayer.prototype.fullscreen.call(instance);
    assert.equal(doc.fullscreenElement, videoShell);
    await StudioPlayer.prototype.fullscreen.call(instance);
    assert.equal(doc.fullscreenElement, null);
    assert.deepEqual(notifications, []);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Drive previews never offer a fake controllable BailaCue fullscreen', async () => {
  const previousDocument = globalThis.document;
  let requested = false;
  const videoShell = { requestFullscreen() { requested = true; return Promise.resolve(); } };
  const warnings = [];
  const instance = {
    videoShell,
    customFullscreenAvailable() { return false; },
    toast: message => warnings.push(message),
    updateFullscreen() {},
  };
  globalThis.document = { fullscreenElement: null };
  try {
    await StudioPlayer.prototype.fullscreen.call(instance);
    assert.equal(requested, false);
    assert.match(warnings[0], /requires a controllable video/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('blocked native fullscreen reports a useful error without changing video state', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { fullscreenElement: null };
  const messages = [];
  const instance = {
    videoShell: { requestFullscreen() { return Promise.reject(new Error('blocked')); } },
    customFullscreenAvailable() { return true; },
    toast: message => messages.push(message),
    updateFullscreen() {},
  };
  try {
    await StudioPlayer.prototype.fullscreen.call(instance);
    assert.equal(globalThis.document.fullscreenElement, null);
    assert.match(messages[0], /Custom video fullscreen was blocked/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('fullscreen exit is in safe top corner, custom overlay uses uncropped video', () => {
  assert.match(css, /#player #video-only-shell:fullscreen \{/);
  assert.match(css, /#player #video-only-shell:fullscreen #video-frame,/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /#player #video-only-shell:fullscreen #fullscreen-button \{[\s\S]*?top: max\(16px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /#player #video-only-shell:fullscreen #fullscreen-button \{[\s\S]*?bottom: auto/);
  assert.match(playerSource, /document\.addEventListener\('fullscreenchange', \(\) => this\.updateFullscreen\(\)\)/);
  assert.match(playerSource, /document\.fullscreenElement === this\.videoShell/);
  assert.match(playerSource, /await document\.exitFullscreen\(\)/);
  assert.match(playerSource, /this\.fullscreenButton\.innerHTML = mediaIcon\(active \? 'shrink' : 'expand'\)/);
  assert.match(playerSource, /this\.hideFullscreenControls\(\)/);
});
