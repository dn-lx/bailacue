import { SOURCES } from './core.mjs';
import { mapDriveFile, nextNumber, numberedName } from './studio-model.mjs';

const API = 'https://www.googleapis.com/drive/v3';
const FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,parents,videoMediaMetadata';
const SCOPE = 'https://www.googleapis.com/auth/drive';
let scriptPromise;
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
  async prepare() { if (this.clientId) await googleSdk(); }
  connect() {
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(this.clientId)) return Promise.reject(new Error('Google uploads need a web OAuth client ID. Open Connection setup below. Browsing and local previews already work.'));
    const google = (/** @type {any} */ (window)).google;
    if (!google?.accounts?.oauth2) return Promise.reject(new Error('Google is still loading. Tap Connect Google again in a moment.'));
    return new Promise((resolve, reject) => {
      this.client = google.accounts.oauth2.initTokenClient({ client_id: this.clientId, scope: SCOPE, include_granted_scopes: false,
        callback: response => {
          if (!response.access_token || response.error) { reject(new Error('Google access was not granted. Your library is unchanged.')); return; }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) { reject(new Error('Drive permission is needed to upload into the fixed dance folders.')); return; }
          this.accessToken = response.access_token; this.expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 60) * 1000; resolve(undefined);
        }, error_callback: () => reject(new Error('Google connection was closed. You can try again when ready.')) });
      this.client.requestAccessToken({ prompt: 'select_account' });
    });
  }
  disconnect() { this.accessToken = ''; this.expiresAt = 0; this.client = null; }
  token() { return this.connected ? this.accessToken : ''; }
  async request(url, options = {}) {
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
    const number = nextNumber(listing.files.map(f => f.name), reserved);
    const generated = await (await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`)).json();
    if (!generated.ids?.[0]) throw new Error('Drive could not reserve a file identity.');
    return { id: generated.ids[0], name: numberedName(number, file.name), number, dance, folderId: listing.source.folderId, file, offset: 0, session: '', completed: false };
  }
  async upload(job, onProgress, signal) {
    if (!SOURCES.some(s => s.folderId === job.folderId && s.dance === job.dance)) throw new Error('The upload destination must be a fixed dance folder.');
    if (job.completed) return job.completed;
    if (!job.session) {
      // Refresh names immediately before creating a new file; never overwrite an existing one.
      const listing = await this.list(job.dance);
      if (listing.files.some(f => f.name === job.name)) throw new Error('That number was just used by another upload. Choose Recheck number before retrying.');
      const response = await this.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': job.file.type || 'video/mp4', 'X-Upload-Content-Length': String(job.file.size) },
        body: JSON.stringify({ id: job.id, name: job.name, parents: [job.folderId], description: `Added with BailaCue. Original filename: ${job.file.name.slice(0, 200)}` }) });
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
