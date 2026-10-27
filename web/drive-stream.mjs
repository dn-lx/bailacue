import { SOURCES } from './core.mjs';

// Stay below Netlify's buffered binary response limit, even if the platform buffers.
export const MAX_CHUNK = 4 * 1024 * 1024;
const FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;
const DOWNLOAD = 'https://drive.usercontent.google.com/download';
const headers = { 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Accept-Ranges': 'bytes' };

export function byteRange(value, size) {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (!value) return size <= MAX_CHUNK ? { start: 0, end: size - 1, partial: false } : null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || suffix > MAX_CHUNK) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    end = Math.min(end, size - 1, start + MAX_CHUNK - 1);
  }
  return { start, end, partial: true };
}

async function readBounded(response, expected) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing media body.');
  const bytes = new Uint8Array(expected); let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (offset + value.byteLength > expected) throw new Error('Unexpected media length.');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== expected) throw new Error('Incomplete media range.');
    return bytes;
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
}

/** Only the deployed, fixed-folder catalogue can be read. No arbitrary URL proxy. */
export function createMediaHandler(catalogue, fetcher = fetch) {
  const files = new Map();
  if (catalogue?.rootFolderId !== '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P') throw new Error('Unexpected Drive source.');
  for (const video of catalogue.videos || []) {
    const source = SOURCES.find(s => s.dance === video.dance);
    if (video.provider === 'drive' && source && (!video.folderId || video.folderId === source.folderId) && FILE_ID.test(video.providerId || '') && video.id === `drive:${video.providerId}` && Number.isSafeInteger(video.size) && video.size > 0) files.set(video.providerId, video);
  }
  return async request => {
    const fail = (status, message, extra = {}) => new Response(request.method === 'HEAD' ? null : message, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
    const url = new URL(request.url);
    const match = /^\/api\/drive-video\/([A-Za-z0-9_-]{10,100})$/.exec(url.pathname);
    const file = match && files.get(match[1]);
    if (!file || url.search) return fail(404, 'This video is not in the deployed dance library.');
    const range = byteRange(request.headers.get('Range'), file.size);
    if (!range && request.method !== 'HEAD') return fail(request.headers.has('Range') ? 416 : 400, 'Request one video byte range.', { 'Content-Range': `bytes */${file.size}` });
    const selected = range || { start: 0, end: file.size - 1, partial: false };
    const { start, end, partial } = selected;
    // MIME is derived from a known video filename; HTML/error bodies are never relayed.
    const mime = /\.webm$/i.test(file.filename) ? 'video/webm' : /\.mov$/i.test(file.filename) ? 'video/quicktime' : 'video/mp4';
    const resultHeaders = { ...headers, 'Content-Type': mime, 'Content-Length': String(end - start + 1), ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}) };
    if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers: resultHeaders });
    const abort = new AbortController();
    const cancel = () => abort.abort(); request.signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 18000);
    try {
      const download = new URL(DOWNLOAD); download.search = new URLSearchParams({ id: file.providerId, export: 'download', confirm: 't' }).toString();
      const response = await fetcher(download.href, { headers: { Range: `bytes=${start}-${end}` }, redirect: 'error', signal: abort.signal, cache: 'no-store' });
      if (!response.ok) { await response.body?.cancel(); return fail([403, 404, 429].includes(response.status) ? response.status : 502, 'Google Drive could not serve this video. Try Drive preview or open the original.'); }
      const contentType = response.headers.get('Content-Type') || '';
      const validType = /^(?:video\/[^;]+|application\/octet-stream)(?:;|$)/i.test(contentType);
      const confirmedRange = response.status === 206 && response.headers.get('Content-Range') === `bytes ${start}-${end}/${file.size}`;
      const wholeSmall = response.status === 200 && start === 0 && end === file.size - 1 && file.size <= MAX_CHUNK;
      const length = response.headers.get('Content-Length');
      if (!validType || (!confirmedRange && !wholeSmall) || (length !== null && Number(length) !== end - start + 1)) {
        await response.body?.cancel(); return fail(502, 'Google Drive did not confirm the video range. Try Drive preview.');
      }
      const bytes = await readBounded(response, end - start + 1);
      return new Response(bytes, { status: partial ? 206 : 200, headers: resultHeaders });
    } catch { return fail(abort.signal.aborted ? 504 : 502, 'Drive playback timed out or was interrupted. Retry, use Drive preview or open the original.'); }
    finally { clearTimeout(timeout); request.signal.removeEventListener('abort', cancel); }
  };
}
