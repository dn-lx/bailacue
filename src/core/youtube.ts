import { uniqueLabels } from "./labels";
import { uid, type Library, type YouTubeSource } from "./types";
export type YouTubeLink = { kind: "video" | "playlist"; id: string };
export function parseYouTubeLink(
  input: string,
  choice?: "video" | "playlist",
): YouTubeLink {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste a full YouTube video or public playlist link.");
  }
  if (
    url.protocol !== "https:" ||
    ![
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ].includes(url.hostname)
  )
    throw new Error("Use an HTTPS link from YouTube.");
  const playlist = url.searchParams.get("list");
  const video =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : url.searchParams.get("v") ||
        url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
  if (
    playlist &&
    /^[\w-]{10,120}$/.test(playlist) &&
    video &&
    /^[\w-]{11}$/.test(video) &&
    !choice
  )
    throw new Error(
      "This link contains a video and a playlist. Choose which to preview.",
    );
  if (playlist && /^[\w-]{10,120}$/.test(playlist) && choice !== "video")
    return { kind: "playlist", id: playlist };
  if (video && /^[\w-]{11}$/.test(video)) return { kind: "video", id: video };
  throw new Error(
    "Use a single-video or public-playlist link. Channel and private-playlist imports are not supported.",
  );
}
export type YouTubeMetadata = {
  id: string;
  title: string;
  channelTitle?: string;
  channelId?: string;
  thumbnail?: string;
  duration?: number;
  available: boolean;
  embedAllowed: boolean;
  error?: string;
};
export const beginnerCatalogVersion = 1;
export const beginnerYouTube = [
  {
    id: "owner:bachata-tutorials",
    type: "playlist",
    language: "Not specified",
    order: 1,
    enabled: true,
    title: "Bachata Tutorials",
    author: "Roberto & Magdalena Bachata",
    style: "Bachata",
    level: "Beginner",
    url: "https://www.youtube.com/playlist?list=PL2E0b6twkkHkMemtovF3zHgo95pURUUmy",
    playlistId: "PL2E0b6twkkHkMemtovF3zHgo95pURUUmy",
    description:
      "An optional starting point selected by BailaCue’s owner. Preview it and decide whether to add it to your library.",
  },
];
/** Keep personal edits and stable IDs; refresh membership independently of metadata fetch success. */
export function importYouTube(
  l: Library,
  items: YouTubeMetadata[],
  style: string,
  labels: string[],
  source?: YouTubeSource,
  complete = true,
): Library {
  const sourceId = source?.id;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const videos = l.videos.map((v) => {
    if (!v.youtube) return v;
    const item = itemsById.get(v.youtube.id);
    const sourceIds = sourceId
      ? uniqueLabels([
          ...(complete
            ? v.youtube.sourceIds.filter((id) => id !== sourceId)
            : v.youtube.sourceIds),
          ...(source?.videoIds.includes(v.youtube.id) ? [sourceId] : []),
        ])
      : v.youtube.sourceIds;
    if (!item) return { ...v, youtube: { ...v.youtube, sourceIds } };
    itemsById.delete(item.id);
    // A temporary metadata/network failure does not revoke a previously playable video.
    return {
      ...v,
      ...(item.available && !item.error
        ? {
            title: item.title,
            thumbnail: item.thumbnail ?? v.thumbnail,
            available: true,
            duration: item.duration || v.duration,
          }
        : item.available
          ? {}
          : { available: false }),
      youtube: {
        ...v.youtube,
        sourceIds,
        channelTitle: item.channelTitle ?? v.youtube.channelTitle,
        channelId: item.channelId ?? v.youtube.channelId,
        embedAllowed: !item.available
          ? false
          : item.error
            ? v.youtube.embedAllowed
            : item.embedAllowed,
        unavailableReason: item.error,
      },
    };
  });
  for (const item of itemsById.values()) {
    videos.push({
      id: uid(),
      title: item.title,
      uri: "",
      thumbnail: item.thumbnail,
      duration: item.duration ?? 0,
      size: 0,
      style,
      styleSet: true,
      danceId: l.danceTypes?.find((d) => d.name === style)?.id,
      labels: uniqueLabels(labels),
      importance: 5,
      ratingSet: false,
      status: "To learn",
      teacher: "",
      className: "",
      location: "",
      lessonDate: "",
      createdAt: new Date().toISOString(),
      resume: 0,
      segments: [],
      bookmarks: [],
      notes: [],
      available: item.available,
      source: "youtube",
      storagePreference: "online",
      youtube: {
        id: item.id,
        channelTitle: item.channelTitle,
        channelId: item.channelId,
        sourceIds: sourceId ? [sourceId] : [],
        embedAllowed: item.embedAllowed,
        unavailableReason: item.error,
      },
    });
  }
  return {
    ...l,
    videos,
    youtubeSources: source
      ? [...(l.youtubeSources ?? []).filter((s) => s.id !== source.id), source]
      : l.youtubeSources,
  };
}
