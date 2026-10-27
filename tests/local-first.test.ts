import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyLibrary, type Video } from "../src/core/types";
import {
  createSqliteRepository,
  type SqlDatabase,
} from "../src/services/local/sqliteRepository";
import {
  migrateDeviceLibraries,
  LEGACY_LIBRARY_KEY,
} from "../src/services/local/migration";
import { createBackup, readBackup, mergeBackup } from "../src/core/backups";
import { metadataSnapshot } from "../src/core/sync";
import { removeLibraryLabel } from "../src/core/labels";
import { mergeMetadata } from "../src/core/metadataMerge";
import { applyEdits, tablesFor } from "../src/services/sheets/codec";
export const video = (id = "v1"): Video => ({
  id,
  title: "Class",
  uri: "file:///private/video.mp4",
  size: 123,
  duration: 60,
  style: "Bachata",
  labels: ["Artist"],
  importance: 5,
  status: "To learn",
  teacher: "",
  className: "",
  location: "",
  lessonDate: "",
  createdAt: "2026-10-22T12:00:00Z",
  resume: 0,
  segments: [],
  bookmarks: [],
  notes: [],
  available: true,
  source: "device",
});
const digest = async (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export async function repository() {
  const db = new DatabaseSync(":memory:");
  const connection = {
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, ...params: any[]) =>
      db.prepare(sql).run(...params),
    getFirstAsync: async <T>(sql: string, ...params: any[]) =>
      (db.prepare(sql).get(...params) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, ...params: any[]) =>
      db.prepare(sql).all(...params) as T[],
  };
  const adapter: SqlDatabase = {
    ...connection,
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(connection);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { repo: await createSqliteRepository(adapter), db, adapter };
}
describe("native SQLite migration and persistence", () => {
  it("keeps guest and old account libraries separate, retains old keys and retires only old session", async () => {
    const { repo, db } = await repository();
    const data = new Map([
      [
        LEGACY_LIBRARY_KEY,
        JSON.stringify({ ...emptyLibrary(), videos: [video("guest")] }),
      ],
      [
        LEGACY_LIBRARY_KEY + ":u",
        JSON.stringify({ ...emptyLibrary(), videos: [video("account")] }),
      ],
    ]);
    let retired = 0;
    const legacy = {
      keys: async () => [...data.keys()],
      get: async (k: string) => data.get(k) ?? null,
      lastSession: async () =>
        JSON.stringify({ user: { id: "u", username: "Dancer" } }),
      retireSession: async () => {
        retired++;
      },
    };
    const result = await migrateDeviceLibraries(repo, legacy);
    expect(result.activeProfileId).toBe("legacy:u");
    expect(result.profiles).toHaveLength(2);
    expect((await repo.read("device")).videos[0].id).toBe("guest");
    expect((await repo.read("legacy:u")).videos[0].id).toBe("account");
    expect((await repo.read("device")).videos[0].uri).toContain("private");
    expect(data.size).toBe(2);
    expect(retired).toBe(1);
    const updated = await repo.read("legacy:u");
    updated.videos[0].importance = 2;
    await repo.write("legacy:u", updated);
    await migrateDeviceLibraries(repo, legacy);
    expect((await repo.read("legacy:u")).videos[0].importance).toBe(2);
    db.close();
  });
  it("rolls back a failed multi-record write and protects another profile", async () => {
    const { repo, db } = await repository();
    await repo.addProfile(
      { id: "p", name: "Phone", origin: "device", createdAt: "1" },
      { ...emptyLibrary(), videos: [video()] },
    );
    const before = await repo.read("p");
    await expect(
      repo.write("p", {
        ...before,
        videos: [{ ...video(), title: "Changed" }, video()],
      }),
    ).rejects.toThrow("duplicate");
    expect((await repo.read("p")).videos[0].title).toBe("Class");
    expect(
      db
        .prepare("SELECT title,rating FROM library_records WHERE kind='videos'")
        .get(),
    ).toMatchObject({ title: "Class", rating: 5 });
    db.close();
  });
  it("detects stale writers and retains five recoverable checkpoints", async () => {
    const { repo, db, adapter } = await repository();
    await repo.addProfile(
      { id: "p", name: "Phone", origin: "device", createdAt: "1" },
      emptyLibrary(),
    );
    const second = await createSqliteRepository(adapter);
    await second.read("p");
    await repo.write("p", { ...emptyLibrary(), labels: ["New"] });
    await expect(second.write("p", emptyLibrary())).rejects.toThrow(
      "another process",
    );
    for (let i = 0; i < 7; i++)
      await repo.checkpoint("p", "Point " + i, {
        ...emptyLibrary(),
        labels: [String(i)],
      });
    const points = await repo.checkpoints("p");
    expect(points).toHaveLength(5);
    expect((await repo.readCheckpoint("p", points[0].id)).labels).toEqual([
      "6",
    ]);
    await expect(repo.readCheckpoint("other", points[0].id)).rejects.toThrow();
    db.close();
  });
  it("refuses a damaged legacy record without marking migration done or overwriting originals", async () => {
    const { repo, db } = await repository();
    await expect(
      migrateDeviceLibraries(repo, {
        keys: async () => [LEGACY_LIBRARY_KEY],
        get: async () => "broken",
        lastSession: async () => null,
        retireSession: async () => {},
      }),
    ).rejects.toThrow();
    expect(await repo.getState("legacy-migration-v1")).toBe(null);
    expect(await repo.profiles()).toEqual([]);
    db.close();
  });
});
describe("portable recovery and two-way metadata", () => {
  it("excludes device paths and credentials, checks corruption, restores matching phone copies", async () => {
    const local = {
      ...emptyLibrary(),
      videos: [{ ...video(), offlineUri: "file:///private/copy.mp4" }],
      youtubeSettings: { apiKey: "private-key" },
    };
    const backup = await createBackup(local, digest),
      raw = JSON.stringify(backup);
    expect(raw).not.toContain("file://");
    expect(raw).not.toContain("private-key");
    const parsed = await readBackup(raw, digest);
    expect(mergeBackup(parsed.library, local, "backup").videos[0].uri).toBe(
      video().uri,
    );
    expect(
      mergeBackup(parsed.library, emptyLibrary(), "backup").videos[0].available,
    ).toBe(false);
    await expect(
      readBackup(raw.replace('"Class"', '"Changed"'), digest),
    ).rejects.toThrow("changed");
  });
  it("rejects malformed settings and credentials even in checksummed files", async () => {
    const backup = await createBackup(emptyLibrary(), digest);
    for (const patch of [
      { preferences: { ...backup.library.preferences, styles: false } },
      { labels: ["okay", 3] },
      { preferences: { ...backup.library.preferences, picksEnabled: "true" } },
      { sources: [{ accessToken: "secret" }] },
    ]) {
      const { checksum: _, ...body } = {
        ...backup,
        library: { ...backup.library, ...patch },
      };
      await expect(
        readBackup(
          JSON.stringify({
            ...body,
            checksum: await digest(
              (await import("../src/core/backups")).canonical(body),
            ),
          }),
          digest,
        ),
      ).rejects.toThrow();
    }
  });
  it("removes a label everywhere and preserves unrelated labels and files", () => {
    const l = {
      ...emptyLibrary(),
      labels: ["Artist", "Other"],
      videos: [video()],
      preferences: { ...emptyLibrary().preferences, labels: ["ARTIST"] },
    };
    const removed = removeLibraryLabel(l, " artist ");
    expect(removed.labels).toEqual(["Other"]);
    expect(removed.videos[0].labels).toEqual([]);
    expect(removed.preferences.labels).toEqual([]);
    expect(removed.videos[0].uri).toBe(video().uri);
  });
  it("merges disjoint edits, handles deletes, and requires review of concurrent ratings", () => {
    const base = metadataSnapshot({
      ...emptyLibrary(),
      videos: [video(), video("v2")],
    });
    const phone = structuredClone(base),
      remote = structuredClone(base);
    phone.videos[0].importance = 3;
    remote.videos[0].title = "Edited";
    const merged = mergeMetadata(base, phone, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.library.videos[0]).toMatchObject({
      importance: 3,
      title: "Edited",
    });
    remote.videos[0].importance = 1;
    expect(mergeMetadata(base, phone, remote).conflicts).toContain(
      "videos.v1.importance",
    );
    expect(
      mergeMetadata(base, phone, remote, "sheet").library.videos[0].importance,
    ).toBe(1);
    phone.videos.pop();
    expect(mergeMetadata(base, phone, base).library.videos).toHaveLength(1);
  });
  it("supports spreadsheet label deletion, video ratings and config edits with validation", async () => {
    const b = await createBackup(
      { ...emptyLibrary(), videos: [video()] },
      digest,
    );
    const tables = tablesFor(b);
    tables["BailaCue Labels"] = [["Label"]];
    tables["BailaCue Videos"][1][3] = 2;
    tables["BailaCue Config"].find((r) => r[0] === "weeklyMinutes")![1] = "90";
    const edited = applyEdits(b, tables);
    expect(edited.videos[0].labels).toEqual([]);
    expect(edited.videos[0].importance).toBe(2);
    expect(edited.preferences.weeklyMinutes).toBe(90);
    tables["BailaCue Videos"][1][3] = 9;
    expect(() => applyEdits(b, tables)).toThrow("ratings");
  });
});

it("keeps an untouched spreadsheet video byte-for-byte equivalent as portable metadata", async () => {
  const b = await createBackup(
    { ...emptyLibrary(), videos: [video()] },
    digest,
  );
  expect(applyEdits(b, tablesFor(b))).toEqual(b.library);
});
