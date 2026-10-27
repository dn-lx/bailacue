import * as Crypto from "expo-crypto";
import { createBackup, readBackup, type BackupEnvelope } from "../core/backups";
import type { Library } from "../core/types";
export const digest = (text: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
export const makeBackup = (library: Library) => createBackup(library, digest);
export const parseBackup = (raw: string) => readBackup(raw, digest);
export function backupFileName(backup: BackupEnvelope) {
  return (
    "BailaCue-" +
    backup.createdAt.replace(/[:.]/g, "-") +
    "-" +
    backup.id.slice(0, 8) +
    ".json"
  );
}
