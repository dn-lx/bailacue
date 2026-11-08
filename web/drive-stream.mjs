import { SOURCES } from './core.mjs';
import { OPTIMIZED_FOLDERS, OPTIMIZED_PRESET } from './optimized-delivery.mjs';

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

// Stream a validated range progressively rather than buffering the entire 4 MiB
// before the first response byte. Limit every chunk and verify the final count.
function streamBounded(response, expected, finish, abort) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing media body.');
  let received = 0;
  let finished = false;
  const close = () => { if (!finished) { finished = true; finish(); } };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (received !== expected) throw new Error('Incomplete media range.');
          close(); controller.close(); return;
        }
        if (!value || received + value.byteLength > expected) throw new Error('Unexpected media length.');
        received += value.byteLength;
        controller.enqueue(value);
      } catch (error) {
        close(); abort();
        await reader.cancel().catch(() => {});
        controller.error(error);
      }
    },
    async cancel(reason) {
      close(); abort();
      await reader.cancel(reason).catch(() => {});
    },
  });
}

/** Only the deployed, fixed-folder catalogue can be read. No arbitrary URL proxy. */
export function createMediaHandler(catalogue, fetcher = fetch, loadPublishedFile = async () => null, loadOptimizedFile = async () => null) {
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
    let file = match && files.get(match[1]);
    if (!file && match && !url.search) {
      // A previously uploaded file is publicly playable only when the owner
      // published it through the RLS-protected catalogue. Never proxy arbitrary IDs.
      try {
        const candidate = await loadPublishedFile(match[1]);
        const source = SOURCES.find(s => s.dance === candidate?.dance);
        if (candidate?.provider === 'drive' &&
            candidate.providerId === match[1] &&
            candidate.id === `drive:${match[1]}` &&
            source && candidate.folderId === source.folderId &&
            FILE_ID.test(candidate.providerId) &&
            Number.isSafeInteger(candidate.size) && candidate.size > 0) {
          files.set(match[1], candidate);
          file = candidate;
        }
      } catch { /* Deny an unavailable or invalid dynamic catalogue record. */ }
    }
    if (!file && match && !url.search) {
      try {
        const derived = await loadOptimizedFile(match[1]);
        if (derived?.provider === 'drive' &&
            derived.id === 'drive:' + match[1] && derived.providerId === match[1] &&
            derived.optimizedPreset === OPTIMIZED_PRESET &&
            derived.folderId === OPTIMIZED_FOLDERS[derived.dance] &&
            derived.filename?.endsWith('.mp4') &&
            Number.isSafeInteger(derived.size) && derived.size >= 1024 &&
            /^drive:[A-Za-z0-9_-]{10,100}$/.test(derived.sourceId || '')) {
          const originalId = derived.sourceId.slice(6);
          const original = files.get(originalId) || await loadPublishedFile(originalId);
          const folder = SOURCES.find(s => s.dance === derived.dance);
          if (original?.id === derived.sourceId &&
              original.providerId === originalId &&
              original.provider === 'drive' &&
              original.dance === derived.dance &&
              folder && (!original.folderId || original.folderId === folder.folderId)) {
            files.set(match[1], derived);
            file = derived;
          }
        }
      } catch { /* An unknown or unverified optimized ID must never be proxied. */ }
    }
    if (!file || url.search) return fail(404, 'This video is not in the published dance library.');
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
    let streaming = false;
    const finish = () => { clearTimeout(timeout); request.signal.removeEventListener('abort', cancel); };
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
      const body = streamBounded(response, end - start + 1, finish, cancel);
      streaming = true;
      return new Response(body, { status: partial ? 206 : 200, headers: resultHeaders });
    } catch { return fail(abort.signal.aborted ? 504 : 502, 'Drive playback timed out or was interrupted. Retry, use Drive preview or open the original.'); }
    finally { if (!streaming) finish(); }
  };
}
