// Owner-only resumable Cloudflare Stream uploader. The original stays in Drive.
// Large bytes travel from the owner's browser directly to Cloudflare (never via Netlify).
const SIZE = 10 * 1024 * 1024;
let activeController = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function jobKey(id) { return 'bailacue:stream-job:' + id; }
function savedJob(id) {
  try {
    const job = JSON.parse(sessionStorage.getItem(jobKey(id)) || 'null');
    return job?.videoId === id && (job.completed === true || Date.parse(job.expiresAt || '') > Date.now()) ? job : null;
  } catch { return null; }
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
      body: file.slice(offset, end), signal, cache: 'no-store',
    });
    if (response.status !== 204) throw new Error('Video upload interrupted. Select the same file and resume.');
    const next = Number(response.headers.get('Upload-Offset'));
    if (!Number.isSafeInteger(next) || next <= offset || next > file.size) throw new Error('Upload offset was not acknowledged.');
    offset = next; onProgress(offset, file.size);
  }
}

export function cancelStreamUpload() { activeController?.abort(); activeController = null; }

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
