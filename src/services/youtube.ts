import type { YouTubeMetadata } from "../core/youtube";
const ROOT = "https://www.googleapis.com/youtube/v3/";
async function json(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  let response: Response, body;
  try {
    response = await fetch(url, { signal: controller.signal });
    body = await response.json().catch(() => null);
  } catch {
    if (signal?.aborted)
      throw new Error("Import cancelled. Your library has not changed.");
    throw new Error(
      "YouTube could not be reached within 15 seconds. Check your connection and retry.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
  if (!response.ok)
    throw new Error(
      body?.error?.message ??
        `YouTube returned ${response.status}. Check that the playlist is public and try again.`,
    );
  if (!body)
    throw new Error(
      "YouTube returned an unreadable response. Check the link’s visibility and try again online.",
    );
  return body;
}
export async function videoMetadata(
  id: string,
  signal?: AbortSignal,
): Promise<YouTubeMetadata> {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid YouTube video ID.");
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const data = await json(url, signal);
  return {
    id,
    title: data.title,
    channelTitle: data.author_name,
    thumbnail: data.thumbnail_url,
    available: true,
    embedAllowed: true,
  };
}
export async function playlistMetadata(
  id: string,
  key: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ part: "snippet", id, key });
  const data = await json(`${ROOT}playlists?${query}`, signal);
  if (!data.items?.length)
    throw new Error("The playlist was not found. Make sure it is public.");
  return {
    title: String(data.items[0].snippet.title),
    author: String(data.items[0].snippet.channelTitle),
  };
}
/** Official Data API, all pages in order. API key stays on this device and is excluded from sync. */
export async function playlistItems(
  id: string,
  key: string,
  signal?: AbortSignal,
  onProgress?: (count: number) => void,
): Promise<YouTubeMetadata[]> {
  const result: YouTubeMetadata[] = [],
    seen = new Set<string>(),
    pages = new Set<string>();
  let page = "";
  do {
    const query = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: id,
      maxResults: "50",
      key,
      ...(page ? { pageToken: page } : {}),
    });
    const data = await json(`${ROOT}playlistItems?${query}`, signal);
    if (!Array.isArray(data.items))
      throw new Error(
        "YouTube did not return playlist contents. Check YouTube Data API v3 setup and retry.",
      );
    for (const row of data.items ?? []) {
      const s = row.snippet,
        videoId = row.contentDetails?.videoId ?? s?.resourceId?.videoId;
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      const unavailable = ["Private video", "Deleted video"].includes(s.title);
      result.push({
        id: videoId,
        title: s.title,
        channelTitle: s.videoOwnerChannelTitle,
        channelId: s.videoOwnerChannelId,
        thumbnail: s.thumbnails?.medium?.url,
        available: !unavailable,
        embedAllowed: !unavailable,
        error: unavailable ? "Private or deleted video" : undefined,
      });
    }
    onProgress?.(result.length);
    page = data.nextPageToken ?? "";
    if (page && pages.has(page))
      throw new Error("YouTube repeated a page. Retry the playlist refresh.");
    pages.add(page);
    if (result.length > 5000)
      throw new Error(
        "This playlist exceeds the 5,000-video import limit. Add smaller playlists.",
      );
  } while (page);
  return result;
}

/** Contents are the essential operation; an unavailable playlist title must not block adding videos. */
export async function readPlaylist(
  id: string,
  key: string,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
) {
  const items = await playlistItems(id, key, signal, onProgress);
  if (!items.length)
    throw new Error(
      "This playlist contains no readable videos. Check that it is public and not empty.",
    );
  let title: string | undefined;
  try {
    title = (await playlistMetadata(id, key, signal)).title;
  } catch {
    if (signal.aborted)
      throw new Error("Import cancelled. Your library has not changed.");
  }
  return { items, title, complete: true as const };
}
export async function embeddedPlaylistMetadata(
  ids: string[],
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<YouTubeMetadata[]> {
  const result: YouTubeMetadata[] = [];
  for (let start = 0; start < ids.length; start += 4) {
    if (signal.aborted)
      throw new Error("Import cancelled. Your library has not changed.");
    result.push(
      ...(await Promise.all(
        ids.slice(start, start + 4).map(async (id) => {
          try {
            return await videoMetadata(id, signal);
          } catch (e) {
            if (signal.aborted) throw e;
            return {
              id,
              title: `YouTube ${id}`,
              available: true,
              embedAllowed: true,
              error:
                "Metadata could not be loaded. Preview this video before adding it.",
            };
          }
        }),
      )),
    );
    onProgress?.(result.length, ids.length);
  }
  return result;
}
