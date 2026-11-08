// Free FFmpeg H.264/AAC Google Drive renditions. A single owner-published
// manifest connects each original stable BailaCue video ID to a derived copy.
// Only the two dedicated derived folders are permitted.
export const OPTIMIZED_ROOT = '1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ';
export const OPTIMIZED_FOLDERS = Object.freeze({
  Salsa: '1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f',
  Bachata: '1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq',
});
export const OPTIMIZED_PRESET = 'h264-aac-faststart-720p-v1';
const FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;
const SOURCE_ID = /^drive:[A-Za-z0-9_-]{10,100}$/;

export function parseOptimizedManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.version !== 1 || input.rootFolderId !== OPTIMIZED_ROOT ||
      input.preset !== OPTIMIZED_PRESET || !Array.isArray(input.entries) ||
      input.entries.length > 1000) return null;
  const entries = [], seenOriginal = new Set(), seenCopy = new Set();
  for (const raw of input.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        !SOURCE_ID.test(raw.sourceId || '') || !FILE_ID.test(raw.driveId || '') ||
        !Object.hasOwn(OPTIMIZED_FOLDERS, raw.dance) ||
        raw.folderId !== OPTIMIZED_FOLDERS[raw.dance] ||
        !Number.isSafeInteger(raw.size) || raw.size < 1024 ||
        raw.size > 2 * 1024 * 1024 * 1024 ||
        typeof raw.filename !== 'string' ||
        !/^[A-Za-z0-9_.()-]{1,190}\.mp4$/i.test(raw.filename) ||
        seenOriginal.has(raw.sourceId) || seenCopy.has(raw.driveId)) return null;
    seenOriginal.add(raw.sourceId); seenCopy.add(raw.driveId);
    entries.push({
      sourceId: raw.sourceId, driveId: raw.driveId,
      dance: raw.dance, folderId: raw.folderId, filename: raw.filename, size: raw.size,
    });
  }
  return { version: 1, rootFolderId: OPTIMIZED_ROOT, preset: OPTIMIZED_PRESET, entries };
}

export function optimizedForSource(manifest, sourceId) {
  if (!manifest || !SOURCE_ID.test(sourceId || '')) return null;
  return manifest.entries.find(entry => entry.sourceId === sourceId) || null;
}

export function asOptimizedFile(entry) {
  if (!entry) return null;
  return {
    id: 'drive:' + entry.driveId,
    provider: 'drive',
    providerId: entry.driveId,
    dance: entry.dance,
    folderId: entry.folderId,
    filename: entry.filename,
    size: entry.size,
    sourceId: entry.sourceId,
    optimizedPreset: OPTIMIZED_PRESET,
  };
}
