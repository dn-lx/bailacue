import { emptyLibrary, type Library } from "../../core/types";
import { readDeviceLibrary } from "./libraryFormat";
import type { LocalProfile, LocalRepository } from "./types";
export const LEGACY_LIBRARY_KEY = "bailacue:device-library:v1";
export interface LegacyLibraries {
  keys(): Promise<readonly string[]>;
  get(key: string): Promise<string | null>;
  lastSession(): Promise<string | null>;
  retireSession(): Promise<void>;
}
export async function migrateDeviceLibraries(
  repository: LocalRepository,
  legacy: LegacyLibraries,
) {
  if (!(await repository.getState<boolean>("legacy-migration-v1"))) {
    const keys = (await legacy.keys()).filter(
      (k) => k === LEGACY_LIBRARY_KEY || k.startsWith(LEGACY_LIBRARY_KEY + ":"),
    );
    let session: { user?: { id?: string; username?: string } } | undefined;
    try {
      session = JSON.parse((await legacy.lastSession()) ?? "null");
    } catch {
      /* A damaged old token is not needed to use local data. */
    }
    const imported: { profile: LocalProfile; library: Library }[] = [];
    for (const key of keys) {
      const raw = await legacy.get(key);
      if (!raw) continue;
      const account = key !== LEGACY_LIBRARY_KEY;
      const userId = key.slice(LEGACY_LIBRARY_KEY.length + 1);
      const name = account
        ? session?.user?.id === userId && session.user.username
          ? "Previous library · " + session.user.username
          : "Previous library " +
            (imported.filter((p) => p.profile.origin === "previous-account")
              .length +
              1)
        : "This phone";
      // Validate every old record before committing any import. Never erase old keys.
      imported.push({
        profile: {
          id: account ? "legacy:" + userId : "device",
          name,
          origin: account ? "previous-account" : "device",
          createdAt: new Date().toISOString(),
        },
        library: readDeviceLibrary(raw),
      });
    }
    const existing = await repository.profiles();
    for (const { profile, library } of imported)
      if (!existing.some((p) => p.id === profile.id))
        await repository.addProfile(profile, library);
    let profiles = await repository.profiles();
    if (!profiles.length) {
      await repository.addProfile(
        {
          id: "device",
          name: "This phone",
          origin: "device",
          createdAt: new Date().toISOString(),
        },
        emptyLibrary(),
      );
      profiles = await repository.profiles();
    }
    const last = session?.user?.id ? "legacy:" + session.user.id : "device";
    const active =
      profiles.find((p) => p.id === last)?.id ??
      profiles.find((p) => p.id === "device")?.id ??
      profiles[0].id;
    await repository.setState("active-library", active);
    await repository.setState("legacy-migration-v1", true);
  }
  await legacy.retireSession();
  const profiles = await repository.profiles();
  const active = await repository.getState<string>("active-library");
  return {
    profiles,
    activeProfileId:
      profiles.find((p) => p.id === active)?.id ?? profiles[0]?.id ?? "device",
  };
}
