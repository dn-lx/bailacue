import { describe, expect, it, vi } from "vitest";
import {
  emptyLibrary,
  type CloudFolder,
  type Connection,
} from "../src/core/types";
import { parseFolder, reconcileSource, remoteId } from "../src/core/sources";
import { DropboxProvider } from "../src/services/providers/dropbox";
import { defaultReminders, reminderSchedule } from "../src/core/reminders";
import { metadataSnapshot, restoreSnapshot } from "../src/core/sync";
import {
  uploadFile,
  type PendingUpload,
} from "../src/services/cloud/uploadEngine";
const connection: Connection = {
  id: "c",
  provider: "google-drive",
  accountId: "my-account",
  name: "Dancer",
  email: "dancer@example.com",
  writable: true,
  connected: true,
};
const source: CloudFolder = {
  id: "s",
  connectionId: "c",
  provider: "google-drive",
  folderId: "folder-a",
  name: "Salsa",
  defaultStyle: "Salsa",
  defaultLabels: ["Class"],
  writable: true,
};
const file = {
  fileId: "f",
  name: "Footwork.mp4",
  mimeType: "video/mp4",
  size: 10,
  duration: 30,
  modifiedAt: "",
  canDownload: true,
};
const response = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers,
  });
const pending: PendingUpload = {
  id: "unique-job",
  videoId: "local",
  sourceId: "s",
  provider: "google-drive",
  name: "Footwork.mp4",
  mimeType: "video/mp4",
  size: 10,
  fileId: "",
  offset: 0,
  status: "queued",
  keepCopy: true,
};
describe("user-selected sources", () => {
  it.each(["google-drive", "dropbox", "mixed"] as const)(
    "keeps Salsa and Bachata folders independent with %s storage",
    (kind) => {
      const salsaConnection: Connection = {
        ...connection,
        provider: kind === "mixed" ? "google-drive" : kind,
      };
      const bachataConnection: Connection =
        kind === "mixed"
          ? { ...connection, id: "dropbox-account", provider: "dropbox" }
          : salsaConnection;
      const salsa: CloudFolder = {
        ...source,
        provider: salsaConnection.provider,
        defaultLabels: ["Salsa class"],
      };
      const bachata: CloudFolder = {
        ...source,
        id: "bachata",
        name: "Bachata",
        folderId: "bachata-folder",
        connectionId: bachataConnection.id,
        provider: bachataConnection.provider,
        defaultStyle: "Bachata",
        defaultLabels: ["Bachata class"],
      };
      let library = {
        ...emptyLibrary(),
        connections:
          kind === "mixed"
            ? [salsaConnection, bachataConnection]
            : [salsaConnection],
        sources: [salsa, bachata],
      };
      library = reconcileSource(library, salsa, [
        { ...file, fileId: "salsa-video" },
      ]);
      library = reconcileSource(library, bachata, [
        { ...file, fileId: "bachata-video" },
      ]);
      expect(library.sources).toHaveLength(2);
      expect(
        library.videos.map((video) => [
          video.style,
          video.labels,
          video.remote?.sourceIds,
        ]),
      ).toEqual([
        ["Salsa", ["Salsa class"], [salsa.id]],
        ["Bachata", ["Bachata class"], [bachata.id]],
      ]);
      library.videos[0] = {
        ...library.videos[0],
        labels: ["Artist A"],
        importance: 5,
      };
      library = reconcileSource(library, salsa, []);
      expect(library.videos[0].available).toBe(false);
      expect(library.videos[1].available).toBe(true);
      library = reconcileSource(library, salsa, [
        { ...file, fileId: "salsa-video" },
      ]);
      expect(library.videos[0]).toMatchObject({
        labels: ["Artist A"],
        importance: 5,
        available: true,
      });
      const restored = restoreSnapshot(
        metadataSnapshot(library),
        emptyLibrary(),
      );
      expect(
        restored.sources.map((folder) => [
          folder.name,
          folder.defaultStyle,
          folder.defaultLabels,
        ]),
      ).toEqual([
        ["Salsa", "Salsa", ["Salsa class"]],
        ["Bachata", "Bachata", ["Bachata class"]],
      ]);
    },
  );
  it("deduplicates a file across folders and preserves labels and ratings with numeric titles after rename/reconnect", () => {
    let library = {
      ...emptyLibrary(),
      connections: [connection],
      sources: [source, { ...source, id: "s2", folderId: "folder-b" }],
    };
    library = reconcileSource(library, source, [file]);
    library.videos[0] = {
      ...library.videos[0],
      title: "My move",
      labels: ["Personal"],
      importance: 5,
      notes: [{ id: "note", text: "Small steps", createdAt: "now" }],
    };
    library = reconcileSource(library, library.sources[1], [
      { ...file, name: "Renamed.mp4" },
    ]);
    expect(library.videos).toHaveLength(1);
    expect(library.videos[0]).toMatchObject({
      title: "Renamed",
      labels: ["Personal"],
      importance: 5,
      remote: { sourceIds: ["s", "s2"] },
    });
    library = reconcileSource(library, source, []);
    expect(library.videos[0].available).toBe(true);
    library = reconcileSource(library, library.sources[1], []);
    expect(library.videos[0].available).toBe(false);
    library = reconcileSource(library, source, [file]);
    expect(library.videos[0].notes[0].text).toBe("Small steps");
    expect(library.videos[0].available).toBe(true);
    expect(remoteId({ ...connection, id: "new-device-connection" }, "f")).toBe(
      library.videos[0].id,
    );
    expect(
      remoteId({ ...connection, accountId: "someone-else" }, "f"),
    ).not.toBe(library.videos[0].id);
  });
  it("parses folder links/paths without confusing shared Dropbox links for folders", () => {
    expect(
      parseFolder(
        "google-drive",
        "https://drive.google.com/drive/folders/abc-123?usp=sharing",
      ),
    ).toBe("abc-123");
    expect(parseFolder("dropbox", "/Dance/Salsa/")).toBe("/Dance/Salsa");
    expect(() =>
      parseFolder("dropbox", "https://dropbox.com/s/a/video"),
    ).toThrow(/path/);
  });
  it("syncs metadata without paths, credentials, thumbnails or device preferences", () => {
    let library = reconcileSource(
      { ...emptyLibrary(), connections: [connection], sources: [source] },
      source,
      [file],
    );
    library.videos[0] = {
      ...library.videos[0],
      offlineUri: "file:///private/video.mp4",
      thumbnail: "file:///private/thumb.jpg",
      storagePreference: "offline",
    };
    library.sources[0] = {
      ...library.sources[0],
      numberUploads: true,
      renameResult: {
        phase: "complete",
        total: 1,
        processed: 1,
        renamed: 0,
        alreadyNamed: 0,
        pending: 0,
        failures: [
          {
            fileId: "f",
            fileName: "video.mp4",
            message: "file:///private/phone-copy.mp4",
          },
        ],
        updatedAt: "now",
      },
    };
    const snapshot = metadataSnapshot(library),
      serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain("file://");
    expect(serialised).not.toContain("dropboxAppKey");
    expect(snapshot.connections[0].connected).toBe(false);
    expect(snapshot.sources[0].numberUploads).toBe(true);
    expect(snapshot.sources[0]).not.toHaveProperty("renameResult");
    expect(
      restoreSnapshot(snapshot, emptyLibrary()).videos[0].offlineUri,
    ).toBeUndefined();
    expect(restoreSnapshot(snapshot, library).videos[0].offlineUri).toBe(
      "file:///private/video.mp4",
    );
  });
});
describe("Dropbox adapter (mock HTTP)", () => {
  it("paginates nested folders and maps duration in milliseconds, excluding non-video files", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          entries: [
            {
              ".tag": "file",
              id: "id:v",
              name: "Move.mov",
              size: 10,
              media_info: {
                ".tag": "metadata",
                metadata: { ".tag": "video", duration: 12500 },
              },
            },
            { ".tag": "file", id: "id:txt", name: "readme.txt" },
          ],
          cursor: "next",
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        response({
          entries: [{ ".tag": "file", id: "id:two", name: "Second.mp4" }],
          cursor: "done",
          has_more: false,
        }),
      );
    const adapter = new DropboxProvider(async () => "own-token", request);
    const videos = (
      await adapter.listVideos({
        ...source,
        provider: "dropbox",
        folderId: "/Dance/Salsa",
      })
    ).videos;
    expect(videos).toHaveLength(2);
    expect(videos[0].duration).toBe(12.5);
    expect(request.mock.calls[1][0]).toContain("list_folder/continue");
    expect(request.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer own-token",
    );
  });
  it("resolves a fresh temporary media link and refuses unexpected origins", async () => {
    const adapter = new DropboxProvider(
      async () => "token",
      vi
        .fn()
        .mockResolvedValue(response({ link: "https://evil.example/file" })),
    );
    await expect(adapter.playback("id:v")).rejects.toMatchObject({
      code: "invalid",
    });
  });
  it.each([
    [401, "reauth"],
    [403, "permission"],
    [409, "missing"],
  ])("handles Dropbox status %s", async (status, code) => {
    const adapter = new DropboxProvider(
      async () => "token",
      vi.fn().mockResolvedValue(response({}, status as number)),
    );
    await expect(adapter.inspectFolder("/private")).rejects.toMatchObject({
      code,
    });
  });
});
describe("upload initiation and safe recovery (mock HTTP)", () => {
  it("recovers a renamed Dropbox upload by saved file ID without resending bytes", async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        ".tag": "file",
        id: "id:ours",
        name: "0001.mp4",
        size: 10,
      }),
    );
    const read = vi.fn();
    const result = await uploadFile(
      {
        ...pending,
        provider: "dropbox",
        fileId: "id:ours",
        path: "/Salsa/job-0001.mp4",
        status: "ready",
        offset: 10,
      },
      "/Salsa",
      {
        request,
        read,
        token: async () => "token",
        persist: vi.fn(),
      },
    );
    expect(JSON.parse(request.mock.calls[0][1].body).path).toBe("id:ours");
    expect(result.fileId).toBe("id:ours");
    expect(request).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["missing", "different"])(
    "never reuploads a confirmed Dropbox job when its ID is %s",
    async (kind) => {
      const request = vi.fn().mockResolvedValue(
        kind === "missing"
          ? response({}, 409)
          : response({
              ".tag": "file",
              id: "id:other",
              name: "0001.mp4",
              size: 10,
            }),
      );
      const read = vi.fn();
      await expect(
        uploadFile(
          {
            ...pending,
            provider: "dropbox",
            fileId: "id:ours",
            path: "/Salsa/job-0001.mp4",
          },
          "/Salsa",
          { request, read, token: async () => "token", persist: vi.fn() },
        ),
      ).rejects.toThrow(
        kind === "missing" ? /could not be found/ : /different file identity/,
      );
      expect(request).toHaveBeenCalledOnce();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it("refuses a resumed folder change before requesting a token, file bytes or HTTP", async () => {
    const request = vi.fn(),
      token = vi.fn(),
      read = vi.fn(),
      persist = vi.fn();
    await expect(
      uploadFile({ ...pending, folderId: "folder-a" }, "folder-b", {
        request,
        token,
        read,
        persist,
      }),
    ).rejects.toThrow("original upload folder changed");
    for (const operation of [request, token, read, persist])
      expect(operation).not.toHaveBeenCalled();
  });
  it.each(["drive-salsa", "drive-bachata"])(
    "uploads to selected Drive parent %s and confirms the final size",
    async (folderId) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(response({ ids: ["reserved"] }))
        .mockResolvedValueOnce(response({}, 404))
        .mockResolvedValueOnce(
          response(null, 200, {
            Location:
              "https://www.googleapis.com/upload/drive/v3/files?upload_id=one",
          }),
        )
        .mockResolvedValueOnce(response(null, 308))
        .mockResolvedValueOnce(response({ id: "reserved" }))
        .mockResolvedValueOnce(
          response({
            id: "reserved",
            name: "Footwork.mp4",
            mimeType: "video/mp4",
            size: "10",
            capabilities: { canDownload: true },
          }),
        );
      const states: PendingUpload[] = [];
      const result = await uploadFile({ ...pending, folderId }, folderId, {
        request,
        token: async () => "token",
        read: async (a, b) => new Blob([new Uint8Array(b - a)]),
        persist: async (j) => {
          states.push(j);
        },
      });
      expect(states[0].fileId).toBe("reserved");
      expect(result.fileId).toBe("reserved");
      expect(states.at(-1)?.status).toBe("ready");
      expect(JSON.parse(request.mock.calls[2][1].body).parents).toEqual([
        folderId,
      ]);
    },
  );
  it("does not re-upload a completed Drive file after the completion response was lost", async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        id: "reserved",
        name: "Move.mp4",
        mimeType: "video/mp4",
        size: "10",
      }),
    );
    await uploadFile(
      { ...pending, fileId: "reserved", status: "interrupted" },
      "folder",
      { request, token: async () => "token", read: vi.fn(), persist: vi.fn() },
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
  it.each(["/Salsa", "/Bachata"])(
    "creates the new Dropbox file inside the selected %s folder",
    async (folderId) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(
          response({ error_summary: "path/not_found" }, 409),
        )
        .mockResolvedValueOnce(response({ session_id: "new-session" }))
        .mockResolvedValueOnce(response(null))
        .mockResolvedValueOnce(
          response({ ".tag": "file", id: "id:new", name: "new.mp4", size: 10 }),
        );
      await uploadFile(
        { ...pending, provider: "dropbox", folderId, sequenceNumber: 1 },
        folderId,
        {
          request,
          token: async () => "token",
          read: async (a, b) => new Blob([new Uint8Array(b - a)]),
          persist: vi.fn(),
        },
      );
      const commit = JSON.parse(
        request.mock.calls.at(-1)![1].headers["Dropbox-API-Arg"],
      ).commit;
      expect(commit.path).toBe(`${folderId}/${pending.id}-${pending.name}`);
      expect(commit.mode).toBe("add");
    },
  );
  it("resumes Dropbox after a lost acknowledgement without changing its unique destination", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ error_summary: "path/not_found" }, 409))
      .mockResolvedValueOnce(
        response(
          { error: { ".tag": "incorrect_offset", correct_offset: 10 } },
          409,
        ),
      )
      .mockResolvedValueOnce(
        response({
          ".tag": "file",
          id: "id:done",
          name: "unique-Move.mp4",
          size: 10,
        }),
      );
    const states: PendingUpload[] = [];
    const result = await uploadFile(
      {
        ...pending,
        provider: "dropbox",
        sessionId: "session",
        path: "/Dance/unique-Move.mp4",
      },
      "/Dance",
      {
        request,
        token: async () => "token",
        read: async (a, b) => new Blob([new Uint8Array(b - a)]),
        persist: async (j) => {
          states.push(j);
        },
      },
    );
    expect(result.fileId).toBe("id:done");
    const commit = JSON.parse(
      request.mock.calls[2][1].headers["Dropbox-API-Arg"],
    ).commit;
    expect(commit).toMatchObject({
      path: "/Dance/unique-Move.mp4",
      mode: "add",
      autorename: false,
      strict_conflict: true,
    });
    expect(states.at(-1)?.status).toBe("ready");
  });
  it("keeps resumable state and never marks an interrupted upload ready", async () => {
    const persist = vi.fn();
    await expect(
      uploadFile({ ...pending, fileId: "reserved" }, "folder", {
        request: vi.fn().mockRejectedValue(new TypeError("Offline")),
        token: async () => "token",
        read: vi.fn(),
        persist,
      }),
    ).rejects.toThrow("Offline");
    expect(persist).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileId: "reserved", status: "interrupted" }),
    );
  });
});
describe("local reminder plan", () => {
  it("moves late-night Saturday reminders to Sunday after quiet hours", () => {
    expect(
      reminderSchedule({ ...defaultReminders(), weekdays: [7], time: "23:15" }),
    ).toEqual([{ id: "bailacue-practice-7", weekday: 1, hour: 8, minute: 0 }]);
  });
  it("keeps early-morning quiet-hour reminders on the same day and removes duplicates", () => {
    expect(
      reminderSchedule({
        ...defaultReminders(),
        weekdays: [2, 2],
        time: "07:00",
      }),
    ).toEqual([{ id: "bailacue-practice-2", weekday: 2, hour: 8, minute: 0 }]);
  });
  it("leaves allowed times unchanged and validates invalid clock values", () => {
    expect(
      reminderSchedule({
        ...defaultReminders(),
        weekdays: [3],
        time: "18:30",
      })[0],
    ).toMatchObject({ weekday: 3, hour: 18, minute: 30 });
    expect(() =>
      reminderSchedule({ ...defaultReminders(), time: "25:00" }),
    ).toThrow(/HH:MM/);
  });
});

it("renames a Dropbox video inside its selected folder without overwrite or ownership transfer", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        ".tag": "file",
        id: "id:v",
        path_display: "/Dance/Salsa/Turn.mp4",
      }),
    )
    .mockResolvedValueOnce(response({ metadata: { id: "id:v" } }));
  const adapter = new DropboxProvider(async () => "token", request);
  await adapter.renameVideo("id:v", "0001 — Turn.mp4", "/dance/salsa");
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
    from_path: "id:v",
    to_path: "/Dance/Salsa/0001 — Turn.mp4",
    autorename: false,
    allow_ownership_transfer: false,
  });
  const denied = vi.fn().mockResolvedValue(
    response({
      ".tag": "file",
      id: "id:v",
      path_display: "/Elsewhere/Turn.mp4",
    }),
  );
  await expect(
    new DropboxProvider(async () => "token", denied).renameVideo(
      "id:v",
      "0001 — Turn.mp4",
      "/Dance/Salsa",
    ),
  ).rejects.toMatchObject({ code: "invalid" });
  expect(denied).toHaveBeenCalledTimes(1);
});
