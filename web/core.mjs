/** BailaCue web domain logic. No BailaCue account dependency. */
import { seedLabels, cleanLabels, cleanDetails } from './studio-model.mjs';
export const STORAGE_KEY = 'bailacue:web:v1';
export const SOURCES = Object.freeze([
  Object.freeze({ id: 'salsa', dance: 'Salsa', folderId: '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm' }),
  Object.freeze({ id: 'bachata', dance: 'Bachata', folderId: '17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1' }),
]);
/** @returns {import('./types.js').State} */
export function emptyState() {
  return { version: 1, meta: {}, youtube: [], drive: [], labels: seedLabels(), numbering: { Salsa: 0, Bachata: 0 }, googleClientId: '', playerSize: 960, queue: [], history: [], daily: null, theme: 'light' };
}
export function rating(value) { return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null; }
export function parseYoutube(input) {
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Paste a complete YouTube video or playlist URL.'); }
  if (url.protocol !== 'https:') throw new Error('Use an https:// YouTube link.');
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  const validId = /^[A-Za-z0-9_-]{11}$/;
  let videoId = null;
  let playlistId = null;
  if (host === 'youtu.be') videoId = parts[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
    else if (url.pathname === '/playlist') playlistId = url.searchParams.get('list');
  } else throw new Error('Use a link from youtube.com or youtu.be.');
  if (videoId && validId.test(videoId)) return { providerId: videoId, kind: 'video', id: `youtube:video:${videoId}`, url: `https://www.youtube.com/watch?v=${videoId}` };
  if (playlistId && /^[A-Za-z0-9_-]{10,100}$/.test(playlistId)) return { providerId: playlistId, kind: 'playlist', id: `youtube:playlist:${playlistId}`, url: `https://www.youtube.com/playlist?list=${playlistId}` };
  throw new Error('This link does not contain a valid YouTube video or playlist.');
}
export function cleanState(input) {
  if (!input || input.version !== 1 || typeof input.meta !== 'object' || !Array.isArray(input.youtube)) throw new Error('Choose a BailaCue web backup (version 1).');
  const out = emptyState();
  for (const [id, value] of Object.entries(input.meta || {}).slice(0, 10000)) {
    if (!/^(drive:|youtube:)/.test(id) || !value || typeof value !== 'object') continue;
    out.meta[id] = { ...cleanDetails(value), rating: rating(value.rating), favorite: value.favorite === true, notes: String(value.notes || '').slice(0, 10000), title: String(value.title || '').slice(0, 160), status: ['New', 'Practising', 'Learned'].includes(value.status) ? value.status : 'New', lastPractised: typeof value.lastPractised === 'string' ? value.lastPractised : null };
  }
  const seen = new Set();
  for (const v of input.youtube.slice(0, 1000)) {
    try {
      const parsed = parseYoutube(v.url);
      if (!['Salsa', 'Bachata'].includes(v.dance) || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      out.youtube.push({ ...parsed, provider: 'youtube', dance: v.dance, title: String(v.title || (parsed.kind === 'playlist' ? 'YouTube playlist' : 'YouTube video')).slice(0, 160), addedAt: String(v.addedAt || new Date().toISOString()) });
    } catch { /* Invalid external links are never restored. */ }
  }
  out.queue = Array.isArray(input.queue) ? [...new Set(input.queue.filter(x => typeof x === 'string' && /^(drive:|youtube:)/.test(x)))].slice(0, 1000) : [];
  out.history = Array.isArray(input.history) ? input.history.filter(x => x && typeof x.id === 'string' && typeof x.at === 'string').slice(-1000).map(x => ({ id: x.id, at: x.at })) : [];
  out.theme = input.theme === 'dark' ? 'dark' : 'light';
  out.labels = cleanLabels(input.labels);
  out.googleClientId = /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(input.googleClientId || '') ? input.googleClientId : '';
  out.playerSize = [680, 960, 1280].includes(input.playerSize) ? input.playerSize : 960;
  for (const dance of ['Salsa', 'Bachata']) out.numbering[dance] = Number.isSafeInteger(input.numbering?.[dance]) && input.numbering[dance] >= 0 ? input.numbering[dance] : 0;
  out.drive = Array.isArray(input.drive) ? input.drive.filter(v => v && v.provider === 'drive' && /^[A-Za-z0-9_-]{10,100}$/.test(v.providerId) && v.id === `drive:${v.providerId}` && SOURCES.some(s => s.dance === v.dance && s.folderId === v.folderId)).slice(0, 5000).map(v => ({ id: v.id, provider: 'drive', providerId: v.providerId, folderId: v.folderId, dance: v.dance, title: String(v.title || '').slice(0, 160), filename: String(v.filename || '').slice(0, 160), addedAt: String(v.addedAt || ''), updatedAt: String(v.updatedAt || ''), size: Number(v.size) || 0, duration: Number(v.duration) || null, width: Number(v.width) || null, height: Number(v.height) || null, mimeType: String(v.mimeType || 'video/mp4').slice(0, 60) })) : [];
  if (input.daily && typeof input.daily.day === 'string' && Array.isArray(input.daily.ids)) out.daily = { day: input.daily.day, ids: input.daily.ids.filter(x => typeof x === 'string').slice(0, 2) };
  return out;
}
/** @param {import('./types.js').Video} video @param {Record<string, import('./types.js').Metadata>} meta */
export function displayTitle(video, meta = {}) {
  return meta[video.id]?.title || (/^\d+$/.test(video.title) ? `${video.dance} · ${video.title.padStart(4, '0')}` : video.title);
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function hash(text) { let h = 2166136261; for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
/** @param {import('./types.js').Video[]} videos @param {Record<string, import('./types.js').Metadata>} meta @param {string} day @param {string[]} previous */
export function dailyPicks(videos, meta, day, previous = []) {
  return ['Salsa', 'Bachata'].flatMap(dance => {
    let pool = videos.filter(v => v.dance === dance && v.provider === 'drive');
    const fresh = pool.filter(v => !previous.includes(v.id));
    if (fresh.length) pool = fresh;
    pool.sort((a, b) => ((meta[b.id]?.rating ?? 10) - (meta[a.id]?.rating ?? 10)) || (hash(day + a.id) - hash(day + b.id)));
    return pool[0] ? [pool[0].id] : [];
  });
}
/** @param {import('./types.js').Video[]} videos @param {Record<string, import('./types.js').Metadata>} meta */
export function practiceQueue(videos, meta, random = Math.random) {
  const byDance = ['Salsa', 'Bachata'].map(dance => videos.filter(v => v.dance === dance).map(v => ({ id: v.id, key: -Math.log(Math.max(0.000001, random())) / (meta[v.id]?.rating ?? 10) })).sort((a, b) => a.key - b.key));
  const out = [];
  while (byDance.some(x => x.length)) for (const pool of byDance) if (pool.length) out.push(pool.shift().id);
  return out;
}
/** @param {import('./types.js').Video[]} videos @param {Record<string, import('./types.js').Metadata>} meta @param {import('./types.js').Filters} filters @param {import('./types.js').Label[]} labels */
export function filterVideos(videos, meta, filters, labels = []) {
  const query = (filters.query || '').toLocaleLowerCase().trim();
  const out = videos.filter(v => {
    const m = meta[v.id] || {};
    return (!filters.dance || filters.dance === 'All' || v.dance === filters.dance)
      && (!filters.provider || filters.provider === 'all' || v.provider === filters.provider)
      && (!filters.favorite || m.favorite)
      && (!filters.labelIds?.length || filters.labelIds.every(id => m.labelIds?.includes(id)))
      && (!filters.artistIds?.length || filters.artistIds.some(id => m.artistIds?.includes(id)))
      && (!filters.rating || (filters.rating === 'unrated' ? !m.rating : m.rating === Number(filters.rating)))
      && (!query || `${displayTitle(v, meta)} ${v.filename || ''} ${m.notes || ''} ${m.event || ''} ${m.location || ''} ${labels.filter(l => [...(m.labelIds || []), ...(m.artistIds || [])].includes(l.id)).map(l => l.name).join(' ')}`.toLocaleLowerCase().includes(query));
  });
  return out.sort((a, b) => {
    if (filters.sort === 'rating') return (meta[b.id]?.rating ?? 0) - (meta[a.id]?.rating ?? 0) || displayTitle(a, meta).localeCompare(displayTitle(b, meta), undefined, { numeric: true });
    if (filters.sort === 'recent') return (b.addedAt || '').localeCompare(a.addedAt || '');
    return a.dance.localeCompare(b.dance) || displayTitle(a, meta).localeCompare(displayTitle(b, meta), undefined, { numeric: true });
  });
}
/** @param {import('./types.js').Video} video */
export function embedUrl(video) {
  if (video.provider === 'drive' && /^[A-Za-z0-9_-]{10,100}$/.test(video.providerId)) return `https://drive.google.com/file/d/${video.providerId}/preview`;
  const parsed = parseYoutube(video.url);
  return parsed.kind === 'playlist' ? `https://www.youtube-nocookie.com/embed/videoseries?list=${parsed.providerId}&rel=0` : `https://www.youtube-nocookie.com/embed/${parsed.providerId}?rel=0`;
}
