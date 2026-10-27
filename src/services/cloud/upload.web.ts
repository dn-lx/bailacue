import type { Connection, CloudFolder } from "../../core/types";
import type { PendingUpload } from "./uploadEngine";
import type { RemoteVideo } from "../providers/types";
export async function uploadVideo(
  _job: PendingUpload,
  _uri: string,
  _source: CloudFolder,
  _connection: Connection,
  _progress: (job: PendingUpload) => void,
  _signal: AbortSignal,
): Promise<RemoteVideo> {
  throw new Error("Upload phone videos in the Android or iOS app.");
}
