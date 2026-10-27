import { uid, type Library } from "../../core/types";
import { readDeviceLibrary } from "./libraryFormat";
import type { Checkpoint, LocalProfile, LocalRepository } from "./types";
let opening: Promise<LocalRepository> | undefined;
export function openLocalRepository(): Promise<LocalRepository> {
  if (!opening)
    opening = open().catch((e) => {
      opening = undefined;
      throw e;
    });
  return opening;
}
async function open(): Promise<LocalRepository> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("bailacue-local-library", 1);
    request.onupgradeneeded = () => {
      for (const name of ["profiles", "libraries", "state", "checkpoints"])
        request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error("Close another BailaCue tab and retry opening this library."),
      );
  });
  function read<T>(store: string, id?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request =
        id === undefined
          ? tx.objectStore(store).getAll()
          : tx.objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }
  function save(
    stores: string[],
    work: (tx: IDBTransaction) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error("Browser storage could not be saved."));
      try {
        work(tx);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  return {
    profiles: () => read<LocalProfile[]>("profiles"),
    async addProfile(profile, library) {
      await save(["profiles", "libraries"], (tx) => {
        tx.objectStore("profiles").add(profile);
        tx.objectStore("libraries").add({
          id: profile.id,
          body: JSON.stringify(library),
        });
      });
    },
    async read(profileId) {
      const row = await read<{ body: string } | undefined>(
        "libraries",
        profileId,
      );
      if (!row) throw new Error("This local library could not be found.");
      return readDeviceLibrary(row.body);
    },
    write: (profileId: string, library: Library) =>
      save(["libraries"], (tx) => {
        tx.objectStore("libraries").put({
          id: profileId,
          body: JSON.stringify(library),
        });
      }),
    async getState<T>(key: string) {
      const row = await read<{ value: T } | undefined>("state", key);
      return row?.value ?? null;
    },
    setState: (key, value) =>
      save(["state"], (tx) => {
        tx.objectStore("state").put({ id: key, value });
      }),
    async checkpoint(profileId, name, library) {
      const old = (
        await read<(Checkpoint & { profileId: string; body: string })[]>(
          "checkpoints",
        )
      )
        .filter((c) => c.profileId === profileId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await save(["checkpoints"], (tx) => {
        tx.objectStore("checkpoints").put({
          id: uid(),
          profileId,
          name,
          createdAt: new Date().toISOString(),
          body: JSON.stringify(library),
        });
        for (const row of old.slice(4))
          tx.objectStore("checkpoints").delete(row.id);
      });
    },
    async checkpoints(profileId) {
      return (await read<(Checkpoint & { profileId: string })[]>("checkpoints"))
        .filter((c) => c.profileId === profileId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async readCheckpoint(profileId, id) {
      const row = await read<{ profileId: string; body: string } | undefined>(
        "checkpoints",
        id,
      );
      if (!row || row.profileId !== profileId)
        throw new Error("This recovery point is no longer available.");
      return readDeviceLibrary(row.body);
    },
  };
}
