import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { StudioPlayer } from '../player.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

async function withPlayer(run) {
  const dom = new JSDOM(html, { url: 'https://bailacue.example/' });
  const names = ['window', 'document', 'navigator', 'location', 'Element', 'Event', 'HTMLMediaElement'];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  dom.window.HTMLMediaElement.prototype.pause = function () {};
  dom.window.HTMLMediaElement.prototype.load = function () {};
  const player = new StudioPlayer({ token: () => '', allowedFile: () => false, toast() {} });
  try { await run(player, dom.window); }
  finally {
    player.stop();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

const video = { provider: 'drive', providerId: 'example', title: 'Test dance' };

test('loading stays visible until playable, follows buffering, and clears on errors or close', async () => {
  await withPlayer(async (player, window) => {
    const busy = () => player.frame.getAttribute('aria-busy');
    await player.open(video, 'blob:first');
    assert.equal(busy(), 'true');
    const first = player.media;
    Object.defineProperties(first, {
      videoWidth: { value: 720 }, videoHeight: { value: 1280 },
      readyState: { configurable: true, value: 1 },
    });
    first.dispatchEvent(new window.Event('loadedmetadata'));
    assert.equal(busy(), 'true', 'metadata alone does not mean video can play');
    Object.defineProperty(first, 'readyState', { value: 3 });
    first.dispatchEvent(new window.Event('canplay'));
    assert.equal(busy(), 'false');
    first.dispatchEvent(new window.Event('waiting'));
    assert.equal(busy(), 'true');
    first.dispatchEvent(new window.Event('playing'));
    assert.equal(busy(), 'false');

    await player.open(video, 'blob:second');
    for (const type of ['canplay', 'playing', 'error']) first.dispatchEvent(new window.Event(type));
    assert.equal(busy(), 'true', 'events from the previous video cannot hide the new loader');
    player.media.dispatchEvent(new window.Event('error'));
    assert.equal(busy(), 'false');

    await player.open(video, 'blob:unsupported');
    player.media.dispatchEvent(new window.Event('loadedmetadata'));
    assert.equal(busy(), 'false', 'unsupported formats show their error without a spinning loader');
    await player.open(video, 'blob:closing');
    player.stop();
    assert.equal(busy(), 'false');
  });
});

test('YouTube buffering and failures clear correctly without stale callbacks affecting another video', async () => {
  await withPlayer(async (player, window) => {
    let events;
    window.YT = { Player: class {
      constructor(_mount, options) { events = options.events; }
      destroy() {}
    } };
    const busy = () => player.frame.getAttribute('aria-busy');
    await player.open({ provider: 'youtube', providerId: 'example', title: 'Test' });
    assert.equal(busy(), 'true');
    events.onReady();
    assert.equal(busy(), 'false');
    events.onStateChange({ data: 3 });
    assert.equal(busy(), 'true');
    events.onStateChange({ data: 1 });
    assert.equal(busy(), 'false');
    events.onStateChange({ data: 3 });
    events.onError();
    assert.equal(busy(), 'false');
    const oldEvents = events;
    await player.open(video, 'blob:new');
    oldEvents.onReady();
    oldEvents.onError();
    oldEvents.onStateChange({ data: 1 });
    assert.equal(busy(), 'true');
  });
});

test('thumbnail appears immediately and retry starts a fresh player attempt', async () => {
  await withPlayer(async (player, window) => {
    player.posterFor = () => 'https://example.test/dance-thumbnail.jpg';
    await player.open(video, 'blob:first');
    assert.match(player.frame.style.backgroundImage, /dance-thumbnail/);
    assert.equal(player.frame.dataset.starting, 'true');
    assert.equal(player.retryButton.hidden, true);
    player.media.dispatchEvent(new window.Event('error'));
    assert.equal(player.retryButton.hidden, false);
    player.retryButton.click();
    await Promise.resolve();
    assert.equal(player.frame.getAttribute('aria-busy'), 'true');
    assert.equal(player.retryButton.hidden, true);
    player.stop();
    assert.equal(player.frame.style.backgroundImage, '');
    assert.equal(player.retryButton.hidden, true);
  });
});

test('player responds to startup, buffering, and recovery events without stale loading state', async () => {
  await withPlayer(async (player, window) => {
    const clock = performance.now();
    await player.open(video, 'blob:performance');
    const media = player.media;
    assert.equal(player.frame.getAttribute('aria-busy'), 'true');
    media.dispatchEvent(new window.Event('loadstart'));
    media.dispatchEvent(new window.Event('loadedmetadata'));
    assert.equal(player.frame.getAttribute('aria-busy'), 'true');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 3 });
    media.dispatchEvent(new window.Event('canplay'));
    const startupMs = performance.now() - clock;
    assert.equal(player.frame.getAttribute('aria-busy'), 'false');
    for (let n = 0; n < 5; n++) {
      media.dispatchEvent(new window.Event('waiting'));
      assert.equal(player.frame.getAttribute('aria-busy'), 'true', 'buffering must show a loader');
      media.dispatchEvent(new window.Event('playing'));
      assert.equal(player.frame.getAttribute('aria-busy'), 'false', 'recovery must clear the loader');
    }
    assert.ok(Number.isFinite(startupMs));
    console.log('Mocked player event-response startup (not network/video latency): ' + startupMs.toFixed(1) + ' ms');
  });
});
