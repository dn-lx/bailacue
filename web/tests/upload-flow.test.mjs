import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DriveConnection, fileMd5Checksum } from '../drive.mjs';

test('Drive MD5 checksums are calculated incrementally across chunk boundaries', async () => {
  for (const value of ['', 'abc', 'a'.repeat(56), 'video bytes across many chunks']) {
    const file = new File([value], 'different-name.mp4', { type: 'video/mp4' });
    const expected = createHash('md5').update(value).digest('hex');
    assert.equal(await fileMd5Checksum(file, 3), expected);
  }
});

test('an exact duplicate is detected by content even when its filename differs', async () => {
  const file = new File(['abc'], 'renamed-video.mp4', { type: 'video/mp4' });
  const connection = new DriveConnection();
  connection.inspect = async () => ({});
  connection.list = async () => ({ source: { folderId: 'fixed-folder' }, files: [{
    name: 'original-upload.mp4', mimeType: 'video/mp4', size: '3',
    md5Checksum: '900150983cd24fb0d6963f7d28e17f72',
  }] });
  await assert.rejects(connection.plan(file, 'Salsa'), /already been uploaded as “original-upload.mp4”/);
});
