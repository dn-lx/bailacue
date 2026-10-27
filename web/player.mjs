import { embedUrl } from './core.mjs';
import { formatTime } from './studio-model.mjs';
const paths = {
  play: '<path d="m9 5 12 9-12 9Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v18M19 5v18" stroke-width="4"/>',
  back: '<path d="M7 9H2V4m0 5a11 11 0 1 1-1 11"/><text x="14" y="19" text-anchor="middle" fill="currentColor" stroke="none" font-size="11" font-family="system-ui" font-weight="600">5</text>',
  forward: '<path d="M21 9h5V4m0 5a11 11 0 1 0 1 11"/><text x="14" y="19" text-anchor="middle" fill="currentColor" stroke="none" font-size="11" font-family="system-ui" font-weight="600">5</text>',
  volume: '<path d="M3 11h5l6-5v16l-6-5H3Z"/><path d="M19 9a8 8 0 0 1 0 10m4-14a14 14 0 0 1 0 18"/>',
  muted: '<path d="M3 11h5l6-5v16l-6-5H3Z"/><path d="m20 10 6 8m0-8-6 8"/>',
  expand: '<path d="M10 3H3v7m15-7h7v7M3 18v7h7m15-7v7h-7"/>',
  mirror: '<path d="M14 2v24M10 7 3 21h7Zm8 0 7 14h-7Z"/>',
};
function mediaIcon(name) { return `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`; }
let youtubePromise;
function loadYoutube() {
  if ((/** @type {any} */ (window)).YT?.Player) return Promise.resolve();
  if (!youtubePromise) youtubePromise = new Promise((resolve, reject) => {
    const fail = () => { clearTimeout(timeout); youtubePromise = null; reject(new Error('YouTube controls could not load. Open the original video.')); };
    const timeout = setTimeout(fail, 15000);
    const w = /** @type {any} */ (window); w.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(undefined); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = fail; document.head.append(script);
  });
  return youtubePromise;
}
export class StudioPlayer {
  constructor({ token, allowedFile, toast, saveLoop }) {
    this.token = token; this.allowedFile = allowedFile; this.toast = toast; this.saveLoop = saveLoop;
    this.frame = document.querySelector('#video-frame'); this.controls = document.querySelector('#media-controls'); this.stage = document.querySelector('#full-stage');
    this.media = null; this.video = null; this.youtube = null; this.loop = null; this.generation = 0; this.timer = null; this.kind = 'preview'; this.a = null;
    this.controls.innerHTML = `
      <div class="timeline"><input type="range" id="media-seek" aria-label="Video position" min="0" max="1000" step="1" value="0" aria-valuetext="0:00 of 0:00"><span id="media-time">0:00 / 0:00</span></div>
      <div class="transport" role="group" aria-label="Playback controls">
        <button type="button" id="media-back" class="media-icon media-skip" aria-label="Back 5 seconds" title="Back 5 seconds">${mediaIcon('back')}</button>
        <button type="button" id="media-play" class="media-icon media-play" aria-label="Play video" title="Play video">${mediaIcon('play')}</button>
        <button type="button" id="media-forward" class="media-icon media-skip" aria-label="Forward 5 seconds" title="Forward 5 seconds">${mediaIcon('forward')}</button>
      </div>
      <div class="player-utilities">
        <div class="volume-control"><button type="button" id="media-mute" class="media-icon" aria-label="Mute" title="Mute">${mediaIcon('volume')}</button><input type="range" id="media-volume" aria-label="Volume" min="0" max="100" value="100"></div>
        <label class="speed-label" for="media-speed">Speed<select id="media-speed" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <div class="media-display-actions"></div>
      </div>
      <details class="practice-tools"><summary>Practice tools<span>Loop & mirror</span></summary><div class="practice-tools-body">
        <div class="loop-controls"><button type="button" id="media-a">Set start A</button><button type="button" id="media-b">Set end B</button><button type="button" id="media-loop" aria-pressed="false">Loop off</button><button type="button" id="media-save-loop">Save loop</button><button type="button" id="media-mirror" aria-pressed="false">${mediaIcon('mirror')}Mirror</button></div>
        <p id="loop-info">Set A and B to repeat a move.</p>
      </div></details>`;
    const fullscreen = document.querySelector('#fullscreen-button');
    fullscreen.className = 'media-icon'; fullscreen.innerHTML = mediaIcon('expand'); fullscreen.setAttribute('aria-label', 'Enter full screen'); fullscreen.setAttribute('title', 'Enter full screen');
    this.$('.media-display-actions').append(fullscreen);
    document.getElementById('drive-preview-button').onclick = () => { if (this.video?.provider === 'drive') { clearTimeout(this.loadingTimer); this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.media = null; this.preview(this.video); } };
    this.$('#media-play').onclick = () => this.playPause();
    this.$('#media-back').onclick = () => this.seek(this.current() - 5);
    this.$('#media-forward').onclick = () => this.seek(this.current() + 5);
    this.$('#media-seek').oninput = e => this.seek(Number(e.target.value) / 1000 * this.duration());
    this.$('#media-speed').onchange = e => { const value = Number(e.target.value); if (this.media) this.media.playbackRate = value; if (this.youtube) this.youtube.setPlaybackRate(value); };
    this.$('#media-volume').oninput = e => { const value = Number(e.target.value); if (this.media) { this.media.volume = value / 100; this.media.muted = value === 0; } if (this.youtube) { this.youtube.setVolume(value); value === 0 ? this.youtube.mute() : this.youtube.unMute(); } this.updateVolume(); };
    this.$('#media-mute').onclick = () => { if (this.media) this.media.muted = !this.media.muted; if (this.youtube) this.youtube.isMuted() ? this.youtube.unMute() : this.youtube.mute(); this.updateVolume(); };
    this.$('#media-a').onclick = () => { this.a = this.current(); this.loop = null; this.$('#media-loop').setAttribute('aria-pressed', 'false'); this.$('#media-loop').textContent = 'Loop off'; this.$('#loop-info').textContent = `A ${formatTime(this.a)} — choose B after this point.`; };
    this.$('#media-b').onclick = () => { if (this.a === null || this.current() <= this.a + 0.2) { this.toast('Set A first, then choose B after the start.'); return; } this.loop = { start: this.a, end: this.current() }; this.$('#media-loop').setAttribute('aria-pressed', 'true'); this.$('#media-loop').textContent = 'Loop on'; this.$('#loop-info').textContent = `${formatTime(this.loop.start)} → ${formatTime(this.loop.end)}`; };
    this.$('#media-loop').onclick = () => { const enabled = this.$('#media-loop').getAttribute('aria-pressed') !== 'true'; if (!this.loop) { this.toast('Set A and B to create a practice loop.'); return; } this.$('#media-loop').setAttribute('aria-pressed', String(enabled)); this.$('#media-loop').textContent = enabled ? 'Loop on' : 'Loop off'; };
    this.$('#media-save-loop').onclick = () => { if (!this.loop) { this.toast('Set A and B before saving a loop.'); return; } this.saveLoop({ ...this.loop }); };
    this.$('#media-mirror').onclick = () => { if (!this.media) return; const active = this.media.classList.toggle('mirrored'); this.$('#media-mirror').setAttribute('aria-pressed', String(active)); };
    document.querySelector('#fullscreen-button').addEventListener('click', () => this.fullscreen());
    document.querySelector('#player').addEventListener('cancel', event => { if (document.querySelector('#player').classList.contains('fullscreen-mode')) { event.preventDefault(); this.fullscreen(); } });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.querySelector('#player').classList.remove('fullscreen-mode'); this.updateFullscreen(); });
    document.addEventListener('keydown', event => {
      if (!document.querySelector('#player')?.matches('[open]') || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest('input,select,textarea,button,[contenteditable=true]'))) return;
      if ([' ', 'k', 'ArrowLeft', 'ArrowRight', 'f'].includes(event.key)) event.preventDefault();
      if (event.key === ' ' || event.key === 'k') this.playPause();
      if (event.key === 'ArrowLeft') this.seek(this.current() - 5);
      if (event.key === 'ArrowRight') this.seek(this.current() + 5);
      if (event.key === 'f') this.fullscreen();
    });
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type !== 'BAILACUE_MEDIA_TOKEN' || !event.ports?.[0]) return;
      event.ports[0].postMessage({ token: this.allowedFile(event.data.fileId) ? this.token() : '' });
    });
  }
  /** @returns {any} */
  $(selector) { return this.controls.querySelector(selector); }
  async open(video, localUrl = '') {
    this.stop(); const generation = this.generation; this.video = video;
    document.getElementById('drive-preview-button').hidden = true;
    this.$('#media-volume').value = '100'; this.$('#media-time').textContent = '0:00 / 0:00'; this.updatePlay(false); this.updateVolume(); this.$('#media-seek').value = '0';
    this.$('#media-speed').value = '1'; this.$('#media-loop').textContent = 'Loop off'; this.$('#media-loop').setAttribute('aria-pressed', 'false'); this.$('#media-mirror').setAttribute('aria-pressed', 'false'); this.$('#loop-info').textContent = 'Set A and B to repeat a move.';
    this.controls.classList.remove('preview-mode'); this.$('.practice-tools').open = false;
    this.frame.setAttribute('aria-busy', 'true'); this.setAvailable(false);
    this.controls.setAttribute('data-preview-label', 'Loading playback…');
    this.status('Loading playback…');
    if (localUrl || video.provider === 'drive') {
      try {
        if (!localUrl && this.token()) {
          if (!('serviceWorker' in navigator)) throw new Error('This browser does not support connected streaming. Use Drive preview.');
          await navigator.serviceWorker.register('/media-worker.js', { scope: '/' }); await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Reload once to enable connected streaming.')), 5000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(undefined); }, { once: true }); });
        }
        if (generation !== this.generation) return;
        const media = document.createElement('video'); media.controls = false; media.playsInline = true; media.preload = 'metadata';
        media.src = localUrl || (this.token() ? `/drive-media/${video.providerId}` : `/api/drive-video/${video.providerId}`);
        media.setAttribute('aria-label', `${video.title} video`);
        this.media = media; this.kind = 'native'; this.frame.replaceChildren(media);
        document.getElementById('drive-preview-button').hidden = video.provider !== 'drive';
        const loading = setTimeout(() => {
          if (generation !== this.generation || media.readyState >= 1) return;
          media.pause(); media.removeAttribute('src'); media.load();
          this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(false);
          this.status('Drive is taking too long. Choose Drive preview or open the original below.');
        }, 22000); this.loadingTimer = loading;
        media.addEventListener('loadedmetadata', () => {
          if (generation !== this.generation || media !== this.media) return;
          clearTimeout(loading); this.frame.setAttribute('aria-busy', 'false');
          if (!media.videoWidth || !media.videoHeight) {
            media.pause(); this.setAvailable(false);
            this.status('This browser cannot show the original video format. Choose Drive preview or open the original below.');
            return;
          }
          this.setAvailable(true);
          this.status(localUrl ? 'Local preview · changes affect playback only' : 'Drive original · BailaCue player · speed, mirror and practice loops');
        });
        media.addEventListener('error', () => {
          if (generation !== this.generation || media !== this.media) return;
          clearTimeout(loading); this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(false);
          this.status('This Drive video could not play here. Choose Drive preview or open the original below.');
        });
        for (const type of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'volumechange']) media.addEventListener(type, () => this.tick());
      } catch (error) { if (generation === this.generation) { this.preview(video); this.status(error.message); } }
    } else if (video.provider === 'youtube') {
      try {
        await loadYoutube(); if (generation !== this.generation) return;
        const mount = document.createElement('div'); this.frame.replaceChildren(mount); this.kind = 'youtube';
        const YT = (/** @type {any} */ (window)).YT;
        this.youtube = new YT.Player(mount, { videoId: video.kind === 'playlist' ? undefined : video.providerId, playerVars: { origin: location.origin, playsinline: 1, controls: 1, rel: 0, ...(video.kind === 'playlist' ? { listType: 'playlist', list: video.providerId } : {}) }, host: 'https://www.youtube-nocookie.com', events: {
          onReady: () => { if (generation !== this.generation) return; this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(true); this.status('YouTube · playback controls ready'); this.timer = setInterval(() => this.tick(), 300); },
          onError: () => { this.setAvailable(false); this.status('YouTube cannot play this source here. Open the original to continue.'); },
        } });
      } catch (error) { if (generation === this.generation) { this.preview(video); this.status(error.message); } }
    } else this.preview(video);
  }
  preview(video) {
    const isDrive = video.provider === 'drive';
    const frame = document.createElement('iframe'); frame.src = embedUrl(video); frame.title = `${video.title} preview`; frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'; frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.onload = () => this.frame.setAttribute('aria-busy', 'false'); this.frame.replaceChildren(frame); this.kind = 'preview'; this.setAvailable(false); this.controls.classList.add('preview-mode'); this.controls.setAttribute('data-preview-label', isDrive ? 'Google Drive preview' : 'Provider preview');
    document.getElementById('drive-preview-button').hidden = true;
    this.status(isDrive ? 'Drive preview · use Google’s controls. Full screen and player sizing remain available.' : 'Provider preview · use its controls, or open the original video.');
  }
  status(text) { const el = document.querySelector('#playback-status'); if (el) el.textContent = text; }
  setAvailable(available) {
    this.controls.querySelectorAll('button,input,select').forEach(el => { if (!el.classList.contains('fullscreen-exit') && el.id !== 'fullscreen-button') (/** @type {any} */ (el)).disabled = !available; });
    this.$('#media-mirror').disabled = !available || !this.media;
    this.controls.classList.toggle('controls-unavailable', !available);
  }
  updatePlay(playing) {
    const button = this.$('#media-play'), label = playing ? 'Pause video' : 'Play video';
    if (button.getAttribute('aria-label') === label) return;
    button.innerHTML = mediaIcon(playing ? 'pause' : 'play'); button.setAttribute('aria-label', label); button.title = label;
  }
  updateVolume() {
    const muted = !!(this.media?.muted || this.youtube?.isMuted?.());
    const button = this.$('#media-mute'); button.innerHTML = mediaIcon(muted ? 'muted' : 'volume');
    button.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); button.title = muted ? 'Unmute' : 'Mute';
    const volume = this.media ? Math.round(this.media.volume * 100) : this.youtube?.getVolume?.();
    if (Number.isFinite(volume)) this.$('#media-volume').value = muted ? 0 : volume;
  }
  updateFullscreen() {
    const active = document.querySelector('#player').classList.contains('fullscreen-mode');
    const button = this.$('#fullscreen-button'), label = active ? 'Exit full screen' : 'Enter full screen'; button.setAttribute('aria-label', label); button.title = label;
  }
  current() { return this.media?.currentTime || this.youtube?.getCurrentTime?.() || 0; }
  duration() { return this.media?.duration || this.youtube?.getDuration?.() || 0; }
  seek(time) { const value = Math.max(0, Math.min(time, this.duration() || time)); if (this.media) this.media.currentTime = value; if (this.youtube) this.youtube.seekTo(value, true); }
  playPause() { if (this.media) { if (this.media.paused) { this.media.play().catch(() => this.toast('Tap Play on the video to start playback.')); } else this.media.pause(); } if (this.youtube) this.youtube.getPlayerState() === 1 ? this.youtube.pauseVideo() : this.youtube.playVideo(); }
  tick() {
    const current = this.current(), duration = this.duration(); this.$('#media-time').textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (document.activeElement !== this.$('#media-seek')) this.$('#media-seek').value = duration ? Math.round(current / duration * 1000) : 0;
    this.updatePlay(!!((this.media && !this.media.paused && !this.media.ended) || this.youtube?.getPlayerState?.() === 1));
    this.updateVolume();
    this.$('#media-seek').setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
    if (this.loop && this.$('#media-loop').getAttribute('aria-pressed') === 'true' && current >= this.loop.end) this.seek(this.loop.start);
  }
  useLoop(loop) { this.$('.practice-tools').open = true; this.a = loop.start; this.loop = { start: loop.start, end: loop.end }; this.$('#media-loop').setAttribute('aria-pressed', 'true'); this.$('#media-loop').textContent = 'Loop on'; this.$('#loop-info').textContent = `${formatTime(loop.start)} → ${formatTime(loop.end)}`; this.seek(loop.start); }
  async fullscreen() { const dialog = document.querySelector('#player'); const active = dialog.classList.toggle('fullscreen-mode'); this.updateFullscreen(); if (!active) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; } try { if (this.stage.requestFullscreen) await this.stage.requestFullscreen(); } catch { /* The full-window layout remains available when native fullscreen is denied. */ } }
  stop() { this.generation++; clearTimeout(this.loadingTimer); clearInterval(this.timer); this.timer = null; this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.youtube?.destroy(); this.youtube = null; this.media = null; this.loop = null; this.a = null; this.frame.replaceChildren(); document.querySelector('#player').classList.remove('fullscreen-mode'); this.updateFullscreen(); }
}
