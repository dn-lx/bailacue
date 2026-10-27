import { effectiveRating, isUnrated } from "./ratings";
import { matchesLabels } from "./labels";
import {
  uid,
  type Library,
  type LearningStatus,
  type DanceStyle,
  type Video,
} from "./types";
export type Filters = {
  query?: string;
  style?: DanceStyle;
  status?: LearningStatus;
  minImportance?: number;
  ratings?: number[];
  includeUnrated?: boolean;
  labels?: string[];
  labelMatch?: "any" | "all";
  sourceId?: string;
};
export type LibrarySort =
  | "added-new"
  | "added-old"
  | "number-up"
  | "number-down"
  | "rating"
  | "rating-low"
  | "title-up"
  | "title-down";
export type LibraryView = Filters & { sort?: LibrarySort };
export function videoInSource(video: Video, id: string) {
  if (!id) return true;
  if (id === "phone") return video.source === "device" || !!video.offlineUri;
  if (id === "online")
    return (
      video.source === "youtube" ||
      (!!video.remote && video.storagePreference !== "offline")
    );
  return (
    !!video.remote?.sourceIds.includes(id) ||
    !!video.youtube?.sourceIds.includes(id)
  );
}
export function sortVideos(
  videos: Video[],
  sort: LibrarySort = "added-new",
): Video[] {
  const stamp = (s: string) =>
    Number.isFinite(Date.parse(s)) ? Date.parse(s) : 0;
  const number = (v: Video) =>
    /^\d+(?:\.[a-z0-9]+)?$/i.test(v.title.trim())
      ? Number(v.title.split(".")[0])
      : undefined;
  const tie = (a: Video, b: Video) =>
    (
      a.remote?.sourceIds[0] ??
      a.youtube?.sourceIds[0] ??
      "phone"
    ).localeCompare(
      b.remote?.sourceIds[0] ?? b.youtube?.sourceIds[0] ?? "phone",
    ) || a.id.localeCompare(b.id);
  return [...videos].sort((a, b) => {
    let order = 0;
    if (sort.startsWith("number")) {
      const x = number(a),
        y = number(b);
      if (x === undefined && y !== undefined) return 1;
      if (y === undefined && x !== undefined) return -1;
      order =
        x === undefined || y === undefined
          ? 0
          : (x - y) * (sort === "number-down" ? -1 : 1);
    } else if (sort === "rating" || sort === "rating-low")
      order =
        (effectiveRating(b) - effectiveRating(a)) *
        (sort === "rating-low" ? -1 : 1);
    else if (sort.startsWith("title"))
      order =
        a.title.localeCompare(b.title, undefined, { numeric: true }) *
        (sort === "title-down" ? -1 : 1);
    else {
      const x = stamp(a.createdAt),
        y = stamp(b.createdAt);
      if (!x && y) return 1;
      if (!y && x) return -1;
      order = (x - y) * (sort === "added-old" ? 1 : -1);
    }
    return order || tie(a, b);
  });
}
export function filterVideos(videos: Video[], f: Filters) {
  const terms = (f.query ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return videos.filter(
    (v) =>
      (!f.style || v.style === f.style) &&
      (!f.status || v.status === f.status) &&
      videoInSource(v, f.sourceId ?? "") &&
      matchesLabels(v.labels, f.labels ?? [], f.labelMatch) &&
      ((!f.ratings?.length && !f.includeUnrated) ||
        (isUnrated(v)
          ? !!f.includeUnrated
          : !!f.ratings?.includes(v.importance))) &&
      effectiveRating(v) >= (f.minImportance ?? 1) &&
      terms.every((term) =>
        [v.title, ...v.labels, v.teacher, v.className, v.location]
          .join(" ")
          .toLowerCase()
          .includes(term),
      ),
  );
}
export function removeVideo(library: Library, id: string): Library {
  return {
    ...library,
    videos: library.videos.filter((v) => v.id !== id),
    playlists: library.playlists.map((p) => ({
      ...p,
      videoIds: p.videoIds.filter((i) => i !== id),
    })),
    picks: library.picks.map((p) => ({
      ...p,
      videoIds: p.videoIds.filter((i) => i !== id),
    })),
    feedback: Object.fromEntries(
      Object.entries(library.feedback).filter(([key]) => key !== id),
    ),
  };
}

export function videoFromExport(
  original: Video,
  output: { uri: string; duration: number; size: number; thumbnail?: string },
): Video {
  return {
    ...original,
    ...output,
    thumbnail: output.thumbnail,
    id: uid(),
    parentId: original.id,
    title: `${original.title} · practice clip`,
    labels: [...new Set([...original.labels, "Practice clip"])],
    createdAt: new Date().toISOString(),
    status: "Practising",
    lastPractisedAt: undefined,
    resume: 0,
    notes: [],
    bookmarks: [],
    segments: [],
    source: "device",
    mimeType: "video/mp4",
    remote: undefined,
    sharedGrantId: undefined,
    offlineUri: undefined,
    storagePreference: undefined,
    available: true,
  };
}
