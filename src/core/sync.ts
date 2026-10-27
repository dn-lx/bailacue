import { emptyLibrary, type Library } from "./types";
import { migrateLibrary } from "./dances";
import { libraryLabels } from "./labels";
// Explicitly allow fields: never send local paths, OAuth/session credentials or upload jobs.
export function metadataSnapshot(library: Library) {
  return {
    version: 1,
    labels: libraryLabels(library),
    practicePreferences: library.practicePreferences,
    danceTypes: library.danceTypes,
    youtubeSources: library.youtubeSources,
    videos: library.videos.map((v) => ({
      id: v.id,
      title: v.title,
      duration: v.duration,
      mimeType: v.mimeType,
      size: v.size,
      style: v.style,
      styleSet: v.styleSet,
      danceId: v.danceId,
      youtube: v.youtube,
      labels: v.labels,
      importance: v.importance,
      ratingSet: v.ratingSet,
      status: v.status,
      teacher: v.teacher,
      className: v.className,
      location: v.location,
      lessonDate: v.lessonDate,
      createdAt: v.createdAt,
      lastPractisedAt: v.lastPractisedAt,
      resume: v.resume,
      segments: v.segments,
      bookmarks: v.bookmarks,
      notes: v.notes,
      available: v.source === "device" ? false : v.available,
      source: v.source,
      parentId: v.parentId,
      remote: v.remote,
    })),
    connections: library.connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      accountId: c.accountId,
      name: c.name,
      email: c.email,
      writable: false,
      connected: false,
    })),
    sources: library.sources.map((s) => ({
      id: s.id,
      connectionId: s.connectionId,
      provider: s.provider,
      folderId: s.folderId,
      name: s.name,
      defaultStyle: s.defaultStyle,
      defaultDanceId: s.defaultDanceId,
      defaultLabels: s.defaultLabels,
      writable: s.writable,
      numbering: s.numbering,
      numberUploads: s.numberUploads,
      lastSyncedAt: s.lastSyncedAt,
    })),
    sessions: library.sessions,
    playlists: library.playlists,
    picks: library.picks,
    feedback: library.feedback,
    preferences: library.preferences,
  };
}
export function restoreSnapshot(
  snapshot: ReturnType<typeof metadataSnapshot>,
  local: Library,
): Library {
  return migrateLibrary({
    ...emptyLibrary(),
    ...snapshot,
    version: 1,
    cloudSettings: local.cloudSettings,
    deviceLock: local.deviceLock,
    reminders: local.reminders,
    youtubeSettings: local.youtubeSettings,
    libraryView: local.libraryView,
    practicePreferences:
      snapshot.practicePreferences ?? local.practicePreferences,
    activePractice: local.activePractice
      ? { ...local.activePractice, running: false }
      : undefined,
    connections: snapshot.connections.map((c) => {
      const own = local.connections.find(
        (own) =>
          own.id === c.id &&
          own.provider === c.provider &&
          own.accountId === c.accountId,
      );
      return {
        ...c,
        connected: !!own?.connected,
        writable: own?.writable ?? false,
      };
    }),
    videos: snapshot.videos.map((v) => {
      const own = local.videos.find((l) => l.id === v.id);
      return {
        ...v,
        uri: own?.uri ?? "",
        offlineUri: own?.offlineUri,
        thumbnail: own?.thumbnail,
        storagePreference: own?.storagePreference ?? "online",
        available: v.youtube || v.remote ? v.available : !!own?.uri,
      };
    }),
  });
}
