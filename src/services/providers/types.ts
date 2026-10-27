export type ProviderKind = "google-drive" | "dropbox" | "webdav" | "s3";
export type Source = {
  id: string;
  connectionId: string;
  provider: ProviderKind;
  folderId: string;
  name: string;
  defaultStyle: string;
  defaultLabels: string[];
  writable: boolean;
  cursor?: string;
  lastSyncedAt?: string;
};
export type RemoteVideo = {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  duration: number;
  modifiedAt: string;
  thumbnail?: string;
  canDownload: boolean;
};
export type UploadJob = {
  id: string;
  sourceId: string;
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  sessionUrl?: string;
  offset: number;
  status: "queued" | "uploading" | "interrupted" | "ready" | "failed";
  result?: RemoteVideo;
};
export interface VideoProvider {
  readonly kind: ProviderKind;
  inspectFolder(folderId: string): Promise<{ name: string; writable: boolean }>;
  listVideos(
    source: Source,
  ): Promise<{ videos: RemoteVideo[]; cursor?: string }>;
  playback(
    fileId: string,
  ): Promise<{ uri: string; headers: Record<string, string> }>;
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: "reauth" | "permission" | "missing" | "network" | "invalid",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
