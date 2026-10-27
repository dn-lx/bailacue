import { STORAGE_KEY, SOURCES, emptyState, cleanState, parseYoutube, displayTitle, localDay, dailyPicks, practiceQueue, filterVideos, embedUrl } from './core.mjs';
import { createLabel, formatTime, normalizeName, newId } from './studio-model.mjs';
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
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.play}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { if (el instanceof HTMLElement) el.innerHTML = icon(el.dataset.icon); }); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
let state = emptyState();
let storageAvailable = true;
let storageCorrupt = false;
try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) state = cleanState(JSON.parse(raw)); } catch { storageCorrupt = true; }
/** @type {import('./types.js').Video[]} */
let catalogue = [];
let activeView = 'today';
/** @type {import('./types.js').Filters} */
let filters = { dance: 'All', provider: 'all', rating: '', sort: 'title', query: '' };
let currentPage = 1;
const pageSize = 20;
/** @type {import('./types.js').Video | null} */
let selected = null;
let playbackQueue = [];
let playbackIndex = -1;
let toastTimeout;
let sessionSeconds = 0;
let sessionStarted = null;
let removing = null;
let localPreviewUrl = '';
const connection = new DriveConnection(state.googleClientId);
const studioPlayer = new StudioPlayer({ token: () => connection.token(), allowedFile: id => videos().some(v => v.provider === 'drive' && v.providerId === id), toast,
  saveLoop: loop => { if (!selected || selected.provider === 'local') { toast('Upload this video before saving its practice loops.'); return; } const loops = [...(meta(selected.id).loops || [])]; loops.push({ ...loop, id: newId(), name: $('#loop-name').value.trim() || `Loop ${loops.length + 1}` }); patchMeta(selected.id, { loops: loops.slice(-30) }); renderLoops(); toast('Practice loop saved'); }
});
function studioContext() { return { state: () => state, save, patchMeta, toast, videos, connection, preview: file => {
  if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); localPreviewUrl = URL.createObjectURL(file);
  openPlayer('local:preview', null, { id: 'local:preview', provider: 'local', providerId: '', dance: 'Local preview', title: file.name, filename: file.name, size: file.size }, localPreviewUrl);
} }; }
function addLabel(name, type, dance) { try { const label = createLabel(state.labels, name, type, dance); save(); return label; } catch (error) { toast(error.message); } }
function readableDate(value) { if (!value || Number.isNaN(Date.parse(value))) return 'Unknown'; return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function cardDetails(v) { const m = meta(v.id); const labels = state.labels.filter(l => m.labelIds?.includes(l.id)); const artists = state.labels.filter(l => m.artistIds?.includes(l.id));
  return `<div class="card-artists">${esc(artists.length ? artists.map(l => l.name).join(' · ') : 'Artist not set')}</div><div class="card-tags">${labels.length ? labels.slice(0, 2).map(l => `<span class="tag">${esc(l.name)}</span>`).join('') : '<span class="empty-tag">Add labels</span>'}${labels.length > 2 ? `<span class="empty-tag">+${labels.length - 2}</span>` : ''}</div><div class="card-date">Added ${esc(readableDate(v.addedAt))}${v.provider === 'drive' ? ' · Drive original' : ''}</div>`;
}
function renderLoops() { const loops = selected ? meta(selected.id).loops || [] : []; $('#loop-list').innerHTML = loops.length ? loops.map(loop => `<div class="loop-row"><button class="text-button" data-loop="${esc(loop.id)}">${esc(loop.name)} <span>${formatTime(loop.start)}–${formatTime(loop.end)}</span></button><button class="icon-button" data-delete-loop="${esc(loop.id)}" aria-label="Delete ${esc(loop.name)} loop">×</button></div>`).join('') : '<p class="helper-text">No saved loops yet.</p>';
  $('#loop-list').querySelectorAll('[data-loop]').forEach(button => button.addEventListener('click', () => { const loop = meta(selected.id).loops.find(l => l.id === button.dataset.loop); studioPlayer.useLoop(loop); }));
  $('#loop-list').querySelectorAll('[data-delete-loop]').forEach(button => button.addEventListener('click', () => { patchMeta(selected.id, { loops: meta(selected.id).loops.filter(l => l.id !== button.dataset.deleteLoop) }); renderLoops(); }));
}
function mountVideoDetails() { if (!selected) return; const v = selected, m = meta(v.id);
  for (const [selector, key] of [['#detail-recorded','recordedAt'],['#detail-event','event'],['#detail-location','location'],['#detail-bpm','bpm']]) $(selector).value = m[key] || '';
  labelPicker($('#detail-labels'), { title: 'Labels', labels: () => state.labels, selected: m.labelIds || [], dance: v.dance, allowCreate: true, onChange: ids => { patchMeta(v.id, { labelIds: ids }); }, onCreate: addLabel });
  labelPicker($('#detail-artists'), { title: 'Artists & teachers', labels: () => state.labels, selected: m.artistIds || [], dance: v.dance, artists: true, allowCreate: true, onChange: ids => { patchMeta(v.id, { artistIds: ids }); }, onCreate: addLabel });
  const facts = [['Original filename',v.filename || 'YouTube source'],['Created in Drive',v.provider === 'drive' ? readableDate(v.addedAt) : 'Not a Drive file'],['Modified',readableDate(v.updatedAt)],['Duration',v.duration ? formatTime(v.duration) : 'Available during playback'],['File size',v.size ? `${(v.size / 1048576).toFixed(1)} MB` : 'Not available'],['Resolution',v.width && v.height ? `${v.width} × ${v.height}` : 'Not available']];
  $('#file-facts').innerHTML = facts.map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join(''); renderLoops();
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
function patchMeta(id, patch) { state.meta[id] = { ...meta(id), ...patch }; return save(); }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
function applyTheme() { document.documentElement.dataset.theme = state.theme; $('#theme-toggle').innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon'); $('#theme-toggle').setAttribute('aria-label', `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`); }
function dateLabel() { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()); }
function badge(dance) { return `<span class="dance-badge ${dance.toLowerCase()}"><i class="dance-dot ${dance.toLowerCase()}"></i>${esc(dance)}</span>`; }
function ratingPill(id) { const value = meta(id).rating; return `<span class="rating-pill">${icon('star')}${value ? `${value}<span>/10</span>` : '<span>Unrated</span>'}</span>`; }
function thumb(v) { return v.provider === 'drive' ? `https://drive.google.com/thumbnail?id=${v.providerId}&sz=w600` : (v.kind === 'video' ? `https://i.ytimg.com/vi/${v.providerId}/hqdefault.jpg` : null); }
function artwork(v, eager = false) { const url = thumb(v); return `${url ? `<img src="${esc(url)}" alt="" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer">` : ''}<span class="visual-fallback">${esc(v.provider === 'drive' ? v.title : '▶')}</span>`; }
function handleImages(root = page) { root.querySelectorAll('.pick-visual,.card-visual').forEach(el => { const img = el.querySelector('img'); if (!img) el.classList.add('image-failed'); else { img.addEventListener('error', () => el.classList.add('image-failed')); if (img.complete && !img.naturalWidth) el.classList.add('image-failed'); } }); }
function card(v) {
  const m = meta(v.id), queued = state.queue.includes(v.id), title = displayTitle(v, state.meta);
  return `<article class="video-card"><div class="card-visual ${v.dance.toLowerCase()}">${artwork(v)}<button class="full-play" data-action="open" data-id="${esc(v.id)}" aria-label="Play ${esc(title)}"><span>${icon('play')}</span></button><button class="favorite-button ${m.favorite ? 'selected' : ''}" data-action="favorite" data-id="${esc(v.id)}" aria-label="${m.favorite ? 'Remove from' : 'Add to'} favourites: ${esc(title)}" aria-pressed="${!!m.favorite}">${icon('heart')}</button><span class="provider-badge">${icon(v.provider)}${v.provider === 'drive' ? 'GOOGLE DRIVE' : (v.kind === 'playlist' ? 'YOUTUBE PLAYLIST' : 'YOUTUBE')}</span></div><div class="card-content"><div class="card-labels">${badge(v.dance)}${ratingPill(v.id)}</div><button class="title-button" data-action="open" data-id="${esc(v.id)}">${esc(title)}</button>${cardDetails(v)}<div class="card-bottom"><span>${esc(m.status || 'New')}${m.lastPractised ? ' · Practised' : ''}</span><button class="queue-button ${queued ? 'selected' : ''}" data-action="queue" data-id="${esc(v.id)}" aria-label="${queued ? 'Remove from' : 'Add to'} practice queue: ${esc(title)}" aria-pressed="${queued}">${icon(queued ? 'check' : 'plus')} Practice</button></div></div></article>`;
}
function pick(v) {
  return `<article class="pick-card"><div class="pick-visual ${v.dance.toLowerCase()}">${artwork(v, true)}${badge(v.dance)}<span class="pick-type">TODAY’S PICK</span><button class="play-round" data-action="open" data-id="${esc(v.id)}" aria-label="Play ${esc(displayTitle(v, state.meta))}">${icon('play')}</button><div class="pick-overlay"><h3>${esc(displayTitle(v, state.meta))}</h3><span>Your ${v.dance.toLowerCase()} cue for today</span></div></div><div class="pick-detail"><div>${ratingPill(v.id)}<p>${meta(v.id).rating ? 'Chosen from your highest ratings.' : 'A fresh cue from your fixed collection.'}</p></div><button class="text-button" data-action="open" data-id="${esc(v.id)}">Let’s practise ${icon('arrow')}</button></div></article>`;
}
function heading(eyebrow, title, description, extra = '') { return `<div class="page-heading"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`; }
function ensurePicks(refresh = false) {
  const today = localDay();
  if (refresh || !state.daily || state.daily.day !== today || state.daily.ids.some(id => !videoById(id)) || state.daily.ids.length !== 2) {
    state.daily = { day: today, ids: dailyPicks(driveVideos(), state.meta, today + (refresh ? `:${Date.now()}` : ''), state.daily?.ids || []) }; save();
  }
  return state.daily.ids.map(videoById).filter(Boolean);
}
function renderToday() {
  const picks = ensurePicks();
  const rated = Object.values(state.meta).filter(m => m.rating).length;
  const practiced = new Set(state.history.map(h => h.id)).size;
  const preview = filterVideos(driveVideos(), state.meta, { sort: 'recent' }).slice(0, 4);
  page.innerHTML = `${heading('YOUR DAILY DANCE RITUAL', 'Keep your feet curious.', 'Your Salsa and Bachata collection, ready for a little practice.', `<span class="date-chip">${icon('calendar')}${dateLabel()}</span>`)}<div class="stats-row"><span><strong>${driveVideos().length}</strong> dance videos</span><span><strong>${rated}</strong> rated by you</span><span><strong>${practiced}</strong> practised</span></div><div class="studio-shortcuts"><a href="#upload"><span>01 / COLLECT</span><strong>Add a new move</strong><small>Numbered uploads to your Drive</small></a><a href="#labels"><span>02 / ORGANISE</span><strong>Find your own language</strong><small>Styles, artists, technique & more</small></a></div><div class="section-heading"><div><h2>Made for today</h2><span class="count-chip">2 DAILY PICKS</span></div><button class="text-button" data-action="refresh-picks">${icon('refresh')} New picks</button></div><div class="picks-grid">${picks.map(pick).join('')}</div><div class="today-banner"><div class="banner-symbol">${icon('play')}</div><div><h3>Less scrolling. More dancing.</h3><p>A balanced Salsa & Bachata session, one cue at a time.</p></div><button class="button primary small" data-action="go-practice">Start practising ${icon('arrow')}</button></div><div class="section-heading"><div><h2>Back to the dance floor</h2><span class="section-note">From your fixed collections</span></div><a class="text-button" href="#library">Explore library ${icon('arrow')}</a></div><div class="video-grid">${preview.map(card).join('')}</div>`;
}
function renderLibrary(favorites = false) {
  page.innerHTML = `${heading(favorites ? 'THE ONES YOU LOVE' : 'WATCH. LEARN. MAKE IT YOURS.', favorites ? 'Keep the good moves close.' : 'Your dance library.', favorites ? 'Your favourite cues, ready when you are.' : 'Two fixed collections. Endless ways to make progress.')}<div class="library-toolbar"><div class="segmented" role="group" aria-label="Filter dance">${['All', 'Salsa', 'Bachata'].map(d => `<button data-action="filter-dance" data-dance="${d}" class="${filters.dance === d ? 'active' : ''}" aria-pressed="${filters.dance === d}">${d === 'All' ? 'All dances' : d}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="Search videos or notes" aria-label="Search videos or notes" value="${esc(filters.query)}"></label></div><div class="filters"><label>Source <select id="provider-filter"><option value="all">All sources</option><option value="drive">Google Drive</option><option value="youtube">YouTube</option></select></label><label>Rating <select id="rating-filter"><option value="">Any rating</option><option value="unrated">Unrated</option>${Array.from({ length: 10 }, (_, i) => `<option value="${10 - i}">${10 - i} / 10</option>`).join('')}</select></label><label>Sort <select id="sort-filter"><option value="title">Video number / title</option><option value="rating">Highest rated</option><option value="recent">Recently added</option></select></label><span class="result-count" id="result-count"></span></div><div class="advanced-filters"><div id="filter-labels"></div><div id="filter-artists"></div><button class="text-button" data-action="reset-filters">Clear filters</button></div><div id="library-results"></div>`;
  $('#provider-filter').value = filters.provider; $('#rating-filter').value = filters.rating; $('#sort-filter').value = filters.sort;
  $('#search').addEventListener('input', e => { filters.query = e.target.value; currentPage = 1; renderResults(favorites); });
  for (const [id, key] of [['provider-filter', 'provider'], ['rating-filter', 'rating'], ['sort-filter', 'sort']]) $(`#${id}`).addEventListener('change', e => { filters[key] = e.target.value; currentPage = 1; renderResults(favorites); });
  labelPicker($('#filter-labels'), { title: 'Filter labels', labels: () => state.labels, selected: filters.labelIds || [], dance: filters.dance === 'All' ? 'Both' : filters.dance, onChange: ids => { filters.labelIds = ids; currentPage = 1; renderResults(favorites); } });
  labelPicker($('#filter-artists'), { title: 'Filter artists', labels: () => state.labels, selected: filters.artistIds || [], artists: true, onChange: ids => { filters.artistIds = ids; currentPage = 1; renderResults(favorites); } });
  renderResults(favorites);
}
function renderResults(favorites = activeView === 'favorites') {
  const matches = filterVideos(videos(), state.meta, { ...filters, favorite: favorites }, state.labels);
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize)); currentPage = Math.min(currentPage, totalPages);
  $('#result-count').textContent = `${matches.length} ${matches.length === 1 ? 'video' : 'videos'}`;
  $('#library-results').innerHTML = matches.length ? `<div class="video-grid">${matches.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(card).join('')}</div>${totalPages > 1 ? `<div class="pagination"><button class="button subtle small" data-action="page-prev" ${currentPage === 1 ? 'disabled' : ''}>${icon('back')} Previous</button><span>Page ${currentPage} of ${totalPages}</span><button class="button subtle small" data-action="page-next" ${currentPage === totalPages ? 'disabled' : ''}>Next ${icon('arrow')}</button></div>` : ''}` : `<div class="empty-state">${icon(favorites ? 'heart' : 'search')}<h3>${favorites ? 'Your favourites start here.' : 'No cues match just yet.'}</h3><p>${favorites ? 'Tap the heart on a video to keep it close. Your favourites are saved in this browser.' : 'Try another dance, rating or search. You can also add a YouTube video or playlist.'}</p><button class="button primary" data-action="reset-filters">${favorites ? 'Explore the library' : 'Clear filters'}</button></div>`;
  handleImages($('#library-results'));
}
function renderPractice() {
  const queue = state.queue.map(videoById).filter(Boolean);
  page.innerHTML = `${heading('A LITTLE PRACTICE, EVERY DAY', 'Turn cues into confidence.', 'Build a session from your favourites or let BailaCue mix it up.')}<div class="practice-layout"><div class="practice-start"><span class="eyebrow">YOUR NEXT GOOD HABIT</span><h2>Salsa. Bachata.<br>And a little bit of you.</h2><p>Make a balanced queue from the fixed collections. Higher-rated videos get more weight. Move through it at your own pace.</p><button class="button primary" data-action="mix">${icon('refresh')} Make a 10-video mix</button>${queue.length ? `<button class="button subtle" data-action="start-queue">${icon('play')} Play my queue</button>` : ''}</div><div class="timer-panel"><span class="eyebrow">SESSION TIMER</span><div class="timer" id="timer">${timerText()}</div><div><button class="button subtle small" id="timer-toggle" data-action="timer">${icon(sessionStarted ? 'pause' : 'play')}${sessionStarted ? 'Pause' : 'Start timer'}</button> <button class="text-button" data-action="timer-reset">Reset</button></div><p>An optional session timer. Pause it for breaks. It pauses when you leave this tab.</p></div></div><div class="section-heading"><div><h2>Your practice queue</h2><span class="count-chip">${queue.length} CUES</span></div>${queue.length ? '<button class="text-button" data-action="clear-queue">Clear queue</button>' : ''}</div>${queue.length ? `<div class="queue-list">${queue.map((v, i) => `<article class="queue-item"><span class="index">${String(i + 1).padStart(2, '0')}</span><div class="queue-info"><h4>${esc(displayTitle(v, state.meta))}</h4><div class="muted">${esc(v.dance)} · ${meta(v.id).rating ? `${meta(v.id).rating}/10` : 'Unrated'} · ${v.provider === 'drive' ? 'Google Drive' : 'YouTube'}</div></div><button class="icon-button" data-action="open-queue" data-id="${esc(v.id)}" aria-label="Play ${esc(displayTitle(v, state.meta))}">${icon('play')}</button><button class="icon-button" data-action="queue" data-id="${esc(v.id)}" aria-label="Remove ${esc(displayTitle(v, state.meta))} from practice">${icon('close')}</button></article>`).join('')}</div>` : `<div class="empty-state">${icon('queue')}<h3>Give your next session a cue.</h3><p>Add videos with the Practice button in your library, or make a balanced mix above.</p><a href="#library" class="button subtle">Explore the library ${icon('arrow')}</a></div>`}`;
}
function renderSettings() {
  page.innerHTML = `${heading('SIMPLE BY DESIGN', 'Your space. Your pace.', 'Browse freely. Connect Google when you want to add numbered videos.')}${!storageAvailable ? '<div class="status-banner">Browser storage is unavailable. Export a backup before leaving this page.</div>' : ''}${storageCorrupt ? '<div class="status-banner">Your existing saved data could not be read. Download the original below before replacing it. This app has left the original untouched.</div>' : ''}<div class="settings-grid"><section class="settings-card"><span class="eyebrow">YOUR PLAYER</span><h3>Drive originals. BailaCue playback.</h3><p>Videos stream from the fixed Google Drive library into the built-in player. No viewer sign-in is needed for shared originals.</p><p>Use speed, seeking, mirror, full screen and saved loops while practising. Videos stay in Drive at their original quality. If a video cannot play, choose Drive preview or Open original.</p></section><section class="settings-card"><h3>Two collections. Always here.</h3><p>The Salsa and Bachata folders are fixed. New videos upload only to your selected fixed dance folder, with numbered filenames. Existing files are never renamed by browsing or refreshing.</p>${SOURCES.map(s => `<div class="source-row"><i class="dance-dot ${s.id}"></i><span>${s.dance}<small>${catalogue.filter(v => v.dance === s.dance).length} videos · Fixed Google Drive source</small></span><span class="lock" aria-label="Source locked">${icon('lock')}</span><a class="icon-button" href="https://drive.google.com/drive/folders/${s.folderId}" target="_blank" rel="noopener noreferrer" aria-label="Open ${s.dance} source folder">${icon('external')}</a></div>`).join('')}<p>Catalogue checked 24 October 2026. Connect Google in Add videos to refresh live folder metadata. Guests see the deployed catalogue. Playback follows Google Drive’s sharing permissions.</p><button class="text-button" data-action="reload-catalogue">${icon('refresh')} Check for a newer catalogue</button></section><section class="settings-card"><h3>Your YouTube discoveries</h3><p>Add any Salsa or Bachata video or playlist. Your links stay alongside the fixed collection, on this device. Playlist entries play as a playlist and are rated as one source.</p><div class="source-row"><span>${icon('youtube')}</span><span>YouTube<small>${state.youtube.length} ${state.youtube.length === 1 ? 'source' : 'sources'} added by you</small></span></div><button class="button primary small" data-action="add-youtube">${icon('plus')} Add YouTube</button><button class="button subtle small" data-action="show-youtube">View my sources</button></section><section class="settings-card"><h3>Your progress belongs to you.</h3><p>Ratings (1–10), notes, favourites, learning status, queues and YouTube additions save in this browser. They do not sync between devices. Clearing browser data clears them.</p><p>Export a backup to keep your progress or take it to another device. Import merges with this browser; imported metadata replaces matching entries.</p><button class="button subtle small" data-action="export">${icon('download')} Export backup</button><button class="button subtle small" data-action="import">${icon('upload')} Import backup</button><input class="local-backup" id="backup-file" type="file" accept="application/json,.json">${storageCorrupt ? '<button class="button subtle small" data-action="export-original">Download unreadable original</button><button class="button subtle small" data-action="replace-original">Replace with current session</button>' : ''}</section><section class="settings-card"><h3>Built for your next dance.</h3><p>Full screen and adjustable player size are available for every source. Drive originals, YouTube and local previews also support seeking, speed and saved A–B loops. In-app practice queues advance when you choose Next, so you can repeat a move for as long as you need.</p><p>Daily Picks choose one Salsa and one Bachata cue from the fixed Drive library. Your highest ratings come first; unrated videos get the same starting weight as 10/10 until you rate them. Refresh picks to explore another pair.</p><span class="eyebrow">BAILACUE WEB · 0.5.0 · DEVELOP</span></section></div>`;
  $('#backup-file').addEventListener('change', importBackup);
}
function render() {
  if (uploadRunning() && activeView === 'upload') return;
  const titles = { today: 'Today', library: 'Library', practice: 'Practice', favorites: 'Favourites', settings: 'Settings', labels: 'Labels', upload: 'Add videos' };
  $('#breadcrumb').textContent = titles[activeView];
  document.title = `${titles[activeView]} · BailaCue`;
  document.querySelectorAll('#nav a').forEach(a => { if (!(a instanceof HTMLElement)) return; const active = a.dataset.view === activeView; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (activeView === 'today') renderToday();
  if (activeView === 'library' || activeView === 'favorites') renderLibrary(activeView === 'favorites');
  if (activeView === 'practice') renderPractice();
  if (activeView === 'settings') renderSettings();
  if (activeView === 'labels') renderLabelManager(page, studioContext());
  if (activeView === 'upload') renderUpload(page, studioContext());
  if (storageCorrupt && activeView !== 'settings') page.insertAdjacentHTML('afterbegin', '<div class="status-banner">Your previous saved data needs recovery. Open Settings to download it. Current changes are temporary.</div>');
  handleImages();
}
function navigate(view) { if (uploadRunning()) { if (view !== 'upload') toast('Pause the upload before leaving this page.'); return; } if (location.hash === `#${view}`) { activeView = view; render(); } else location.hash = view; }
function route() { const next = location.hash.slice(1); if (uploadRunning() && next !== 'upload') { toast('Pause the upload before leaving this page.'); location.hash = 'upload'; return; } activeView = ['today', 'library', 'practice', 'favorites', 'settings', 'labels', 'upload'].includes(next) ? next : 'today'; render(); window.scrollTo({ top: 0 }); }
function openYoutube() { $('#youtube-error').textContent = ''; $('#youtube-dialog').showModal(); }
function updatePlayer() {
  if (!selected) return;
  const m = meta(selected.id);
  $('#player-title').textContent = displayTitle(selected, state.meta);
  $('#player-source').textContent = `${selected.dance} / ${selected.provider === 'drive' ? 'GOOGLE DRIVE' : selected.provider === 'local' ? 'ON THIS DEVICE' : 'YOUTUBE'}`;
  $('#rating-buttons').innerHTML = `${Array.from({ length: 10 }, (_, i) => `<button data-action="rate" data-rating="${i + 1}" aria-label="Rate ${i + 1} out of 10" aria-pressed="${m.rating === i + 1}" class="${m.rating === i + 1 ? 'active' : ''}">${i + 1}</button>`).join('')}<button class="unrate ${!m.rating ? 'active' : ''}" data-action="rate" data-rating="0" aria-pressed="${!m.rating}">Unrated</button>`;
  $('#player-favorite').innerHTML = `${icon('heart')}${m.favorite ? 'Favourited' : 'Favourite'}`; $('#player-favorite').setAttribute('aria-pressed', String(!!m.favorite));
  $('#player-queue').innerHTML = `${icon(state.queue.includes(selected.id) ? 'check' : 'plus')} ${state.queue.includes(selected.id) ? 'In practice queue' : 'Add to practice'}`;
  $('#learning-status').value = m.status || 'New';
  $('#queue-nav').innerHTML = playbackIndex >= 0 ? `<button class="button subtle small" data-action="previous" ${playbackIndex === 0 ? 'disabled' : ''}>${icon('back')} Previous</button><span>${playbackIndex + 1} / ${playbackQueue.length}</span><button class="button primary small" data-action="next" ${playbackIndex >= playbackQueue.length - 1 ? 'disabled' : ''}>Next cue ${icon('arrow')}</button>` : '';
  $('#remove-row').innerHTML = selected.provider === 'youtube' ? '<button class="text-button" data-action="remove-youtube">Remove this YouTube source</button>' : '';
}
function openPlayer(id, queue = null, override = null, localUrl = '') {
  const v = override || videoById(id); if (!v) return;
  selected = v;
  if (queue) { playbackQueue = queue.filter(x => videoById(x)); playbackIndex = playbackQueue.indexOf(id); } else { playbackQueue = []; playbackIndex = -1; }
  studioPlayer.open(v, localUrl);
  $('#player').classList.toggle('local-preview', v.provider === 'local');
  $('#player').style.width = `${state.playerSize}px`; $('#player-size').value = String(state.playerSize);
  $('#provider-link').hidden = v.provider === 'local';
  if (v.provider !== 'local') $('#provider-link').href = v.provider === 'drive' ? `https://drive.google.com/file/d/${v.providerId}/view` : v.url; else $('#provider-link').removeAttribute('href');
  $('#personal-title').value = meta(id).title || ''; $('#notes').value = meta(id).notes || ''; $('#note-status').textContent = 'Saved in this browser';
  updatePlayer(); mountVideoDetails(); if (!$('#player').open) $('#player').showModal();
}
function toggleFavorite(id) { patchMeta(id, { favorite: !meta(id).favorite }); if (selected?.id === id) updatePlayer(); refreshView(); }
function toggleQueue(id) { const queued = state.queue.includes(id); state.queue = queued ? state.queue.filter(x => x !== id) : [...state.queue, id]; save(); toast(queued ? 'Removed from your practice queue' : 'Added to your practice queue'); if (selected?.id === id) updatePlayer(); refreshView(); }
function refreshView() { const position = window.scrollY; render(); window.scrollTo({ top: position }); }
function markPractised() { if (!selected) return; const at = new Date().toISOString(); patchMeta(selected.id, { lastPractised: at, status: meta(selected.id).status === 'Learned' ? 'Learned' : 'Practising' }); state.history.push({ id: selected.id, at }); state.history = state.history.slice(-1000); save(); updatePlayer(); refreshView(); toast('Practice recorded. A little progress, every time.'); }
function elapsed() { return sessionSeconds + (sessionStarted ? Math.floor((Date.now() - sessionStarted) / 1000) : 0); }
function timerText() { const sec = elapsed(); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function pauseTimer() { if (sessionStarted) { sessionSeconds = elapsed(); sessionStarted = null; } }
function downloadJson(value, name) { const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function importBackup(event) {
  const file = event.target.files?.[0]; if (!file) return;
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
    save(); render(); toast('Backup imported. Your progress is ready.');
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
document.addEventListener('click', async event => {
  if (!(event.target instanceof Element)) return;
  const close = event.target.closest('[data-close]'); if (close instanceof HTMLElement) { const dialog = document.getElementById(close.dataset.close); if (dialog instanceof HTMLDialogElement) dialog.close(); return; }
  const button = event.target.closest('[data-action]'); if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'open') openPlayer(id);
  if (action === 'favorite') toggleFavorite(id);
  if (action === 'queue') toggleQueue(id);
  if (action === 'filter-dance') { filters.dance = button.dataset.dance; currentPage = 1; render(); }
  if (action === 'refresh-picks') { ensurePicks(true); render(); toast('Two fresh cues. Let’s dance.'); }
  if (action === 'go-practice') navigate('practice');
  if (action === 'page-prev' || action === 'page-next') { currentPage += action === 'page-next' ? 1 : -1; renderResults(); $('.library-toolbar').scrollIntoView({ block: 'start' }); }
  if (action === 'reset-filters') { filters = { dance: 'All', provider: 'all', rating: '', sort: 'title', query: '' }; currentPage = 1; navigate('library'); }
  if (action === 'mix') { state.queue = practiceQueue(driveVideos(), state.meta).slice(0, 10); save(); render(); toast('Your 10-video Salsa & Bachata mix is ready.'); }
  if (action === 'start-queue') { const ids = state.queue.filter(x => videoById(x)); if (ids.length) openPlayer(ids[0], ids); }
  if (action === 'open-queue') openPlayer(id, state.queue);
  if (action === 'clear-queue') { state.queue = []; save(); render(); toast('Practice queue cleared'); }
  if (action === 'timer') { if (sessionStarted) pauseTimer(); else sessionStarted = Date.now(); render(); }
  if (action === 'timer-reset') { sessionStarted = null; sessionSeconds = 0; render(); }
  if (action === 'rate' && selected) { patchMeta(selected.id, { rating: Number(button.dataset.rating) || null }); updatePlayer(); refreshView(); }
  if (action === 'next' || action === 'previous') { const next = playbackIndex + (action === 'next' ? 1 : -1); if (next >= 0 && next < playbackQueue.length) openPlayer(playbackQueue[next], playbackQueue); }
  if (action === 'add-youtube') openYoutube();
  if (action === 'show-youtube') { filters = { dance: 'All', provider: 'youtube', rating: '', sort: 'title', query: '' }; currentPage = 1; navigate('library'); }
  if (action === 'export') downloadJson(state, `BailaCue-backup-${localDay()}.json`);
  if (action === 'import') $('#backup-file').click();
  if (action === 'export-original') downloadJson(localStorage.getItem(STORAGE_KEY) || '{}', `BailaCue-original-${localDay()}.json`);
  if (action === 'replace-original') { storageCorrupt = false; if (save()) { render(); toast('Current session saved. Your downloaded original can be recovered separately.'); } }
  if (action === 'reload-catalogue') { button.disabled = true; try { await loadCatalogue(); render(); toast('Latest deployed catalogue loaded'); } catch (error) { toast(error.message); button.disabled = false; } }
  if (action === 'remove-youtube' && selected?.provider === 'youtube') { removing = selected.id; $('#confirm-dialog').showModal(); }
  if (action === 'retry-load') start();
});
$('#confirm-remove').addEventListener('click', () => { if (!removing) return; state.youtube = state.youtube.filter(v => v.id !== removing); state.queue = state.queue.filter(id => id !== removing); state.history = state.history.filter(h => h.id !== removing); delete state.meta[removing]; save(); removing = null; $('#confirm-dialog').close(); $('#player').close(); render(); $('#nav-count').textContent = String(videos().length); toast('YouTube source removed'); });
$('#player').addEventListener('close', () => { studioPlayer.stop(); selected = null; if (localPreviewUrl) { URL.revokeObjectURL(localPreviewUrl); localPreviewUrl = ''; } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); refreshView(); });
$('#player-favorite').addEventListener('click', () => selected && toggleFavorite(selected.id));
$('#player-queue').addEventListener('click', () => selected && toggleQueue(selected.id));
$('#mark-practised').addEventListener('click', markPractised);
$('#learning-status').addEventListener('change', e => { if (selected) { patchMeta(selected.id, { status: e.target.value }); refreshView(); } });
for (const [selector, key] of [['#notes', 'notes'], ['#personal-title', 'title']]) $(selector).addEventListener('input', event => { if (!selected) return; const ok = patchMeta(selected.id, { [key]: event.target.value }); $('#note-status').textContent = ok ? 'Saved in this browser' : 'Session only — export a backup'; if (key === 'title') $('#player-title').textContent = displayTitle(selected, state.meta); });
$('#personal-title').addEventListener('change', refreshView);
$('#youtube-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const parsed = parseYoutube($('#youtube-url').value);
    if (state.youtube.some(v => v.id === parsed.id)) throw new Error('This source is already in your library.');
    const title = $('#youtube-name').value.trim(); if (!title) throw new Error('Give this source a title.');
    state.youtube.push({ ...parsed, provider: 'youtube', dance: $('#youtube-dance').value, title, addedAt: new Date().toISOString() }); save();
    $('#youtube-dialog').close(); $('#youtube-form').reset(); $('#nav-count').textContent = String(videos().length);
    filters = { dance: 'All', provider: 'youtube', rating: '', sort: 'recent', query: '' }; currentPage = 1; navigate('library'); toast('New inspiration added to your library.');
  } catch (error) { $('#youtube-error').textContent = error.message; }
});
$('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); });
for (const id of ['add-youtube', 'youtube-nav']) $(`#${id}`).addEventListener('click', openYoutube);
for (const id of ['settings-nav', 'footer-settings']) $(`#${id}`).addEventListener('click', () => navigate('settings'));
document.querySelectorAll('.source-nav [data-dance]').forEach(button => button.addEventListener('click', () => { if (!(button instanceof HTMLElement)) return; filters = { dance: button.dataset.dance, provider: 'drive', rating: '', sort: 'title', query: '' }; currentPage = 1; navigate('library'); }));
window.addEventListener('hashchange', () => { if (catalogue.length) route(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { state = cleanState(JSON.parse(event.newValue)); applyTheme(); render(); if (selected) { updatePlayer(); $('#notes').value = meta(selected.id).notes || ''; $('#personal-title').value = meta(selected.id).title || ''; } } catch { toast('Another tab saved unreadable data. Export your current progress.'); } } });
document.addEventListener('visibilitychange', () => { if (document.hidden && sessionStarted) { pauseTimer(); if (activeView === 'practice') renderPractice(); } });
setInterval(() => { const timer = $('#timer'); if (timer && sessionStarted) timer.textContent = timerText(); }, 1000);
async function start() { try { await loadCatalogue(); route(); } catch { page.innerHTML = '<div class="error-message"><h2>Your library needs a moment.</h2><p>The catalogue could not be loaded. Check your connection and try again. Your saved progress stays in this browser.</p><button class="button primary" data-action="retry-load">Try again</button></div>'; } }
$('#player-size').addEventListener('change', event => { state.playerSize = Number(event.target.value); $('#player').classList.remove('theater'); $('#theater-button').textContent = 'Theater view'; $('#theater-button').setAttribute('aria-pressed', 'false'); $('#player').style.width = `${state.playerSize}px`; save(); });
$('#player-height').addEventListener('input', event => $('#video-frame').style.setProperty('--video-height', `${event.target.value}px`));
$('#theater-button').addEventListener('click', () => { const active = $('#player').classList.toggle('theater'); $('#theater-button').textContent = active ? 'Exit theater' : 'Theater view'; $('#theater-button').setAttribute('aria-pressed', String(active)); });
for (const [selector, key] of [['#detail-recorded','recordedAt'],['#detail-event','event'],['#detail-location','location'],['#detail-bpm','bpm']]) $(selector).addEventListener('change', event => { if (!selected) return; patchMeta(selected.id, { [key]: key === 'bpm' ? (Number(event.target.value) || null) : event.target.value }); });
async function loadConfiguration() { try { const config = await (await fetch('/public-config.json')).json(); if (!connection.clientId && /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId || '')) connection.clientId = config.googleClientId; } catch { /* Local and guest use do not depend on Google registration. */ } }
hydrateIcons(); applyTheme(); loadConfiguration().finally(start);
