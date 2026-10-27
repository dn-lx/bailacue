export const LABEL_TYPES = ['Style', 'Technique', 'Video type', 'Level', 'Artist'];
const suggestions = [
  ['Salsa On1', 'Style', 'Salsa'], ['Salsa On2', 'Style', 'Salsa'], ['Cuban / Casino', 'Style', 'Salsa'], ['Rueda de Casino', 'Style', 'Salsa'], ['Colombian / Cali', 'Style', 'Salsa'],
  ['Sensual Bachata', 'Style', 'Bachata'], ['Dominican Bachata', 'Style', 'Bachata'], ['Modern Bachata', 'Style', 'Bachata'], ['Bachata Fusion', 'Style', 'Bachata'],
  ['Footwork / Shines', 'Technique', 'Both'], ['Partnerwork', 'Technique', 'Both'], ['Body movement', 'Technique', 'Both'], ['Turns', 'Technique', 'Both'], ['Musicality', 'Technique', 'Both'],
  ['Class', 'Video type', 'Both'], ['Tutorial', 'Video type', 'Both'], ['Social dance', 'Video type', 'Both'], ['Demo', 'Video type', 'Both'], ['Performance', 'Video type', 'Both'],
  ['Beginner', 'Level', 'Both'], ['Intermediate', 'Level', 'Both'], ['Advanced', 'Level', 'Both'],
];
export function normalizeName(value) { return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
export function newId() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export function seedLabels() { return suggestions.map(([name, type, dance], i) => ({ id: `label-${i + 1}`, name, type, dance })); }
export function cleanLabels(input) {
  if (!Array.isArray(input)) return seedLabels();
  const seen = new Set(), ids = new Set();
  return input.slice(0, 2000).flatMap(v => {
    if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) || ids.has(v.id) || !LABEL_TYPES.includes(v.type)) return [];
    const name = String(v.name || '').trim().slice(0, 80), key = `${v.type}:${normalizeName(name)}`;
    if (!name || seen.has(key)) return [];
    seen.add(key); ids.add(v.id);
    return [{ id: v.id, name, type: v.type, dance: ['Salsa', 'Bachata'].includes(v.dance) ? v.dance : 'Both' }];
  });
}
export function createLabel(labels, name, type = 'Style', dance = 'Both') {
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) throw new Error('Enter a label name.');
  if (!LABEL_TYPES.includes(type)) throw new Error('Choose a label type.');
  const existing = labels.find(v => v.type === type && normalizeName(v.name) === normalizeName(name));
  if (existing) return existing;
  const label = { id: `custom-${newId()}`, name, type, dance: ['Salsa', 'Bachata'].includes(dance) ? dance : 'Both' };
  labels.push(label); return label;
}
export function cleanDetails(value = {}) {
  const ids = key => Array.isArray(value[key]) ? [...new Set(value[key].filter(x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x)))].slice(0, 100) : [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value.recordedAt || '') && !Number.isNaN(Date.parse(value.recordedAt)) ? value.recordedAt : '';
  return { labelIds: ids('labelIds'), artistIds: ids('artistIds'), recordedAt: date, event: String(value.event || '').slice(0, 160), location: String(value.location || '').slice(0, 160), bpm: Number.isFinite(Number(value.bpm)) && Number(value.bpm) > 0 && Number(value.bpm) < 400 ? Number(value.bpm) : null,
    loops: Array.isArray(value.loops) ? value.loops.filter(v => v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.start >= 0 && v.end > v.start).slice(0, 30).map(v => ({ id: String(v.id || '').slice(0, 80), name: String(v.name || 'Practice loop').slice(0, 80), start: v.start, end: v.end })) : [] };
}
export function nextNumber(names, reserved = 0) {
  let max = Math.max(0, Number(reserved) || 0);
  for (const name of names) { const stem = String(name).replace(/\.[^.]+$/, ''); if (/^\d{1,9}$/.test(stem)) max = Math.max(max, Number(stem)); }
  return max + 1;
}
export function numberedName(number, original) {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(original);
  if (!match || !['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'].includes(match[1].toLowerCase())) throw new Error('Choose a video file (MP4, MOV, WebM, M4V, MKV, AVI or 3GP).');
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Could not allocate a video number.');
  return `${String(number).padStart(4, '0')}.${match[1].toLowerCase()}`;
}
export function formatTime(value) { const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function mapDriveFile(file, dance, folderId) {
  return { id: `drive:${file.id}`, provider: 'drive', providerId: file.id, dance, folderId, title: String(file.name || '').replace(/\.[^.]+$/, ''), filename: String(file.name || ''), addedAt: file.createdTime || new Date().toISOString(), updatedAt: file.modifiedTime || '', size: Number(file.size) || 0, duration: Number(file.videoMediaMetadata?.durationMillis) / 1000 || null, width: Number(file.videoMediaMetadata?.width) || null, height: Number(file.videoMediaMetadata?.height) || null, mimeType: file.mimeType || 'video/mp4' };
}
