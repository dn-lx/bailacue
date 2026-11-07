import { embedUrl } from './core.mjs';
import { formatTime } from './studio-model.mjs';
import { streamEmbedUrl } from './stream-delivery.mjs';
const paths = {
  play: '<path d="m9 5 12 9-12 9Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v18M19 5v18" stroke-width="4"/>',
  back: '<path d="M7 9H2V4m0 5a11 11 0 1 1-1 11"/><text x="14" y="19" text-anchor="middle" fill="currentColor" stroke="none" font-size="11" font-family="system-ui" font-weight="600">5</text>',
  forward: '<path d="M21 9h5V4m0 5a11 11 0 1 0 1 11"/><text x="14" y="19" text-anchor="middle" fill="currentColor" stroke="none" font-size="11" font-family="system-ui" font-weight="600">5</text>',
  volume: '<path d="M3 11h5l6-5v16l-6-5H3Z"/><path d="M19 9a8 8 0 0 1 0 10m4-14a14 14 0 0 1 0 18"/>',
  muted: '<path d="M3 11h5l6-5v16l-6-5H3Z"/><path d="m20 10 6 8m0-8-6 8"/>',
  expand: '<path d="M10 3H3v7m15-7h7v7M3 18v7h7m15-7v7h-7"/>',
  shrink: '<path d="M3 10h7V3m8 0v7h7M3 18h7v7m8 0v-7h7"/>',
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
  constructor({ token, allowedFile, streamFor = _video => null, onEnded = _video => {}, toast }) {
    this.token = token; this.allowedFile = allowedFile; this.streamFor = streamFor; this.onEnded = onEnded; this.toast = toast;
    this.frame = document.querySelector('#video-frame'); this.videoShell = /** @type {HTMLElement} */ (document.querySelector('#video-only-shell')); this.controls = document.querySelector('#media-controls'); this.stage = document.querySelector('#full-stage');
    this.media = null; this.video = null; this.youtube = null; this.generation = 0; this.timer = null; this.kind = 'preview';
    this.fullscreenControls = /** @type {HTMLElement} */ (document.querySelector('#fullscreen-controls'));
    this.fullscreenTapZone = /** @type {HTMLElement} */ (document.querySelector('#fullscreen-tap-zone'));
    this.fsPlay = /** @type {HTMLButtonElement} */ (document.querySelector('#fs-play'));
    this.fsBack = /** @type {HTMLButtonElement} */ (document.querySelector('#fs-back'));
    this.fsForward = /** @type {HTMLButtonElement} */ (document.querySelector('#fs-forward'));
    this.fsSeek = /** @type {HTMLInputElement} */ (document.querySelector('#fs-seek'));
    this.fsTime = document.querySelector('#fs-time');
    this.fsMute = /** @type {HTMLButtonElement} */ (document.querySelector('#fs-mute'));
    this.fsVolume = /** @type {HTMLInputElement} */ (document.querySelector('#fs-volume'));
    this.fsSpeed = /** @type {HTMLSelectElement} */ (document.querySelector('#fs-speed'));
    this.fullscreenHideTimer = null;
    this.fsPointerDown = false;
    this.fsKeyboardActive = false;
    this.fsScrubbing = false;
    this.controls.innerHTML = `
      <div class="timeline"><input type="range" id="media-seek" aria-label="Video position" min="0" max="1000" step="1" value="0" aria-valuetext="0:00 of 0:00"><span id="media-time">0:00 / 0:00</span></div>
      <div class="transport" role="group" aria-label="Playback controls">
        <button type="button" id="media-back" class="media-icon media-skip" aria-label="Back 5 seconds" title="Back 5 seconds">${mediaIcon('back')}</button>
        <button type="button" id="media-play" class="media-icon media-play" aria-label="Play video" title="Play video">${mediaIcon('play')}</button>
        <button type="button" id="media-forward" class="media-icon media-skip" aria-label="Forward 5 seconds" title="Forward 5 seconds">${mediaIcon('forward')}</button>
      </div>
      <div class="player-utilities">
        <div class="volume-control" role="group" aria-label="Volume controls">
          <button type="button" id="media-mute" class="media-icon" aria-label="Mute" title="Mute">${mediaIcon('volume')}</button>
          <button type="button" id="media-volume-down" class="volume-step" aria-label="Decrease volume" title="Volume down">−</button>
          <input type="range" id="media-volume" aria-label="Adjust volume" min="0" max="100" step="1" value="100">
          <button type="button" id="media-volume-up" class="volume-step" aria-label="Increase volume" title="Volume up">+</button>
          <output id="media-volume-value" class="volume-value" aria-live="off">100%</output>
        </div>
        <label class="speed-label" for="media-speed"><span class="speed-caption">Speed</span><select id="media-speed" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <div class="media-display-actions"><button type="button" class="media-icon" id="media-mirror" aria-label="Mirror video" aria-pressed="false" title="Mirror video">${mediaIcon('mirror')}</button></div>
      </div>`;
    this.fullscreenButton = /** @type {HTMLButtonElement} */ (document.querySelector('#fullscreen-button'));
    this.fullscreenButton.innerHTML = mediaIcon('expand');
    this.updateFullscreen();
    document.addEventListener('fullscreenchange', () => this.updateFullscreen());
    this.fsPlay.innerHTML = mediaIcon('play');
    this.fsBack.innerHTML = mediaIcon('back');
    this.fsForward.innerHTML = mediaIcon('forward');
    this.fsMute.innerHTML = mediaIcon('volume');
    this.fsPlay.onclick = () => { this.playPause(); this.updateFullscreenControls(); this.showFullscreenControls(); };
    this.fsBack.onclick = () => { this.seek(this.current() - 5); this.tick(); this.showFullscreenControls(); };
    this.fsForward.onclick = () => { this.seek(this.current() + 5); this.tick(); this.showFullscreenControls(); };
    this.fsSeek.addEventListener('pointerdown', () => { this.fsScrubbing = true; });
    this.fsSeek.oninput = () => { this.seek(Number(this.fsSeek.value) / 1000 * this.duration()); this.tick(); this.showFullscreenControls(); };
    this.fsSeek.onchange = () => { this.fsScrubbing = false; this.showFullscreenControls(); };
    this.fsSeek.addEventListener('pointerup', () => { this.fsScrubbing = false; this.showFullscreenControls(); });
    this.fsSeek.addEventListener('pointercancel', () => { this.fsScrubbing = false; this.showFullscreenControls(); });
    this.fsMute.onclick = () => { this.toggleMute(); this.showFullscreenControls(); };
    this.fsVolume.oninput = () => { this.setVolume(Number(this.fsVolume.value)); this.showFullscreenControls(); };
    this.fsSpeed.onchange = () => { this.setSpeed(Number(this.fsSpeed.value)); this.showFullscreenControls(); };
    this.fullscreenTapZone.addEventListener('click', () => this.showFullscreenControls());
    this.videoShell.addEventListener('pointermove', event => {
      if (document.fullscreenElement === this.videoShell && event.pointerType === 'mouse') this.showFullscreenControls();
    });
    this.fullscreenControls.addEventListener('pointerdown', () => { this.fsPointerDown = true; this.fsKeyboardActive = false; });
    this.fullscreenControls.addEventListener('pointerup', event => {
      this.fsPointerDown = false;
      if (event.target instanceof Element) event.target.closest('button')?.blur();
      this.scheduleFullscreenHide();
    });
    this.fullscreenControls.addEventListener('pointercancel', () => { this.fsPointerDown = false; this.scheduleFullscreenHide(); });
    this.fullscreenControls.addEventListener('focusin', () => {
      if (!this.fsPointerDown) this.fsKeyboardActive = true;
      this.showFullscreenControls();
    });
    this.videoShell.addEventListener('keydown', () => {
      if (document.fullscreenElement !== this.videoShell) return;
      this.fsKeyboardActive = true; this.showFullscreenControls();
    });
    document.getElementById('drive-preview-button').onclick = () => { if (this.video?.provider === 'drive') { clearTimeout(this.loadingTimer); this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.media = null; this.preview(this.video); } };
    this.$('#media-play').onclick = () => this.playPause();
    this.$('#media-back').onclick = () => this.seek(this.current() - 5);
    this.$('#media-forward').onclick = () => this.seek(this.current() + 5);
    this.$('#media-seek').oninput = e => this.seek(Number(e.target.value) / 1000 * this.duration());
    this.$('#media-speed').onchange = e => this.setSpeed(Number(e.target.value));
    this.$('#media-volume').oninput = e => this.setVolume(Number(e.target.value));
    this.$('#media-volume-down').onclick = () => this.setVolume(Number(this.$('#media-volume').value) - 10);
    this.$('#media-volume-up').onclick = () => this.setVolume(Number(this.$('#media-volume').value) + 10);
    this.$('#media-mute').onclick = () => this.toggleMute();
    this.$('#media-mirror').onclick = () => { if (!this.media) return; const active = this.media.classList.toggle('mirrored'); this.$('#media-mirror').setAttribute('aria-pressed', String(active)); };
    this.fullscreenButton.addEventListener('click', () => this.fullscreen());
    this.fullscreenButton.addEventListener('pointerdown', () => { this.fsKeyboardActive = false; });
    /* The player fills the browser viewport, not the device screen, so Close and Escape remain available. */
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
  async open(video, localUrl = '', autoPlay = false) {
    this.stop(); const generation = this.generation; this.video = video; this.autoStartPending = autoPlay;
    document.getElementById('drive-preview-button').hidden = true;
    this.$('#media-volume').value = '100'; this.$('#media-time').textContent = '0:00 / 0:00'; this.updatePlay(false); this.updateVolume(); this.$('#media-seek').value = '0';
    this.$('#media-speed').value = '1'; this.$('#media-mirror').setAttribute('aria-pressed', 'false');
    this.controls.classList.remove('preview-mode');
    this.hideFullscreenControls();
    this.frame.classList.remove('portrait-video');
    this.frame.setAttribute('aria-busy', 'true'); this.setAvailable(false);
    this.controls.setAttribute('data-preview-label', 'Loading playback…');
    this.status('Loading playback…');
    const deliveryUrl = !localUrl && video.provider === 'drive' ? streamEmbedUrl(this.streamFor(video)) : null;
    if (deliveryUrl) {
      const frame = document.createElement('iframe');
      frame.src = autoPlay ? deliveryUrl + '&autoplay=true' : deliveryUrl;
      frame.title = video.title + ' · adaptive player';
      frame.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.addEventListener('load', () => this.frame.setAttribute('aria-busy', 'false'));
      this.frame.replaceChildren(frame);
      this.kind = 'stream';
      this.updateFullscreen();
      this.controls.classList.add('preview-mode');
      this.controls.setAttribute('data-preview-label', 'Adaptive video player');
      this.setAvailable(false);
      document.getElementById('drive-preview-button').hidden = false;
      this.status('Adaptive video · quality adjusts to the connection. Use the video controls inside the player.');
      return;
    }
    if (localUrl || video.provider === 'drive') {
      try {
        if (!localUrl && this.token()) {
          if (!('serviceWorker' in navigator)) throw new Error('This browser does not support connected streaming. Use Drive preview.');
          await navigator.serviceWorker.register('/media-worker.js', { scope: '/' }); await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Reload once to enable connected streaming.')), 5000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(undefined); }, { once: true }); });
        }
        if (generation !== this.generation) return;
        const media = document.createElement('video'); media.controls = false; media.playsInline = true; media.preload = 'auto';
        media.src = localUrl || (this.token() ? `/drive-media/${video.providerId}` : `/api/drive-video/${video.providerId}`);
        media.setAttribute('aria-label', `${video.title} video`);
        this.media = media; this.kind = 'native'; this.frame.replaceChildren(media); this.updateFullscreen();
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
          this.frame.classList.toggle('portrait-video', media.videoHeight > media.videoWidth);
          this.frame.dispatchEvent(new Event('videoaspectchange'));
          if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) this.readyToPlay(media, localUrl);
          else this.status('Video opened · preparing playback buffer…');
        });
        media.addEventListener('canplay', () => { if (generation === this.generation && media === this.media && media.videoWidth) this.readyToPlay(media, localUrl); });
        media.addEventListener('waiting', () => { if (generation === this.generation && media === this.media) this.status('Buffering video…'); });
        media.addEventListener('playing', () => { if (generation === this.generation && media === this.media) this.status('Playing · BailaCue player'); });
        media.addEventListener('error', () => {
          if (generation !== this.generation || media !== this.media) return;
          clearTimeout(loading); this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(false);
          this.status('This Drive video could not play here. Choose Drive preview or open the original below.');
        });
        for (const type of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'volumechange']) media.addEventListener(type, () => this.tick());
        media.addEventListener('ended', () => { if (generation === this.generation && media === this.media) this.onEnded(video); });
      } catch (error) { if (generation === this.generation) { this.preview(video); this.status(error.message); } }
    } else if (video.provider === 'youtube') {
      try {
        await loadYoutube(); if (generation !== this.generation) return;
        const mount = document.createElement('div'); this.frame.replaceChildren(mount); this.kind = 'youtube';
        const YT = (/** @type {any} */ (window)).YT;
        this.youtube = new YT.Player(mount, { videoId: video.kind === 'playlist' ? undefined : video.providerId, playerVars: { origin: location.origin, playsinline: 1, controls: 0, rel: 0, ...(video.kind === 'playlist' ? { listType: 'playlist', list: video.providerId } : {}) }, host: 'https://www.youtube-nocookie.com', events: {
          onReady: () => { if (generation !== this.generation) return; this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(true); this.status('YouTube · playback controls ready'); this.timer = setInterval(() => this.tick(), 300); if (this.autoStartPending) { this.autoStartPending = false; this.youtube?.playVideo(); } },
          onStateChange: event => { if (generation === this.generation && video.kind !== 'playlist' && event.data === 0) this.onEnded(video); },
          onError: () => { this.setAvailable(false); this.status('YouTube cannot play this source here. Open the original to continue.'); },
        } });
      } catch (error) { if (generation === this.generation) { this.preview(video); this.status(error.message); } }
    } else this.preview(video);
  }
  preview(video) {
    if (document.fullscreenElement === this.videoShell) document.exitFullscreen().catch(() => {});
    const isDrive = video.provider === 'drive';
    const frame = document.createElement('iframe'); frame.src = embedUrl(video); frame.title = `${video.title} preview`; frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = false; frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.onload = () => this.frame.setAttribute('aria-busy', 'false'); this.frame.replaceChildren(frame); this.kind = 'preview'; this.setAvailable(false); this.controls.classList.add('preview-mode'); this.controls.setAttribute('data-preview-label', isDrive ? 'Google Drive preview' : 'Provider preview');
    document.getElementById('drive-preview-button').hidden = true;
    this.status(isDrive ? 'Drive preview · Google manages this embedded player. BailaCue fullscreen requires direct playback.' : 'Provider preview · use its controls, or open the original video.');
  }
  status(text) { const el = document.querySelector('#playback-status'); if (el) el.textContent = text; }
  readyToPlay(media, localUrl) { this.frame.setAttribute('aria-busy', 'false'); this.setAvailable(true); this.status(localUrl ? 'Local video ready' : 'Video buffered and ready · press Play'); if (this.autoStartPending) { this.autoStartPending = false; media.play().catch(() => this.status('Next video is ready. Tap Play to continue the mix.')); } }
  setAvailable(available) {
    this.controls.querySelectorAll('button,input,select').forEach(el => { if (!el.classList.contains('fullscreen-exit') && el.id !== 'fullscreen-button') (/** @type {any} */ (el)).disabled = !available; });
    this.$('#media-mirror').disabled = !available || !this.media;
    this.controls.classList.toggle('controls-unavailable', !available);
    this.updateFullscreen();
  }
  updatePlay(playing) {
    const button = this.$('#media-play'), label = playing ? 'Pause video' : 'Play video';
    if (button.getAttribute('aria-label') === label) return;
    button.innerHTML = mediaIcon(playing ? 'pause' : 'play'); button.setAttribute('aria-label', label); button.title = label;
  }
  setSpeed(value) {
    const speed = Number.isFinite(value) && value > 0 ? value : 1;
    if (this.media) this.media.playbackRate = speed;
    if (this.youtube) this.youtube.setPlaybackRate(speed);
    this.$('#media-speed').value = String(speed);
    this.fsSpeed.value = String(speed);
  }
  toggleMute() {
    if (this.media) this.media.muted = !this.media.muted;
    if (this.youtube) this.youtube.isMuted() ? this.youtube.unMute() : this.youtube.mute();
    this.updateVolume();
  }
  setVolume(value) {
    const volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (this.media) { this.media.volume = volume / 100; this.media.muted = volume === 0; }
    if (this.youtube) { this.youtube.setVolume(volume); volume === 0 ? this.youtube.mute() : this.youtube.unMute(); }
    this.$('#media-volume').value = String(volume);
    this.updateVolume();
  }
  updateVolume() {
    const muted = !!(this.media?.muted || this.youtube?.isMuted?.());
    const button = this.$('#media-mute'); button.innerHTML = mediaIcon(muted ? 'muted' : 'volume');
    button.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); button.title = muted ? 'Unmute' : 'Mute';
    const volume = this.media ? Math.round(this.media.volume * 100) : this.youtube?.getVolume?.();
    if (Number.isFinite(volume)) this.$('#media-volume').value = String(muted ? 0 : Math.round(volume));
    this.$('#media-volume-value').textContent = `${this.$('#media-volume').value}%`;
    this.updateFullscreenControls();
  }
  customFullscreenAvailable() {
    if (this.controls.classList.contains('controls-unavailable')) return false;
    if (this.kind === 'native') return !!this.media;
    if (this.kind === 'youtube') return !!this.youtube;
    // Cross-origin Google Drive and Cloudflare player iframes cannot be controlled by BailaCue.
    return false;
  }
  updateFullscreenControls() {
    if (!this.fullscreenControls) return;
    const current = this.current(), duration = this.duration();
    this.fsTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (document.activeElement !== this.fsSeek && !this.fsScrubbing) {
      this.fsSeek.value = String(duration > 0 ? Math.round(current / duration * 1000) : 0);
    }
    this.fsSeek.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
    const playing = !!((this.media && !this.media.paused && !this.media.ended) || this.youtube?.getPlayerState?.() === 1);
    const label = playing ? 'Pause video' : 'Play video';
    if (this.fsPlay.getAttribute('aria-label') !== label) {
      this.fsPlay.innerHTML = mediaIcon(playing ? 'pause' : 'play');
      this.fsPlay.setAttribute('aria-label', label);
      this.fsPlay.title = label;
    }
    const muted = !!(this.media?.muted || this.youtube?.isMuted?.());
    const volume = this.media ? Math.round(this.media.volume * 100) : this.youtube?.getVolume?.();
    if (Number.isFinite(volume) && document.activeElement !== this.fsVolume) this.fsVolume.value = String(muted ? 0 : Math.round(volume));
    this.fsMute.innerHTML = mediaIcon(muted ? 'muted' : 'volume');
    this.fsMute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.fsMute.title = muted ? 'Unmute' : 'Mute';
    if (document.activeElement !== this.fsSpeed) this.fsSpeed.value = this.$('#media-speed').value;
  }
  showFullscreenControls() {
    if (document.fullscreenElement !== this.videoShell) return;
    this.fullscreenControls.hidden = false;
    this.videoShell.classList.add('fullscreen-controls-visible');
    this.updateFullscreenControls();
    this.scheduleFullscreenHide();
  }
  scheduleFullscreenHide() {
    clearTimeout(this.fullscreenHideTimer);
    if (document.fullscreenElement !== this.videoShell) return;
    this.fullscreenHideTimer = setTimeout(() => {
      if (this.fsScrubbing || this.fsPointerDown ||
          (this.fsKeyboardActive && (this.fullscreenControls.contains(document.activeElement) || document.activeElement === this.fullscreenButton))) {
        this.scheduleFullscreenHide();
        return;
      }
      this.hideFullscreenControls();
    }, 3500);
  }
  hideFullscreenControls() {
    clearTimeout(this.fullscreenHideTimer);
    this.fullscreenHideTimer = null;
    this.fullscreenControls.hidden = true;
    this.videoShell.classList.remove('fullscreen-controls-visible');
    this.fsScrubbing = false;
  }
  updateFullscreen() {
    const active = document.fullscreenElement === this.videoShell;
    const label = active ? 'Exit video fullscreen' : 'Fullscreen video';
    if (this.media) this.media.controls = false; // BailaCue owns the fullscreen controls.
    this.fullscreenButton.hidden = !active && !this.customFullscreenAvailable();
    this.fullscreenButton.setAttribute('aria-label', label);
    this.fullscreenButton.title = label;
    this.fullscreenButton.setAttribute('aria-pressed', String(active));
    this.fullscreenButton.innerHTML = mediaIcon(active ? 'shrink' : 'expand');
    if (active) {
      this.fsKeyboardActive = false;
      this.showFullscreenControls();
    } else {
      this.hideFullscreenControls();
      this.fsKeyboardActive = false;
    }
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
    this.updateFullscreenControls();
    this.$('#media-seek').setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
  }
  async fullscreen() {
    if (document.fullscreenElement === this.videoShell) {
      try { await document.exitFullscreen(); }
      catch { this.toast('Could not exit fullscreen. Try the browser Back button.'); }
      return;
    }
    if (!this.customFullscreenAvailable()) {
      this.toast('BailaCue fullscreen requires a controllable video. Embedded Google Drive previews have their own controls.');
      return;
    }
    try {
      if (typeof this.videoShell.requestFullscreen === 'function') {
        await this.videoShell.requestFullscreen();
      } else {
        this.toast('Custom fullscreen is unavailable in this browser.');
      }
    } catch {
      this.toast('Custom video fullscreen was blocked by the browser.');
    }
    this.updateFullscreen();
  }
  stop() { this.generation++; this.autoStartPending = false; clearTimeout(this.loadingTimer); clearInterval(this.timer); this.timer = null; this.hideFullscreenControls(); this.media?.pause(); this.media?.removeAttribute('src'); this.media?.load(); this.youtube?.destroy(); this.youtube = null; this.media = null; this.kind = 'preview'; this.frame.replaceChildren(); this.frame.classList.remove('portrait-video'); if (document.fullscreenElement === this.videoShell) document.exitFullscreen().catch(() => {}); document.querySelector('#player').classList.remove('fullscreen-mode', 'browser-wide'); this.updateFullscreen(); }
}
