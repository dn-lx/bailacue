import { embedUrl } from './core.mjs';
import { formatTime } from './studio-model.mjs';
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
    this.controls.innerHTML = `<div class="transport"><button type="button" id="media-play" aria-label="Play or pause video">Play</button><button type="button" id="media-back" aria-label="Seek back 5 seconds">−5s</button><button type="button" id="media-forward" aria-label="Seek forward 5 seconds">+5s</button><span id="media-time">0:00 / 0:00</span><label class="sr-only" for="media-seek">Video position</label><input type="range" id="media-seek" min="0" max="1000" value="0"><label class="speed-label">Speed<select id="media-speed" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label class="speed-label volume-label">Volume<input type="range" id="media-volume" aria-label="Volume" min="0" max="100" value="100"></label><button type="button" id="media-mute" aria-label="Mute or unmute video">Mute</button></div><div class="practice-tools"><button type="button" id="media-a">Set A</button><button type="button" id="media-b">Set B</button><button type="button" id="media-loop" aria-pressed="false">Loop off</button><button type="button" id="media-save-loop">Save loop</button><button type="button" id="media-mirror" aria-pressed="false">Mirror</button><span id="loop-info">Choose the start (A) and end (B) of a move.</span></div>`;
    document.getElementById('drive-preview-button').onclick = () => { if (this.video?.provider === 'drive') { clearTimeout(this.loadingTimer); this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.media = null; this.preview(this.video); } };
    this.$('#media-play').onclick = () => this.playPause();
    this.$('#media-back').onclick = () => this.seek(this.current() - 5);
    this.$('#media-forward').onclick = () => this.seek(this.current() + 5);
    this.$('#media-seek').oninput = e => this.seek(Number(e.target.value) / 1000 * this.duration());
    this.$('#media-speed').onchange = e => { const value = Number(e.target.value); if (this.media) this.media.playbackRate = value; if (this.youtube) this.youtube.setPlaybackRate(value); };
    this.$('#media-volume').oninput = e => { const value = Number(e.target.value); if (this.media) { this.media.volume = value / 100; this.media.muted = value === 0; } if (this.youtube) { this.youtube.setVolume(value); value === 0 ? this.youtube.mute() : this.youtube.unMute(); } this.$('#media-mute').textContent = value === 0 ? 'Unmute' : 'Mute'; };
    this.$('#media-mute').onclick = () => { if (this.media) this.media.muted = !this.media.muted; if (this.youtube) this.youtube.isMuted() ? this.youtube.unMute() : this.youtube.mute(); this.$('#media-mute').textContent = (this.media?.muted || this.youtube?.isMuted()) ? 'Unmute' : 'Mute'; };
    this.$('#media-a').onclick = () => { this.a = this.current(); this.loop = null; this.$('#loop-info').textContent = `A ${formatTime(this.a)} — choose B after this point.`; };
    this.$('#media-b').onclick = () => { if (this.a === null || this.current() <= this.a + 0.2) { this.toast('Set A first, then choose B after the start.'); return; } this.loop = { start: this.a, end: this.current() }; this.$('#media-loop').setAttribute('aria-pressed', 'true'); this.$('#media-loop').textContent = 'Loop on'; this.$('#loop-info').textContent = `${formatTime(this.loop.start)} → ${formatTime(this.loop.end)}`; };
    this.$('#media-loop').onclick = () => { const enabled = this.$('#media-loop').getAttribute('aria-pressed') !== 'true'; if (!this.loop) { this.toast('Set A and B to create a practice loop.'); return; } this.$('#media-loop').setAttribute('aria-pressed', String(enabled)); this.$('#media-loop').textContent = enabled ? 'Loop on' : 'Loop off'; };
    this.$('#media-save-loop').onclick = () => { if (!this.loop) { this.toast('Set A and B before saving a loop.'); return; } this.saveLoop({ ...this.loop }); };
    this.$('#media-mirror').onclick = () => { if (!this.media) return; const active = this.media.classList.toggle('mirrored'); this.$('#media-mirror').setAttribute('aria-pressed', String(active)); };
    document.querySelector('#fullscreen-button').addEventListener('click', () => this.fullscreen());
    const exit = document.createElement('button'); exit.type = 'button'; exit.className = 'fullscreen-exit'; exit.textContent = 'Exit full screen'; exit.addEventListener('click', () => this.fullscreen()); this.controls.append(exit);
    document.querySelector('#player').addEventListener('cancel', event => { if (document.querySelector('#player').classList.contains('fullscreen-mode')) { event.preventDefault(); this.fullscreen(); } });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.querySelector('#player').classList.remove('fullscreen-mode'); });
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
    this.$('#media-volume').value = '100'; this.$('#media-time').textContent = '0:00 / 0:00'; this.$('#media-play').textContent = 'Play'; this.$('#media-mute').textContent = 'Mute'; this.$('#media-seek').value = '0';
    this.$('#media-speed').value = '1'; this.$('#media-loop').textContent = 'Loop off'; this.$('#media-loop').setAttribute('aria-pressed', 'false'); this.$('#media-mirror').setAttribute('aria-pressed', 'false'); this.$('#loop-info').textContent = 'Choose the start (A) and end (B) of a move.';
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
        const media = document.createElement('video'); media.controls = true; media.playsInline = true; media.preload = 'metadata';
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
          clearTimeout(loading); this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(true);
          this.status(localUrl ? 'Local preview · changes affect playback only' : 'Drive original · BailaCue player · speed, mirror and practice loops');
        });
        media.addEventListener('error', () => {
          if (generation !== this.generation || media !== this.media) return;
          clearTimeout(loading); this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(false);
          this.status('This Drive video could not play here. Choose Drive preview or open the original below.');
        });
        for (const type of ['play', 'pause', 'timeupdate', 'durationchange']) media.addEventListener(type, () => this.tick());
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
    const frame = document.createElement('iframe'); frame.src = embedUrl(video); frame.title = `${video.title} preview`; frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'; frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.onload = () => this.frame.setAttribute('aria-busy', 'false'); this.frame.replaceChildren(frame); this.kind = 'preview'; this.setAvailable(false); this.controls.setAttribute('data-preview-label', isDrive ? 'Google Drive preview' : 'Provider preview');
    document.getElementById('drive-preview-button').hidden = true;
    this.status(isDrive ? 'Drive preview · use Google’s controls. Full screen and player sizing remain available.' : 'Provider preview · use its controls, or open the original video.');
  }
  status(text) { const el = document.querySelector('#playback-status'); if (el) el.textContent = text; }
  setAvailable(available) { this.controls.querySelectorAll('button,input,select').forEach(el => { if (!el.classList.contains('fullscreen-exit')) (/** @type {any} */ (el)).disabled = !available; }); this.$('#media-mirror').disabled = !available || !this.media; this.controls.classList.toggle('preview-mode', !available); }
  current() { return this.media?.currentTime || this.youtube?.getCurrentTime?.() || 0; }
  duration() { return this.media?.duration || this.youtube?.getDuration?.() || 0; }
  seek(time) { const value = Math.max(0, Math.min(time, this.duration() || time)); if (this.media) this.media.currentTime = value; if (this.youtube) this.youtube.seekTo(value, true); }
  playPause() { if (this.media) { if (this.media.paused) { this.media.play().catch(() => this.toast('Tap Play on the video to start playback.')); } else this.media.pause(); } if (this.youtube) this.youtube.getPlayerState() === 1 ? this.youtube.pauseVideo() : this.youtube.playVideo(); }
  tick() {
    const current = this.current(), duration = this.duration(); this.$('#media-time').textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (document.activeElement !== this.$('#media-seek')) this.$('#media-seek').value = duration ? Math.round(current / duration * 1000) : 0;
    this.$('#media-play').textContent = (this.media && !this.media.paused) || this.youtube?.getPlayerState?.() === 1 ? 'Pause' : 'Play';
    if (this.loop && this.$('#media-loop').getAttribute('aria-pressed') === 'true' && current >= this.loop.end) this.seek(this.loop.start);
  }
  useLoop(loop) { this.a = loop.start; this.loop = { start: loop.start, end: loop.end }; this.$('#media-loop').setAttribute('aria-pressed', 'true'); this.$('#media-loop').textContent = 'Loop on'; this.$('#loop-info').textContent = `${formatTime(loop.start)} → ${formatTime(loop.end)}`; this.seek(loop.start); }
  async fullscreen() { const dialog = document.querySelector('#player'); const active = dialog.classList.toggle('fullscreen-mode'); if (!active) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; } try { if (this.stage.requestFullscreen) await this.stage.requestFullscreen(); } catch { /* The full-window layout remains available when native fullscreen is denied. */ } }
  stop() { this.generation++; clearTimeout(this.loadingTimer); clearInterval(this.timer); this.timer = null; this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.youtube?.destroy(); this.youtube = null; this.media = null; this.loop = null; this.a = null; this.frame.replaceChildren(); document.querySelector('#player').classList.remove('fullscreen-mode'); }
}
