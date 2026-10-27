import { MAX_BACKUP_BYTES } from "../core/backups";
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > MAX_BACKUP_BYTES)
        return reject(new Error("Choose a backup smaller than 25 MB."));
      try {
        resolve(await file.text());
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
export async function exportBackupFile(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
