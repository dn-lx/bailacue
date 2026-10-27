export interface Video {
  id: string;
  provider: string;
  providerId: string;
  dance: string;
  title: string;
  kind?: string;
  url?: string;
  filename?: string;
  addedAt?: string;
  updatedAt?: string;
  size?: number;
  folderId?: string;
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
}
export interface Metadata {
  rating?: number | null;
  favorite?: boolean;
  notes?: string;
  title?: string;
  status?: string;
  lastPractised?: string | null;
  labelIds?: string[];
  artistIds?: string[];
  recordedAt?: string;
  event?: string;
  location?: string;
  bpm?: number;
  loops?: { id: string; name: string; start: number; end: number }[];
}
export interface Label { id: string; name: string; type: string; dance: string }
export interface State {
  version: number;
  meta: Record<string, Metadata>;
  youtube: Video[];
  drive: Video[];
  labels: Label[];
  numbering: Record<string, number>;
  googleClientId: string;
  playerSize: number;
  queue: string[];
  history: { id: string; at: string }[];
  daily: { day: string; ids: string[] } | null;
  theme: string;
}
export interface Filters {
  query?: string;
  dance?: string;
  provider?: string;
  favorite?: boolean;
  rating?: string;
  sort?: string;
  labelIds?: string[];
  artistIds?: string[];
}

export {};
