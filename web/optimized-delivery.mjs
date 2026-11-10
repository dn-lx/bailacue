// Owner-published free H.264/AAC Google Drive copies. Originals keep their IDs.
export const OPTIMIZED_ROOT = '1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ';
export const OPTIMIZED_FOLDERS = Object.freeze({
  Salsa: '1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f',
  Bachata: '1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq',
});
export const COMPRESSED_FOLDERS = Object.freeze({
  Salsa: '17Ndihr1QjepwPzVsBBWoA-2MowfPPAWa',
  Bachata: '12juoU5Gg7qLnkYJrTLVfeljqEEH4u8QX',
});
export function isOptimizedFolder(dance, folderId) {
  return Object.hasOwn(OPTIMIZED_FOLDERS, dance) &&
    (folderId === OPTIMIZED_FOLDERS[dance] || folderId === COMPRESSED_FOLDERS[dance]);
}
export const OPTIMIZED_PRESET = 'h264-aac-ladder-v2';
export const LEGACY_PRESET = 'h264-aac-faststart-720p-v1';
export const QUALITIES = Object.freeze(['360p','720p','1080p']);
const FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;
const SOURCE_ID = /^drive:[A-Za-z0-9_-]{10,100}$/;
const NAME = /^[A-Za-z0-9_.()-]{1,190}\.mp4$/i;

export function parseOptimizedManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.rootFolderId !== OPTIMIZED_ROOT || !Array.isArray(input.entries) ||
      input.entries.length > 1000 ||
      !((input.version === 1 && input.preset === LEGACY_PRESET) ||
        (input.version === 2 && input.preset === OPTIMIZED_PRESET))) return null;
  const entries = [], seenSources = new Set(), seenIds = new Set();
  for (const raw of input.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        !SOURCE_ID.test(raw.sourceId || '') ||
        !Object.hasOwn(OPTIMIZED_FOLDERS, raw.dance) ||
        seenSources.has(raw.sourceId)) return null;
    const legacy = input.version === 1;
    const variants = legacy ? [{ ...raw, quality: '720p' }] : raw.renditions;
    if (!Array.isArray(variants) || variants.length < 1 || variants.length > 3) return null;
    const seenQualities = new Set();
    for (const variant of variants) {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant) ||
          !QUALITIES.includes(variant.quality) ||
          !FILE_ID.test(variant.driveId || '') ||
          !isOptimizedFolder(raw.dance, variant.folderId) ||
          !Number.isSafeInteger(variant.size) || variant.size < 1024 ||
          variant.size > 2 * 1024 * 1024 * 1024 ||
          typeof variant.filename !== 'string' || !NAME.test(variant.filename) ||
          seenQualities.has(variant.quality) || seenIds.has(variant.driveId)) return null;
      seenQualities.add(variant.quality); seenIds.add(variant.driveId);
    }
    seenSources.add(raw.sourceId);
    if (legacy) entries.push({ ...raw });
    else entries.push({
      sourceId: raw.sourceId, dance: raw.dance,
      renditions: variants.map(v => ({
        quality: v.quality, driveId: v.driveId,
        folderId: v.folderId, filename: v.filename, size: v.size,
      })),
    });
  }
  return { version: input.version, rootFolderId: OPTIMIZED_ROOT, preset: input.preset, entries };
}

export function optimizedForSource(manifest, sourceId) {
  if (!manifest || !SOURCE_ID.test(sourceId || '')) return null;
  return manifest.entries.find(entry => entry.sourceId === sourceId) || null;
}

export function renditions(entry) {
  if (!entry) return [];
  return Array.isArray(entry.renditions) ? entry.renditions :
    (FILE_ID.test(entry.driveId || '') ? [{ quality: '720p', driveId: entry.driveId, folderId: entry.folderId, filename: entry.filename, size: entry.size }] : []);
}
export function chooseRendition(entry, quality = 'auto') {
  const options = renditions(entry);
  if (!options.length) return null;
  if (quality !== 'auto') {
    const exact = options.find(v => v.quality === quality);
    if (exact) return exact;
  }
  return options.find(v => v.quality === '720p') ||
    options.find(v => v.quality === '360p') || options[0];
}

export function asOptimizedFile(entry, selected = chooseRendition(entry)) {
  if (!entry || !selected || !SOURCE_ID.test(entry.sourceId || '')) return null;
  return {
    id: 'drive:' + selected.driveId,
    provider: 'drive', providerId: selected.driveId,
    dance: entry.dance, folderId: selected.folderId,
    filename: selected.filename, size: selected.size, sourceId: entry.sourceId,
    optimizedPreset: Array.isArray(entry.renditions) ? OPTIMIZED_PRESET : LEGACY_PRESET,
  };
}
