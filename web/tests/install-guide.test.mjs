import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../install-guide.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../install-guide.css', import.meta.url), 'utf8');

test('install guide is included in the published web build with CSP-compatible styles', () => {
  assert.match(build, /'install-guide\\.js', 'install-guide\\.css'/);
  assert.match(html, /href="\\/install-guide\\.css\\?v=2"/);
  assert.match(html, /src="\\/install-guide\\.js\\?v=2"/);
  assert.match(html, /class="ig-shortcut-mobile" data-install-guide-open/);
  assert.match(css, /\\.ig-dialog/);
  assert.doesNotMatch(source, /document\\.createElement\\("style"\\)/);
});

test('clicking Install opens a working, illustrated, device-selectable guide', () => {
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
  assert.ok(dialog, 'dialog must exist');
  assert.equal(dialog.open, true, 'install trigger opens the dialog');
  assert.equal(dialog.querySelectorAll('[data-ig-choice]').length, 7, 'all device choices exist');
  assert.equal(dialog.querySelectorAll('.ig-step').length, 4, 'selected device has four steps');
  assert.equal(dialog.querySelectorAll('.ig-image').length, 4, 'illustrations render for every step');
  dialog.querySelector('[data-ig-choice="iphone"]').click();
  assert.equal(dialog.querySelector('[data-ig-choice="iphone"]').getAttribute('aria-pressed'), 'true');
  assert.match(dialog.textContent, /Add to Home Screen/);
  dialog.querySelector('[data-ig-close]').click();
  assert.equal(dialog.open, false, 'close action works');
  dom.window.close();
});
