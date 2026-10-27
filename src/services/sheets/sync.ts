import { libraryLabels, removeLibraryLabel } from "../../core/labels";
import { canonical, type PortableLibrary } from "../../core/backups";
import { mergeMetadata } from "../../core/metadataMerge";
import { metadataSnapshot, restoreSnapshot } from "../../core/sync";
import { emptyLibrary, type Library } from "../../core/types";
import { makeBackup, parseBackup } from "../backup";
import { accessToken } from "../cloud/accounts";
import type { LocalRepository } from "../local/types";
import { sheetClient } from "./client";
export type SheetSyncState = {
  enabled: boolean;
  spreadsheetId: string;
  connectionId: string;
  base?: PortableLibrary;
  lastSuccess?: string;
  message?: string;
  conflicts?: string[];
  conflictDetails?: { field: string; phone: string; sheet: string }[];
  pending?: boolean;
  failures?: number;
  nextAttemptAt?: number;
};
export const stateKey = (profileId: string) => "sheet-sync:" + profileId;
export const clientFor = (library: Library, connectionId: string) => {
  const connection = library.connections.find(
    (c) =>
      c.id === connectionId &&
      c.connected &&
      c.provider === "google-drive" &&
      c.writable,
  );
  if (!connection)
    throw new Error(
      "Connect Google Drive with write access before syncing this spreadsheet.",
    );
  return sheetClient({
    token: () => accessToken(connection),
    parse: parseBackup,
  });
};
const locks = new Map<string, Promise<SheetSyncState>>();
export function syncSheet(options: {
  repository: LocalRepository;
  profileId: string;
  get: () => Library;
  commit?: (action: (l: Library) => Library) => Promise<Library>;
  choice?: "phone" | "sheet";
  manual?: boolean;
}) {
  const { repository, profileId } = options;
  const running = locks.get(profileId);
  if (running) return running;
  const job = (async () => {
    const config = await repository.getState<SheetSyncState>(
      stateKey(profileId),
    );
    if (!config?.enabled)
      return config ?? { enabled: false, spreadsheetId: "", connectionId: "" };
    if (config.conflicts?.length && !options.choice) return config;
    if (
      !options.manual &&
      !options.choice &&
      config.nextAttemptAt &&
      Date.now() < config.nextAttemptAt
    )
      return config;
    const save = async (changes: Partial<SheetSyncState>) => {
      const latest = await repository.getState<SheetSyncState>(
        stateKey(profileId),
      );
      // A user can disconnect or switch destinations while a request is in flight.
      if (
        !latest ||
        latest.spreadsheetId !== config.spreadsheetId ||
        !latest.enabled
      )
        return latest ?? config;
      const next = { ...latest, ...changes };
      await repository.setState(stateKey(profileId), next);
      return next;
    };
    try {
      const phone = options.get(),
        portable = metadataSnapshot(phone),
        client = clientFor(phone, config.connectionId);
      const remote = await client.read(config.spreadsheetId);
      const base = config.base ?? metadataSnapshot(emptyLibrary());
      if (!options.commit && canonical(remote.library) !== canonical(base))
        return save({
          pending: true,
          message:
            "Spreadsheet changes are waiting. Open BailaCue to review and save them.",
        });
      const merged = mergeMetadata(
        base,
        portable,
        remote.library,
        options.choice,
      );
      if (merged.conflicts.length && !options.choice)
        return save({
          conflicts: merged.conflicts,
          conflictDetails: merged.conflicts
            .slice(0, 20)
            .map((path) => ({
              field: conflictName(portable, path),
              phone: previewValue(portable, path),
              sheet: previewValue(remote.library, path),
            })),
          pending: true,
          message:
            "Changes on this phone and in the spreadsheet need your review.",
        });
      const changedRemote =
        canonical(merged.library) !== canonical(remote.library);
      if (changedRemote) {
        // Preserve manually edited sheet content as a separate recovery version too.
        const previous = await makeBackup(
          restoreSnapshot(remote.library, phone),
        );
        const backup = await makeBackup(restoreSnapshot(merged.library, phone));
        const latest = await repository.getState<SheetSyncState>(
          stateKey(profileId),
        );
        if (!latest?.enabled || latest.spreadsheetId !== config.spreadsheetId)
          return latest ?? config;
        await client.write(
          config.spreadsheetId,
          backup,
          remote.fingerprint,
          previous,
        );
      }
      if (options.commit && canonical(merged.library) !== canonical(portable)) {
        await repository.checkpoint(
          profileId,
          "Before spreadsheet sync",
          options.get(),
        );
        await options.commit((current) => {
          // Include edits made while the request was running. A newer phone edit
          // remains queued for the next sync rather than being overwritten.
          const next = mergeMetadata(
            portable,
            metadataSnapshot(current),
            merged.library,
          ).library;
          let clean = current;
          for (const label of libraryLabels(current))
            if (
              !(next.labels ?? []).some(
                (name) => name.toLowerCase() === label.toLowerCase(),
              )
            )
              clean = removeLibraryLabel(clean, label);
          return {
            ...restoreSnapshot(next, clean),
            activePractice: clean.activePractice,
          };
        });
      }
      const stillPending =
        canonical(metadataSnapshot(options.get())) !==
        canonical(merged.library);
      return save({
        base: merged.library,
        conflicts: [],
        conflictDetails: [],
        failures: 0,
        nextAttemptAt: 0,
        pending: stillPending,
        lastSuccess: new Date().toISOString(),
        message: stillPending
          ? "New phone changes are queued for the next sync."
          : "Your phone and spreadsheet are in sync.",
      });
    } catch (e) {
      const failures = (config.failures ?? 0) + 1;
      return save({
        pending: true,
        failures,
        nextAttemptAt:
          Date.now() +
          Math.min(15 * 60000, 30000 * 2 ** Math.min(5, failures - 1)),
        message: (e as Error).message,
      });
    }
  })().finally(() => {
    locks.delete(profileId);
  });
  locks.set(profileId, job);
  return job;
}

function previewValue(value: unknown, path: string): string {
  let current: any = value,
    remaining = path;
  while (remaining && current !== undefined) {
    if (Array.isArray(current)) {
      const record = current.find(
        (v) =>
          (typeof v?.id === "string" &&
            (remaining === v.id || remaining.startsWith(v.id + "."))) ||
          (typeof v?.day === "string" &&
            (remaining === v.day || remaining.startsWith(v.day + "."))),
      );
      if (!record) return "Removed";
      remaining = remaining.slice((record.id ?? record.day).length + 1);
      current = record;
    } else {
      const dot = remaining.indexOf(".");
      const key = dot < 0 ? remaining : remaining.slice(0, dot);
      current = current?.[key];
      remaining = dot < 0 ? "" : remaining.slice(dot + 1);
    }
  }
  return current === undefined
    ? "Removed"
    : (typeof current === "string" ? current : JSON.stringify(current)).slice(
        0,
        240,
      );
}
function conflictName(library: PortableLibrary, path: string) {
  const video = library.videos.find((v) =>
    path.startsWith("videos." + v.id + "."),
  );
  return video
    ? video.title + " · " + path.slice(("videos." + video.id + ".").length)
    : path;
}
