import { COMPRESSED_FOLDERS, OPTIMIZED_PRESET, OPTIMIZED_ROOT, QUALITIES, parseOptimizedManifest, renditions } from './optimized-delivery.mjs';

const MAX_BYTES = 100 * 1024 ** 2;
const MAX_SECONDS = 300;
const PROFILES = {
  '360p': { width: 640, height: 360, bitrate: 600_000 },
  '720p': { width: 1280, height: 720, bitrate: 2_000_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 4_000_000 },
};
const probedDimensions = new Map();
const browserLibrary = './vendor/mediabunny.min.mjs';
/** @type {Promise<typeof import('mediabunny')>} */
let library;

export function compressionSize(width, height, quality = '360p') {
  const profile = PROFILES[quality];
  if (!Object.hasOwn(PROFILES, quality) || !Number.isFinite(width) || !Number.isFinite(height) ||
      Math.min(width, height) < profile.height) return null;
  const scale = Math.min(profile.width / Math.max(width, height), profile.height / Math.min(width, height));
  return { width: Math.floor(width * scale / 2) * 2, height: Math.floor(height * scale / 2) * 2 };
}

async function openSource(video, connection, report, signal) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error('This browser does not provide video encoding. Try current Safari on your iPad.');
  }
  const media = await (library ??= import(browserLibrary).catch(error => { library = undefined; throw error; }));
  if (!video.size || video.size > MAX_BYTES) throw new Error('The source must be at most 100 MB for this pilot.');
  report('Downloading from Drive…', 0);
  const response = await connection.request(`https://www.googleapis.com/drive/v3/files/${video.providerId}?alt=media&supportsAllDrives=true`, { signal });
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_BYTES) throw new Error('The downloaded source exceeds the pilot size limit or is empty.');
  signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(blob), formats: media.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No supported video track was found.');
    const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) throw new Error('Choose a video that is five minutes or shorter.');
    const audio = await input.getPrimaryAudioTrack();
    return { media, input, track, audio, width, height, duration, bytes: blob.size };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

async function encode(source, quality, filename, report, signal) {
  const { media, input, track, audio, width, height, duration, bytes } = source;
  const { Output, Mp4OutputFormat, BufferTarget, Conversion } = media;
  const size = compressionSize(width, height, quality);
  const audioBitrate = 96_000;
  const bitrate = Math.min(PROFILES[quality].bitrate, Math.floor(bytes * 8 / duration * 0.8) - (audio ? audioBitrate : 0));
  if (bitrate < 40_000) throw new Error('The original bitrate is already too low to make a useful smaller copy.');
  const target = new BufferTarget();
  const conversion = await Conversion.init({
    input, output: new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target }),
    tracks: 'primary',
    video: { ...size, fit: 'contain', codec: 'avc', bitrate, forceTranscode: true, allowRotationMetadata: false },
    audio: { codec: 'aac', bitrate: audioBitrate, numberOfChannels: 2, sampleRate: 48_000 },
    showWarnings: false,
  });
  if (!conversion.isValid || !conversion.utilizedTracks.includes(track) ||
      (audio && !conversion.utilizedTracks.includes(audio))) {
    throw new Error('This browser could not encode the source as H.264/AAC MP4.');
  }
  signal.throwIfAborted();
  const cancel = () => { conversion.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    report(`Compressing ${quality} on this device…`, 0);
    conversion.onProgress = value => report(`Compressing ${quality} on this device…`, value);
    await conversion.execute();
  } finally { signal.removeEventListener('abort', cancel); }
  signal.throwIfAborted();
  if (!target.buffer || target.buffer.byteLength < 1024) throw new Error('The encoder returned an empty file.');
  if (target.buffer.byteLength >= bytes) throw new Error('The compressed copy would be larger than the original.');
  return new File([target.buffer], filename, { type: 'video/mp4' });
}

function addRendition(manifest, video, copy, quality) {
  const entries = (manifest?.entries || []).map(entry => ({ sourceId: entry.sourceId, dance: entry.dance, renditions: renditions(entry) }));
  const existing = entries.find(entry => entry.sourceId === video.id);
  if (existing?.renditions.some(item => item.quality === quality && item.folderId === copy.folderId)) return null;
  const rendition = { quality, driveId: copy.providerId, folderId: copy.folderId, filename: copy.filename, size: copy.size };
  if (existing) existing.renditions = [...existing.renditions.filter(item => item.quality !== quality), rendition];
  else entries.push({ sourceId: video.id, dance: video.dance, renditions: [rendition] });
  const next = parseOptimizedManifest({ version: 2, rootFolderId: OPTIMIZED_ROOT, preset: OPTIMIZED_PRESET, entries });
  if (!next) throw new Error('The combined playback manifest failed validation.');
  return next;
}

let controller;
export function renderBrowserCompressor(panel, ctx) {
  if (!ctx.admin.isAdmin) return;
  panel.hidden = false;
  panel.innerHTML = `
    <span class="eyebrow">BROWSER COMPRESSION PILOT</span>
    <h2>Compress Drive videos on this device</h2>
    <p>Save smaller 360p, 720p and 1080p MP4 copies when the source supports them to Salsa-compressed or Bachata-compressed inside Dancing. Start with one short clip. Keep this page open and your device awake. Pilot limit: 100 MB and five minutes per video.</p>
    <label class="field">Collection <select id="browser-compress-dance"><option>Salsa</option><option>Bachata</option></select></label>
    <label class="field">Batch size <select id="browser-compress-limit"><option value="1">1 video</option><option value="5">Up to 5 videos</option><option value="20">Up to 20 videos</option><option value="all">All eligible videos</option></select></label>
    <button class="button primary" type="button" id="browser-compress-start">Start compression</button>
    <button class="button subtle" type="button" id="browser-compress-stop">Stop</button>
    <progress max="100" value="0" aria-label="Current compression step progress"></progress>
    <p class="helper-text" role="status"></p>`;
  const start = panel.querySelector('button#browser-compress-start');
  const stop = panel.querySelector('button#browser-compress-stop');
  const dance = panel.querySelector('select#browser-compress-dance');
  const limit = panel.querySelector('select#browser-compress-limit');
  const status = panel.querySelector('[role="status"]');
  const progress = panel.querySelector('progress');
  start.disabled = Boolean(controller);
  stop.disabled = !controller;
  if (controller) status.textContent = 'A compression batch is running.';
  stop.onclick = () => controller?.abort();
  start.onclick = async () => {
    if (controller) return;
    if (!ctx.admin.isAdmin || !ctx.connection.connected) {
      status.textContent = 'Sign in as the BailaCue owner and connect Google Drive first.';
      return;
    }
    const selectedDance = dance.value;
    const count = limit.value === 'all' ? Infinity : Number(limit.value);
    const run = async () => {
      const { signal } = controller;
      const report = (message, value) => {
        progress.value = Math.round(value * 100);
        status.textContent = message;
      };
      const readManifest = async () => {
        const raw = (await ctx.admin.readContent()).find(row => row.key === 'optimized:manifest')?.payload;
        const parsed = raw == null ? null : parseOptimizedManifest(raw);
        if (raw != null && !parsed) throw new Error('The existing playback manifest could not be read safely.');
        return parsed;
      };
      report('Checking Drive and existing copies…', 0);
      const [listing, manifest] = await Promise.all([ctx.connection.list(selectedDance), readManifest()]);
      const known = new Set(ctx.videos().map(video => video.id));
      const destination = COMPRESSED_FOLDERS[selectedDance];
      const published = new Map((manifest?.entries || []).map(entry => [
        entry.sourceId, new Set(renditions(entry).filter(item => item.folderId === destination).map(item => item.quality)),
      ]));
      const missingFor = video => {
        const dimensions = probedDimensions.get(video.id + ':' + video.updatedAt) || video;
        return QUALITIES.filter(quality => !published.get(video.id)?.has(quality) &&
          (!dimensions.width || !dimensions.height || compressionSize(dimensions.width, dimensions.height, quality)));
      };
      const candidates = listing.videos.filter(video => known.has(video.id) &&
        video.size > 0 && video.size <= MAX_BYTES && (!video.duration || video.duration <= MAX_SECONDS))
        .map(video => ({ video, missing: missingFor(video) }))
        .filter(item => item.missing.length).slice(0, count);
      if (!candidates.length) { report('No eligible videos need more playback copies in this collection.', 0); return; }
      let saved = 0, skipped = 0, failureCount = 0;
      const failures = [];
      const recordFailure = (filename, error) => {
        if (signal.aborted || !ctx.connection.connected || !ctx.admin.isAdmin) throw error;
        failureCount++;
        if (failures.length < 3) failures.push(`${filename}: ${error.message}`);
      };
      for (const [index, { video, missing }] of candidates.entries()) {
        signal.throwIfAborted();
        if (!ctx.admin.isAdmin) throw new Error('Sign in again before continuing.');
        const step = (message, value) => report(`${index + 1}/${candidates.length} · ${video.filename} · ${message}`, value);
        let source;
        try {
          for (const quality of missing) {
            signal.throwIfAborted();
            try {
              const copy = await ctx.connection.browserCopy(video, quality, signal);
              let result = copy.existing;
              if (!result) {
                source ??= await openSource(video, ctx.connection, step, signal);
                probedDimensions.set(video.id + ':' + video.updatedAt, { width: source.width, height: source.height });
                if (!compressionSize(source.width, source.height, quality)) { skipped++; continue; }
                const file = await encode(source, quality, copy.name, step, signal);
                result = await ctx.connection.uploadBrowserCopy(video, copy, file,
                  (bytes, total) => step(`Uploading ${quality} to Drive…`, bytes / total), signal);
              }
              signal.throwIfAborted();
              const next = addRendition(await readManifest(), video, result, quality);
              if (next) await ctx.publishOptimizedManifest(next);
              saved++;
            } catch (error) { recordFailure(`${video.filename} (${quality})`, error); }
          }
        } finally { source?.input.dispose(); }
      }
      report(`Published ${saved} copies across ${candidates.length} videos. ${skipped} above source resolution. ${failureCount} failed.${failures.length ? ' ' + failures.join(' | ') : ''}`, 1);
    };
    controller = new AbortController();
    start.disabled = true;
    stop.disabled = false;
    try {
      if (navigator.locks) await navigator.locks.request('bailacue-optimized-manifest', { signal: controller.signal }, run);
      else await run();
    } catch (error) {
      status.textContent = controller.signal.aborted
        ? 'Stopped. Previously published copies are saved.'
        : error.message;
    } finally {
      controller = null;
      start.disabled = false;
      stop.disabled = true;
    }
  };
}
