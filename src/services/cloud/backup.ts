import { MAX_BACKUP_BYTES } from "../../core/backups";
import { uid, type Connection, type CloudFolder } from "../../core/types";
import { accessToken } from "./accounts";
import { DropboxProvider } from "../providers/dropbox";
import { provider } from "./provider";
export type CloudBackupFile = {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
};
const DRIVE = "https://www.googleapis.com/drive/v3";
export function utf8Size(value: string) {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
function argument(value: unknown) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
async function checked(response: Response) {
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Reconnect your storage account and retry."
        : response.status === 403
          ? "Allow access to this backup folder, then retry."
          : response.status === 429
            ? "Storage is busy. Your library is saved on this phone; try again later."
            : "Backup storage could not be reached (HTTP " +
              response.status +
              "). Your phone library is kept.",
    );
  return response;
}
async function request(url: string, init: RequestInit) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60000);
  try {
    return await checked(
      await fetch(url, { ...init, signal: controller.signal }),
    );
  } finally {
    clearTimeout(timer);
  }
}
function assertSource(connection: Connection, source: CloudFolder) {
  if (source.connectionId !== connection.id || !connection.connected)
    throw new Error("Reconnect the account for the selected backup folder.");
}
export async function listCloudBackups(
  connection: Connection,
  source: CloudFolder,
): Promise<CloudBackupFile[]> {
  assertSource(connection, source);
  if (connection.provider === "dropbox") {
    const entries = await new DropboxProvider(() =>
      accessToken(connection),
    ).listEntries(source.folderId);
    return entries
      .filter(
        (e) => e[".tag"] === "file" && /^BailaCue-.*\.json$/i.test(e.name),
      )
      .map((e) => ({
        id: e.id,
        name: e.name,
        size: e.size ?? 0,
        modifiedAt: e.server_modified ?? "",
      }))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
  const files: CloudBackupFile[] = [];
  let cursor = "";
  const folder = source.folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  do {
    const params = new URLSearchParams({
      q:
        "'" +
        folder +
        "' in parents and trashed=false and mimeType='application/json' and name contains 'BailaCue-'",
      fields: "nextPageToken,files(id,name,size,modifiedTime)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (cursor) params.set("pageToken", cursor);
    const page = await (
      await request(DRIVE + "/files?" + params, {
        headers: { Authorization: "Bearer " + (await accessToken(connection)) },
      })
    ).json();
    files.push(
      ...page.files.map((f: any) => ({
        id: f.id,
        name: f.name,
        size: Number(f.size ?? 0),
        modifiedAt: f.modifiedTime ?? "",
      })),
    );
    cursor = page.nextPageToken ?? "";
    if (files.length > 5000)
      throw new Error(
        "This folder has too many backups to list. Choose a more specific folder.",
      );
  } while (cursor);
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
export async function saveCloudBackup(
  connection: Connection,
  source: CloudFolder,
  name: string,
  content: string,
): Promise<void> {
  assertSource(connection, source);
  if (!connection.writable || !source.writable)
    throw new Error(
      "Allow write access before saving a backup to this folder.",
    );
  const size = utf8Size(content);
  if (size > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large to save on this device.");
  await provider(connection).inspectFolder(source.folderId);
  const token = await accessToken(connection);
  if (connection.provider === "dropbox") {
    const folder = source.folderId.replace(/\/$/, "");
    await request("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": argument({
          path: folder + "/" + name,
          mode: "add",
          autorename: true,
          mute: true,
        }),
      },
      body: content,
    });
    return;
  }
  const start = await request(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "application/json",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({
        name,
        parents: [source.folderId],
        mimeType: "application/json",
        appProperties: { bailacueBackup: "1", backupId: uid() },
      }),
    },
  );
  const location = start.headers.get("Location");
  if (!location)
    throw new Error("Drive did not provide a backup upload address.");
  const url = new URL(location);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.googleapis.com" ||
    !url.pathname.startsWith("/upload/drive/")
  )
    throw new Error("Drive returned an unexpected upload address.");
  await request(location, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Content-Range": "bytes 0-" + (size - 1) + "/" + size,
    },
    body: content,
  });
}
export async function readCloudBackup(
  connection: Connection,
  source: CloudFolder,
  file: CloudBackupFile,
) {
  assertSource(connection, source);
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Choose a backup smaller than 25 MB.");
  // Re-list the selected folder before reading: a stale/moved identity must not
  // silently change the recovery source the user reviewed.
  if (
    !(await listCloudBackups(connection, source)).some((f) => f.id === file.id)
  )
    throw new Error(
      "This backup is no longer in the selected folder. Refresh the list.",
    );
  const token = await accessToken(connection);
  const response =
    connection.provider === "google-drive"
      ? await request(
          DRIVE +
            "/files/" +
            encodeURIComponent(file.id) +
            "?alt=media&supportsAllDrives=true",
          { headers: { Authorization: "Bearer " + token } },
        )
      : await request("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Dropbox-API-Arg": argument({ path: file.id }),
          },
        });
  if (Number(response.headers.get("Content-Length") ?? 0) > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large.");
  const content = await response.text();
  if (utf8Size(content) > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large.");
  return content;
}
