import { emptyLibrary, uid, type Library } from "./types";
import { metadataSnapshot, restoreSnapshot } from "./sync";
import { readDeviceLibrary } from "../services/local/libraryFormat";
export type PortableLibrary = ReturnType<typeof metadataSnapshot>;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export type BackupEnvelope = {
  format: "bailacue-backup";
  version: 1;
  id: string;
  createdAt: string;
  library: PortableLibrary;
  checksum: string;
};
const forbidden = new Set([
  "uri",
  "offlineUri",
  "thumbnail",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "password",
  "token",
  "apiKey",
  "sessionUrl",
  "deviceLock",
  "reminders",
  "cloudSettings",
  "activePractice",
]);
function safeTree(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error("The backup has too many nested fields.");
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (
      ["__proto__", "prototype", "constructor"].includes(key) ||
      forbidden.has(key)
    )
      throw new Error(
        "This backup contains device-only or credential fields and cannot be imported.",
      );
    safeTree(item, depth + 1);
  }
}
function records(value: unknown, name: string): Record<string, any>[] {
  if (
    !Array.isArray(value) ||
    value.length > 50000 ||
    value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
  )
    throw new Error("The backup has an invalid " + name + " list.");
  return value;
}
function text(
  value: unknown,
  name: string,
  max = 100000,
): asserts value is string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid " + name + " in backup.");
}
function strings(value: unknown, name: string) {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== "string" || v.length > 1000) ||
    value.length > 50000
  )
    throw new Error("Invalid " + name + " in backup.");
}
export function validatePortableLibrary(value: unknown): PortableLibrary {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose a BailaCue library backup.");
  safeTree(value);
  const raw = value as Record<string, any>;
  const allowed = new Set(Object.keys(metadataSnapshot(emptyLibrary())));
  if (Object.keys(raw).some((key) => !allowed.has(key)) || raw.version !== 1)
    throw new Error(
      "This backup format is not supported by this version of BailaCue.",
    );
  const defaults = metadataSnapshot(emptyLibrary());
  const data = { ...defaults, ...raw };
  for (const key of [
    "videos",
    "connections",
    "sources",
    "sessions",
    "playlists",
    "picks",
  ] as const)
    records(data[key], key);
  const ids = new Set<string>();
  for (const video of data.videos) {
    text(video.id, "video identity", 500);
    text(video.title, "video title");
    text(video.style, "dance");
    if (!video.id || ids.has(video.id))
      throw new Error("The backup has duplicate video identities.");
    ids.add(video.id);
    if (
      !["device", "google-drive", "dropbox", "youtube"].includes(video.source)
    )
      throw new Error("A backup video has an invalid source.");
    if (
      !Number.isFinite(video.duration) ||
      video.duration < 0 ||
      !Number.isFinite(video.importance) ||
      video.importance < 1 ||
      video.importance > 5
    )
      throw new Error("A backup video has an invalid duration or rating.");
    strings(video.labels, "video labels");
    for (const note of records(video.notes ?? [], "notes")) {
      text(note.id, "note identity");
      text(note.text, "note text");
      if (
        note.time !== undefined &&
        (!Number.isFinite(note.time) || note.time < 0)
      )
        throw new Error("A backup note has an invalid time.");
    }
    for (const segment of records(video.segments ?? [], "sections"))
      if (
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end <= segment.start
      )
        throw new Error("A backup section has an invalid range.");
    if (video.remote) {
      text(video.remote.connectionId, "storage connection");
      text(video.remote.fileId, "provider file");
      strings(video.remote.sourceIds, "source membership");
    }
    if (video.youtube && !/^[A-Za-z0-9_-]{11}$/.test(video.youtube.id))
      throw new Error("A backup has an invalid YouTube identity.");
  }
  for (const connection of data.connections) {
    text(connection.id, "connection identity");
    text(connection.accountId, "storage account");
    if (!["google-drive", "dropbox"].includes(connection.provider))
      throw new Error("Invalid storage provider in backup.");
  }
  for (const source of data.sources) {
    text(source.id, "folder identity");
    text(source.connectionId, "folder connection");
    text(source.folderId, "provider folder");
    strings(source.defaultLabels, "folder labels");
  }
  for (const collection of data.playlists) {
    text(collection.id, "collection identity");
    text(collection.name, "collection name");
    strings(collection.videoIds, "collection videos");
  }
  if (data.labels !== undefined) strings(data.labels, "label catalog");
  if (
    !data.preferences ||
    !["system", "light", "dark"].includes(data.preferences.theme) ||
    !Number.isFinite(data.preferences.weeklyMinutes) ||
    data.preferences.weeklyMinutes < 1
  )
    throw new Error("The backup contains invalid preferences.");
  const object = (value: unknown, name: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid " + name + " in backup.");
    return value as Record<string, any>;
  };
  const number = (
    value: unknown,
    name: string,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
  ) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new Error("Invalid " + name + " in backup.");
  };
  const boolean = (value: unknown, name: string) => {
    if (typeof value !== "boolean")
      throw new Error("Invalid " + name + " in backup.");
  };
  const unique = (items: Record<string, any>[], field = "id") => {
    const seen = new Set<string>();
    for (const item of items) {
      text(item[field], "record identity", 500);
      if (!item[field] || seen.has(item[field]))
        throw new Error("Duplicate or missing record identity in backup.");
      seen.add(item[field]);
    }
  };
  for (const key of [
    "connections",
    "sources",
    "sessions",
    "playlists",
  ] as const)
    unique(data[key]);
  unique(data.picks, "day");
  for (const video of data.videos) {
    if (!["To learn", "Practising", "Learned"].includes(video.status))
      throw new Error("Invalid learning status in backup.");
    for (const key of [
      "teacher",
      "className",
      "location",
      "lessonDate",
      "createdAt",
    ] as const)
      text(video[key], key);
    number(video.size, "video size");
    number(video.resume, "playback position");
    boolean(video.available, "video availability");
    if (video.ratingSet !== undefined)
      boolean(video.ratingSet, "rating status");
    if (video.styleSet !== undefined) boolean(video.styleSet, "dance status");
    for (const section of records(video.segments, "sections")) {
      text(section.id, "section identity");
      text(section.name, "section name");
    }
    for (const mark of records(video.bookmarks, "bookmarks")) {
      text(mark.id, "bookmark identity");
      text(mark.name, "bookmark name");
      number(mark.time, "bookmark time");
    }
    for (const note of records(video.notes, "notes"))
      text(note.createdAt, "note date");
    if (video.remote) {
      text(video.remote.connectionId, "connection identity");
      boolean(video.remote.canDownload, "download permission");
    }
    if (video.youtube) {
      strings(video.youtube.sourceIds, "YouTube sources");
      boolean(video.youtube.embedAllowed, "YouTube availability");
    }
  }
  for (const connection of data.connections) {
    text(connection.name, "account name");
    text(connection.email, "account email");
    boolean(connection.writable, "write access");
    boolean(connection.connected, "connection status");
  }
  for (const source of data.sources) {
    text(source.name, "folder name");
    text(source.defaultStyle, "folder dance");
    boolean(source.writable, "folder write access");
    if (!["google-drive", "dropbox"].includes(source.provider))
      throw new Error("Invalid folder provider.");
    if (source.numberUploads !== undefined)
      boolean(source.numberUploads, "numbering preference");
    if (source.numbering) {
      number(source.numbering.next, "next video number", 1);
      for (const entry of Object.values(
        object(source.numbering.files, "number allocations"),
      )) {
        const e = object(entry, "number allocation");
        number(e.number, "video number", 1);
        text(e.originalName, "original filename");
      }
    }
  }
  for (const dance of records(data.danceTypes ?? [], "dance types")) {
    text(dance.id, "dance identity");
    text(dance.name, "dance name");
  }
  unique(data.danceTypes ?? []);
  for (const source of records(data.youtubeSources ?? [], "YouTube sources")) {
    text(source.id, "playlist identity");
    text(source.playlistId, "YouTube playlist");
    text(source.name, "playlist name");
    text(source.defaultStyle, "playlist dance");
    strings(source.defaultLabels, "playlist labels");
    strings(source.videoIds, "playlist videos");
  }
  unique(data.youtubeSources ?? []);
  for (const session of data.sessions) {
    text(session.startedAt, "practice date");
    number(session.seconds, "practice duration");
    if (session.videoIds !== undefined)
      strings(session.videoIds, "practice videos");
  }
  for (const pick of data.picks) {
    text(pick.day, "pick day");
    strings(pick.videoIds, "daily videos");
    boolean(pick.skipped, "daily pick status");
  }
  for (const value of Object.values(object(data.feedback, "feedback")))
    number(value, "feedback", -1000000, 1000000);
  const p = object(data.preferences, "preferences");
  strings(p.styles, "preferred dances");
  strings(p.labels, "preferred labels");
  boolean(p.picksEnabled, "Daily Picks preference");
  number(p.weeklyMinutes, "weekly goal", 1, 10080);
  number(p.cooldownDays, "cooldown", 0, 3650);
  number(p.count, "daily count", 1, 100);
  if (p.minPickRating !== undefined)
    number(p.minPickRating, "minimum rating", 1, 5);
  if (p.pickSourceIds !== undefined)
    strings(p.pickSourceIds, "selected sources");
  for (const key of ["onePerStyle", "requirePickLabels", "includeYouTube"])
    if (p[key] !== undefined) boolean(p[key], key);
  if (p.pickMix !== undefined && !["dance", "source"].includes(p.pickMix))
    throw new Error("Invalid Daily Picks mode.");
  if (p.labelMatch !== undefined && !["any", "all"].includes(p.labelMatch))
    throw new Error("Invalid label match mode.");
  if (data.practicePreferences) {
    const p = object(data.practicePreferences, "practice preferences");
    number(p.minutes, "focus minutes", 1, 1440);
    number(p.breakMinutes, "break minutes", 0, 1440);
    strings(p.styles, "practice dances");
    strings(p.sourceIds, "practice sources");
    strings(p.labels, "practice labels");
    number(p.minRating, "practice rating", 1, 5);
    boolean(p.offlineOnly, "offline practice preference");
    if (!["any", "all"].includes(p.labelMatch))
      throw new Error("Invalid practice label match mode.");
  }
  // Re-allowlist the parsed structure; unknown video fields cannot become runtime state.
  return metadataSnapshot(
    readDeviceLibrary(
      JSON.stringify({
        ...emptyLibrary(),
        ...data,
        videos: data.videos.map((v) => ({ ...v, uri: "" })),
      }),
    ),
  );
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export async function createBackup(
  library: Library,
  digest: (text: string) => Promise<string>,
): Promise<BackupEnvelope> {
  const portable = validatePortableLibrary(metadataSnapshot(library));
  const content = {
    format: "bailacue-backup" as const,
    version: 1 as const,
    id: uid(),
    createdAt: new Date().toISOString(),
    library: portable,
  };
  const payload = canonical(content);
  if (new TextEncoder().encode(payload).byteLength > MAX_BACKUP_BYTES)
    throw new Error(
      "This metadata backup is larger than 25 MB. Reduce its size before exporting.",
    );
  return { ...content, checksum: await digest(payload) };
}
export async function readBackup(
  raw: string,
  digest: (text: string) => Promise<string>,
): Promise<BackupEnvelope> {
  if (raw.length > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large to import on this device.");
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large to import on this device.");
  let value: any;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The selected file is not a valid BailaCue backup.");
  }
  if (
    !value ||
    value.format !== "bailacue-backup" ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.checksum !== "string"
  )
    throw new Error("Choose a BailaCue backup file created by this app.");
  const { checksum, ...content } = value;
  if ((await digest(canonical(content))) !== checksum)
    throw new Error(
      "This backup is incomplete or has changed. Choose another backup; your library has not been replaced.",
    );
  return {
    ...content,
    checksum,
    library: validatePortableLibrary(content.library),
  } as BackupEnvelope;
}
export function mergeBackup(
  snapshot: PortableLibrary,
  local: Library,
  mode: "missing" | "backup",
): Library {
  const restored = restoreSnapshot(snapshot, local);
  function merge<T extends { id: string }>(current: T[], remote: T[]): T[] {
    const map = new Map(
      (mode === "backup" ? current : remote).map((v) => [v.id, v]),
    );
    for (const value of mode === "backup" ? remote : current)
      map.set(value.id, value);
    return [...map.values()];
  }
  return {
    ...(mode === "backup" ? restored : local),
    videos: merge(local.videos, restored.videos),
    sources: merge(local.sources, restored.sources),
    connections: merge(local.connections, restored.connections),
    playlists: merge(local.playlists, restored.playlists),
    sessions: merge(local.sessions, restored.sessions),
    youtubeSources: merge(
      local.youtubeSources ?? [],
      restored.youtubeSources ?? [],
    ),
    danceTypes: merge(local.danceTypes ?? [], restored.danceTypes ?? []),
    labels: [...new Set([...(local.labels ?? []), ...(restored.labels ?? [])])],
    feedback:
      mode === "backup"
        ? { ...local.feedback, ...restored.feedback }
        : { ...restored.feedback, ...local.feedback },
    activePractice: local.activePractice
      ? { ...local.activePractice, running: false }
      : undefined,
  };
}
