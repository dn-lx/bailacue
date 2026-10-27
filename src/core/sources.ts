import { planNumbering, sourceStyle } from "./numbering";
import { v5 } from "uuid";
import type { CloudFolder, Connection, Library, Video } from "./types";
import type { RemoteVideo } from "../services/providers/types";
const namespace = "9deae7a6-f284-48fe-8e96-8e476a1bc985";
export function remoteId(connection: Connection, fileId: string) {
  return v5(
    `${connection.provider}:${connection.accountId}:${fileId}`,
    namespace,
  );
}
// Complete a whole paginated scan before reconciling: failed scans never mark missing files.
export function reconcileSource(
  library: Library,
  source: CloudFolder,
  files: RemoteVideo[],
  now = new Date().toISOString(),
): Library {
  const connection = library.connections.find(
    (c) => c.id === source.connectionId,
  );
  if (!connection)
    throw new Error("This storage account is no longer connected.");
  const plan = planNumbering(source, files);
  const seen = new Set(files.map((f) => f.fileId));
  const videos: Video[] = library.videos.map((v) => {
    if (
      !v.remote ||
      v.remote.connectionId !== connection.id ||
      !v.remote.sourceIds.includes(source.id) ||
      seen.has(v.remote.fileId)
    )
      return v;
    const sourceIds = v.remote.sourceIds.filter((id) => id !== source.id);
    return {
      ...v,
      available: sourceIds.length > 0,
      remote: { ...v.remote, sourceIds },
    };
  });
  const indexes = new Map(videos.map((v, index) => [v.id, index]));
  for (const file of files) {
    const id = remoteId(connection, file.fileId);
    const existing = indexes.get(id) ?? -1;
    if (existing >= 0) {
      const v = videos[existing];
      videos[existing] = {
        ...v,
        title: file.name.replace(/\.[^.]+$/, ""),
        style:
          v.styleSet !== true && v.style === source.defaultStyle
            ? sourceStyle(source)
            : v.style,
        available: true,
        sharedGrantId: undefined,
        duration: file.duration || v.duration,
        size: file.size,
        mimeType: file.mimeType,
        remote: {
          connectionId: connection.id,
          fileId: file.fileId,
          fileName: file.name,
          sourceIds: [...new Set([...(v.remote?.sourceIds ?? []), source.id])],
          canDownload: file.canDownload,
        },
      };
    } else {
      indexes.set(id, videos.length);
      videos.push({
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        uri: "",
        mimeType: file.mimeType,
        duration: file.duration,
        size: file.size,
        style: sourceStyle(source),
        styleSet: false,
        labels: [...source.defaultLabels],
        importance: 5,
        ratingSet: false,
        status: "To learn",
        teacher: "",
        className: source.name,
        location: "",
        lessonDate: "",
        createdAt: now,
        resume: 0,
        segments: [],
        bookmarks: [],
        notes: [],
        available: true,
        source: connection.provider,
        storagePreference: "online",
        remote: {
          connectionId: connection.id,
          fileId: file.fileId,
          fileName: file.name,
          sourceIds: [source.id],
          canDownload: file.canDownload,
        },
      });
    }
  }
  return {
    ...library,
    videos,
    sources: library.sources.map((s) =>
      s.id === source.id
        ? {
            ...source,
            numbering: plan.numbering,
            lastSyncedAt: now,
            error: source.error,
          }
        : s,
    ),
  };
}
export function parseFolder(provider: Connection["provider"], value: string) {
  const input = value.trim();
  if (provider === "dropbox") {
    if (!input || input === "/") return "";
    if (
      !input.startsWith("/") ||
      input.startsWith("//") ||
      input.includes("://")
    )
      throw new Error(
        "Enter a Dropbox folder path such as /Dance/Salsa, not a shared link.",
      );
    return input.replace(/\/$/, "");
  }
  let id = input;
  if (input.startsWith("https://")) {
    const url = new URL(input);
    if (url.hostname !== "drive.google.com")
      throw new Error("Use a Google Drive folder link.");
    id = /\/folders\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1] ?? "";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error("Paste a Google Drive folder link or folder ID.");
  return id;
}
