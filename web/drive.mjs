import { COMPRESSED_FOLDERS, OPTIMIZED_PRESET, QUALITIES } from './optimized-delivery.mjs';
import { SOURCES } from './core.mjs';
import { mapDriveFile, nextNumber, numberedName } from './studio-model.mjs';

const API = 'https://www.googleapis.com/drive/v3';
const FIELDS = 'id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,videoMediaMetadata';
const SCOPE = 'https://www.googleapis.com/auth/drive';
let scriptPromise;

const MD5_SHIFTS = [
  7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
  5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
  4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
  6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21,
];
const MD5_CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
function md5Block(state, bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
  let a = state[0], b = state[1], c = state[2], d = state[3];
  for (let i = 0; i < 64; i++) {
    let f, g;
    if (i < 16) { f = (b & c) | (~b & d); g = i; }
    else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
    else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
    else { f = c ^ (b | ~d); g = (7 * i) % 16; }
    const sum = (a + f + MD5_CONSTANTS[i] + view.getUint32(g * 4, true)) >>> 0;
    const shift = MD5_SHIFTS[i];
    const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0;
    a = d; d = c; c = b; b = (b + rotated) >>> 0;
  }
  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
}
export async function fileMd5Checksum(file, chunkSize = 4 * 1024 * 1024) {
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const buffer = new Uint8Array(64);
  let buffered = 0, total = 0;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer());
    total += chunk.length;
    let cursor = 0;
    if (buffered) {
      const take = Math.min(64 - buffered, chunk.length);
      buffer.set(chunk.subarray(0, take), buffered);
      buffered += take; cursor += take;
      if (buffered === 64) { md5Block(state, buffer); buffered = 0; }
    }
    while (cursor + 64 <= chunk.length) { md5Block(state, chunk, cursor); cursor += 64; }
    if (cursor < chunk.length) { buffer.set(chunk.subarray(cursor), 0); buffered = chunk.length - cursor; }
  }
  const padded = new Uint8Array(buffered < 56 ? 64 : 128);
  padded.set(buffer.subarray(0, buffered));
  padded[buffered] = 0x80;
  const bits = total * 8, length = new DataView(padded.buffer);
  length.setUint32(padded.length - 8, bits >>> 0, true);
  length.setUint32(padded.length - 4, Math.floor(bits / 0x100000000) >>> 0, true);
  for (let offset = 0; offset < padded.length; offset += 64) md5Block(state, padded, offset);
  return state.map(word => [0, 8, 16, 24].map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}
function googleSdk() {
  if ((/** @type {any} */ (window)).google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => resolve(undefined); script.onerror = () => { scriptPromise = null; reject(new Error('Google connection could not load. Check your connection and try again.')); }; document.head.append(script);
  });
  return scriptPromise;
}
export class DriveConnection {
  constructor(clientId = '') { this.clientId = clientId; this.accessToken = ''; this.expiresAt = 0; this.client = null; }
  get connected() { return !!this.accessToken && Date.now() < this.expiresAt; }
  async prepare() {
    if (!this.connected) await this.restoreMePlus();
    if (!this.connected && this.clientId) await googleSdk();
  }
  async restoreMePlus() {
    const raw = globalThis.localStorage?.getItem('bailacue:web:admin-session:v1');
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session?.access_token) return false;
    const response = await fetch('https://wbqnctrvxohxwiaignhg.supabase.co/functions/v1/bailacue-google-oauth/token', {
      method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      this.connectionError = result.error || 'Connect Google Drive to continue.';
      return false;
    }
    const result = await response.json();
    if (!result.access_token) return false;
    this.accessToken = result.access_token;
    this.expiresAt = Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000;
    this.connectionError = '';
    return true;
  }
  async connect() {
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(this.clientId)) throw new Error('BailaCue Google OAuth client ID is missing.');
    await googleSdk();
    const google = globalThis.google;
    const response = await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId, scope: SCOPE, include_granted_scopes: false,
        callback: result => result.error || !result.access_token ? reject(new Error('Google authorization was not granted.')) : resolve(result),
        error_callback: () => reject(new Error('Google authorization was closed or blocked.')),
      });
      client.requestAccessToken({ prompt: 'consent' });
    });
    const raw = globalThis.localStorage?.getItem('bailacue:web:admin-session:v1');
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.access_token) throw new Error('Sign in as administrator first.');
    const saved = await fetch('https://wbqnctrvxohxwiaignhg.supabase.co/functions/v1/bailacue-google-oauth/save', {
      method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: response.access_token }),
    });
    const result = await saved.json().catch(() => ({}));
    if (!saved.ok) throw new Error(result.error || 'Google connection could not be saved.');
    this.accessToken = response.access_token;
    this.expiresAt = Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000;
    this.connectionError = '';
  }
  disconnect() { this.accessToken = ''; this.expiresAt = 0; this.client = null; }
  token() { return this.connected ? this.accessToken : ''; }
  async request(url, options = {}) {
    if (!this.connected) await this.restoreMePlus().catch(() => false);
    if (!this.connected) throw new Error('Connect Google to continue. Google authorization has expired or is not connected.');
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${this.accessToken}` } });
    if (response.status === 401) { this.disconnect(); throw new Error('Google authorization expired. Reconnect, then retry this upload.'); }
    if (!response.ok && response.status !== 308) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch { /* Keep the HTTP status. */ }
      throw Object.assign(new Error(`Google Drive returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : '. Try again.'}`), { status: response.status });
    }
    return response;
  }
  async inspect(dance) {
    const source = SOURCES.find(s => s.dance === dance); if (!source) throw new Error('Choose Salsa or Bachata.');
    const response = await this.request(`${API}/files/${source.folderId}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`);
    const folder = await response.json();
    if (folder.id !== source.folderId || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.capabilities?.canAddChildren !== true) throw new Error(`This Google account cannot upload to the fixed ${dance} folder.`);
    return source;
  }
  async list(dance) {
    const source = SOURCES.find(s => s.dance === dance); if (!source) throw new Error('Choose a fixed dance collection.');
    const files = []; let cursor = '';
    do {
      const params = new URLSearchParams({ q: `'${source.folderId}' in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
      if (cursor) params.set('pageToken', cursor);
      const page = await (await this.request(`${API}/files?${params}`)).json(); files.push(...(page.files || [])); cursor = page.nextPageToken || '';
    } while (cursor);
    return { source, files, videos: files.filter(f => f.mimeType?.startsWith('video/')).map(f => mapDriveFile(f, dance, source.folderId)) };
  }
  async plan(file, dance, reserved = 0) {
    if (!file || !file.size || (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(file.name))) throw new Error('Choose a non-empty video file.');
    await this.inspect(dance);
    const listing = await this.list(dance);
    const sameSize = listing.files.filter(item => item.mimeType?.startsWith('video/') &&
      Number(item.size) === Number(file.size) && /^[a-f0-9]{32}$/i.test(item.md5Checksum || ''));
    if (sameSize.length) {
      const checksum = await fileMd5Checksum(file);
      const duplicate = sameSize.find(item => item.md5Checksum.toLowerCase() === checksum);
      if (duplicate) throw new Error(`This video has already been uploaded as “${duplicate.name}”, even though this filename is different. No duplicate was uploaded.`);
    }
    const number = nextNumber(listing.files.map(f => f.name), reserved);
    const generated = await (await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`)).json();
    if (!generated.ids?.[0]) throw new Error('Drive could not reserve a file identity.');
    return { id: generated.ids[0], name: numberedName(number, file.name), number, dance, folderId: listing.source.folderId, file, offset: 0, session: '', completed: false };
  }
  async browserCopy(video, quality, signal) {
    const folderId = COMPRESSED_FOLDERS[video.dance];
    if (!QUALITIES.includes(quality)) throw new Error('Choose a supported playback resolution.');
    if (!SOURCES.some(source => source.dance === video.dance && source.folderId === video.folderId) ||
        !/^[A-Za-z0-9_-]{10,100}$/.test(video.providerId) || video.id !== 'drive:' + video.providerId) {
      throw new Error('Choose a video from the fixed Drive collections.');
    }
    const base = (video.filename || 'video').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.()-]+/g, '-').slice(0, 75) || 'video';
    const simpleName = `${base}-${quality}.mp4`;
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and (name = '${simpleName}' or (appProperties has { key='bailacueSourceId' and value='${video.providerId}' } and appProperties has { key='bailacueQuality' and value='${quality}' }))`,
      fields: `files(${FIELDS},appProperties)`,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const { files } = await (await this.request(`${API}/files?${params}`, { signal })).json();
    const appProperties = { bailacueSourceId: video.providerId, bailacueQuality: quality, bailacuePreset: OPTIMIZED_PRESET };
    const existing = files?.find(file => file.mimeType === 'video/mp4' &&
      Number.isSafeInteger(Number(file.size)) && Number(file.size) >= 1024 &&
      Object.entries(appProperties).every(([key, value]) => file.appProperties?.[key] === value));
    const name = files?.some(file => file.name === simpleName) && !existing
      ? `${base}-${video.providerId}-${quality}.mp4` : simpleName;
    return { folderId, name, appProperties, existing: existing ? mapDriveFile(existing, video.dance, folderId) : null };
  }

  async uploadBrowserCopy(video, copy, file, onProgress, signal) {
    const generated = await (await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`, { signal })).json();
    if (!generated.ids?.[0]) throw new Error('Drive could not reserve a file identity.');
    const job = { ...copy, id: generated.ids[0], dance: video.dance, file, offset: 0, session: '', completed: false };
    try { return await this.upload(job, onProgress, signal); }
    catch (error) {
      if (!job.session || signal.aborted || error.status === 401 || error.status === 403) throw error;
      return this.upload(job, onProgress, signal);
    }
  }

  async upload(job, onProgress, signal) {
    const optimized = job.folderId === COMPRESSED_FOLDERS[job.dance] &&
      job.appProperties?.bailacuePreset === OPTIMIZED_PRESET && QUALITIES.includes(job.appProperties?.bailacueQuality);
    if (!optimized && !SOURCES.some(s => s.folderId === job.folderId && s.dance === job.dance)) throw new Error('The upload destination must be a fixed dance folder.');
    if (job.completed) return job.completed;
    if (!job.session) {
      // Refresh names immediately before creating a new file; never overwrite an existing one.
      if (!optimized) {
        const listing = await this.list(job.dance);
        if (listing.files.some(f => f.name.replace(/\\.[^.]+$/, '') === job.name.replace(/\\.[^.]+$/, ''))) throw new Error('That video number is already used in Drive. Choose Recheck number before retrying.');
      }
      const response = await this.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': job.file.type || 'video/mp4', 'X-Upload-Content-Length': String(job.file.size) },
        body: JSON.stringify({ id: job.id, name: job.name, parents: [job.folderId], ...(optimized ? { appProperties: job.appProperties } : { description: `Added with BailaCue. Original filename: ${job.file.name.slice(0, 200)}` }) }) });
      const location = response.headers.get('Location');
      if (!location || !/^https:\/\/(www|content)\.googleapis\.com\//.test(location)) throw new Error('Drive did not return a valid upload session. No completed upload is being reported.');
      job.session = location;
    } else {
      let status;
      try { status = await this.request(job.session, { method: 'PUT', signal, headers: { 'Content-Range': `bytes */${job.file.size}` } }); }
      catch (error) {
        if (![404, 410].includes(error.status)) throw error;
        try {
          const existing = await (await this.request(`${API}/files/${job.id}?fields=${encodeURIComponent(FIELDS)}&supportsAllDrives=true`)).json();
          if (Number(existing.size) !== job.file.size) throw new Error('The reserved Drive ID exists with a different size. Open the folder before retrying.');
          return this.finish(job, existing);
        } catch (lookupError) { if (lookupError.status !== 404) throw lookupError; }
        job.session = ''; job.offset = 0;
        return this.upload(job, onProgress, signal);
      }
      if (status.status === 200 || status.status === 201) return this.finish(job, await status.json());
      job.offset = acknowledgedOffset(status.headers.get('Range'));
    }
    const chunkSize = 8 * 1024 * 1024;
    while (job.offset < job.file.size) {
      const end = Math.min(job.offset + chunkSize, job.file.size);
      const response = await this.request(job.session, { method: 'PUT', signal, headers: { 'Content-Type': job.file.type || 'video/mp4', 'Content-Range': `bytes ${job.offset}-${end - 1}/${job.file.size}` }, body: job.file.slice(job.offset, end) });
      if (response.status === 200 || response.status === 201) { onProgress(job.file.size, job.file.size); return this.finish(job, await response.json()); }
      const next = acknowledgedOffset(response.headers.get('Range'));
      if (next <= job.offset) throw new Error('Drive has not acknowledged the next chunk. Retry to resume from its confirmed position.');
      job.offset = next; onProgress(job.offset, job.file.size);
    }
    throw new Error('Drive has not confirmed completion. Retry to check this same file identity.');
  }
  finish(job, file) {
    if (file.id !== job.id || file.name !== job.name || (file.parents && !file.parents.includes(job.folderId))) throw new Error('Drive completion did not match the reserved upload. Recheck the folder before retrying.');
    job.completed = mapDriveFile(file, job.dance, job.folderId); job.session = ''; return job.completed;
  }
}
export function acknowledgedOffset(range) { const match = /^bytes=0-(\d+)$/.exec(range || ''); return match ? Number(match[1]) + 1 : 0; }
