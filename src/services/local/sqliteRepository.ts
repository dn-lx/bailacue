import { emptyLibrary, uid, type Library } from "../../core/types";
import { readDeviceLibrary } from "./libraryFormat";
import type { LocalProfile, LocalRepository, Checkpoint } from "./types";

type Bind = string | number | null;
export interface SqlConnection {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, ...values: Bind[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...values: Bind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...values: Bind[]): Promise<T[]>;
}
export interface SqlDatabase extends SqlConnection {
  withExclusiveTransactionAsync(
    task: (transaction: SqlConnection) => Promise<void>,
  ): Promise<void>;
}
const groups = ["videos", "playlists", "sessions"] as const;
type Group = (typeof groups)[number];
type Document = { body: string; revision: number };
type RecordRow = { kind: Group; id: string; body: string };

export async function createSqliteRepository(
  db: SqlDatabase,
): Promise<LocalRepository> {
  await db.execAsync(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; " +
      "CREATE TABLE IF NOT EXISTS local_profiles(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS library_documents(profile_id TEXT PRIMARY KEY REFERENCES local_profiles(id), body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);" +
      "CREATE TABLE IF NOT EXISTS library_records(profile_id TEXT REFERENCES local_profiles(id), kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, title TEXT, dance TEXT, rating INTEGER, PRIMARY KEY(profile_id,kind,id));" +
      "CREATE INDEX IF NOT EXISTS library_video_lookup ON library_records(profile_id,kind,dance,rating);" +
      "CREATE TABLE IF NOT EXISTS local_state(key TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS library_checkpoints(id TEXT PRIMARY KEY NOT NULL, profile_id TEXT REFERENCES local_profiles(id), name TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);" +
      "PRAGMA user_version=1;",
  );
  const known = new Map<string, number>();
  async function write(
    transaction: SqlConnection,
    id: string,
    library: Library,
  ) {
    const previous = await transaction.getFirstAsync<Document>(
      "SELECT body,revision FROM library_documents WHERE profile_id=?",
      id,
    );
    if (previous && known.has(id) && previous.revision !== known.get(id))
      throw new Error(
        "This library changed in another process. Reopen it before saving.",
      );
    const existing = await transaction.getAllAsync<RecordRow>(
      "SELECT kind,id,body FROM library_records WHERE profile_id=?",
      id,
    );
    const old = new Map(existing.map((r) => [r.kind + ":" + r.id, r.body]));
    const keep = new Set<string>();
    const { videos: _v, playlists: _p, sessions: _s, ...settings } = library;
    const order: Record<string, string[]> = {};
    for (const kind of groups) {
      order[kind] = [];
      for (const record of library[kind]) {
        if (!record.id || keep.has(kind + ":" + record.id))
          throw new Error(
            "A library record has a missing or duplicate identity.",
          );
        const key = kind + ":" + record.id,
          body = JSON.stringify(record);
        order[kind].push(record.id);
        keep.add(key);
        if (old.get(key) === body) continue;
        const video =
          kind === "videos" ? (record as Library["videos"][number]) : undefined;
        await transaction.runAsync(
          "INSERT INTO library_records(profile_id,kind,id,body,title,dance,rating) VALUES(?,?,?,?,?,?,?) ON CONFLICT(profile_id,kind,id) DO UPDATE SET body=excluded.body,title=excluded.title,dance=excluded.dance,rating=excluded.rating",
          id,
          kind,
          record.id,
          body,
          video?.title ?? null,
          video?.style ?? null,
          video && video.ratingSet !== false ? video.importance : null,
        );
      }
    }
    for (const record of existing)
      if (!keep.has(record.kind + ":" + record.id))
        await transaction.runAsync(
          "DELETE FROM library_records WHERE profile_id=? AND kind=? AND id=?",
          id,
          record.kind,
          record.id,
        );
    const revision = (previous?.revision ?? 0) + 1;
    await transaction.runAsync(
      "INSERT INTO library_documents(profile_id,body,revision) VALUES(?,?,?) ON CONFLICT(profile_id) DO UPDATE SET body=excluded.body,revision=excluded.revision",
      id,
      JSON.stringify({ settings, order }),
      revision,
    );
    return revision;
  }
  return {
    profiles: () =>
      db.getAllAsync<LocalProfile>(
        "SELECT id,name,origin,created_at AS createdAt FROM local_profiles ORDER BY created_at,id",
      ),
    async addProfile(profile, library) {
      let revision = 0;
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "INSERT INTO local_profiles(id,name,origin,created_at) VALUES(?,?,?,?)",
          profile.id,
          profile.name,
          profile.origin,
          profile.createdAt,
        );
        revision = await write(tx, profile.id, library);
      });
      known.set(profile.id, revision);
    },
    async read(id) {
      let document: Document | null = null;
      let records: RecordRow[] = [];
      await db.withExclusiveTransactionAsync(async (tx) => {
        document = await tx.getFirstAsync<Document>(
          "SELECT body,revision FROM library_documents WHERE profile_id=?",
          id,
        );
        records = await tx.getAllAsync<RecordRow>(
          "SELECT kind,id,body FROM library_records WHERE profile_id=?",
          id,
        );
      });
      const saved = document as Document | null;
      if (!saved) throw new Error("This local library could not be found.");
      const { settings, order } = JSON.parse(saved.body);
      const data: Record<string, unknown> = { ...emptyLibrary(), ...settings };
      for (const kind of groups) {
        const indexed = new Map(
          records.filter((r) => r.kind === kind).map((r) => [r.id, r.body]),
        );
        data[kind] = (order[kind] as string[]).map((recordId) => {
          const body = indexed.get(recordId);
          if (!body)
            throw new Error(
              "A library record is missing. Your recovery records are kept.",
            );
          return JSON.parse(body);
        });
      }
      const library = readDeviceLibrary(JSON.stringify(data));
      known.set(id, saved.revision);
      return library;
    },
    async write(id, library) {
      let revision = 0;
      await db.withExclusiveTransactionAsync(async (tx) => {
        revision = await write(tx, id, library);
      });
      known.set(id, revision);
    },
    async getState<T>(key: string) {
      const row = await db.getFirstAsync<{ body: string }>(
        "SELECT body FROM local_state WHERE key=?",
        key,
      );
      return row ? (JSON.parse(row.body) as T) : null;
    },
    async setState(key, value) {
      await db.runAsync(
        "INSERT INTO local_state(key,body) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
        key,
        JSON.stringify(value),
      );
    },
    async checkpoint(profileId, name, library) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "INSERT INTO library_checkpoints(id,profile_id,name,created_at,body) VALUES(?,?,?,?,?)",
          uid(),
          profileId,
          name,
          new Date().toISOString(),
          JSON.stringify(library),
        );
        await tx.runAsync(
          "DELETE FROM library_checkpoints WHERE profile_id=? AND id NOT IN (SELECT id FROM library_checkpoints WHERE profile_id=? ORDER BY created_at DESC,rowid DESC LIMIT 5)",
          profileId,
          profileId,
        );
      });
    },
    checkpoints: (profileId) =>
      db.getAllAsync<Checkpoint>(
        "SELECT id,name,created_at AS createdAt FROM library_checkpoints WHERE profile_id=? ORDER BY created_at DESC,rowid DESC",
        profileId,
      ),
    async readCheckpoint(profileId, id) {
      const row = await db.getFirstAsync<{ body: string }>(
        "SELECT body FROM library_checkpoints WHERE profile_id=? AND id=?",
        profileId,
        id,
      );
      if (!row) throw new Error("This recovery point is no longer available.");
      return readDeviceLibrary(row.body);
    },
  };
}
