import { reconcileSource } from "../../core/sources";
import { planNumbering, stagedUploadNames } from "../../core/numbering";
import type {
  CloudFolder,
  Library,
  SourceRenameProgress,
} from "../../core/types";
import { prepareNamedCopy } from "../phoneCopies";
import { deleteMedia } from "../media";
import { vault } from "./vault";
import type { PendingUpload } from "./uploadEngine";
import { provider } from "./provider";
const active = new Map<string, Promise<void>>();
export type ScanStore = {
  getLibrary: () => Library;
  commit: (action: (l: Library) => Library) => Promise<Library>;
};
export type ScanOptions = {
  // Only the explicit, reviewed rename action may set this. Discovery never does.
  rename?: boolean;
  fileIds?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (progress: SourceRenameProgress) => void;
};
export function scanSource(
  store: ScanStore,
  sourceId: string,
  options: ScanOptions = {},
): Promise<void> {
  const previous = active.get(sourceId);
  if (previous) {
    // An explicit rename must not be swallowed by an in-flight discovery scan.
    return options.rename
      ? previous
          .catch(() => {})
          .then(() => scanSource(store, sourceId, options))
      : previous;
  }
  const task = scan(store, sourceId, options).finally(() =>
    active.delete(sourceId),
  );
  active.set(sourceId, task);
  return task;
}
async function scan(store: ScanStore, sourceId: string, options: ScanOptions) {
  const progress: SourceRenameProgress = {
    phase: "scanning",
    total: 0,
    processed: 0,
    renamed: 0,
    alreadyNamed: 0,
    pending: 0,
    failures: [],
  };
  const emit = () =>
    options.onProgress?.({ ...progress, failures: [...progress.failures] });
  if (options.rename) emit();
  if (options.rename && options.signal?.aborted) {
    progress.phase = "paused";
    emit();
    return;
  }
  const before = store.getLibrary();
  const source = before.sources.find((s) => s.id === sourceId);
  const connection = before.connections.find(
    (c) => c.id === source?.connectionId,
  );
  if (!source || !connection?.connected)
    throw new Error("Reconnect this source first.");
  const adapter = provider(connection);
  const info = await adapter.inspectFolder(source.folderId);
  const { videos: listing } = await adapter.listVideos(source);
  const videos = listing.map((file) => ({ ...file }));
  let planned: CloudFolder = source;
  await store.commit((l) => {
    const current = l.sources.find((s) => s.id === source.id);
    if (
      !current ||
      current.connectionId !== source.connectionId ||
      current.folderId !== source.folderId
    )
      throw new Error("The source changed during refresh. Try again.");
    planned = {
      ...current,
      writable: info.writable,
      error: undefined,
      numbering: planNumbering(current, videos).numbering,
    };
    return reconcileSource(l, planned, videos);
  });
  // Connecting, polling and Refresh videos stop here. No provider writes, upload-job vault
  // access, phone-copy renames or title changes to an unapplied number.
  if (options.rename !== true) return;
  const names = planNumbering(planned, videos).names;
  const pendingNames = new Set(stagedUploadNames(planned).keys());
  const pendingIds = new Set<string>();
  for (const video of store.getLibrary().videos.filter((v) => !v.remote)) {
    if (options.signal?.aborted) break;
    const jobId = await vault.get(`upload-for-${video.id}`);
    if (!jobId) continue;
    const raw = await vault.get(`upload-${jobId}`);
    if (!raw) continue;
    const pending: PendingUpload = JSON.parse(raw);
    if (pending.sourceId !== source.id) continue;
    if (pending.fileId) pendingIds.add(pending.fileId);
    if (pending.path) pendingNames.add(pending.path.split("/").pop()!);
  }
  const selected = options.fileIds ? new Set(options.fileIds) : undefined;
  const targets = selected
    ? videos.filter((v) => selected.has(v.fileId))
    : videos;
  progress.total = targets.length;
  progress.phase = "renaming";
  emit();
  for (const file of targets) {
    if (options.signal?.aborted) break;
    const name = names.get(file.fileId)!;
    if (pendingNames.has(file.name) || pendingIds.has(file.fileId)) {
      progress.pending++;
    } else {
      let applied = file.name === name;
      if (applied) progress.alreadyNamed++;
      else {
        try {
          if (!connection.writable || !info.writable)
            throw new Error(
              "Allow write access for this account and folder, then retry.",
            );
          await adapter.renameVideo(file.fileId, name, planned.folderId);
          file.name = name;
          applied = true;
          progress.renamed++;
          // Save actual success immediately; later failures never claim it was
          // renamed or roll it back. Ratings/notes remain on the same identity.
          await store.commit((l) => ({
            ...l,
            videos: l.videos.map((v) =>
              v.remote?.connectionId === connection.id &&
              v.remote.fileId === file.fileId
                ? {
                    ...v,
                    title: name.replace(/\.[^.]+$/, ""),
                    remote: { ...v.remote, fileName: name },
                  }
                : v,
            ),
          }));
        } catch (error) {
          progress.failures.push({
            fileId: file.fileId,
            fileName: file.name,
            message: (error as Error).message,
          });
        }
      }
      if (applied) {
        const cached = store
          .getLibrary()
          .videos.find(
            (v) =>
              v.remote?.connectionId === connection.id &&
              v.remote.fileId === file.fileId &&
              v.offlineUri,
          );
        if (cached?.offlineUri) {
          const oldUri = cached.offlineUri;
          try {
            const uri = await prepareNamedCopy(oldUri, name, cached.id);
            if (uri !== oldUri) {
              await store.commit((l) => ({
                ...l,
                videos: l.videos.map((v) =>
                  v.id === cached.id && v.offlineUri === oldUri
                    ? { ...v, offlineUri: uri }
                    : v,
                ),
              }));
              await deleteMedia(oldUri);
            }
          } catch (error) {
            progress.failures.push({
              fileId: file.fileId,
              fileName: name,
              message: `Phone copy: ${(error as Error).message}. The existing copy was kept.`,
            });
          }
        }
      }
    }
    progress.processed++;
    emit();
  }
  progress.phase =
    options.signal?.aborted && progress.processed < progress.total
      ? "paused"
      : "complete";
  await store.commit((l) => {
    const current = l.sources.find((s) => s.id === source.id);
    if (!current) return l;
    return reconcileSource(
      l,
      {
        ...current,
        renameResult: {
          ...progress,
          failures: [...progress.failures],
          updatedAt: new Date().toISOString(),
        },
      },
      videos,
    );
  });
  emit();
}
