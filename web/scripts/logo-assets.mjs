import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const EXPECTED_SHA256 = '1a859586380afa97599b6fdd02c73ae03c41eb3806a92fc104ff7708451f5bcd';
const EXPECTED_ASSETS = new Set([
  'apple-touch-icon.png',
  'bailacue-192.png',
  'bailacue-512.png',
  'bailacue-favicon-16.png',
  'bailacue-favicon-32.png',
  'bailacue-favicon.svg',
  'bailacue-logo-128.png',
  'bailacue-logo-64.png',
  'bailacue-maskable-192.png',
  'bailacue-maskable-512.png',
  'bailacue-maskable.svg',
  'favicon.ico',
  'icon.svg',
]);

// This bundle uses the approved blue-and-white dancers logo, unchanged.
export async function getBailaCueLogoAssets(sourceFile) {
  const encoded = (await readFile(sourceFile, 'utf8')).replace(/\s+/g, '');
  const compressed = Buffer.from(encoded, 'base64');
  if (createHash('sha256').update(compressed).digest('hex') !== EXPECTED_SHA256) {
    throw new Error('BailaCue approved logo bundle is incomplete or modified.');
  }
  const archive = gunzipSync(compressed);
  const assets = new Map();
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').split('\0', 1)[0];
    if (!name) break;
    const lengthField = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim();
    const size = Number.parseInt(lengthField, 8);
    if (!Number.isSafeInteger(size) || size < 0 || size > 3_000_000) {
      throw new Error('Invalid icon archive member size.');
    }
    offset += 512;
    if (offset + size > archive.length) throw new Error('Truncated BailaCue icon archive.');
    if (EXPECTED_ASSETS.has(name)) {
      if (assets.has(name)) throw new Error(`Duplicate BailaCue icon: ${name}`);
      assets.set(name, Buffer.from(archive.subarray(offset, offset + size)));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  if (assets.size !== EXPECTED_ASSETS.size) {
    throw new Error(`BailaCue icon bundle missing assets (${assets.size}/${EXPECTED_ASSETS.size}).`);
  }
  return assets;
}

export async function installBailaCueLogoAssets(sourceFile, destinationDir) {
  const assets = await getBailaCueLogoAssets(sourceFile);
  for (const [name, content] of assets) await writeFile(join(destinationDir, name), content);
  // Do not expose the base64 build input in the published site.
  await rm(join(destinationDir, 'bailacue-approved-icon-bundle.base64'), { force: true });
  return assets.size;
}
