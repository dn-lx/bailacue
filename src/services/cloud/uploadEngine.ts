import { safeVideoName } from "../../core/numbering";
import { mapDriveVideo } from "../providers/googleDrive";
import { mapDropboxVideo } from "../providers/dropbox";
import {
  ProviderError,
  type RemoteVideo,
  type UploadJob,
} from "../providers/types";
import { chunkSize, resumeUpload, type UploadChunk } from "../providers/upload";
export type PendingUpload = {
  id: string;
  videoId: string;
  sourceId: string;
  folderId?: string;
  connectionId?: string;
  accountId?: string;
  provider: "google-drive" | "dropbox";
  name: string;
  sequenceNumber?: number;
  numberedNames?: boolean;
  originalName?: string;
  mimeType: string;
  size: number;
  fileId: string;
  offset: number;
  sessionUrl?: string;
  sessionId?: string;
  path?: string;
  status: "queued" | "uploading" | "interrupted" | "ready";
  keepCopy: boolean;
};
type Transport = {
  token: () => Promise<string>;
  read: (start: number, end: number) => Promise<UploadChunk>;
  persist: (job: PendingUpload) => Promise<void>;
  request?: typeof fetch;
  signal?: AbortSignal;
};
function ascii(value: unknown) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export async function uploadFile(
  input: PendingUpload,
  folderId: string,
  transport: Transport,
): Promise<RemoteVideo> {
  if (input.folderId !== undefined && input.folderId !== folderId)
    throw new Error("The original upload folder changed. No file was sent.");
  const { token, read, persist, signal } = transport;
  const request = transport.request ?? fetch;
  let job = { ...input };
  const save = async (patch: Partial<PendingUpload>) => {
    job = { ...job, ...patch };
    await persist(job);
  };
  const headers = async () => ({ Authorization: `Bearer ${await token()}` });
  const ensure = async (response: Response) => {
    if (response.status === 401)
      throw new ProviderError(
        "Reconnect your storage account, then retry this upload.",
        "reauth",
      );
    if (response.status === 403)
      throw new ProviderError(
        "This folder does not allow uploads. Choose a writable folder.",
        "permission",
      );
    if (!response.ok)
      throw new ProviderError(
        "The upload was interrupted. Retry to resume the same file.",
        "network",
      );
    return response;
  };
  try {
    if (signal?.aborted) throw new Error("Upload paused.");
    if (job.provider === "google-drive") {
      if (!job.fileId) {
        const response = await ensure(
          await request(
            "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files",
            { headers: await headers(), signal },
          ),
        );
        const { ids } = (await response.json()) as { ids: string[] };
        if (!ids?.[0]) throw new Error("Drive did not reserve a file ID.");
        await save({ fileId: ids[0] });
      }
      const metadataUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(job.fileId)}?fields=id,name,mimeType,size,modifiedTime,videoMediaMetadata,capabilities(canDownload)&supportsAllDrives=true`;
      const existing = await request(metadataUrl, {
        headers: await headers(),
        signal,
      });
      if (existing.ok) {
        const file = mapDriveVideo(await existing.json());
        if (file.size !== job.size)
          throw new Error(
            "The reserved Drive file has a different size. No file was overwritten.",
          );
        await save({ offset: job.size, status: "ready" });
        return file;
      }
      if (existing.status !== 404) await ensure(existing);
      if (!job.sessionUrl) {
        const response = await ensure(
          await request(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
            {
              method: "POST",
              headers: {
                ...(await headers()),
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": job.mimeType,
                "X-Upload-Content-Length": String(job.size),
              },
              body: JSON.stringify({
                id: job.fileId,
                name: job.name,
                parents: [folderId],
                mimeType: job.mimeType,
              }),
              signal,
            },
          ),
        );
        const sessionUrl = response.headers.get("Location");
        if (!sessionUrl)
          throw new Error("Drive did not start an upload session.");
        await save({ sessionUrl, offset: 0 });
      }
      try {
        await resumeUpload(
          job as UploadJob,
          read,
          async (next) =>
            save({
              offset: next.offset,
              status: next.status === "failed" ? "interrupted" : next.status,
            }),
          token,
          request,
          signal,
        );
      } catch (error) {
        if (error instanceof ProviderError && error.code === "missing")
          await save({ sessionUrl: undefined, offset: 0 });
        throw error;
      }
      const confirmed = await ensure(
        await request(metadataUrl, { headers: await headers(), signal }),
      );
      const file = mapDriveVideo(await confirmed.json());
      if (file.size !== job.size)
        throw new Error(
          "Drive has not confirmed the complete video. Retry to reconcile.",
        );
      await save({ status: "ready", offset: job.size });
      return file;
    }
    if (!job.path) {
      // Upload to a job-unique staging name. A readable numbered name is applied
      // by stable file ID only after confirmation; an unrelated same-size file
      // must never be mistaken for a completed upload.
      const safeName = safeVideoName(`${job.id}-${job.name}`);
      await save({
        path: `${folderId === "/" ? "" : folderId}/${safeName}`,
      });
    }
    const metadata = await request(
      "https://api.dropboxapi.com/2/files/get_metadata",
      {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({
          path: job.fileId || job.path,
          include_media_info: true,
        }),
        signal,
      },
    );
    if (metadata.ok) {
      const file = mapDropboxVideo(await metadata.json());
      if (job.fileId && file.fileId !== job.fileId)
        throw new Error(
          "Dropbox returned a different file identity. No file was overwritten.",
        );
      if (file.size !== job.size)
        throw new Error(
          "The Dropbox destination already has a different file. No file was overwritten.",
        );
      await save({ fileId: file.fileId, offset: job.size, status: "ready" });
      return file;
    }
    if (metadata.status !== 409) await ensure(metadata);
    if (job.fileId)
      throw new Error(
        "The confirmed Dropbox video could not be found. Reconnect and retry; no duplicate was uploaded.",
      );
    const content = async (
      endpoint: string,
      arg: unknown,
      body?: UploadChunk,
    ) =>
      request(`https://content.dropboxapi.com/2/files/${endpoint}`, {
        method: "POST",
        headers: {
          ...(await headers()),
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": ascii(arg),
        },
        body: body ?? new Uint8Array(0),
        signal,
      });
    if (!job.sessionId) {
      const response = await ensure(
        await content("upload_session/start", { close: false }),
      );
      const data = (await response.json()) as { session_id: string };
      if (!data.session_id)
        throw new Error("Dropbox did not start an upload session.");
      await save({ sessionId: data.session_id, offset: 0 });
    }
    while (job.offset < job.size) {
      if (signal?.aborted) throw new Error("Upload paused.");
      const before = job.offset,
        end = Math.min(job.size, before + 2 * 1024 * 1024);
      const body = await read(before, end);
      if (chunkSize(body) !== end - before)
        throw new Error("The local video changed or is missing.");
      const response = await content(
        "upload_session/append_v2",
        { cursor: { session_id: job.sessionId, offset: before }, close: false },
        body,
      );
      if (response.status === 409) {
        const error = (await response.json()) as {
          error?: { ".tag"?: string; correct_offset?: number };
        };
        const offset = error.error?.correct_offset;
        if (
          Number.isSafeInteger(offset) &&
          offset! >= 0 &&
          offset! <= job.size &&
          offset !== before
        ) {
          await save({ offset });
          continue;
        }
        if (
          error.error?.[".tag"] === "not_found" ||
          error.error?.[".tag"] === "closed"
        )
          await save({ sessionId: undefined, offset: 0 });
        throw new Error(
          "Dropbox could not resume this session. Retry to check the same destination and restart safely.",
        );
      }
      await ensure(response);
      await save({ offset: end, status: "uploading" });
    }
    const response = await ensure(
      await content("upload_session/finish", {
        cursor: { session_id: job.sessionId, offset: job.offset },
        commit: {
          path: job.path,
          mode: "add",
          autorename: false,
          mute: false,
          strict_conflict: true,
        },
      }),
    );
    const file = mapDropboxVideo(await response.json());
    if (file.size !== job.size)
      throw new Error("Dropbox has not confirmed the complete video.");
    await save({ fileId: file.fileId, status: "ready", offset: job.size });
    return file;
  } catch (error) {
    await save({ status: "interrupted" });
    throw error;
  }
}
