import * as Network from "expo-network";
import type { VideoSource } from "expo-video";
import type { Library, Video } from "../../core/types";
import { resolveMedia, deleteMedia } from "../media";
import { provider } from "./provider";
import { ProviderError } from "../providers/types";
export class RevokedAccess extends Error {}
async function removeDownload(video: Video) {
  if (video.offlineUri) await deleteMedia(video.offlineUri);
  if (video.thumbnail?.startsWith("file:")) await deleteMedia(video.thumbnail);
}
export async function resolveVideo(
  video: Video,
  library: Library,
): Promise<VideoSource> {
  if (!video.remote) return resolveMedia(video.uri);
  if (video.sharedGrantId)
    throw new Error(
      "Reconnect this older shared video from your Drive or Dropbox folder. Your notes and phone copy are kept.",
    );
  const connection = library.connections.find(
    (c) => c.id === video.remote!.connectionId && c.connected,
  );
  if (!connection)
    throw new Error(
      "Reconnect this video’s storage account in Storage. Your notes are kept.",
    );
  if (video.offlineUri && video.storagePreference === "offline") {
    // Check revoked access whenever online. A provider outage still permits the chosen phone copy.
    try {
      const network = await Network.getNetworkStateAsync();
      if (network.isConnected && network.isInternetReachable !== false)
        await provider(connection).playback(video.remote.fileId);
    } catch (error) {
      if (
        error instanceof ProviderError &&
        ["permission", "missing", "reauth"].includes(error.code)
      ) {
        await removeDownload(video);
        throw new RevokedAccess(
          "Storage access was removed. The downloaded copy was removed. Reconnect or check permission with the owner.",
        );
      }
      // An expired/replaced Google account is not an offline network error.
      if (!(error instanceof TypeError) && !(error instanceof ProviderError))
        throw error;
    }
    return resolveMedia(video.offlineUri);
  }
  if (!video.available)
    throw new Error(
      "This video is no longer in a connected folder. Refresh Storage or reconnect its folder.",
    );
  const address = await provider(connection).playback(video.remote.fileId);
  return { ...address, useCaching: false };
}
