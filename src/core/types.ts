import type { SourceNumbering } from "./numbering";
import { defaultReminders, type ReminderPreferences } from "./reminders";
export type DanceStyle = string;
export type DanceType = { id: string; name: string };
export type LearningStatus = "To learn" | "Practising" | "Learned";
export type Segment = { id: string; name: string; start: number; end: number };
export type Bookmark = { id: string; name: string; time: number };
export type Note = {
  id: string;
  text: string;
  time?: number;
  createdAt: string;
  kind?: "note" | "moment";
};
export type Video = {
  id: string;
  title: string;
  uri: string;
  thumbnail?: string;
  mimeType?: string;
  duration: number;
  size: number;
  style: DanceStyle;
  styleSet?: boolean;
  labels: string[];
  importance: number;
  ratingSet?: boolean;
  status: LearningStatus;
  teacher: string;
  className: string;
  location: string;
  lessonDate: string;
  createdAt: string;
  lastPractisedAt?: string;
  resume: number;
  segments: Segment[];
  bookmarks: Bookmark[];
  notes: Note[];
  available: boolean;
  source: "device" | "google-drive" | "dropbox" | "youtube";
  danceId?: string;
  youtube?: {
    id: string;
    channelId?: string;
    channelTitle?: string;
    sourceIds: string[];
    embedAllowed: boolean;
    unavailableReason?: string;
  };
  remote?: {
    connectionId: string;
    fileId: string;
    fileName?: string;
    sourceIds: string[];
    canDownload: boolean;
  };
  sharedGrantId?: string;
  offlineUri?: string;
  storagePreference?: "online" | "offline";
  parentId?: string;
};
export type PracticeSession = {
  id: string;
  startedAt: string;
  seconds: number;
  videoId?: string;
  videoIds?: string[];
};
export type Playlist = { id: string; name: string; videoIds: string[] };
export type Pick = {
  day: string;
  videoIds: string[];
  skipped: boolean;
  selectionKey?: string;
};
export type Preferences = {
  styles: DanceStyle[];
  labels: string[];
  picksEnabled: boolean;
  onePerStyle?: boolean;
  minPickRating?: number;
  weeklyMinutes: number;
  theme: "system" | "light" | "dark";
  cooldownDays: number;
  count: number;
  pickMix?: "dance" | "source";
  pickSourceIds?: string[];
  labelMatch?: "any" | "all";
  requirePickLabels?: boolean;
  includeYouTube?: boolean;
};
export type Connection = {
  id: string;
  provider: "google-drive" | "dropbox";
  accountId: string;
  email: string;
  name: string;
  writable: boolean;
  connected: boolean;
};
export type CloudFolder = {
  id: string;
  connectionId: string;
  provider: "google-drive" | "dropbox";
  folderId: string;
  name: string;
  defaultStyle: DanceStyle;
  defaultDanceId?: string;
  defaultLabels: string[];
  writable: boolean;
  numbering?: SourceNumbering;
  // Missing on older libraries: always opt out until explicitly enabled.
  numberUploads?: boolean;
  renameResult?: SourceRenameProgress & { updatedAt: string };
  lastSyncedAt?: string;
  error?: string;
};
export type SourceRenameProgress = {
  phase: "scanning" | "renaming" | "paused" | "complete";
  total: number;
  processed: number;
  renamed: number;
  alreadyNamed: number;
  pending: number;
  failures: { fileId: string; fileName: string; message: string }[];
};
export type Library = {
  version: 1;
  labels?: string[];
  schemaRevision?: number;
  danceTypes?: DanceType[];
  youtubeSources?: YouTubeSource[];
  youtubeSettings?: { apiKey: string };
  libraryView?: import("./library").LibraryView;
  practicePreferences?: import("./practiceQueue").PracticePreferences;
  activePractice?: import("./practiceQueue").ActivePractice;
  deviceLock: boolean;
  reminders: ReminderPreferences;
  connections: Connection[];
  sources: CloudFolder[];
  cloudSettings: { dropboxAppKey: string; wifiOnly: boolean };
  videos: Video[];
  sessions: PracticeSession[];
  playlists: Playlist[];
  picks: Pick[];
  feedback: Record<string, number>;
  preferences: Preferences;
};
export type YouTubeSource = {
  id: string;
  playlistId: string;
  name: string;
  defaultStyle: string;
  defaultDanceId?: string;
  defaultLabels: string[];
  videoIds: string[];
  lastSyncedAt?: string;
  limited?: boolean;
  error?: string;
};
export const emptyLibrary = (): Library => ({
  version: 1,
  deviceLock: false,
  reminders: defaultReminders(),
  connections: [],
  sources: [],
  cloudSettings: {
    dropboxAppKey: process.env.EXPO_PUBLIC_DROPBOX_APP_KEY ?? "",
    wifiOnly: true,
  },
  videos: [],
  sessions: [],
  playlists: [],
  picks: [],
  feedback: {},
  preferences: {
    styles: ["Bachata", "Salsa"],
    labels: [],
    picksEnabled: true,
    onePerStyle: true,
    minPickRating: 1,
    weeklyMinutes: 60,
    theme: "system",
    cooldownDays: 3,
    count: 1,
    pickMix: "dance",
  },
});
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
