import { beforeEach, expect, it, vi } from "vitest";
import { emptyLibrary, type Library } from "../src/core/types";
const remote = vi.hoisted(() => ({
  inspectFolder: vi.fn(),
  listVideos: vi.fn(),
  renameVideo: vi.fn(),
  prepare: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../src/services/cloud/vault", () => ({ vault: { get: remote.get } }));
vi.mock("../src/services/cloud/provider", () => ({ provider: () => remote }));
vi.mock("../src/services/phoneCopies", () => ({
  prepareNamedCopy: remote.prepare,
}));
vi.mock("../src/services/media", () => ({ deleteMedia: remote.remove }));
import { scanSource } from "../src/services/cloud/scan";
import { reconcileSource } from "../src/core/sources";
function fixture() {
  let library = emptyLibrary();
  library.connections = [
    {
      id: "c",
      provider: "google-drive",
      accountId: "own",
      name: "Dancer",
      email: "test@example.com",
      connected: true,
      writable: true,
    },
  ];
  library.sources = [
    {
      id: "s",
      connectionId: "c",
      provider: "google-drive",
      folderId: "folder",
      name: "Salsa",
      defaultStyle: "Salsa",
      defaultLabels: [],
      writable: true,
    },
  ];
  return {
    getLibrary: () => library,
    commit: vi.fn(async (action: (l: Library) => Library) => {
      library = action(library);
      return library;
    }),
  };
}
const file = {
  fileId: "id:one",
  name: "Turn.mp4",
  mimeType: "video/mp4",
  size: 10,
  duration: 6,
  modifiedAt: "",
  canDownload: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  remote.get.mockResolvedValue(null);
  remote.inspectFolder.mockResolvedValue({ writable: true });
  remote.listVideos.mockResolvedValue({ videos: [file] });
  remote.renameVideo.mockResolvedValue(undefined);
});
it("saves a numbering reservation before renaming the exact source file and discovers later additions", async () => {
  const store = fixture();
  remote.renameVideo.mockImplementation(async () => {
    expect(
      store.getLibrary().sources[0].numbering?.files[file.fileId].number,
    ).toBe(1);
  });
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).toHaveBeenCalledWith(
    file.fileId,
    "0001.mp4",
    "folder",
  );
  expect(store.getLibrary().videos[0].title).toBe("0001");
  remote.renameVideo.mockResolvedValue(undefined);
  remote.listVideos.mockResolvedValue({
    videos: [
      { ...file, name: "0001.mp4" },
      { ...file, fileId: "outside", name: "Outside.mp4" },
    ],
  });
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).toHaveBeenLastCalledWith(
    "outside",
    "0002.mp4",
    "folder",
  );
  expect(store.getLibrary().videos).toHaveLength(2);
});
it("does not rename if reservations cannot be saved and keeps library entries on incomplete scans", async () => {
  const store = fixture();
  store.commit.mockRejectedValueOnce(new Error("Disk full"));
  await expect(scanSource(store, "s", { rename: true })).rejects.toThrow(
    "Disk full",
  );
  expect(remote.renameVideo).not.toHaveBeenCalled();
  await scanSource(store, "s", { rename: true });
  remote.listVideos.mockRejectedValueOnce(new Error("Page two failed"));
  await expect(scanSource(store, "s", { rename: true })).rejects.toThrow(
    "Page two failed",
  );
  expect(store.getLibrary().videos[0].available).toBe(true);
});
it("records remote rename failures for retry and commits phone references before removing old copies", async () => {
  const store = fixture();
  remote.renameVideo.mockRejectedValueOnce(new Error("Read only"));
  await scanSource(store, "s", { rename: true });
  expect(store.getLibrary().sources[0].renameResult?.failures[0].message).toBe(
    "Read only",
  );
  expect(store.getLibrary().videos[0].title).toBe("Turn");
  store.getLibrary().videos[0].offlineUri = "file:///owned/old.mp4";
  remote.prepare.mockResolvedValue("file:///owned/0001.mp4");
  remote.remove.mockImplementation(async () => {
    expect(store.getLibrary().videos[0].offlineUri).toBe(
      "file:///owned/0001.mp4",
    );
  });
  remote.renameVideo.mockResolvedValue(undefined);
  await scanSource(store, "s", { rename: true });
  expect(store.getLibrary().sources[0].renameResult?.failures).toEqual([]);
  expect(remote.remove).toHaveBeenCalledWith("file:///owned/old.mp4");
});

it("leaves completed legacy jobs at their saved path until resume registers the file", async () => {
  const store = fixture();
  store.getLibrary().videos.push({ id: "local", remote: undefined } as never);
  const staged = { ...file, name: "job-Turn.mp4" };
  remote.listVideos.mockResolvedValue({ videos: [staged] });
  remote.get.mockImplementation(async (key: string) =>
    key === "upload-for-local"
      ? "job"
      : JSON.stringify({
          sourceId: "s",
          path: "/Salsa/job-Turn.mp4",
          fileId: "",
          status: "interrupted",
        }),
  );
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).not.toHaveBeenCalled();
});

it("renames every existing descriptive source file and cached phone copy to its allocated number only", async () => {
  const store = fixture();
  await store.commit((l) => reconcileSource(l, l.sources[0], [file]));
  store.getLibrary().videos[0].title = "0001 — Old title";
  store.getLibrary().videos[0].offlineUri = "file:///owned/0001 — Turn.mp4";
  remote.listVideos.mockResolvedValue({
    videos: [{ ...file, name: "0001 — Turn.mp4" }],
  });
  remote.prepare.mockResolvedValue("file:///owned/0001.mp4");
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).toHaveBeenCalledWith(
    file.fileId,
    "0001.mp4",
    "folder",
  );
  expect(remote.prepare).toHaveBeenCalledWith(
    "file:///owned/0001 — Turn.mp4",
    "0001.mp4",
    store.getLibrary().videos[0].id,
  );
  expect(store.getLibrary().videos[0]).toMatchObject({
    title: "0001",
    offlineUri: "file:///owned/0001.mp4",
  });
  expect(store.getLibrary().sources[0].numbering?.next).toBe(2);
});

it.each([undefined, false, true])(
  "discovery is read-only even when new-upload numbering is %s",
  async (numberUploads) => {
    const store = fixture();
    store.getLibrary().sources[0].numberUploads = numberUploads;
    await scanSource(store, "s");
    store.getLibrary().videos[0].offlineUri = "file:///owned/original.mp4";
    store.getLibrary().videos[0].title = "0001";
    await scanSource(store, "s");
    expect(remote.renameVideo).not.toHaveBeenCalled();
    expect(remote.prepare).not.toHaveBeenCalled();
    expect(remote.get).not.toHaveBeenCalled();
    expect(store.getLibrary().videos[0]).toMatchObject({
      title: "Turn",
      remote: { fileName: "Turn.mp4" },
      offlineUri: "file:///owned/original.mp4",
    });
  },
);

it("reports per-file failures and retries only the remaining cloud changes", async () => {
  const store = fixture();
  const server = [
    { ...file, fileId: "a", name: "A.mp4" },
    { ...file, fileId: "b", name: "B.mp4" },
  ];
  let denyA = true;
  remote.listVideos.mockImplementation(async () => ({
    videos: server.map((v) => ({ ...v })),
  }));
  remote.renameVideo.mockImplementation(async (id: string, name: string) => {
    if (id === "a" && denyA)
      throw new Error(
        "Drive rename failed (HTTP 403): insufficientFilePermissions",
      );
    server.find((v) => v.fileId === id)!.name = name;
  });
  const updates: { processed: number; renamed: number }[] = [];
  await scanSource(store, "s", {
    rename: true,
    onProgress: (p) => updates.push(p),
  });
  expect(store.getLibrary().sources[0].renameResult).toMatchObject({
    phase: "complete",
    total: 2,
    processed: 2,
    renamed: 1,
    failures: [
      {
        fileId: "a",
        fileName: "A.mp4",
        message: expect.stringContaining("HTTP 403"),
      },
    ],
  });
  expect(store.getLibrary().videos.map((v) => v.title)).toEqual(["A", "0002"]);
  expect(updates.some((p) => p.processed === 1)).toBe(true);
  remote.renameVideo.mockClear();
  await scanSource(store, "s");
  expect(remote.renameVideo).not.toHaveBeenCalled();
  expect(store.getLibrary().sources[0].renameResult?.failures).toHaveLength(1);
  denyA = false;
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).toHaveBeenCalledTimes(1);
  expect(remote.renameVideo).toHaveBeenCalledWith("a", "0001.mp4", "folder");
  expect(store.getLibrary().sources[0].renameResult).toMatchObject({
    renamed: 1,
    alreadyNamed: 1,
    failures: [],
  });
  expect(store.getLibrary().sources[0].numberUploads).toBeUndefined();
});

it("pauses after the current file and resumes with the same numbers", async () => {
  const store = fixture();
  const server = ["A", "B", "C"].map((id) => ({
    ...file,
    fileId: id,
    name: `${id}.mp4`,
  }));
  const controller = new AbortController();
  remote.listVideos.mockImplementation(async () => ({
    videos: server.map((v) => ({ ...v })),
  }));
  remote.renameVideo.mockImplementation(async (id: string, name: string) => {
    server.find((v) => v.fileId === id)!.name = name;
    controller.abort();
  });
  await scanSource(store, "s", { rename: true, signal: controller.signal });
  expect(remote.renameVideo).toHaveBeenCalledTimes(1);
  expect(store.getLibrary().sources[0].renameResult).toMatchObject({
    phase: "paused",
    processed: 1,
    total: 3,
    renamed: 1,
  });
  remote.renameVideo
    .mockClear()
    .mockImplementation(async (id: string, name: string) => {
      server.find((v) => v.fileId === id)!.name = name;
    });
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).toHaveBeenCalledTimes(2);
  expect(server.map((v) => v.name)).toEqual([
    "0001.mp4",
    "0002.mp4",
    "0003.mp4",
  ]);
  expect(store.getLibrary().sources[0].numbering?.next).toBe(4);
});

it("does not rename files that appeared after the reviewed preview", async () => {
  const store = fixture();
  remote.listVideos.mockResolvedValue({
    videos: [file, { ...file, fileId: "outside", name: "Outside.mp4" }],
  });
  await scanSource(store, "s", { rename: true, fileIds: [file.fileId] });
  expect(remote.renameVideo).toHaveBeenCalledTimes(1);
  expect(remote.renameVideo.mock.calls[0][0]).toBe(file.fileId);
  expect(
    store.getLibrary().videos.find((v) => v.remote?.fileId === "outside")
      ?.title,
  ).toBe("Outside");
});

it("queues an explicit rename behind an in-flight discovery instead of ignoring the request", async () => {
  const store = fixture();
  let finish: (result: { videos: (typeof file)[] }) => void = () => {};
  remote.listVideos
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ videos: [file] });
  const reading = scanSource(store, "s");
  await vi.waitFor(() => expect(remote.listVideos).toHaveBeenCalledTimes(1));
  const renaming = scanSource(store, "s", { rename: true });
  finish({ videos: [file] });
  await Promise.all([reading, renaming]);
  expect(remote.listVideos).toHaveBeenCalledTimes(2);
  expect(remote.renameVideo).toHaveBeenCalledWith(
    file.fileId,
    "0001.mp4",
    "folder",
  );
});

it("reports write-permission failures without claiming the filename changed", async () => {
  const store = fixture();
  remote.inspectFolder.mockResolvedValue({ writable: false });
  await scanSource(store, "s", { rename: true });
  expect(remote.renameVideo).not.toHaveBeenCalled();
  expect(store.getLibrary().videos[0].remote?.fileName).toBe("Turn.mp4");
  expect(
    store.getLibrary().sources[0].renameResult?.failures[0].message,
  ).toContain("write access");
});
