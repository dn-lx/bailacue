import {
  ProviderError,
  type RemoteVideo,
  type Source,
  type VideoProvider,
} from "./types";
type Entry = {
  ".tag": string;
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  server_modified?: string;
  sharing_info?: { read_only?: boolean };
  media_info?: {
    ".tag": string;
    metadata?: { ".tag": string; duration?: number };
  };
};
export function mapDropboxVideo(file: Entry): RemoteVideo {
  return {
    fileId: file.id,
    name: file.name,
    mimeType:
      "video/" +
      (file.name.split(".").pop()?.toLowerCase() === "mov"
        ? "quicktime"
        : "mp4"),
    size: file.size ?? 0,
    duration: (file.media_info?.metadata?.duration ?? 0) / 1000,
    modifiedAt: file.server_modified ?? "",
    canDownload: true,
  };
}
export class DropboxProvider implements VideoProvider {
  readonly kind = "dropbox" as const;
  constructor(
    private token: () => Promise<string>,
    private request: typeof fetch = (...args) => fetch(...args),
  ) {}
  async call(path: string, body: unknown) {
    const response = await this.request(
      `https://api.dropboxapi.com/2/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (response.status === 401)
      throw new ProviderError(
        "Reconnect Dropbox to continue. Your notes are kept.",
        "reauth",
      );
    if (response.status === 403)
      throw new ProviderError(
        "Dropbox access to this folder is restricted.",
        "permission",
      );
    if (response.status === 409)
      throw new ProviderError(
        "The Dropbox folder or video moved or is no longer available. Check the selected path.",
        "missing",
      );
    if (!response.ok)
      throw new ProviderError(
        "Dropbox could not be reached. Retry when connected.",
        "network",
      );
    return response.json();
  }
  async inspectFolder(folderId: string) {
    if (!folderId) return { name: "Dropbox", writable: true };
    const folder = (await this.call("files/get_metadata", {
      path: folderId,
    })) as Entry;
    if (folder[".tag"] !== "folder")
      throw new ProviderError(
        "Choose a Dropbox folder, not a file or shared link.",
        "invalid",
      );
    return { name: folder.name, writable: !folder.sharing_info?.read_only };
  }
  async listEntries(path: string) {
    let page = (await this.call("files/list_folder", {
      path,
      include_media_info: true,
      recursive: false,
      include_deleted: false,
    })) as { entries: Entry[]; cursor: string; has_more: boolean };
    const entries: Entry[] = [...page.entries];
    while (page.has_more) {
      page = (await this.call("files/list_folder/continue", {
        cursor: page.cursor,
      })) as typeof page;
      entries.push(...page.entries);
    }
    return [...new Map(entries.map((v) => [v.id, v])).values()];
  }
  async folders(parent = "") {
    return (await this.listEntries(parent))
      .filter((v) => v[".tag"] === "folder")
      .map((v) => ({ id: v.path_lower ?? v.id, name: v.name }));
  }
  async listVideos(source: Source) {
    return {
      videos: (await this.listEntries(source.folderId))
        .filter(
          (v) =>
            v[".tag"] === "file" &&
            /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(v.name),
        )
        .map(mapDropboxVideo),
    };
  }
  async renameVideo(fileId: string, name: string, folderId: string) {
    const file = (await this.call("files/get_metadata", {
      path: fileId,
    })) as Entry;
    const path = file.path_display ?? file.path_lower;
    const parent = path?.slice(0, path.lastIndexOf("/"));
    if (
      file.id !== fileId ||
      parent?.toLowerCase() !== folderId.replace(/\/$/, "").toLowerCase() ||
      !path
    )
      throw new ProviderError(
        "This video moved out of the selected folder. Refresh before renaming.",
        "invalid",
      );
    await this.call("files/move_v2", {
      from_path: fileId,
      to_path: `${parent}/${name}`,
      autorename: false,
      allow_ownership_transfer: false,
    });
  }
  async playback(fileId: string) {
    const result = (await this.call("files/get_temporary_link", {
      path: fileId,
    })) as { link: string };
    const url = new URL(result.link);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname.endsWith(".dropboxusercontent.com") ||
        url.hostname.endsWith(".dropbox.com")
      )
    )
      throw new ProviderError(
        "Dropbox returned an invalid media address.",
        "invalid",
      );
    return { uri: result.link, headers: {} };
  }
}
