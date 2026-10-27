import { emptyLibrary, type Library } from "../../core/types";
import { migrateLibrary } from "../../core/dances";

// Used for old device records and private SQLite checkpoints, not untrusted
// portable backups (which have their own allowlist and validation).
export function readDeviceLibrary(raw: string): Library {
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.videos))
    throw new Error(
      "Unrecognized library format. The original record is kept.",
    );
  const defaults = emptyLibrary();
  for (const name of [
    "connections",
    "sources",
    "sessions",
    "playlists",
    "picks",
  ])
    if (parsed[name] !== undefined && !Array.isArray(parsed[name]))
      throw new Error("A saved library contains an invalid " + name + " list.");
  return migrateLibrary({
    ...defaults,
    ...parsed,
    cloudSettings: { ...defaults.cloudSettings, ...parsed.cloudSettings },
    preferences: { ...defaults.preferences, ...parsed.preferences },
    reminders: { ...defaults.reminders, ...parsed.reminders },
    activePractice: parsed.activePractice
      ? { ...parsed.activePractice, running: false }
      : undefined,
  });
}
