import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../install-guide.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../install-guide.css', import.meta.url), 'utf8');

test('install guide is bundled with CSP-compatible external styles', () => {
  assert.ok(build.includes("'install-guide.js', 'install-guide.css'"));
  assert.ok(html.includes('href="/install-guide.css?v=3"'));
  assert.ok(html.includes('src="/install-guide.js?v=3"'));
  assert.ok(html.includes('class="ig-shortcut-mobile" data-install-guide-open hidden'));
  assert.equal(new JSDOM(html).window.document.querySelectorAll('[data-install-guide-open]').length, 1);
  assert.match(css, /\[data-install-guide-open\]\[hidden\]\{display:none!important\}/);
  assert.ok(css.includes('.ig-dialog'));
  assert.ok(!source.includes('document.createElement("style")'));
});

test('install button opens illustrated steps and supports choosing device', () => {
  const dom = new JSDOM('<!doctype html><html><body><button data-install-guide-open>Install</button></body></html>', {
    url: 'https://develop--bailacue.netlify.app/', runScripts: 'outside-only'
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.eval(source);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.document.querySelector('[data-install-guide-open]').click();
  const dialog = window.document.querySelector('#ig-dialog');
  assert.ok(dialog);
  assert.equal(dialog.open, true, 'button opens the guide');
  assert.equal(dialog.querySelectorAll('[data-ig-choice]').length, 7);
  assert.equal(dialog.querySelectorAll('.ig-step').length, 4);
  assert.equal(dialog.querySelectorAll('.ig-image').length, 4);
  dialog.querySelector('[data-ig-choice="iphone"]').click();
  assert.equal(dialog.querySelector('[data-ig-choice="iphone"]').getAttribute('aria-pressed'), 'true');
  assert.ok(dialog.textContent.includes('Add to Home Screen'));
  dialog.querySelector('[data-ig-close]').click();
  assert.equal(dialog.open, false);
  dom.window.close();
});

function setupInstall({ standalone = false, ios = false, remembered = false } = {}) {
  const dom = new JSDOM('<!doctype html><button data-install-guide-open hidden>Install</button>', {
    url: 'https://develop--bailacue.netlify.app/', runScripts: 'outside-only'
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: standalone });
  if (ios) Object.defineProperty(window.navigator, 'standalone', { value: true });
  if (remembered) window.localStorage.setItem('bailacue.webAppInstalled', '1');
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.eval(source);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, button: window.document.querySelector('[data-install-guide-open]') };
}
test('installed PWA and iOS home screen launches hide the install control', () => {
  for (const options of [{ standalone: true }, { ios: true }]) {
    const { dom, window, button } = setupInstall(options);
    assert.equal(button.hidden, true);
    button.click();
    assert.equal(window.document.querySelector('#ig-dialog').open, false);
    dom.window.close();
  }
});
test('browser installation immediately hides the button and closes the guide', () => {
  const { dom, window, button } = setupInstall();
  assert.equal(button.hidden, false);
  button.click();
  const dialog = window.document.querySelector('#ig-dialog');
  assert.equal(dialog.open, true);
  window.dispatchEvent(new window.Event('appinstalled'));
  assert.equal(button.hidden, true);
  assert.equal(dialog.open, false);
  assert.equal(window.localStorage.getItem('bailacue.webAppInstalled'), '1');
  dom.window.close();
});
test('remembered installation stays hidden until the browser offers a fresh install', () => {
  const { dom, window, button } = setupInstall({ remembered: true });
  assert.equal(button.hidden, true);
  window.dispatchEvent(new window.Event('beforeinstallprompt', { cancelable: true }));
  assert.equal(button.hidden, false);
  assert.equal(window.localStorage.getItem('bailacue.webAppInstalled'), null);
  dom.window.close();
});
