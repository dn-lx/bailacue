import { ProviderError, type UploadJob } from "./types";
// Native transport sends bounded byte buffers directly through expo/fetch.
export type UploadChunk = Blob | Uint8Array<ArrayBuffer>;
export const chunkSize = (chunk: UploadChunk) =>
  chunk instanceof Uint8Array ? chunk.byteLength : chunk.size;
// Persist after every server acknowledgement. Callers retain the job's preallocated
// provider file ID across retries; a network failure must never allocate a new ID.
export function acknowledgedOffset(response: Response, total: number): number {
  if (response.status !== 308)
    throw new ProviderError("Unexpected upload acknowledgement.", "network");
  const range = response.headers.get("Range");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const offset = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total)
    throw new ProviderError(
      "Storage returned an invalid upload position.",
      "invalid",
    );
  return offset;
}
export async function resumeUpload(
  job: UploadJob,
  read: (start: number, end: number) => Promise<UploadChunk>,
  persist: (job: UploadJob) => Promise<void>,
  token: () => Promise<string>,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<UploadJob> {
  if (job.status === "ready") return job;
  if (!job.sessionUrl || !job.fileId)
    throw new ProviderError(
      "This upload needs a confirmed destination and upload session.",
      "invalid",
    );
  const session = new URL(job.sessionUrl);
  if (
    session.protocol !== "https:" ||
    !(
      session.hostname === "www.googleapis.com" ||
      session.hostname === "content.googleapis.com"
    )
  )
    throw new ProviderError("Invalid storage upload session.", "invalid");
  let current = { ...job };
  const isReady = () => current.status === "ready";
  const send = async (body: UploadChunk | undefined, range: string) =>
    request(job.sessionUrl!, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Range": range,
        "Content-Type": job.mimeType,
      },
      body,
      signal,
    });
  const accept = async (response: Response) => {
    if (response.status === 401)
      throw new ProviderError(
        "Reconnect your storage account before resuming.",
        "reauth",
      );
    if (response.status === 403)
      throw new ProviderError(
        "This destination is read-only. Choose a writable folder.",
        "permission",
      );
    if (response.status === 404 || response.status === 410)
      throw new ProviderError(
        "The upload session expired. Recreate it using the same file ID.",
        "missing",
      );
    if (response.status === 200 || response.status === 201) {
      const file = (await response.json()) as { id?: string };
      if (file.id !== job.fileId)
        throw new ProviderError(
          "Storage returned a different video. The library was not updated.",
          "invalid",
        );
      current = { ...current, offset: job.size, status: "ready" };
    } else if (response.status === 308)
      current = {
        ...current,
        offset: acknowledgedOffset(response, job.size),
        status: "uploading",
      };
    else
      throw new ProviderError(
        "Upload interrupted. Retry when connected.",
        "network",
      );
    await persist(current);
  };
  try {
    await accept(await send(undefined, `bytes */${job.size}`));
    while (!isReady()) {
      if (signal?.aborted) throw new Error("Upload cancelled.");
      const before = current.offset;
      const end = Math.min(job.size, current.offset + 8 * 256 * 1024);
      if (before >= end)
        throw new ProviderError(
          "Storage has not confirmed completion. Retry the upload.",
          "network",
        );
      const chunk = await read(before, end);
      if (chunkSize(chunk) !== end - before)
        throw new ProviderError(
          "The selected file changed or is unavailable.",
          "invalid",
        );
      await accept(await send(chunk, `bytes ${before}-${end - 1}/${job.size}`));
      if (!isReady() && current.offset <= before)
        throw new ProviderError(
          "Upload made no progress. Retry when connected.",
          "network",
        );
    }
    return current;
  } catch (error) {
    current = { ...current, status: "interrupted" };
    await persist(current);
    throw error;
  }
}
