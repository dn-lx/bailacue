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
  assert.ok(html.includes('href="/install-guide.css?v=2"'));
  assert.ok(html.includes('src="/install-guide.js?v=2"'));
  assert.ok(html.includes('class="ig-shortcut-mobile" data-install-guide-open'));
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
