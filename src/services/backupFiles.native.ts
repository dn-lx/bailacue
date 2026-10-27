import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MAX_BACKUP_BYTES } from "../core/backups";
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    file = new File(asset.uri);
  try {
    if ((file.size ?? asset.size ?? 0) > MAX_BACKUP_BYTES)
      throw new Error("Choose a backup smaller than 25 MB.");
    return await file.text();
  } finally {
    if (file.exists && asset.uri.startsWith(Paths.cache.uri)) file.delete();
  }
}
export async function exportBackupFile(name: string, content: string) {
  const folder = new Directory(Paths.cache, "bailacue-backups");
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "File sharing is unavailable. You can still save this backup to a connected folder.",
    );
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Keep your BailaCue backup",
  });
}
