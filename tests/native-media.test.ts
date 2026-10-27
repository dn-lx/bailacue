import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  files: new Map<string, number>(),
  finish: undefined as undefined | (() => void),
  failCopy: false,
  inspect: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Paths: {
    document: { uri: "file:///owned/" },
    cache: { uri: "file:///cache/" },
    availableDiskSpace: 1e9,
  },
  Directory: class {
    uri: string;
    constructor(_root: unknown, name: string) {
      this.uri = `file:///owned/${name}/`;
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(root: string | { uri: string }, name?: string) {
      this.uri = name
        ? `${(root as { uri: string }).uri}${name}`
        : (root as string);
    }
    get exists() {
      return io.files.has(this.uri);
    }
    get size() {
      return io.files.get(this.uri) ?? 0;
    }
    delete() {
      io.files.delete(this.uri);
    }
    async copy(destination: { uri: string }) {
      io.files.set(destination.uri, 0);
      await new Promise<void>((resolve) => {
        io.finish = resolve;
      });
      if (io.failCopy) throw new Error("copy interrupted");
      io.files.set(destination.uri, this.size);
    }
    async move(destination: { uri: string }) {
      await new Promise<void>((resolve) => {
        io.finish = resolve;
      });
      io.files.set(destination.uri, this.size);
      io.files.delete(this.uri);
      this.uri = destination.uri;
    }
  },
}));
vi.mock("expo-document-picker", () => ({
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [{ uri: "file:///cache/input.mp4", name: "input.mp4" }],
  }),
}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-media-library/legacy", () => ({}));
vi.mock("../modules/baila-media", () => ({
  nativeMedia: () => ({ getInfoAsync: io.inspect }),
}));
vi.mock("expo-network", () => ({}));
vi.mock("expo-file-system/legacy", () => ({
  createDownloadResumable: (_url: string, uri: string) => ({
    downloadAsync: async () => {
      io.files.set(uri, 12);
      return { status: 200 };
    },
    cancelAsync: async () => {},
  }),
}));
import { importMedia } from "../src/services/media.native";
import { downloadVideo } from "../src/services/cloud/download.native";
beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.files.set("file:///cache/input.mp4", 12);
  io.finish = undefined;
  io.failCopy = false;
  io.inspect.mockImplementation(async (uri: string) => {
    if (io.files.get(uri) !== 12)
      throw new Error("media inspected before file was ready");
    return { duration: 6, width: 320, height: 240 };
  });
});
it("waits for the actual copy before inspection and keeps picker cache until completion", async () => {
  const result = importMedia();
  await vi.waitFor(() => expect(io.finish).toBeTypeOf("function"));
  expect(io.inspect).not.toHaveBeenCalled();
  expect(io.files.has("file:///cache/input.mp4")).toBe(true);
  io.finish!();
  expect(await result).toMatchObject({ duration: 6, size: 12 });
  expect(io.files.has("file:///cache/input.mp4")).toBe(false);
});
it("removes partial owned copies and picker cache when copying fails", async () => {
  io.failCopy = true;
  const result = importMedia();
  const rejected = expect(result).rejects.toThrow("copy interrupted");
  await vi.waitFor(() => expect(io.finish).toBeTypeOf("function"));
  io.finish!();
  await rejected;
  expect([...io.files.keys()]).toEqual([]);
  expect(io.inspect).not.toHaveBeenCalled();
});
it("waits for a download move to finish before inspecting or registering its destination", async () => {
  const progress = vi.fn();
  const result = downloadVideo(
    { uri: "https://provider.test/video", headers: {} },
    12,
    false,
    progress,
  );
  await vi.waitFor(() => expect(io.finish).toBeTypeOf("function"));
  expect(io.inspect).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalledWith(1);
  io.finish!();
  expect(await result).toMatchObject({ size: 12, duration: 6 });
  expect(progress).toHaveBeenCalledWith(1);
  expect([...io.files.keys()].some((key) => key.endsWith(".part"))).toBe(false);
});
