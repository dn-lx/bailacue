import { COMPRESSED_FOLDERS, OPTIMIZED_PRESET, OPTIMIZED_ROOT, QUALITIES, parseOptimizedManifest, renditions } from './optimized-delivery.mjs';

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
      Math.min(width, height) < 2) return null;
  // Create the requested output dimensions from the Original, upscaling when needed.
  const scale = Math.min(profile.width / Math.max(width, height), profile.height / Math.min(width, height));
  return { width: Math.floor(width * scale / 2) * 2, height: Math.floor(height * scale / 2) * 2 };
}

async function temporaryFile() {
  if (!navigator.storage?.getDirectory || typeof FileSystemFileHandle === 'undefined' ||
      !FileSystemFileHandle.prototype.createWritable) return null;
  const root = await navigator.storage.getDirectory();
  const name = `bailacue-${crypto.randomUUID()}`;
  const handle = await root.getFileHandle(name, { create: true });
  return { handle, remove: () => root.removeEntry(name).catch(() => {}) };
}

async function openSource(video, connection, report, signal) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error('This browser does not provide video encoding. Try current Safari on your iPad.');
  }
  const media = await (library ??= import(browserLibrary).catch(error => { library = undefined; throw error; }));
  report('Downloading from Drive…', 0);
  const response = await connection.request(`https://www.googleapis.com/drive/v3/files/${video.providerId}?alt=media&supportsAllDrives=true`, { signal });
  const scratch = await temporaryFile();
  let blob;
  try {
    if (scratch && response.body) {
      const writable = await scratch.handle.createWritable();
      await response.body.pipeTo(writable, { signal });
      blob = await scratch.handle.getFile();
    } else {
      blob = await response.blob();
    }
    signal.throwIfAborted();
    if (!blob.size) throw new Error('The downloaded source is empty.');
  } catch (error) {
    await scratch?.remove();
    throw error;
  }
  const input = new media.Input({ source: new media.BlobSource(blob), formats: media.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No supported video track was found.');
    const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('The source has no usable duration.');
    const audio = await input.getPrimaryAudioTrack();
    return { media, input, track, audio, width, height, duration, bytes: blob.size, close: async () => { input.dispose(); await scratch?.remove(); } };
  } catch (error) {
    input.dispose();
    await scratch?.remove();
    throw error;
  }
}

async function encode(source, quality, filename, report, signal) {
  const { media, input, track, audio, width, height, duration, bytes } = source;
  const { Output, Mp4OutputFormat, BufferTarget, StreamTarget, Conversion } = media;
  const size = compressionSize(width, height, quality);
  const audioBitrate = 96_000;
  const bitrate = Math.max(40_000, Math.min(PROFILES[quality].bitrate, Math.floor(bytes * 8 / duration * 0.8) - (audio ? audioBitrate : 0)));
  const scratch = await temporaryFile();
  try {
    const buffer = scratch ? null : new BufferTarget();
    const target = scratch
      ? new StreamTarget(await scratch.handle.createWritable(), { chunked: true })
      : buffer;
    const conversion = await Conversion.init({
      input, output: new Output({ format: new Mp4OutputFormat({ fastStart: scratch ? false : 'in-memory' }), target }),
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
    const data = scratch ? await scratch.handle.getFile() : buffer?.buffer;
    if (!data) throw new Error('The encoder returned an empty file.');
    const file = new File([data], filename, { type: 'video/mp4' });
    if (file.size < 1024) throw new Error('The encoder returned an empty file.');
    return { file, remove: scratch?.remove };
  } catch (error) {
    await scratch?.remove();
    throw error;
  }
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
const automatic = new Map();

export function pendingCopies(video, entry) {
  const dimensions = probedDimensions.get(video.id + ':' + video.updatedAt) || video;
  const published = new Set(renditions(entry).map(item => item.quality));
  return QUALITIES.filter(quality => !published.has(quality) &&
    (!dimensions.width || !dimensions.height || compressionSize(dimensions.width, dimensions.height, quality)));
}
export function renderBrowserCompressor(panel, ctx) {
  if (!ctx.admin.isAdmin) return;
  panel.hidden = false;
  panel.innerHTML = `
    <header class="compress-header">
      <div>
        
        <h2 id="browser-compress-title">Video compression</h2>
        
      </div>
    </header>
    <div class="compress-grid">
      <div class="compress-settings">
        <div class="compress-actions">
          <button class="button primary" type="button" id="browser-compress-start">Start compression</button>
          <button class="button subtle" type="button" id="browser-compress-stop" hidden>Stop batch</button>
        </div>
      </div>
      <div class="compress-output">
        <span class="field-label" title="Available output qualities depend on each original video">Playback quality ⓘ</span>
        <ul class="compress-resolutions" aria-label="Output resolutions">
          <li title="Maximum output resolution is limited by the Original">360p</li><li title="Maximum output resolution is limited by the Original">720p</li><li title="Maximum output resolution is limited by the Original">1080p</li>
        </ul>
        <p class="compress-note">All copies are encoded directly from the Original. The converter upscales when needed to create 360p, 720p, or 1080p outputs; upscaling changes pixel dimensions, not source detail.</p>

      </div>
    </div>
    <footer class="compress-status">
      <p id="browser-compress-pending" class="compress-note"></p><div id="browser-compress-missing" class="compress-missing" aria-live="polite"></div><p role="status"></p>
      <progress max="100" value="0" aria-label="Current compression step progress" hidden></progress>
      <p class="compress-note" title="On-device compression stops when the browser is suspended">Keep this tab open while compressing.</p>
    </footer>`;
  const start = panel.querySelector('button#browser-compress-start');
  const stop = panel.querySelector('button#browser-compress-stop');
  const status = panel.querySelector('[role="status"]');
  const progress = panel.querySelector('progress');
  const missingList = panel.querySelector('#browser-compress-missing');
  const pending = panel.querySelector('#browser-compress-pending');
  let scanVersion = 0;
  async function scan() {
    const version = ++scanVersion;
    pending.textContent = ctx.connection.connected ? 'Checking both Drive collections…' : 'Connect Google Drive above to check conversions.';
    missingList.replaceChildren();
    try {
      const [salsa, bachata] = await Promise.all(['Salsa', 'Bachata'].map(collection =>
        ctx.connection.connected ? ctx.connection.list(collection).then(listing => listing.videos)
          : Promise.resolve(ctx.videos().filter(video => video.provider === 'drive' && video.dance === collection))));
      const raw = ctx.admin.isAdmin ? (await ctx.admin.readContent('optimized:manifest')).find(row => row.key === 'optimized:manifest')?.payload : null;
      const manifest = raw == null ? null : parseOptimizedManifest(raw);
      if (raw != null && !manifest) throw new Error('Cannot verify existing playback copies.');
      if (version !== scanVersion) return;
      const published = new Map((manifest?.entries || []).map(entry => [entry.sourceId, entry]));
      const incomplete = [...salsa, ...bachata].map(video => {
        const entry = published.get(video.id);
        const missing = QUALITIES.filter(quality => !renditions(entry).some(copy => copy.quality === quality));
        return { video, missing, convertible: pendingCopies(video, entry) };
      }).filter(item => item.missing.length);
      const convertibleCount = incomplete.filter(item => item.convertible.length).length;
      pending.textContent = incomplete.length
        ? `${incomplete.length} videos are missing versions; ${convertibleCount} can be created from their Originals, upscaling when needed.`
        : 'All videos have all three compressed versions.';
      const list = panel.ownerDocument.createElement('div');
      list.className = 'compress-missing-list';
      for (const { video, missing, convertible } of incomplete) {
        const row = panel.ownerDocument.createElement('div');
        row.className = 'compress-missing-row';
        const name = panel.ownerDocument.createElement('span');
        name.textContent = `${video.dance} · ${video.filename || video.title}`;
        const qualities = panel.ownerDocument.createElement('span');
        const unsupported = missing.filter(quality => !convertible.includes(quality));
        qualities.textContent = [
          `Compressed version not available: ${missing.join(', ')}`,
          convertible.length ? `Can create from Original: ${convertible.join(', ')} (upscaled when needed)` : '',
          unsupported.length ? `Could not read usable Original dimensions for: ${unsupported.join(', ')}` : '',
        ].filter(Boolean).join(' · ');
        row.append(name, qualities);
        list.append(row);
      }
      missingList.replaceChildren(list);
    } catch (error) {
      if (version === scanVersion) pending.textContent = 'Could not check conversions: ' + error.message;
    }
  }
  void scan();
  function setRunning(running) {
    start.disabled = running || !ctx.connection.connected;
    stop.hidden = !running;
    progress.hidden = !running;
  }
  setRunning(Boolean(controller));
  status.textContent = controller ? 'A compression batch is running.' : ctx.connection.connected
    ? 'Ready to compress.' : 'Connect Google Drive above to compress videos.';
  stop.onclick = () => controller?.abort();
  start.onclick = () => startBatch();
  panel.addEventListener('bailacue-uploaded', event => {
    const originals = (/** @type {CustomEvent} */ (event)).detail;
    for (const video of originals) automatic.set(video.id, video);
    void drainAutomatic();
  });
  async function drainAutomatic() {
    if (controller || !ctx.connection.connected || !automatic.size) return;
    const originals = [...automatic.values()];
    automatic.clear();
    await startBatch(originals);
  }
  async function startBatch(only = null) {
    if (controller) return;
    if (!ctx.admin.isAdmin) {
      status.textContent = 'Sign in as the BailaCue owner first.';
      return;
    }
    if (!ctx.connection.connected) return;
    const run = async () => {
      const { signal } = controller;
      const report = (message, value) => {
        progress.value = Math.round(value * 100);
        status.textContent = message;
      };
      const readManifest = async () => {
        const raw = (await ctx.admin.readContent('optimized:manifest')).find(row => row.key === 'optimized:manifest')?.payload;
        const parsed = raw == null ? null : parseOptimizedManifest(raw);
        if (raw != null && !parsed) throw new Error('The existing playback manifest could not be read safely.');
        return parsed;
      };
      report('Checking Drive and existing copies…', 0);
      const [originals, manifest] = await Promise.all([
        only || Promise.all([ctx.connection.list('Salsa'), ctx.connection.list('Bachata')]).then(lists => lists.flatMap(list => list.videos)), readManifest(),
      ]);
      const published = new Map((manifest?.entries || []).map(entry => [entry.sourceId, entry]));
      const candidates = originals.map(video => ({ video, missing: pendingCopies(video, published.get(video.id)) }))
        .filter(item => item.missing.length);
      if (!candidates.length) { report('No missing playback versions need to be created.', 0); return; }
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
        let loadingSource;
        try {
          await ctx.ensureDriveOriginal(video);
          for (const quality of missing) {
            signal.throwIfAborted();
            try {
              const copy = await ctx.connection.browserCopy(video, quality, signal);
              let result = copy.existing;
              if (!result) {
                source ??= await (loadingSource ??= openSource(video, ctx.connection, step, signal));
                probedDimensions.set(video.id + ':' + video.updatedAt, { width: source.width, height: source.height });
                if (!compressionSize(source.width, source.height, quality)) { skipped++; continue; }
                const encoded = await encode(source, quality, copy.name, step, signal);
                try {
                  result = await ctx.connection.uploadBrowserCopy(video, copy, encoded.file,
                    (bytes, total) => step(`Uploading ${quality} to Drive…`, bytes / total), signal);
                } finally { await encoded.remove?.(); }
              }
              signal.throwIfAborted();
              const next = addRendition(await readManifest(), video, result, quality);
              if (next) await ctx.publishOptimizedManifest(next);
              saved++;
            } catch (error) { recordFailure(`${video.filename} (${quality})`, error); }
          }
        } catch (error) { recordFailure(video.filename, error); }
        finally { await source?.close(); }
      }
      report(`Published ${saved} copies across ${candidates.length} videos. ${skipped} above source resolution. ${failureCount} failed.${failures.length ? ' ' + failures.join(' | ') : ''}`, 1);
    };
    controller = new AbortController();
    setRunning(true);
    status.textContent = 'Preparing the batch…';
    try {
      if (navigator.locks) await navigator.locks.request('bailacue-optimized-manifest', { signal: controller.signal }, run);
      else await run();
    } catch (error) {
      status.textContent = controller.signal.aborted
        ? 'Stopped. Previously published copies are saved.'
        : error.message;
    } finally {
      controller = null;
      setRunning(false);
      void scan();
      void drainAutomatic();
    }
  }
}
