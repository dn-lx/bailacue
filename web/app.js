import { STORAGE_KEY, SOURCES, emptyState, cleanState, parseYoutube, displayTitle, localDay, dailyPicks, practiceQueue, filterVideos, embedUrl, clampPlayerHeight, clampMixCount, recordRecent, recentOpenings, moveQueueItem, appendFilteredToMix } from './core.mjs';
import { cleanLabels, formatTime, normalizeName, newId } from './studio-model.mjs';
import { BailaCueAdmin } from './admin.mjs';
import { parseStreamDelivery, streamThumbnailUrl } from './stream-delivery.mjs';
import { cancelStreamUpload } from './stream-admin.mjs';
import { parseOptimizedManifest } from './optimized-delivery.mjs';
import { DriveConnection } from './drive.mjs';
import { StudioPlayer } from './player.mjs';
import { labelPicker, renderLabelManager, renderUpload, uploadRunning } from './studio-ui.mjs';

const $ = (selector) => document.querySelector(selector);
const page = $('#page');
const iconPaths = {
  tag: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  play: '<path d="m8 5 12 7-12 7Z"/>',
  heart: '<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  back: '<path d="M20 12H5m5-5-5 5 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  queue: '<path d="M4 5h16M4 10h16M4 15h8m5-1v7m-3-3h6"/>',
  refresh: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
  drive: '<path d="m9 3 6 0 8 14-3 5H4l-3-5Zm0 0 8 14H1m14-14-8 14 3 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  up: '<path d="M12 19V5m-7 7 7-7 7 7"/>',
  down: '<path d="M12 5v14m-7-7 7 7 7-7"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.play}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { if (el instanceof HTMLElement) el.innerHTML = icon(el.dataset.icon); }); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
let state = emptyState();
const LEGACY_BACKUP_KEY = 'bailacue:web:before-public-v1';
let storageAvailable = true;
let storageCorrupt = false;
try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) state = cleanState(JSON.parse(raw)); } catch { storageCorrupt = true; }
/** @type {import('./types.js').Video[]} */
let catalogue = [];
let activeView = 'library';
/** @type {import('./types.js').Filters} */
let filters = { dance: 'All', provider: 'all', level: '', moves: [], positions: [], techniques: [], musicality: [], danceStyles: [], sort: 'random', query: '' };
let randomSeed = Math.floor(Math.random() * 0x100000000);
let currentPage = 1;
const pageSize = 20;
/** @type {import('./types.js').Video | null} */
let selected = null;
let playbackQueue = [];
let playbackIndex = -1;
let recentlyClearedQueue = [];
let queueUndoTimeout;
let toastTimeout;
let metadataIslandTimeout;
let metadataIslandHideTimeout;
let removing = null;
let localPreviewUrl = '';
const connection = new DriveConnection();
const admin = new BailaCueAdmin();
const streamMap = new Map();
const optimizedMap = new Map();
const publishTimers = new Map();
const publishChains = new Map();
const metadataVersions = new Map();
const metadataStatus = new Map();
const pendingMetadata = new Map();
const studioPlayer = new StudioPlayer({
  token: () => connection.token(),
  allowedFile: id => videos().some(v => v.provider === 'drive' && v.providerId === id),
  optimizedFor: video => optimizedMap.get(video.id),
  onPlaybackStarted: video => showMetadataIsland(video),
  onEnded: video => {
    if (selected?.id !== video.id || !$('#player').open || playbackIndex < 0) return;
    const following = playbackQueue[playbackIndex + 1];
    if (following) openPlayer(following, playbackQueue, null, '', true);
    else toast('You have reached the end of this mix.');
  },
  toast,
});
function requireAdmin() { if (admin.isAdmin) return true; toast('Only the administrator can edit BailaCue. Sign in to continue.'); return false; }
function publishKey(key, payload) {
  if (!admin.isAdmin) return Promise.resolve();
  const prior = publishChains.get(key) || Promise.resolve();
  const current = prior.catch(() => {}).then(() => admin.put(key, payload));
  publishChains.set(key, current);
  current.catch(error => toast('Could not publish changes: ' + error.message));
  return current;
}
function publishLabels() { return publishKey('labels', { items: state.labels }); }
function publicMetadata(value = {}) {
  const kept = ['title', 'notes', 'labelIds', 'artistIds', 'recordedAt', 'event', 'location', 'rating', 'moves', 'danceStyles', 'moveIds', 'styleTimingIds', 'level', 'cues'];
  return Object.fromEntries(kept.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}
function publishDrive() {
  if (!admin.isAdmin) return;
  for (const video of state.drive) publishKey('drive:' + video.id, video);
}
function queueMetaPublish(id) {
  const version = (metadataVersions.get(id) || 0) + 1;
  metadataVersions.set(id, version);
  setMetadataStatus(id, 'saving');
  clearTimeout(publishTimers.get(id));
  publishTimers.set(id, setTimeout(async () => {
    publishTimers.delete(id);
    const patch = { ...pendingMetadata.get(id) };
    try {
      const key = 'meta:' + id, prior = publishChains.get(key) || Promise.resolve();
      const request = prior.catch(() => {}).then(() => admin.patchMetadata(id, patch));
      publishChains.set(key, request);
      const canonical = await request;
      if (metadataVersions.get(id) === version) {
        pendingMetadata.delete(id);
        state.meta[id] = publicMetadata(canonical);
        save();
        setMetadataStatus(id, 'saved');
      }
    } catch {
      if (metadataVersions.get(id) === version) setMetadataStatus(id, 'error');
    }
  }, 450));
}
function setMetadataStatus(id, status = metadataStatus.get(id) || 'saved') {
  metadataStatus.set(id, status);
  if (selected?.id !== id) return;
  $('#note-status').textContent = status === 'saving' ? 'Saving changes…' : status === 'error' ? 'Changes could not be published. Try again.' : 'All changes saved';
  $('#retry-video-save').hidden = status !== 'error';
}
function applyAccess() {
  document.body.classList.toggle('is-admin', admin.isAdmin);
  $('#admin-login').hidden = admin.isAdmin;
  $('#admin-logout').hidden = !admin.isAdmin;
}
function studioContext() { return { state: () => state, save: () => { const saved = save(); if (saved && admin.isAdmin) { publishLabels(); publishDrive(); } return saved; }, saveLabels: async () => { if (!save()) return false; if (!admin.isAdmin) throw new Error('Sign in as the administrator to publish labels.'); await publishLabels(); return true; }, patchMeta, toast, videos, connection, admin, optimizedFor: video => optimizedMap.get(video.id), ensureDriveOriginal: async video => {
  if (catalogue.some(item => item.id === video.id)) return;
  await admin.put('drive:' + video.id, video);
  state.drive = [...state.drive.filter(item => item.id !== video.id), video];
  save();
}, publishOptimizedManifest: async manifest => { await admin.put('optimized:manifest', manifest); optimizedMap.clear(); for (const entry of manifest.entries) optimizedMap.set(entry.sourceId, entry); }, preview: file => {
  if (!requireAdmin()) return;
  if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); localPreviewUrl = URL.createObjectURL(file);
  openPlayer('local:preview', null, { id: 'local:preview', provider: 'local', providerId: '', dance: 'Local preview', title: file.name, filename: file.name, size: file.size }, localPreviewUrl);
} }; }
async function addLabel(name, type, dance) {
  try {
    const label = await admin.addSharedLabel(name, type, dance);
    state.labels = cleanLabels([...state.labels, label]);
    save();
    return label;
  } catch (error) { toast('Could not add the label: ' + error.message); }
}
function readableDate(value) { if (!value || Number.isNaN(Date.parse(value))) return 'Unknown'; return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function cardDetails(v) { const m = meta(v.id); const artists = state.labels.filter(l => m.artistIds?.includes(l.id));
  const tags = [...state.labels.filter(item => m.moveIds?.includes(item.id) || m.styleTimingIds?.includes(item.id) || m.labelIds?.includes(item.id)).map(item => item.name), ...(m.moves || []), ...(m.danceStyles || [])];
  return `<div class="card-artists">${artists.length ? esc(artists.map(l => l.name).join(' · ')) : ''}</div><div class="card-tags">${tags.slice(0, 2).map(name => `<span class="tag">${esc(name)}</span>`).join('')}${tags.length > 2 ? `<span class="empty-tag">+${tags.length - 2}</span>` : ''}</div><div class="card-date">Added ${esc(readableDate(v.addedAt))}</div>`;
}

function mountVideoDetails() { if (!selected) return; const v = selected, m = meta(v.id);
  $('#personal-title').value = m.title || '';
  $('#notes').value = m.notes || '';
  setMetadataStatus(v.id);
  for (const [selector, key] of [['#detail-recorded','recordedAt'],['#detail-event','event'],['#detail-location','location']]) $(selector).value = m[key] || '';
  const categoryIds = types => (m.labelIds || []).filter(id => state.labels.some(item => item.id === id && types.includes(item.type)));
  labelPicker($('#detail-dance-styles'), { title: 'Styles', labels: () => state.labels.filter(item => ['Style & timing', 'Style'].includes(item.type)), selected: [...new Set([...(m.styleTimingIds || []), ...categoryIds(['Style & timing', 'Style'])])], dance: v.dance, onChange: styleTimingIds => patchMeta(v.id, { styleTimingIds, labelIds: (meta(v.id).labelIds || []).filter(id => !state.labels.some(item => item.id === id && ['Style & timing', 'Style'].includes(item.type))) }) });
  labelPicker($('#detail-moves'), { title: 'Moves', labels: () => state.labels.filter(item => item.type === 'Moves'), selected: [...new Set([...(m.moveIds || []), ...categoryIds(['Moves'])])], dance: v.dance, onChange: moveIds => patchMeta(v.id, { moveIds, labelIds: (meta(v.id).labelIds || []).filter(id => !state.labels.some(item => item.id === id && item.type === 'Moves')) }) });
  for (const [id, title, type] of [['detail-positions','Positions','Position'],['detail-techniques','Techniques','Technique'],['detail-musicality','Musicality','Musicality']]) {
    let host = document.getElementById(id);
    if (!host) { host = document.createElement('div'); host.id = id; host.className = 'detail-taxonomy'; $('#detail-moves').after(host); }
    labelPicker(host, { title, labels: () => state.labels.filter(item => item.type === type), selected: categoryIds([type]), dance: v.dance, onChange: ids => patchMeta(v.id, { labelIds: [...(meta(v.id).labelIds || []).filter(key => !state.labels.some(item => item.id === key && item.type === type)), ...ids] }) });
  }
  let cueHost = document.getElementById('detail-cues');
  if (!cueHost) { cueHost = document.createElement('section'); cueHost.id = 'detail-cues'; cueHost.className = 'detail-cues'; $('#detail-moves').after(cueHost); }
  const drawCues = () => {
    const cues = meta(v.id).cues || [];
    cueHost.innerHTML = '<h3>Timestamped moves</h3><p class="helper-text">Mark a move at the current playback position. Tap a timestamp to jump there.</p>' +
      '<div class="cue-list">' + cues.map(c => {
        const term = state.labels.find(l => l.id === c.termId);
        return '<div class="cue-row"><button type="button" data-seek="' + c.start + '">' + esc(formatTime(c.start)) + ' · ' + esc(term?.name || 'Move') + '</button>' +
          (admin.isAdmin ? '<button type="button" data-remove="' + esc(c.id) + '" aria-label="Remove timestamp">×</button>' : '') + '</div>';
      }).join('') + '</div>' + (admin.isAdmin ? '<div class="cue-add"><select aria-label="Move for timestamp"><option value="">Select a move</option>' +
      state.labels.filter(l => ['Moves','Position','Technique','Musicality'].includes(l.type) && (l.dance === 'Both' || l.dance === v.dance)).map(l => '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>').join('') +
      '</select><button type="button" class="button subtle small" data-add-cue>Mark current time</button></div>' : '');
    cueHost.querySelectorAll('[data-seek]').forEach(button => button.addEventListener('click', () => studioPlayer.seek(Number(button.getAttribute('data-seek')))));
    cueHost.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { patchMeta(v.id, { cues: cues.filter(c => c.id !== button.getAttribute('data-remove')) }); drawCues(); }));
    cueHost.querySelector('[data-add-cue]')?.addEventListener('click', () => {
      const termId = cueHost.querySelector('select').value;
      if (!termId) { toast('Choose a move first.'); return; }
      const start = Math.round(studioPlayer.current() * 100) / 100;
      patchMeta(v.id, { cues: [...cues, { id: 'cue-' + newId(), termId, start }].slice(0,100).sort((a,b) => a.start-b.start) });
      drawCues();
    });
  };
  drawCues();
  const level = $('#detail-level'); level.value = m.level || ''; level.onchange = () => patchMeta(v.id, { level: level.value || null });
  labelPicker($('#detail-artists'), { title: 'Artists & teachers', labels: () => state.labels, selected: m.artistIds || [], dance: v.dance, artists: true, allowCreate: true, onChange: ids => { patchMeta(v.id, { artistIds: ids }); }, onCreate: addLabel });
  const facts = [['Created in Drive',v.provider === 'drive' ? readableDate(v.addedAt) : 'Not a Drive file'],['Modified',readableDate(v.updatedAt)],['Duration',v.duration ? formatTime(v.duration) : 'Available during playback'],['File size',v.size ? `${(v.size / 1048576).toFixed(1)} MB` : 'Not available'],['Resolution',v.width && v.height ? `${v.width} × ${v.height}` : 'Not available']];
  $('#file-facts').innerHTML = facts.map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('#stream-admin').replaceChildren();
}


function videos() { return [...new Map([...catalogue, ...state.drive, ...state.youtube].map(v => [v.id, v])).values()]; }
function driveVideos() { return videos().filter(v => v.provider === 'drive'); }
function videoById(id) { return videos().find(v => v.id === id); }
function meta(id) { return state.meta[id] || {}; }
function save() {
  if (storageCorrupt) { toast('Your previous data could not be read. Download it in Settings before replacing it.'); return false; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; return true; }
  catch { storageAvailable = false; toast('Browser storage is unavailable. Export a backup to keep your changes.'); return false; }
}
function patchMeta(id, patch) {
  const change = publicMetadata(patch);
  state.meta[id] = { ...meta(id), ...change };
  const saved = save();
  if (!id.startsWith('local:')) {
    pendingMetadata.set(id, { ...pendingMetadata.get(id), ...change });
    queueMetaPublish(id);
  }
  return saved;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
function applyTheme() { document.documentElement.dataset.theme = state.theme; $('#theme-toggle').innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon'); $('#theme-toggle').setAttribute('aria-label', `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`); }
function dateLabel() { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()); }
function badge(dance) { return `<span class="dance-badge ${dance.toLowerCase()}"><i class="dance-dot ${dance.toLowerCase()}"></i>${esc(dance)}</span>`; }
function levelPill(id) { const value = meta(id).level; return value ? `<span class="level-pill">${esc(value)}</span>` : ''; }
function thumb(v) { const converted = streamMap.get(v.id); if (converted) return streamThumbnailUrl(converted); return v.provider === 'drive' ? `https://drive.google.com/thumbnail?id=${v.providerId}&sz=w600` : (v.kind === 'video' ? `https://i.ytimg.com/vi/${v.providerId}/hqdefault.jpg` : null); }
function artwork(v, eager = false) { const url = thumb(v); return `${url ? `<img src="${esc(url)}" alt="" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">` : ''}<span class="visual-fallback">${esc(v.provider === 'drive' ? displayTitle(v, state.meta, state.labels) : '▶')}</span>`; }
function handleImages(root = page) { root.querySelectorAll('.pick-visual,.card-visual').forEach(el => { const img = el.querySelector('img'); if (!img) el.classList.add('image-failed'); else { img.addEventListener('error', () => el.classList.add('image-failed')); if (img.complete && !img.naturalWidth) el.classList.add('image-failed'); } }); }
function card(v) {
  const m = meta(v.id), queued = state.queue.includes(v.id), title = displayTitle(v, state.meta, state.labels);
  return `<article class="video-card"><div class="card-visual ${v.dance.toLowerCase()}">${artwork(v)}<button class="full-play" data-action="open" data-autoplay="true" data-id="${esc(v.id)}" aria-label="Play ${esc(title)}"><span>${icon('play')}</span></button><span class="provider-badge">${icon(v.provider)}${v.provider === 'drive' ? 'GOOGLE DRIVE' : (v.kind === 'playlist' ? 'YOUTUBE PLAYLIST' : 'YOUTUBE')}</span></div><div class="card-content"><div class="card-labels">${badge(v.dance)}${levelPill(v.id)}</div><button class="title-button" data-action="open" data-id="${esc(v.id)}">${esc(title)}</button>${cardDetails(v)}<div class="card-bottom"><button class="queue-button ${queued ? 'selected' : ''}" data-action="queue" data-id="${esc(v.id)}" aria-label="${queued ? 'Remove from' : 'Add to'} mix: ${esc(title)}" aria-pressed="${queued}">${icon(queued ? 'check' : 'plus')} ${queued ? 'In mix' : 'Add to mix'}</button></div></div></article>`;
}
function pick(v) {
  return `<article class="pick-card"><div class="pick-visual ${v.dance.toLowerCase()}">${artwork(v, true)}${badge(v.dance)}<span class="pick-type">TODAY’S PICK</span><button class="play-round" data-action="open" data-autoplay="true" data-id="${esc(v.id)}" aria-label="Play ${esc(displayTitle(v, state.meta, state.labels))}">${icon('play')}</button><div class="pick-overlay"><h3>${esc(displayTitle(v, state.meta, state.labels))}</h3><span>A ${v.dance.toLowerCase()} cue for today</span></div></div><div class="pick-detail"><div>${levelPill(v.id)}<p>${meta(v.id).level ? `Level: ${esc(meta(v.id).level)}.` : 'A fresh cue from your fixed collection.'}</p></div><button class="text-button" data-action="open" data-id="${esc(v.id)}">Watch video ${icon('arrow')}</button></div></article>`;
}
function heading(eyebrow, title, description, extra = '') { return `<div class="page-heading"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`; }
function ensurePicks(refresh = false) {
  const today = localDay();
  if (refresh || !state.daily || state.daily.day !== today || state.daily.ids.some(id => !videoById(id)) || state.daily.ids.length !== 2) {
    state.daily = { day: today, ids: dailyPicks(videos(), state.meta, today + (refresh ? `:${Date.now()}` : ''), state.daily?.ids || []) }; save();
  }
  return state.daily.ids.map(videoById).filter(Boolean);
}
function renderToday() {
  const picks = ensurePicks();
  const recent = recentOpenings(state.history, videos(), 4);
  const preview = filterVideos(videos(), state.meta, { sort: 'recent' }).slice(0, 4);
  page.innerHTML = `${heading('SALSA + BACHATA', 'Find your next dance.', 'Browse the collection, play videos and create Salsa, Bachata or combined mixes.', `<span class="date-chip">${icon('calendar')}${dateLabel()}</span>`)}
    <div class="stats-row"><span><strong>${videos().length}</strong> dance videos</span><span><strong>2</strong> collections</span></div>
    <div class="section-heading"><div><h2>Discover today</h2><span class="count-chip">2 PICKS</span></div><button class="text-button" data-action="refresh-picks">${icon('refresh')} New picks</button></div>
    <div class="picks-grid">${picks.map(pick).join('')}</div>
    <div class="today-banner"><div class="banner-symbol">${icon('play')}</div><div><h3>Make your own mix.</h3><p>Choose Salsa, Bachata or both, and watch videos one after another.</p></div><button class="button primary small" data-action="go-practice">Create a mix ${icon('arrow')}</button></div>
    ${recent.length ? `<div class="section-heading"><div><h2>Recently opened</h2></div><button type="button" class="text-button" data-action="clear-recent">Clear recent</button></div><p class="recent-helper">Your last opened videos, saved only in this browser.</p><div class="video-grid recent-grid">${recent.map(card).join('')}</div>` : ''}
    <div class="section-heading"><div><h2>Explore videos</h2></div><a class="text-button" href="#library">View the library ${icon('arrow')}</a></div>
    <div class="video-grid">${preview.map(card).join('')}</div>`;
}
function renderLibrary() {
  page.innerHTML = `${heading('EXPLORE DANCE', 'Your dance library.', 'Browse Salsa and Bachata, search by level, styles and moves, and make your own mix.')}<div class="library-toolbar"><div class="segmented" role="group" aria-label="Filter dance">${['All', 'Salsa', 'Bachata'].map(d => `<button data-action="filter-dance" data-dance="${d}" class="${filters.dance === d ? 'active' : ''}" aria-pressed="${filters.dance === d}">${d === 'All' ? 'All dances' : d}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="Search videos, moves or styles" aria-label="Search videos, moves or styles" value="${esc(filters.query)}"></label><label class="library-sort">Sort by <select id="sort-filter" aria-label="Sort videos"><option value="random">Random</option><option value="recent">Newest added</option><option value="oldest">Oldest added</option><option value="updated-new">Recently updated</option><option value="title">Title A–Z</option><option value="title-desc">Title Z–A</option><option value="dance-asc">Dance A–Z</option><option value="dance-desc">Dance Z–A</option><option value="level-asc">Level: basic first</option><option value="level-desc">Level: advanced first</option><option value="rating-high">Highest rated</option><option value="rating-low">Lowest rated</option><option value="duration-short">Shortest first</option><option value="duration-long">Longest first</option><option value="size-small">Smallest file</option><option value="size-large">Largest file</option><option value="moves-most">Most moves tagged</option></select></label><button type="button" class="button subtle small shuffle-videos" data-action="shuffle-videos" aria-label="Shuffle library videos">Shuffle</button></div><details id="more-filters" class="filter-panel"><summary class="filter-summary">More filters <span class="filter-summary-count" id="advanced-count" hidden></span></summary><div class="filter-panel-body"><div class="filters"><label>Source <select id="provider-filter"><option value="all">All sources</option><option value="drive">Google Drive</option><option value="youtube">YouTube</option></select></label><label>Level <select id="level-filter"><option value="">Any level</option><option>Basic</option><option>Intermediate</option><option>Advanced</option><option value="__unset__">Not set</option></select></label></div><div class="advanced-filters"><div id="filter-dance-styles"></div><div id="filter-moves"></div><div id="filter-positions"></div><div id="filter-techniques"></div><div id="filter-musicality"></div><div id="filter-artists"></div><button class="text-button" data-action="reset-filters">Clear filters</button></div></div></details><div class="library-feedback"><span class="result-count" id="result-count" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="button subtle small add-filtered-to-mix" id="add-all-filtered" data-action="queue-all-filtered" disabled aria-label="Add all matching videos to mix">${icon('plus')} Add all to mix <span id="add-all-count" class="mix-add-count" hidden></span></button><div id="active-filter-chips" class="active-filter-chips" aria-label="Active library filters"></div></div><div id="library-results"></div>`;
  $('#provider-filter').value = filters.provider; $('#level-filter').value = filters.level; $('#sort-filter').value = filters.sort;
  $('#more-filters').open = window.matchMedia('(min-width: 721px)').matches || Boolean(filters.provider !== 'all' || filters.level || filters.moves?.length || filters.danceStyles?.length || filters.artistIds?.length);
  $('#search').addEventListener('input', e => { filters.query = e.target.value; currentPage = 1; renderResults(); });
  for (const [id, key] of [['provider-filter', 'provider'], ['level-filter', 'level'], ['sort-filter', 'sort']]) $(`#${id}`).addEventListener('change', e => { filters[key] = e.target.value; currentPage = 1; renderResults(); });
  labelPicker($('#filter-moves'), { title: 'Filter Moves', labels: () => state.labels.filter(item => item.type === 'Moves'), selected: filters.moves || [], dance: filters.dance === 'All' ? 'Both' : filters.dance, onChange: ids => { filters.moves = ids; currentPage = 1; renderResults(); } });
  labelPicker($('#filter-dance-styles'), { title: 'Filter Styles', labels: () => state.labels.filter(item => ['Style & timing', 'Style'].includes(item.type)), selected: filters.danceStyles || [], dance: filters.dance === 'All' ? 'Both' : filters.dance, onChange: ids => { filters.danceStyles = ids; currentPage = 1; renderResults(); } });
  for (const [key, type] of [['positions','Position'],['techniques','Technique'],['musicality','Musicality']]) {
    labelPicker($('#filter-' + key), { title: 'Filter ' + (key === 'musicality' ? 'Musicality' : key[0].toUpperCase() + key.slice(1)), labels: () => state.labels.filter(item => item.type === type), selected: filters[key] || [], dance: filters.dance === 'All' ? 'Both' : filters.dance, onChange: ids => { filters[key] = ids; currentPage = 1; renderResults(); } });
  }
  labelPicker($('#filter-artists'), { title: 'Filter artists', labels: () => state.labels, selected: filters.artistIds || [], artists: true, onChange: ids => { filters.artistIds = ids; currentPage = 1; renderResults(); } });
  renderResults();
}
function renderFilterChips() {
  const chips = [];
  if (filters.dance !== 'All') chips.push({ key: 'dance', label: filters.dance });
  if (filters.query.trim()) chips.push({ key: 'query', label: 'Search: ' + filters.query.trim() });
  if (filters.provider !== 'all') chips.push({ key: 'provider', label: filters.provider === 'drive' ? 'Google Drive' : 'YouTube' });
  if (filters.level) chips.push({ key: 'level', label: filters.level === '__unset__' ? 'Level: Not set' : 'Level: ' + filters.level });
  if (filters.sort !== 'random') chips.push({ key: 'sort', label: 'Sort: ' + ($('#sort-filter option:checked')?.textContent || filters.sort) });
  for (const field of ['moves', 'positions', 'techniques', 'musicality', 'danceStyles', 'artistIds']) {
    const ids = filters[field] || [];
    if (!ids.length) continue;
    const title = field === 'moves' ? 'Moves/Technique' : field === 'danceStyles' ? 'Styles' : field === 'positions' ? 'Positions' : field === 'techniques' ? 'Techniques' : field === 'musicality' ? 'Musicality' : 'Artists';
    const names = ids.map(id => state.labels.find(item => item.id === id)?.name).filter(Boolean);
    const shown = names.slice(0, 2).join(', ');
    const more = ids.length > 2 ? ` +${ids.length - 2}` : '';
    chips.push({ key: field, label: names.length ? `${title}: ${shown}${more}` : `${title} (${ids.length})` });
  }
  const target = $('#active-filter-chips');
  target.replaceChildren();
  for (const { key, label } of chips) {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'active-filter-chip';
    chip.dataset.action = 'clear-filter'; chip.dataset.filter = key;
    chip.textContent = label + ' ×'; chip.title = 'Remove ' + label + ' filter';
    chip.setAttribute('aria-label', 'Remove filter: ' + label);
    target.append(chip);
  }
  if (chips.length > 1) {
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'clear-active-filters';
    clear.dataset.action = 'reset-filters'; clear.textContent = 'Clear all';
    target.append(clear);
  }
  const advanced = ['provider', 'level', 'sort', 'moves', 'positions', 'techniques', 'musicality', 'danceStyles', 'artistIds'].filter(key => {
    if (key === 'provider') return filters.provider !== 'all';
    if (key === 'level') return Boolean(filters.level);
    if (key === 'sort') return false;
    return Boolean(filters[key]?.length);
  }).length;
  $('#advanced-count').hidden = advanced === 0;
  $('#advanced-count').textContent = advanced ? advanced + ' applied' : '';
}
function renderResults() {
  const matches = filterVideos(videos(), state.meta, { ...filters, randomSeed }, state.labels);
  const displayedPageSize = window.matchMedia('(max-width: 480px)').matches ? 12 : pageSize;
  const totalPages = Math.max(1, Math.ceil(matches.length / displayedPageSize)); currentPage = Math.min(currentPage, totalPages);
  $('#result-count').textContent = matches.length ? `Showing ${(currentPage - 1) * displayedPageSize + 1}–${Math.min(currentPage * displayedPageSize, matches.length)} of ${matches.length} videos` : 'No matching videos';
  const pending = matches.filter(video => !state.queue.includes(video.id)).length;
  const addAllButton = $('#add-all-filtered');
  const addAllCount = $('#add-all-count');
  addAllButton.disabled = pending === 0;
  addAllButton.title = pending
    ? `Add ${pending} matching ${pending === 1 ? 'video' : 'videos'} not yet in your mix`
    : (matches.length ? 'All matching videos are already in your mix' : 'No matching videos to add');
  addAllButton.setAttribute('aria-label', addAllButton.title);
  addAllCount.hidden = pending === 0;
  addAllCount.textContent = pending ? `+${pending}` : '';
  $('#library-results').innerHTML = matches.length ? `<div class="video-grid">${matches.slice((currentPage - 1) * displayedPageSize, currentPage * displayedPageSize).map(card).join('')}</div>${totalPages > 1 ? `<div class="pagination"><button class="button subtle small" data-action="page-prev" ${currentPage === 1 ? 'disabled' : ''}>${icon('back')} Previous</button><span>Page ${currentPage} of ${totalPages}</span><button class="button subtle small" data-action="page-next" ${currentPage === totalPages ? 'disabled' : ''}>Next ${icon('arrow')}</button></div>` : ''}` : `<div class="empty-state">${icon('search')}<h3>No videos match your filters.</h3><p>Try a different dance, artist, label or search term.</p><button class="button primary" data-action="reset-filters">Clear filters</button></div>`;
  renderFilterChips();
  handleImages($('#library-results'));
}
function renderPractice() {
  const queue = state.queue.map(videoById).filter(Boolean);
  const available = videos().length;
  const requested = clampMixCount(state.mixSize, available);
  page.innerHTML = `${heading('CREATE YOUR MIX', 'Pick a dance. Press play.', 'Choose Salsa, Bachata or both, and decide how many videos to include.')}<div class="practice-layout"><section class="practice-start" aria-labelledby="mix-heading"><span class="eyebrow">CREATE YOUR VIDEO MIX</span><h2 id="mix-heading">What are we dancing today?</h2><p>Select the number of videos, then choose a mix. Videos play in the order shown below.</p><div class="mix-count-setting"><label for="mix-count">Number of videos</label><div class="mix-count-field"><input id="mix-count" type="number" min="1" max="${available}" step="1" inputmode="numeric" value="${requested}" aria-describedby="mix-count-help"><span>videos</span></div><p id="mix-count-help">Choose 1–${available}. A dance-only mix uses as many videos as are available for that dance, up to this number.</p></div><div class="mix-options" role="group" aria-label="Create a video mix"><button type="button" class="button primary" data-action="mix" data-dance="Salsa">Salsa mix</button><button type="button" class="button primary" data-action="mix" data-dance="Bachata">Bachata mix</button><button type="button" class="button primary" data-action="mix" data-dance="Both">Salsa + Bachata mix</button></div>${queue.length ? `<button type="button" class="button subtle mix-play-button" data-action="start-queue">${icon('play')} Play this mix</button>` : ''}</section></div><div class="section-heading"><div><h2>Your current mix</h2><span class="count-chip">${queue.length} VIDEOS</span></div>${queue.length ? '<button class="text-button" data-action="clear-queue">Clear mix</button>' : recentlyClearedQueue.length ? '<button class="text-button" data-action="undo-clear">Undo clear</button>' : ''}</div>${queue.length ? `<div class="queue-list">${queue.map((v, i) => `<article class="queue-item"><span class="index">${String(i + 1).padStart(2, '0')}</span><div class="queue-info"><h4>${esc(displayTitle(v, state.meta, state.labels))}</h4><div class="muted">${esc(v.dance)} · ${v.provider === 'drive' ? 'Google Drive' : 'YouTube'}</div></div><div class="queue-actions"><button type="button" class="icon-button mix-move" data-action="mix-move-up" data-id="${esc(v.id)}" aria-label="Move ${esc(displayTitle(v, state.meta, state.labels))} earlier" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" class="icon-button mix-move" data-action="mix-move-down" data-id="${esc(v.id)}" aria-label="Move ${esc(displayTitle(v, state.meta, state.labels))} later" title="Move down" ${i === queue.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button class="icon-button" data-action="open-queue" data-id="${esc(v.id)}" aria-label="Play ${esc(displayTitle(v, state.meta, state.labels))}">${icon('play')}</button><button class="icon-button" data-action="queue" data-id="${esc(v.id)}" aria-label="Remove ${esc(displayTitle(v, state.meta, state.labels))} from mix">${icon('close')}</button></div></article>`).join('')}</div>` : `<div class="empty-state">${icon('queue')}<h3>Your mix starts here.</h3><p>Choose Salsa, Bachata or both above, or add individual videos from the library.</p><a href="#library" class="button subtle">Explore the library ${icon('arrow')}</a></div>`}`;
  $('#mix-count')?.addEventListener('change', event => {
    const count = clampMixCount(event.target.value, videos().length);
    state.mixSize = count;
    event.target.value = String(count);
    save();
  });
}
function renderSettings() {
  page.innerHTML = `${heading('BAILACUE', 'Open to everyone.', 'Watch Salsa and Bachata from the shared collection. Anyone can edit video details. The administrator manages video sources.')}<div class="settings-grid"><section class="settings-card"><h3>Watch and create mixes.</h3><p>Browse the library without an account. Create Salsa-only, Bachata-only or combined video mixes. Shared Drive originals use BailaCue’s player where available, with a Drive preview fallback.</p><a href="#practice" class="button primary small">Create a mix</a></section><section class="settings-card"><h3>Two fixed dance collections.</h3>${SOURCES.map(source => `<div class="source-row"><i class="dance-dot ${source.id}"></i><span>${source.dance}<small>${driveVideos().filter(v => v.dance === source.dance).length} in library</small></span><a class="icon-button" href="https://drive.google.com/drive/folders/${source.folderId}" target="_blank" rel="noopener noreferrer" aria-label="View ${source.dance} videos">${icon('external')}</a></div>`).join('')}<p class="helper-text">Counts show videos currently loaded in the BailaCue library. Reloading updates the deployed catalogue snapshot; it does not scan Google Drive.</p><button class="text-button" data-action="reload-catalogue">${icon('refresh')} Reload library catalogue</button></section><section class="settings-card"><h3>YouTube videos</h3><p>The administrator can publish YouTube videos to the shared library.</p><div class="source-row"><span>${icon('youtube')}</span><span>YouTube<small>${state.youtube.length} public sources</small></span></div>${admin.isAdmin ? `<button class="button primary small" data-action="add-youtube">${icon('plus')} Add YouTube</button>` : ''}<button class="button subtle small" data-action="show-youtube">View sources</button></section>${admin.isAdmin ? `<section class="settings-card"><h3>Administrator tools</h3><p>You can add Google Drive videos, publish YouTube links and manage shared labels. Everyone can edit video metadata. Your sign-in is preserved until you sign out.</p><a href="#upload" class="button primary small">Manage uploads</a><a href="#labels" class="button subtle small">Manage labels</a><button class="button subtle small" data-action="export">Export backup</button>${localStorage.getItem(LEGACY_BACKUP_KEY) ? '<button class="button subtle small" data-action="export-legacy">Export previous browser collection</button>' : ''}<button class="button subtle small" data-action="import">Import backup</button><input class="local-backup" id="backup-file" type="file" accept="application/json,.json"></section>` : ''}</div>`;
  $('#backup-file')?.addEventListener('change', importBackup);
}
function updateMixCounter() {
  const mixCounter = $('#nav-mix-count');
  if (mixCounter) {
    const mixSize = state.queue.filter(id => !!videoById(id)).length;
    mixCounter.hidden = mixSize === 0;
    mixCounter.textContent = String(mixSize);
    mixCounter.setAttribute('aria-label', `${mixSize} ${mixSize === 1 ? 'video' : 'videos'} in mix`);
  }
}
function render() {
  if (uploadRunning() && activeView === 'upload') return;
  const titles = { library: 'Library', practice: 'Mixes', settings: 'Settings', labels: 'Labels', upload: 'Add videos' };
  updateMixCounter();
  $('#breadcrumb').textContent = titles[activeView];
  $('#mobile-settings').setAttribute('aria-current', activeView === 'settings' ? 'page' : 'false');
  document.title = `${titles[activeView]} · BailaCue`;

  document.querySelectorAll('#nav a').forEach(a => { if (!(a instanceof HTMLElement)) return; const active = a.dataset.view === activeView; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (activeView === 'library') renderLibrary();
  if (activeView === 'practice') renderPractice();
  if (activeView === 'settings') renderSettings();
  if (activeView === 'labels') renderLabelManager(page, studioContext());
  if (activeView === 'upload') renderUpload(page, studioContext());
  if (storageCorrupt && activeView !== 'settings') page.insertAdjacentHTML('afterbegin', '<div class="status-banner">Your previous saved data needs recovery. Open Settings to download it. Current changes are temporary.</div>');
  handleImages();
}
function navigate(view) { if (uploadRunning()) { if (view !== 'upload') toast('Pause the upload before leaving this page.'); return; } if (location.hash === `#${view}`) { activeView = view; render(); } else location.hash = view; }
function route() { const next = location.hash.slice(1); if (uploadRunning() && next !== 'upload') { toast('Pause the upload before leaving this page.'); location.hash = 'upload'; return; } activeView = ['library', 'practice', 'settings', 'labels', 'upload'].includes(next) ? next : 'library'; if (next !== activeView) history.replaceState(null, '', '#library'); if (!admin.isAdmin && ['labels','upload'].includes(activeView)) { activeView = 'library'; history.replaceState(null, '', '#library'); toast('Sign in to edit the collection.'); } render(); window.scrollTo({ top: 0 }); }
function openYoutube() { if (!requireAdmin()) return; $('#youtube-error').textContent = ''; $('#youtube-dialog').showModal(); }
function updatePlayer() {
  if (!selected) return;
  const m = meta(selected.id);
  $('#player-title').textContent = displayTitle(selected, state.meta, state.labels);
  $('#player-source').textContent = `${selected.dance} / ${selected.provider === 'drive' ? 'GOOGLE DRIVE' : selected.provider === 'local' ? 'ON THIS DEVICE' : 'YOUTUBE'}`;
  $('#player-queue').innerHTML = `${icon(state.queue.includes(selected.id) ? 'check' : 'plus')} ${state.queue.includes(selected.id) ? 'In mix' : 'Add to mix'}`;
  $('#queue-nav').innerHTML = playbackIndex >= 0 ? `<button class="button subtle small" data-action="previous" ${playbackIndex === 0 ? 'disabled' : ''}>${icon('back')} Previous</button><span>${playbackIndex + 1} / ${playbackQueue.length}</span><button class="button primary small" data-action="next" ${playbackIndex >= playbackQueue.length - 1 ? 'disabled' : ''}>Next cue ${icon('arrow')}</button>` : '';
  $('#remove-row').innerHTML = admin.isAdmin && selected.provider === 'youtube' ? '<button class="text-button" data-action="remove-youtube">Remove this YouTube source</button>' : '';
}
function hideMetadataIsland(immediate = false) {
  clearTimeout(metadataIslandTimeout);
  clearTimeout(metadataIslandHideTimeout);
  const island = $('#metadata-island');
  if (!island) return;
  island.classList.remove('island-visible');
  if (immediate) island.hidden = true;
  else metadataIslandHideTimeout = setTimeout(() => { island.hidden = true; }, 220);
}
function showMetadataIsland(video) {
  clearTimeout(metadataIslandTimeout);
  clearTimeout(metadataIslandHideTimeout);
  const island = $('#metadata-island');
  if (!island) return;
  island.classList.remove('island-visible');
  const m = meta(video.id);
  const labels = (Array.isArray(m.labelIds) ? m.labelIds : [])
    .map(id => state.labels.find(label => label.id === id))
    .filter(Boolean);
  const hasStyle = (Array.isArray(m.styleTimingIds) && m.styleTimingIds.length > 0)
    || (Array.isArray(m.danceStyles) && m.danceStyles.length > 0)
    || labels.some(label => ['Style', 'Style & timing'].includes(label.type));
  const hasMove = (Array.isArray(m.moveIds) && m.moveIds.length > 0)
    || (Array.isArray(m.moves) && m.moves.length > 0)
    || labels.some(label => ['Moves', 'Position', 'Technique', 'Musicality'].includes(label.type));
  if (video.provider === 'local' || (m.level && hasStyle && hasMove)) {
    island.hidden = true;
    return;
  }
  island.hidden = false;
  requestAnimationFrame(() => {
    if (selected?.id === video.id && $('#player').open) island.classList.add('island-visible');
  });
  metadataIslandTimeout = setTimeout(() => hideMetadataIsland(), 6500);
}
function openPlayer(id, queue = null, override = null, localUrl = '', autoPlay = false) {
  const v = override || videoById(id); if (!v) return;
  selected = v;
  if (v.provider !== 'local') { state.history = recordRecent(state.history, v.id); save(); }
  if (queue) { playbackQueue = queue.filter(x => videoById(x)); playbackIndex = playbackQueue.indexOf(id); } else { playbackQueue = []; playbackIndex = -1; }
  studioPlayer.open({ ...v, title: displayTitle(v, state.meta, state.labels) }, localUrl, autoPlay);
  setPlayerViewport(true);
  studioPlayer.updateFullscreen();
  $('#player').scrollTop = 0;
  $('#player').classList.toggle('local-preview', v.provider === 'local');
  $('#player').style.width = `${state.playerSize}px`;
  $('#personal-title').value = meta(id).title || ''; $('#notes').value = meta(id).notes || ''; setMetadataStatus(id);

  updatePlayer(); mountVideoDetails(); if (!$('#player').open) $('#player').showModal();
  hideMetadataIsland(true);
  requestAnimationFrame(() => { if ($('#player').open) applyVideoHeight(state.playerHeight); });
}

function toggleQueue(id) { const queued = state.queue.includes(id); state.queue = queued ? state.queue.filter(x => x !== id) : [...state.queue, id]; save(); toast(queued ? 'Removed from mix' : 'Added to mix'); if (selected?.id === id) updatePlayer(); refreshView(); }
function refreshView() { const position = window.scrollY; render(); window.scrollTo({ top: position }); }

function downloadJson(value, name) { const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function importBackup(event) {
  const file = event.target.files?.[0]; if (!file || !requireAdmin()) return;
  try {
    if (storageCorrupt) throw new Error('Download the unreadable original first, then replace it with this session before importing.');
    if (file.size > 10_000_000) throw new Error('Choose a backup smaller than 10 MB.');
    const imported = cleanState(JSON.parse(await file.text()));
    const labelRemap = new Map();
    for (const label of imported.labels) { const existing = state.labels.find(l => l.type === label.type && normalizeName(l.name) === normalizeName(label.name)); if (existing) labelRemap.set(label.id, existing.id); else { state.labels.push(label); labelRemap.set(label.id, label.id); } }
    for (const m of Object.values(imported.meta)) { m.labelIds = (m.labelIds || []).map(id => labelRemap.get(id) || id); m.artistIds = (m.artistIds || []).map(id => labelRemap.get(id) || id); }
    const driveAdditions = new Map(state.drive.map(v => [v.id, v])); imported.drive.forEach(v => driveAdditions.set(v.id, v));
    const additions = new Map(state.youtube.map(v => [v.id, v])); imported.youtube.forEach(v => additions.set(v.id, v));
    state = cleanState({ ...state, meta: { ...state.meta, ...imported.meta }, drive: [...driveAdditions.values()], youtube: [...additions.values()], queue: [...new Set([...state.queue, ...imported.queue])], history: [...new Map([...state.history, ...imported.history].map(h => [`${h.id}:${h.at}`, h])).values()] });
    save(); await publishLabels(); for (const [id, value] of Object.entries(imported.meta)) await admin.put('meta:' + id, publicMetadata(value)); for (const video of imported.youtube) await admin.put('youtube:' + video.id, video); for (const video of imported.drive) await admin.put('drive:' + video.id, video); render(); toast('Backup published to BailaCue.');
  } catch (error) { toast(error.message || 'Could not import this backup.'); }
  event.target.value = '';
}
async function loadCatalogue() {
  const response = await fetch('/catalogue.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('The library catalogue could not be loaded.');
  const data = await response.json();
  if (data.version !== 1 || data.rootFolderId !== '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P' || !Array.isArray(data.videos) || !data.videos.length) throw new Error('The library catalogue is invalid.');
  const ids = new Set();
  catalogue = data.videos.filter(v => v.provider === 'drive' && SOURCES.some(s => s.dance === v.dance) && typeof v.title === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(v.providerId) && v.id === `drive:${v.providerId}` && !ids.has(v.id) && ids.add(v.id));
  if (!catalogue.length) throw new Error('The fixed collections are empty.');
  $('#nav-count').textContent = String(videos().length);
}
function protectLegacyBrowserData() {
  try {
    if (localStorage.getItem(LEGACY_BACKUP_KEY)) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const old = cleanState(JSON.parse(raw));
    if (Object.keys(old.meta).length || old.drive.length || old.youtube.length || old.labels.some(x => x.id.startsWith('custom-'))) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
  } catch { /* Existing storage remains untouched when unreadable. */ }
}
function resetPublicContent() { state.meta = {}; state.youtube = []; state.drive = []; state.labels = emptyState().labels; streamMap.clear(); optimizedMap.clear(); }
async function loadSharedContent() {
  if (!admin.ready) return;
  const rows = await admin.readContent();
  // Shared content is authoritative. Legacy browser-only edits never leak to public visitors.
  resetPublicContent();
  for (const item of rows) {
    const key = item.key, v = item.payload;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (key === 'config:google-drive' && typeof v.clientId === 'string' &&
        /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(v.clientId)) {
      if (connection.clientId !== v.clientId) connection.disconnect();
      connection.clientId = v.clientId;
    }
    if (key === 'labels' && Array.isArray(v.items)) state.labels = cleanLabels(v.items);
    if (key === 'optimized:manifest') { const manifest = parseOptimizedManifest(v); if (manifest) for (const entry of manifest.entries) optimizedMap.set(entry.sourceId, entry); }
    if (key?.startsWith('stream:') && /^drive:[A-Za-z0-9_-]{10,100}$/.test(key.slice(7))) { const converted = parseStreamDelivery(v); if (converted) streamMap.set(key.slice(7), converted); }
    if (key?.startsWith('meta:') && /^(drive:|youtube:)/.test(key.slice(5))) state.meta[key.slice(5)] = publicMetadata(v);
    if (key?.startsWith('youtube:') && v.provider === 'youtube' && ['Salsa','Bachata'].includes(v.dance) && v.id === key.slice(8)) {
      try { if (parseYoutube(v.url).id === v.id) state.youtube.push(v); } catch { /* Ignore invalid shared URLs. */ }
    }
    if (key?.startsWith('drive:') && v.provider === 'drive' && v.id === key.slice(6) && v.id === `drive:${v.providerId}` && SOURCES.some(x => x.dance === v.dance && x.folderId === v.folderId) && /^[A-Za-z0-9_-]{10,100}$/.test(v.providerId)) state.drive.push(v);
  }
  $('#nav-count').textContent = String(videos().length);
}
function openAdminSignIn() {
  $('#admin-error').textContent = '';
  $('#admin-dialog').showModal();
  $('#admin-email').focus();
}
$('#admin-login').addEventListener('click', openAdminSignIn);
$('#admin-dialog').addEventListener('close', () => {
  $('#admin-password').value = '';
  $('#admin-password').type = 'password';
  $('#toggle-password').textContent = 'Show password';
  $('#toggle-password').setAttribute('aria-pressed', 'false');
});
$('#toggle-password').addEventListener('click', () => {
  const password = $('#admin-password'), toggle = $('#toggle-password');
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Hide password' : 'Show password';
  toggle.setAttribute('aria-pressed', String(show));
  password.focus({ preventScroll: true });
});
$('#admin-logout').addEventListener('click', async () => { await admin.signOut(); applyAccess(); if (selected) $('#player').close(); route(); toast('Signed out. Public viewing remains available.'); });
$('#admin-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#admin-form button[type="submit"]'); button.disabled = true;
  $('#admin-error').textContent = '';
  try {
    await admin.signIn($('#admin-email').value.trim(), $('#admin-password').value);
    $('#admin-password').value = '';
    $('#admin-dialog').close(); applyAccess(); route();
    if (selected && $('#player').open) {
      updatePlayer(); mountVideoDetails();
      $('#personal-title').focus();
    }
    toast('Signed in. You can now edit video metadata.');
  } catch (error) { $('#admin-error').textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (activeView !== 'library') { navigate('library'); requestAnimationFrame(() => $('#search')?.focus({ preventScroll: true })); }
  else $('#search')?.focus({ preventScroll: true });
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
document.addEventListener('click', async event => {
  if (!(event.target instanceof Element)) return;
  const close = event.target.closest('[data-close]'); if (close instanceof HTMLElement) { const dialog = document.getElementById(close.dataset.close); if (dialog instanceof HTMLDialogElement) dialog.close(); return; }
  const button = event.target.closest('[data-action]'); if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'open') openPlayer(id, null, null, '', button.dataset.autoplay === 'true');
  if (action === 'queue') toggleQueue(id);
  if (action === 'queue-all-filtered' && activeView === 'library') {
    const matches = filterVideos(videos(), state.meta, { ...filters, randomSeed }, state.labels);
    const result = appendFilteredToMix(state.queue, matches);
    if (!result.added) {
      toast(matches.length ? 'All matching videos are already in your mix.' : 'No matching videos to add.');
    } else {
      state.queue = result.queue;
      save();
      updateMixCounter();
      renderResults();
      toast(`Added ${result.added} filtered ${result.added === 1 ? 'video' : 'videos'} to your mix.`);
    }
  }
  if (action === 'shuffle-videos') { filters.sort = 'random'; randomSeed = Math.floor(Math.random() * 0x100000000); currentPage = 1; $('#sort-filter').value = 'random'; renderResults(); }
  if (action === 'filter-dance') { filters.dance = button.dataset.dance; currentPage = 1; render(); page.querySelector('.segmented [data-dance="' + filters.dance + '"]')?.focus({ preventScroll: true }); }
  if (action === 'refresh-picks') { ensurePicks(true); render(); toast('Two fresh cues. Let’s dance.'); }
  if (action === 'go-practice') navigate('practice');
  if (action === 'page-prev' || action === 'page-next') { currentPage += action === 'page-next' ? 1 : -1; renderResults(); $('.library-toolbar').scrollIntoView({ block: 'start' }); }
  if (action === 'reset-filters') { filters = { dance: 'All', provider: 'all', level: '', moves: [], positions: [], techniques: [], musicality: [], danceStyles: [], sort: 'random', query: '' }; currentPage = 1; renderLibrary(); $('#search')?.focus({ preventScroll: true }); }
   if (action === 'clear-filter') { const field = button.dataset.filter; if (!['dance', 'query', 'provider', 'level', 'sort', 'moves', 'positions', 'techniques', 'musicality', 'danceStyles', 'artistIds'].includes(field)) return; filters[field] = { dance: 'All', query: '', provider: 'all', level: '', sort: 'random', moves: [], positions: [], techniques: [], musicality: [], danceStyles: [], artistIds: [] }[field]; currentPage = 1; renderLibrary(); if (field === 'query') $('#search')?.focus({ preventScroll: true }); }
  if (action === 'mix') {
    const dance = button.dataset.dance || 'Both';
    const requested = clampMixCount($('#mix-count')?.value ?? state.mixSize, videos().length);
    const createMix = () => {
      const pool = videos().filter(v => dance === 'Both' || v.dance === dance);
      state.mixSize = requested;
      const count = clampMixCount(requested, pool.length);
      state.queue = practiceQueue(pool, state.meta).slice(0, count);
      save(); render();
      toast(`${dance === 'Both' ? 'Salsa & Bachata' : dance} mix ready — ${state.queue.length} videos.${count < requested ? ' That is every available video for this dance.' : ''}`);
    };
    if (state.queue.length) {
      const dialog = document.createElement('dialog');
      dialog.innerHTML = `<h2>Replace your current mix?</h2><p class="muted">Your current mix has ${state.queue.length} videos. Creating a new ${esc(dance === 'Both' ? 'Salsa and Bachata' : dance)} mix will replace it.</p><div class="dialog-footer"><button type="button" class="button subtle" data-cancel>Keep current mix</button><button type="button" class="button primary" data-replace>Replace mix</button></div>`;
      document.body.append(dialog);
      dialog.addEventListener('close', () => dialog.remove());
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-replace]').addEventListener('click', () => { dialog.close(); createMix(); });
      dialog.showModal();
    } else createMix();
  }
  if (action === 'start-queue') { const ids = state.queue.filter(x => videoById(x)); if (ids.length) openPlayer(ids[0], ids, null, '', true); }
  if (action === 'open-queue') openPlayer(id, state.queue, null, '', true);
  if (action === 'clear-queue') {
    recentlyClearedQueue = [...state.queue];
    clearTimeout(queueUndoTimeout);
    state.queue = []; save(); render(); toast('Mix cleared. You can undo this for 15 seconds.');
    queueUndoTimeout = setTimeout(() => { recentlyClearedQueue = []; if (activeView === 'practice') renderPractice(); }, 15000);
    page.querySelector('[data-action="undo-clear"]')?.focus({ preventScroll: true });
  }
  if (action === 'undo-clear') {
    if (!state.queue.length && recentlyClearedQueue.length) {
      state.queue = recentlyClearedQueue; recentlyClearedQueue = []; clearTimeout(queueUndoTimeout);
      save(); render(); toast('Previous mix restored.');
    }
  }
  if (action === 'clear-recent') { state.history = []; save(); renderToday(); toast('Recent videos cleared from this browser.'); }
  if (action === 'mix-move-up' || action === 'mix-move-down') {
    const previousIndex = state.queue.indexOf(id);
    if (previousIndex >= 0) {
      const updated = moveQueueItem(state.queue, id, action === 'mix-move-up' ? -1 : 1);
      const newIndex = updated.indexOf(id);
      if (newIndex !== previousIndex) {
        state.queue = updated; save(); render();
        const nextAction = newIndex === 0 ? 'mix-move-down' : newIndex === updated.length - 1 ? 'mix-move-up' : action;
        [...page.querySelectorAll('button[data-action]')].find(el => el.dataset.action === nextAction && el.dataset.id === id)?.focus({ preventScroll: true });
        toast(`Moved video to position ${newIndex + 1} of ${updated.length}.`);
      }
    }
  }
  if (action === 'retry-video-save' && selected) queueMetaPublish(selected.id);
  if (action === 'next' || action === 'previous') { const next = playbackIndex + (action === 'next' ? 1 : -1); if (next >= 0 && next < playbackQueue.length) openPlayer(playbackQueue[next], playbackQueue, null, '', true); }
  if (action === 'add-youtube') openYoutube();
  if (action === 'show-youtube') { filters = { dance: 'All', provider: 'youtube', level: '', moves: [], positions: [], techniques: [], musicality: [], danceStyles: [], sort: 'title', query: '' }; currentPage = 1; navigate('library'); }
  if (action === 'export' && admin.isAdmin) downloadJson(state, `BailaCue-backup-${localDay()}.json`);
  if (action === 'export-legacy' && admin.isAdmin) downloadJson(localStorage.getItem(LEGACY_BACKUP_KEY) || '{}', `BailaCue-before-public-${localDay()}.json`);
  if (action === 'import') $('#backup-file').click();
  if (action === 'export-original') downloadJson(localStorage.getItem(STORAGE_KEY) || '{}', `BailaCue-original-${localDay()}.json`);
  if (action === 'replace-original') { storageCorrupt = false; if (save()) { render(); toast('Current session saved. Your downloaded original can be recovered separately.'); } }
  if (action === 'reload-catalogue') { button.disabled = true; try { await loadCatalogue(); render(); toast('Latest deployed catalogue loaded'); } catch (error) { toast(error.message); button.disabled = false; } }
  if (action === 'remove-youtube' && admin.isAdmin && selected?.provider === 'youtube') { removing = selected.id; $('#confirm-dialog').showModal(); }
  if (action === 'retry-load') start();
});
$('#confirm-remove').addEventListener('click', async () => { if (!removing || !requireAdmin()) return; try { await admin.remove('youtube:' + removing); } catch (error) { toast('Removal failed: ' + error.message); return; } state.youtube = state.youtube.filter(v => v.id !== removing); state.queue = state.queue.filter(id => id !== removing); state.history = state.history.filter(h => h.id !== removing); delete state.meta[removing]; save(); removing = null; $('#confirm-dialog').close(); $('#player').close(); render(); $('#nav-count').textContent = String(videos().length); toast('YouTube source removed'); });
$('#player').addEventListener('close', () => { hideMetadataIsland(true); cancelStreamUpload(); studioPlayer.stop(); $('#player').classList.remove('browser-wide'); selected = null; if (localPreviewUrl) { URL.revokeObjectURL(localPreviewUrl); localPreviewUrl = ''; } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); refreshView(); });
$('#metadata-island-dismiss').addEventListener('click', () => hideMetadataIsland());
$('#metadata-island-add').addEventListener('click', () => {
  hideMetadataIsland();
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  $('#public-video-details').scrollIntoView({ behavior, block: 'start' });
});
$('#player-queue').addEventListener('click', () => selected && toggleQueue(selected.id));
for (const [selector, key] of [['#notes', 'notes'], ['#personal-title', 'title']]) $(selector).addEventListener('input', event => { if (!selected) return; patchMeta(selected.id, { [key]: event.target.value }); if (key === 'title') $('#player-title').textContent = displayTitle(selected, state.meta, state.labels); });
$('#personal-title').addEventListener('change', refreshView);
$('#youtube-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!requireAdmin()) return;
  try {
    const parsed = parseYoutube($('#youtube-url').value);
    if (state.youtube.some(v => v.id === parsed.id)) throw new Error('This source is already in your library.');
    const title = $('#youtube-name').value.trim(); if (!title) throw new Error('Give this source a title.');
    const video = { ...parsed, provider: 'youtube', dance: $('#youtube-dance').value, title, addedAt: new Date().toISOString() };
    await admin.put('youtube:' + video.id, video);
    state.youtube.push(video); save();
    $('#youtube-dialog').close(); $('#youtube-form').reset(); $('#nav-count').textContent = String(videos().length);
    filters = { dance: 'All', provider: 'youtube', level: '', moves: [], positions: [], techniques: [], musicality: [], danceStyles: [], sort: 'recent', query: '' }; currentPage = 1; navigate('library'); toast('New inspiration added to your library.');
  } catch (error) { $('#youtube-error').textContent = error.message; }
});
$('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); });
for (const id of ['add-youtube', 'youtube-nav']) $(`#${id}`).addEventListener('click', openYoutube);
for (const id of ['settings-nav', 'mobile-settings']) $(`#${id}`).addEventListener('click', () => navigate('settings'));
document.querySelectorAll('.source-nav [data-dance]').forEach(button => button.addEventListener('click', () => { if (!(button instanceof HTMLElement)) return; filters.dance = button.dataset.dance; currentPage = 1; navigate('library'); }));
window.addEventListener('hashchange', () => { if (catalogue.length) route(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { state = cleanState(JSON.parse(event.newValue)); applyTheme(); render(); if (selected) { updatePlayer(); $('#notes').value = meta(selected.id).notes || ''; $('#personal-title').value = meta(selected.id).title || ''; } } catch { toast('Another tab saved unreadable data. Export your current progress.'); } } });
async function start() { try { await loadCatalogue(); protectLegacyBrowserData(); resetPublicContent(); try { await loadSharedContent(); } catch (error) { toast('Shared labels are temporarily unavailable: ' + error.message); } await admin.restore(); applyAccess(); route(); } catch { page.innerHTML = '<div class="error-message"><h2>Your library needs a moment.</h2><p>The catalogue could not be loaded. Check your connection and try again. Your saved progress stays in this browser.</p><button class="button primary" data-action="retry-load">Try again</button></div>'; } }
/* Video opens browser-wide, with the native media control to toggle compact view. */
const playerDialog = $('#player');
function setPlayerViewport(fill) {
  playerDialog.classList.toggle('browser-wide', fill);
  playerDialog.classList.remove('theater');
  studioPlayer.updateFullscreen();
  if (playerDialog.open) requestAnimationFrame(() => applyVideoHeight(state.playerHeight));
}
/* Resize the video without restarting playback. Pointer drag and keyboard sliders
   write the same browser-local preference; neither touches video metadata. */
const videoFrame = $('#video-frame');
const videoResize = $('#video-resize');
videoFrame.addEventListener('videoaspectchange', () => { if (playerDialog.open) applyVideoHeight(state.playerHeight); });
const playerHeightMaximum = () => Math.max(220, Math.min(840, Math.floor(window.innerHeight * 0.82)));
function applyVideoHeight(value, persist = false) {
  const max = playerHeightMaximum();
  const height = clampPlayerHeight(value, max);
  if (height) videoFrame.style.setProperty('--video-height', `${height}px`);
  else videoFrame.style.removeProperty('--video-height');
  const displayed = height || Math.round(videoFrame.getBoundingClientRect().height) || Math.min(max, 540);
  videoResize.setAttribute('aria-valuemax', String(max));
  videoResize.setAttribute('aria-valuenow', String(Math.round(displayed)));
  videoResize.setAttribute('aria-valuetext', `${Math.round(displayed)} pixels high`);
  if (persist) { state.playerHeight = height; save(); }
  return height;
}
let activeVideoResize = null;
videoResize.addEventListener('pointerdown', event => {
  if (!$('#player').open || $('#player').classList.contains('fullscreen-mode') || event.button !== 0) return;
  event.preventDefault();
  videoResize.focus({ preventScroll: true });
  activeVideoResize = { id: event.pointerId, startY: event.clientY, startHeight: videoFrame.getBoundingClientRect().height, height: 0 };
  activeVideoResize.height = activeVideoResize.startHeight;
  videoResize.setPointerCapture(event.pointerId);
  videoResize.classList.add('dragging');
});
videoResize.addEventListener('pointermove', event => {
  if (!activeVideoResize || activeVideoResize.id !== event.pointerId) return;
  activeVideoResize.height = applyVideoHeight(activeVideoResize.startHeight + event.clientY - activeVideoResize.startY);
});
function endVideoResize(event) {
  if (!activeVideoResize || activeVideoResize.id !== event.pointerId) return;
  const height = activeVideoResize.height;
  const initialHeight = activeVideoResize.startHeight;
  activeVideoResize = null;
  videoResize.classList.remove('dragging');
  if (videoResize.hasPointerCapture(event.pointerId)) videoResize.releasePointerCapture(event.pointerId);
  applyVideoHeight(event.type === 'pointercancel' ? initialHeight : height, true);
}
videoResize.addEventListener('pointerup', endVideoResize);
videoResize.addEventListener('pointercancel', endVideoResize);
videoResize.addEventListener('keydown', event => {
  const current = videoFrame.getBoundingClientRect().height;
  const keyValues = { ArrowUp: current + 24, ArrowRight: current + 24, ArrowDown: current - 24, ArrowLeft: current - 24, Home: 220, End: playerHeightMaximum() };
  if (!Object.hasOwn(keyValues, event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  applyVideoHeight(keyValues[event.key], true);
});
/* Keep drag sizing responsive; double-click/tap the grip to return to automatic height. */
videoResize.addEventListener('dblclick', () => applyVideoHeight(0, true));
window.addEventListener('resize', () => {
  if (playerDialog.open) applyVideoHeight(state.playerHeight);
});
for (const [selector, key] of [['#detail-recorded','recordedAt'],['#detail-event','event'],['#detail-location','location']]) $(selector).addEventListener('change', event => { if (selected) patchMeta(selected.id, { [key]: event.target.value }); });
async function loadConfiguration() { try { const config = await (await fetch('/public-config.json', { cache: 'no-store' })).json(); admin.configure(config); if (!connection.clientId && /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId || '')) connection.clientId = config.googleClientId; } catch { /* The public catalogue is still accessible without admin configuration. */ } }
$('.develop-badge').hidden = !location.hostname.startsWith('develop--') && location.hostname !== 'localhost';
hydrateIcons(); applyTheme(); loadConfiguration().finally(start);
