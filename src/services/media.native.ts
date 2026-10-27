import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library/legacy";
import { nativeMedia } from "../../modules/baila-media";
import { validateSegment } from "../core/practice";
import { uid } from "../core/types";
export type ImportedMedia = {
  uri: string;
  name: string;
  duration: number;
  size: number;
  thumbnail?: string;
};
async function retain(uri: string, name: string): Promise<ImportedMedia> {
  const dir = new Directory(Paths.document, "bailacue-library");
  dir.create({ intermediates: true, idempotent: true });
  const ext =
    name
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "")
      .slice(0, 8) || "mp4";
  const destination = new File(dir, `${uid()}.${ext}`);
  try {
    await new File(uri).copy(destination);
    const info = await nativeMedia().getInfoAsync(destination.uri);
    return { uri: destination.uri, name, size: destination.size ?? 0, ...info };
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}
export async function importMedia(): Promise<ImportedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "video/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = result.assets[0];
  try {
    return await retain(file.uri, file.name);
  } finally {
    const temporary = new File(file.uri);
    if (temporary.exists && file.uri.startsWith(Paths.cache.uri))
      temporary.delete();
  }
}
export async function recordMedia(): Promise<ImportedMedia | null> {
  const camera = await ImagePicker.requestCameraPermissionsAsync();
  if (!camera.granted)
    throw new Error(
      "Camera permission is needed to record. You can still import an existing video.",
    );
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["videos"],
    videoMaxDuration: 600,
    quality: 1,
  });
  return result.canceled
    ? null
    : retain(
        result.assets[0].uri,
        result.assets[0].fileName ??
          `Practice-${Date.now()}.${result.assets[0].uri.split(".").pop() || "mp4"}`,
      );
}
export async function resolveMedia(uri: string) {
  if (!new File(uri).exists)
    throw new Error(
      "This local video is missing. Import it again from your original.",
    );
  return uri;
}
export async function deleteMedia(uri: string) {
  if (!uri.startsWith(Paths.document.uri) && !uri.startsWith(Paths.cache.uri))
    throw new Error("Only BailaCue local copies can be removed.");
  const file = new File(uri);
  if (file.exists) file.delete();
}
export async function exportClip(
  uri: string,
  start: number,
  end: number,
  duration: number,
) {
  validateSegment(start, end, duration);
  const output = await nativeMedia().trimAsync(uri, start, end);
  try {
    const info = await nativeMedia().getInfoAsync(output.uri);
    return { uri: output.uri, ...info, size: new File(output.uri).size ?? 0 };
  } catch (error) {
    await deleteMedia(output.uri);
    throw error;
  }
}
export async function saveToPhotos(uri: string) {
  const permission = await MediaLibrary.requestPermissionsAsync(true, [
    "video",
  ]);
  if (!permission.granted)
    throw new Error(
      "Allow Photos access to save this new clip, or use Share / Save file.",
    );
  await MediaLibrary.saveToLibraryAsync(uri);
}
export async function shareMedia(uri: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is unavailable on this device.");
  await Sharing.shareAsync(uri, {
    mimeType: "video/mp4",
    UTI: "public.mpeg-4",
    dialogTitle: "Save your BailaCue clip",
  });
}
