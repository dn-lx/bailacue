import type { CloudFolder, Connection, Library, Video } from "./types";
import type { PendingUpload } from "../services/cloud/uploadEngine";
import type { RemoteVideo } from "../services/providers/types";
import { safeVideoName, sourceStyle } from "./numbering";
import { remoteId } from "./sources";

export type SaveDestination = {
  mode: "device" | "cloud";
  sourceId: string;
  keepCopy: boolean;
};
export const phoneDestination = (): SaveDestination => ({
  mode: "device",
  sourceId: "",
  keepCopy: true,
});
export function uploadNaming(
  source: CloudFolder,
  title: string,
  extension: string,
) {
  const name = safeVideoName(`${title}.${extension}`);
  return {
    name,
    originalName: name,
    numberedNames: source.numberUploads === true,
  };
}
export function clipDestination(video: Video): SaveDestination {
  if (video.remote && video.storagePreference !== "offline")
    return {
      mode: "cloud",
      sourceId:
        video.remote.sourceIds.length === 1 ? video.remote.sourceIds[0] : "",
      keepCopy: false,
    };
  return phoneDestination();
}
export function uploadDestination(library: Library, sourceId: string) {
  const source = library.sources.find((s) => s.id === sourceId);
  const connection = library.connections.find(
    (c) => c.id === source?.connectionId,
  );
  if (
    !source ||
    !connection?.connected ||
    !source.writable ||
    !connection.writable
  )
    throw new Error(
      "Choose a connected folder with upload permission. Allow uploads for this account in Storage first.",
    );
  return { source, connection };
}
export function assertUploadDestination(
  job: PendingUpload,
  source: CloudFolder,
  connection: Connection,
) {
  if (
    job.sourceId !== source.id ||
    (job.connectionId !== undefined && job.connectionId !== connection.id) ||
    (job.accountId !== undefined && job.accountId !== connection.accountId) ||
    source.connectionId !== connection.id ||
    job.provider !== connection.provider ||
    source.provider !== connection.provider ||
    (job.folderId !== undefined && job.folderId !== source.folderId)
  )
    throw new Error(
      "The upload destination changed. Resume with the original account and folder; no file was sent.",
    );
  if (!connection.connected || !connection.writable || !source.writable)
    throw new Error(
      "This destination needs a connected account with upload permission.",
    );
}
export function registerUpload(
  library: Library,
  videoId: string,
  source: CloudFolder,
  connection: Connection,
  file: RemoteVideo,
  keepCopy: boolean,
  number?: number,
  intendedName?: string,
): Library {
  const video = library.videos.find((v) => v.id === videoId);
  if (!video) throw new Error("The phone video is no longer in this library.");
  const id = remoteId(connection, file.fileId);
  return {
    ...library,
    videos: [
      {
        ...video,
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        style: sourceStyle(source),
        styleSet: false,
        source: connection.provider,
        uri: "",
        offlineUri: keepCopy ? video.uri : undefined,
        thumbnail: keepCopy ? video.thumbnail : undefined,
        storagePreference: keepCopy ? "offline" : "online",
        remote: {
          connectionId: connection.id,
          fileId: file.fileId,
          fileName: file.name,
          sourceIds: [source.id],
          canDownload: file.canDownload,
        },
        available: true,
      },
      ...library.videos.filter((v) => v.id !== videoId && v.id !== id),
    ],
    sources: number
      ? library.sources.map((s) =>
          s.id === source.id
            ? {
                ...s,
                numbering: {
                  next: Math.max(s.numbering?.next ?? 1, number + 1),
                  files: {
                    ...Object.fromEntries(
                      Object.entries(s.numbering?.files ?? {}).filter(
                        ([key, entry]) =>
                          !key.startsWith("upload:") || entry.number !== number,
                      ),
                    ),
                    [file.fileId]: {
                      number,
                      originalName: (intendedName ?? file.name).replace(
                        /^\d{4,}\s+[—-]\s+/,
                        "",
                      ),
                    },
                  },
                },
              }
            : s,
        )
      : library.sources,
    playlists: library.playlists.map((p) => ({
      ...p,
      videoIds: [...new Set(p.videoIds.map((v) => (v === videoId ? id : v)))],
    })),
    picks: library.picks.map((p) => ({
      ...p,
      videoIds: p.videoIds.map((v) => (v === videoId ? id : v)),
    })),
    sessions: library.sessions.map((s) =>
      s.videoId === videoId ? { ...s, videoId: id } : s,
    ),
    feedback:
      videoId in library.feedback
        ? {
            ...Object.fromEntries(
              Object.entries(library.feedback).filter(
                ([key]) => key !== videoId,
              ),
            ),
            [id]: library.feedback[videoId],
          }
        : library.feedback,
  };
}
