// Owner-only resumable Cloudflare Stream uploader. The original stays in Drive.
// Large bytes travel from the owner's browser directly to Cloudflare (never via Netlify).
const SIZE = 10 * 1024 * 1024;
let activeController = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function jobKey(id) { return 'bailacue:stream-job:' + id; }
function savedJob(id) {
  try {
    const job = JSON.parse(localStorage.getItem(jobKey(id)) || sessionStorage.getItem(jobKey(id)) || 'null');
    return job?.videoId === id && (job.completed === true || Date.parse(job.expiresAt || '') > Date.now()) ? job : null;
  } catch { return null; }
}
function saveAutomaticJob(id, job) {
  // A short-lived upload capability is kept locally for resume after a tab closes.
  // It is never written to a public database, bundle, or URL.
  localStorage.setItem(jobKey(id), JSON.stringify(job));
}
function clearCompletedJob(id) {
  localStorage.removeItem(jobKey(id));
  sessionStorage.removeItem(jobKey(id));
}
function safeUploadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'upload.videodelivery.net' || url.hostname === 'api.cloudflare.com' ||
       /^customer-[a-z0-9]+\.cloudflarestream\.com$/i.test(url.hostname));
  } catch { return false; }
}

async function originalDuration(file) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'metadata';
  return new Promise(resolve => {
    let done = false;
    const finish = duration => {
      if (done) return;
      done = true; clearTimeout(timeout);
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
      resolve(duration);
    };
    const timeout = setTimeout(() => finish(0), 12000);
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => finish(0);
    video.src = url;
  });
}

async function ownerRequest(admin, action, body) {
  await admin.ensureSession();
  let response = await fetch('/api/stream/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.session.access_token },
    body: JSON.stringify(body), cache: 'no-store',
  });
  if (response.status === 401) {
    await admin.refresh();
    response = await fetch('/api/stream/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.session.access_token },
      body: JSON.stringify(body), cache: 'no-store',
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Video processing service could not complete this request.');
  return data;
}

async function uploadChunks(file, job, onProgress, signal) {
  if (!safeUploadUrl(job.uploadUrl)) throw new Error('The video upload URL is not valid.');
  const head = await fetch(job.uploadUrl, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' }, signal, cache: 'no-store' });
  if (!head.ok) throw new Error('Your previous upload link has expired. Restart the upload.');
  let offset = Number(head.headers.get('Upload-Offset'));
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) throw new Error('Invalid resume position.');
  onProgress(offset, file.size);
  while (offset < file.size) {
    const end = Math.min(file.size, offset + (job.chunkSize || SIZE));
    const response = await fetch(job.uploadUrl, {
      method: 'PATCH',
      headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
      body: typeof file.readChunk === 'function' ? await file.readChunk(offset, end, signal) : file.slice(offset, end), signal, cache: 'no-store',
    });
    if (response.status !== 204) throw new Error('Video upload interrupted. Select the same file and resume.');
    const next = Number(response.headers.get('Upload-Offset'));
    if (!Number.isSafeInteger(next) || next <= offset || next > file.size) throw new Error('Upload offset was not acknowledged.');
    offset = next; onProgress(offset, file.size);
  }
}

export function cancelStreamUpload() { activeController?.abort(); activeController = null; }

/** Read a bounded byte range from an owner's already-authorized fixed Drive video. */
export async function readDriveChunk(connection, video, start, end, signal) {
  const id = video?.providerId || '';
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id) ||
      !Number.isSafeInteger(video?.size) || video.size <= 0 ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end <= start || end > video.size || end - start > SIZE)
    throw new Error('Invalid original video range.');
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const response = await connection.request(url, {
    headers: { Range: `bytes=${start}-${end - 1}` },
    cache: 'no-store', signal,
  });
  if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${end - 1}/${video.size}`)
    throw new Error('Google Drive did not return the requested video bytes. Conversion is paused safely.');
  const blob = await response.blob();
  if (blob.size !== end - start) throw new Error('Drive video download was incomplete; resume conversion.');
  return blob;
}

export async function streamServiceEnabled() {
  try {
    const response = await fetch('/api/stream/config', { cache: 'no-store' });
    return response.ok && (await response.json()).enabled === true;
  } catch { return false; }
}

function conversionSignal(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Video conversion paused.'), { name: 'AbortError' });
}

async function processingDelay(signal) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 4000);
    function abort() {
      clearTimeout(timeout);
      reject(Object.assign(new Error('Video conversion paused.'), { name: 'AbortError' }));
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/**
 * Convert a newly uploaded File or an owner-authorized Drive source to adaptive
 * Cloudflare Stream playback. Idempotency is keyed on the original Drive ID and
 * the existing resumable TUS session. Never forwards a Google token to Cloudflare.
 * The billed provider MUST already be explicitly enabled server-side.
 */
export async function publishStreamAutomatically({ video, file, admin, signal, onProgress = _message => {}, onPublished = _delivery => {} }) {
  if (!video || video.provider !== 'drive' || !/^[A-Za-z0-9_-]{10,100}$/.test(video.providerId || '') ||
      !file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size !== video.size)
    throw new Error('Cannot optimize a video without its verified Drive original.');
  if (!await streamServiceEnabled()) return { status: 'disabled' };
  conversionSignal(signal);
  const seconds = Number(video.duration) > 0 ? Number(video.duration)
    : typeof file.readChunk === 'function' ? 0 : await originalDuration(file);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('Drive has no video duration yet. Wait for Google to process its metadata, then retry.');
  const name = String(file.name || video.filename || '');
  const modified = Number(file.lastModified) || 0;
  let job = savedJob(video.id);
  if (job && (job.size !== file.size || job.name !== name || Number(job.modified || 0) !== modified))
    throw new Error('A different original is already being processed for this video. Resume its original upload.');
  if (!job) {
    onProgress('Reserving adaptive encoding capacity…');
    const created = await ownerRequest(admin, 'prepare', {
      videoId: video.id,
      file: { size: file.size, name, durationSeconds: Math.ceil(seconds) },
    });
    if (!safeUploadUrl(created.uploadUrl)) throw new Error('Unsafe video upload destination.');
    job = { ...created, size: file.size, name, modified, videoId: video.id };
    saveAutomaticJob(video.id, job);
  }
  if (!job.completed) {
    onProgress('Sending video to the adaptive encoder…');
    await uploadChunks(file, job, (sent, total) => {
      onProgress(`Optimizing ${video.filename || name}: ${Math.floor(sent / total * 100)}% uploaded`);
    }, signal);
    job.completed = true;
    saveAutomaticJob(video.id, job);
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    conversionSignal(signal);
    onProgress('Encoding streaming-friendly video…');
    const result = await ownerRequest(admin, 'status', { videoId: video.id, uid: job.uid });
    if (result.status === 'ready' && result.delivery) {
      clearCompletedJob(video.id);
      onPublished(result.delivery);
      return { status: 'ready', delivery: result.delivery };
    }
    if (attempt < 23) await processingDelay(signal);
  }
  // Stay paused instead of reserving another paid copy. Resume by checking this job.
  return { status: 'processing' };
}

/** Process one original at a time; reruns skip already-published videos. */
export async function backfillStreamLibrary({ videos, connection, admin, isPublished, onPublished, onProgress, signal }) {
  if (!await streamServiceEnabled()) return { status: 'disabled', total: 0, completed: 0, skipped: 0 };
  if (!connection?.connected || !admin?.isAdmin) throw new Error('Sign in as owner and connect Google Drive.');
  const valid = videos.filter(video => video.provider === 'drive' &&
    /^(?:Salsa|Bachata)$/.test(video.dance) &&
    /^[A-Za-z0-9_-]{10,100}$/.test(video.providerId || '') &&
    Number.isSafeInteger(video.size) && video.size >= 1024 &&
    !isPublished(video));
  const result = { status: 'ready', total: valid.length, completed: 0, skipped: 0 };
  for (const video of valid) {
    conversionSignal(signal);
    if (isPublished(video)) { result.skipped++; continue; }
    if (!Number(video.duration) || video.duration < 1) {
      result.skipped++; onProgress(`Skipped ${video.filename}: Google has no duration metadata.`);
      continue;
    }
    const source = {
      name: video.filename, size: video.size,
      lastModified: Number.isFinite(Date.parse(video.updatedAt)) ? Date.parse(video.updatedAt) : 0,
      readChunk: (start, end, requestSignal) => readDriveChunk(connection, video, start, end, requestSignal),
    };
    onProgress(`Optimizing ${result.completed + result.skipped + 1}/${valid.length}: ${video.filename}`);
    const outcome = await publishStreamAutomatically({
      video, file: source, admin, signal, onProgress,
      onPublished: delivery => onPublished(video, delivery),
    });
    if (outcome.status === 'ready') result.completed++;
    else { result.status = outcome.status; break; }
  }
  return result;
}

/** @param {HTMLElement} container */
export function renderStreamAdmin(container, { video, admin, currentDelivery, onPublished, toast }) {
  cancelStreamUpload();
  if (!container) return;
  if (!admin.isAdmin || !video || video.provider !== 'drive') { container.innerHTML = ''; return; }
  const active = !!currentDelivery;
  container.innerHTML = `<div class="stream-publisher">
    <h3>Adaptive video delivery</h3>
    <p class="helper-text">Original: <strong>${esc(video.filename || video.title)}</strong> · ${video.size ? (video.size / 1048576).toFixed(1) + ' MB' : 'size unknown'}. Upload the matching original from your device for a smoother, adaptive video player. Your Google Drive original stays untouched.</p>
    <p class="stream-delivery-state" role="status">${active ? 'Adaptive playback is active for this video.' : 'Currently playing from Google Drive.'}</p>
    <label class="field">Select original file<input id="stream-file" type="file" accept="video/*,.mov,.mkv,.avi"></label>
    <label class="field">Video duration in minutes<input id="stream-duration" type="number" min="0.1" max="480" step="0.1" placeholder="Read automatically when possible"></label>
    <div class="stream-buttons"><button id="stream-upload" type="button" class="button primary small" disabled>Upload to adaptive video service</button>
    <button id="stream-check" type="button" class="button subtle small">Check video processing</button>
    <button id="stream-pause" type="button" class="button subtle small" hidden>Pause upload</button></div>
    <progress id="stream-progress" max="100" value="0" hidden aria-label="Adaptive video upload progress"></progress>
    <p class="helper-text" id="stream-message" role="status">Streaming charges apply only after the provider is activated. Start with one video.</p>
  </div>`;
  const $ = selector => container.querySelector(selector);
  const fileInput = $('#stream-file'), duration = $('#stream-duration'), upload = $('#stream-upload'), check = $('#stream-check'), pause = $('#stream-pause'), progress = $('#stream-progress'), message = $('#stream-message');
  let file = null, busy = false, enabled = false;
  fetch('/api/stream/config', { cache: 'no-store' }).then(response => response.json()).then(config => {
    enabled = config.enabled === true;
    if (!enabled) status('Cloudflare Stream is not activated for BailaCue. No paid processing can start until the administrator configures the private provider credentials.');
    upload.disabled = !enabled || !file;
    check.disabled = !enabled;
  }).catch(() => { enabled = false; status('Adaptive video service status is unavailable; uploads are disabled.'); upload.disabled = true; check.disabled = true; });
  const job = () => savedJob(video.id);
  check.hidden = !job();
  function status(text) { message.textContent = text; }
  function toggle(value) { busy = value; upload.disabled = value || !file || !enabled; fileInput.disabled = value; pause.hidden = !value; check.disabled = value || !enabled; }
  fileInput.onchange = async () => {
    file = fileInput.files?.[0] || null;
    if (!file) { upload.disabled = true; return; }
    if (video.size && file.size !== video.size) {
      status('The selected file does not match the original size. Please select the exact Drive original.');
      file = null; upload.disabled = true; return;
    }
    status('Reading video duration…');
    const seconds = await originalDuration(file);
    if (seconds > 0) duration.value = String(Math.ceil(seconds / 6) / 10);
    else status('Please enter the video duration manually if this browser cannot read its format.');
    if (seconds > 0) status('Ready to upload the selected original. This creates a separately billed streaming copy.');
    upload.disabled = !enabled;
  };
  pause.onclick = () => { cancelStreamUpload(); status('Upload paused. Select the same original to resume.'); toggle(false); };
  upload.onclick = async () => {
    if (!enabled || !file || busy || !admin.isAdmin) return;
    const minutes = Number(duration.value);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480) { status('Enter the duration of the original video in minutes.'); return; }
    const existing = job();
    if (existing?.completed) { status('This video has been uploaded. Select Check video processing instead.'); return; }
    if (existing && (existing.size !== file.size || existing.name !== file.name || existing.modified !== file.lastModified)) {
      status('The selected original differs from the paused upload. Restart with the original file or wait until its upload expires.');
      return;
    }
    toggle(true); progress.hidden = false;
    const controller = new AbortController(); activeController = controller;
    try {
      let current = existing;
      if (!current) {
        status('Reserving capacity for this video…');
        const created = await ownerRequest(admin, 'prepare', { videoId: video.id, file: { size: file.size, name: file.name, durationSeconds: Math.ceil(minutes * 60) } });
        if (!safeUploadUrl(created.uploadUrl)) throw new Error('Untrusted video upload address.');
        current = { ...created, size: file.size, name: file.name, modified: file.lastModified, videoId: video.id };
        sessionStorage.setItem(jobKey(video.id), JSON.stringify(current));
      }
      status('Uploading the original securely and resumably to the video service…');
      await uploadChunks(file, current, (sent, total) => { progress.value = Math.round(sent / total * 100); status(`Uploaded ${Math.round(sent / total * 100)}% · keep this tab active, or pause and resume later.`); }, controller.signal);
      current.completed = true; sessionStorage.setItem(jobKey(video.id), JSON.stringify(current));
      status('Upload completed. Cloudflare is preparing adaptive resolutions. Check processing status to publish.');
      check.hidden = false;
    } catch (error) {
      status(controller.signal.aborted ? 'Upload paused. You can resume with the same original.' : error.message);
    } finally { activeController = null; toggle(false); }
  };
  check.onclick = async () => {
    const current = job();
    if (!current) { status('No active upload for this video. Select its original file first.'); return; }
    if (!enabled) { status('Adaptive video service is not activated.'); return; }
    check.disabled = true;
    try {
      const result = await ownerRequest(admin, 'status', { videoId: video.id, uid: current.uid });
      if (result.status === 'ready' && result.delivery) {
        sessionStorage.removeItem(jobKey(video.id));
        check.hidden = true;
        status('Video encoded and published. Adaptive playback is ready.');
        onPublished(result.delivery);
      } else status(`Video service processing: ${result.status} · ${Math.round(result.percent || 0)}% completed. Try Check again shortly.`);
    } catch (error) { status(error.message); toast('Video delivery status unavailable.'); }
    finally { check.disabled = false; }
  };
}
