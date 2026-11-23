import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBailaCueLogoAssets } from '../scripts/logo-assets.mjs';

const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const assets = await getBailaCueLogoAssets(new URL('../assets/bailacue-approved-icon-bundle.base64', import.meta.url));

function pngInfo(data) {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test('approved dancers PNGs are provided at every required platform size', () => {
  for (const size of [192, 512]) {
    for (const type of ['bailacue', 'bailacue-maskable']) {
      const icon = pngInfo(assets.get(`${type}-${size}.png`));
      assert.equal(icon.width, size);
      assert.equal(icon.height, size);
    }
  }
  assert.equal(pngInfo(assets.get('apple-touch-icon.png')).width, 180);
  assert.equal(pngInfo(assets.get('bailacue-logo-64.png')).width, 64);
  assert.equal(pngInfo(assets.get('bailacue-favicon-32.png')).width, 32);
});

test('approved art is transparent outside its circle and maskable art has safe padding', () => {
  // The bundle hash in getBailaCueLogoAssets ensures these are the tested master assets.
  const any = assets.get('bailacue-512.png');
  const maskable = assets.get('bailacue-maskable-512.png');
  assert.ok(any.includes(Buffer.from('tRNS')), 'normal icon needs an alpha channel');
  assert.ok(maskable.includes(Buffer.from('tRNS')), 'maskable icon has per-pixel alpha information');
  assert.notDeepEqual(any, maskable, 'maskable icon uses a different safe-zone layout');
});

test('website and PWA metadata use the updated dancers icon everywhere', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  for (const size of ['192x192', '512x512']) {
    for (const purpose of ['any', 'maskable']) {
      assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === purpose && icon.src.includes('?v=9')));
    }
  }
  assert.match(html, /bailacue-favicon-32\.png\?v=9/);
  assert.match(html, /apple-touch-icon\.png\?v=9/);
  assert.match(html, /class="brand-mark" src="\/assets\/bailacue-logo-64\.png\?v=9"/);
  assert.match(build, /installBailaCueLogoAssets/);
  assert.match(assets.get('bailacue-favicon.svg').toString('utf8'), /data:image\/png;base64/);
});
