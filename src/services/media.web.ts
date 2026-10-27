import * as DocumentPicker from "expo-document-picker";
import { uid } from "../core/types";
export type ImportedMedia = {
  uri: string;
  name: string;
  duration: number;
  size: number;
  thumbnail?: string;
};
const urls = new Map<string, string>();
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bailacue-media", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("files", mode);
    const req = action(tx.objectStore("files"));
    tx.oncomplete = () => {
      database.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      database.close();
      reject(tx.error ?? new Error("Storage is unavailable."));
    };
  });
}
async function info(
  url: string,
): Promise<{ duration: number; thumbnail?: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "This video could not be opened. Try an MP4 with H.264 video.",
        ),
      );
    }, 20000);
    video.onerror = () => {
      cleanup();
      reject(new Error("Unsupported video. Try an MP4 with H.264 video."));
    };
    video.onloadeddata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        cleanup();
        reject(new Error("The video has no playable duration."));
        return;
      }
      let thumbnail: string | undefined;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 270;
        canvas.getContext("2d")?.drawImage(video, 0, 0, 480, 270);
        thumbnail = canvas.toDataURL("image/jpeg", 0.65);
      } catch {
        /* A thumbnail is optional. */
      }
      cleanup();
      resolve({ duration, thumbnail });
    };
  });
}
export async function importMedia(): Promise<ImportedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "video/*" });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = asset.file ?? (await (await fetch(asset.uri)).blob());
  const url = URL.createObjectURL(file);
  try {
    const metadata = await info(url);
    const key = `device:${uid()}`;
    await transaction("readwrite", (store) => store.put(file, key));
    urls.set(key, url);
    return { uri: key, name: asset.name, size: file.size, ...metadata };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
export async function resolveMedia(uri: string) {
  if (urls.has(uri)) return urls.get(uri)!;
  const blob = await transaction<Blob | undefined>("readonly", (store) =>
    store.get(uri),
  );
  if (!blob)
    throw new Error(
      "This video is no longer stored in this browser. Import it again.",
    );
  const url = URL.createObjectURL(blob);
  urls.set(uri, url);
  return url;
}
export async function deleteMedia(uri: string) {
  await transaction("readwrite", (store) => store.delete(uri));
  const url = urls.get(uri);
  if (url) URL.revokeObjectURL(url);
  urls.delete(uri);
}
export async function exportClip(
  _uri: string,
  _start: number,
  _end: number,
  _duration: number,
): Promise<{
  uri: string;
  duration: number;
  size: number;
  thumbnail?: string;
}> {
  throw new Error(
    "Trimmed-file export is available in the Android and iOS app. Open this video on your phone to create a new clip.",
  );
}
export async function saveToPhotos(_uri: string) {
  throw new Error("Save to Photos is available in the mobile app.");
}
export async function shareMedia(uri: string) {
  const a = document.createElement("a");
  a.href = await resolveMedia(uri);
  a.download = "BailaCue-video.mp4";
  a.click();
}
export async function recordMedia(): Promise<ImportedMedia | null> {
  throw new Error(
    "Use Record in the Android or iOS app, or import a recording here.",
  );
}
