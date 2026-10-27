import { assertUploadDestination } from "../../core/destination";
import { File, FileMode, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { accessToken } from "./accounts";
import { uploadFile, type PendingUpload } from "./uploadEngine";
import { vault } from "./vault";
import type { CloudFolder, Connection } from "../../core/types";
export async function uploadVideo(
  job: PendingUpload,
  uri: string,
  source: CloudFolder,
  connection: Connection,
  progress: (job: PendingUpload) => void,
  signal: AbortSignal,
) {
  assertUploadDestination(job, source, connection);
  if (!uri.startsWith(Paths.document.uri))
    throw new Error("Upload a BailaCue phone copy. Import this file first.");
  const file = new File(uri);
  if (!file.exists || file.size !== job.size)
    throw new Error("This local video is missing or changed. Import it again.");
  const handle = file.open(FileMode.ReadOnly);
  try {
    return await uploadFile(job, source.folderId, {
      token: () => accessToken(connection),
      read: async (start, end) => {
        handle.offset = start;
        // React Native Blob rejects ArrayBuffer/ArrayBufferView parts. Expo fetch
        // accepts bytes directly; reads stay bounded to the 2 MiB chunk size.
        return await handle.readBytes(end - start);
      },
      persist: async (next) => {
        await vault.set(`upload-${job.id}`, JSON.stringify(next));
        progress(next);
      },
      request: expoFetch as typeof fetch,
      signal,
    });
  } finally {
    handle.close();
  }
}
