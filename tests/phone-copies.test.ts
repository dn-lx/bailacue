import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  fail: false,
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///owned/" } },
  Directory: class {
    uri: string;
    constructor(...paths: (string | { uri: string })[]) {
      this.uri =
        paths
          .map((p) => (typeof p === "string" ? p : p.uri.replace(/\/$/, "")))
          .join("/") + "/";
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(path: string | { uri: string }, name?: string) {
      this.uri = typeof path === "string" ? path : path.uri + name;
    }
    get exists() {
      return io.files.has(this.uri);
    }
    get size() {
      return io.files.get(this.uri)?.byteLength ?? 0;
    }
    async digest() {
      return [...(io.files.get(this.uri) ?? [])].join(",");
    }
    async copy(to: { uri: string }) {
      io.files.set(to.uri, new Uint8Array([0]));
      await Promise.resolve();
      if (io.fail) throw new Error("Disk full");
      io.files.set(to.uri, io.files.get(this.uri)!.slice());
    }
    delete() {
      io.files.delete(this.uri);
    }
  },
}));
import { prepareNamedCopy } from "../src/services/phoneCopies.native";
beforeEach(() => {
  io.files.clear();
  io.files.set("file:///owned/input.mp4", new Uint8Array([1, 2, 3]));
  io.fail = false;
});
it("creates the actual numbered filename and preserves the old copy until durable caller cleanup", async () => {
  const uri = await prepareNamedCopy(
    "file:///owned/input.mp4",
    "0001.mp4",
    "salsa-video",
  );
  expect(uri).toBe("file:///owned/bailacue-numbered/salsa-video/0001.mp4");
  expect(io.files.get(uri)).toEqual(new Uint8Array([1, 2, 3]));
  expect(io.files.has("file:///owned/input.mp4")).toBe(true);
  expect(
    await prepareNamedCopy(
      "file:///owned/input.mp4",
      "0001.mp4",
      "salsa-video",
    ),
  ).toBe(uri);
  const bachata = await prepareNamedCopy(
    "file:///owned/input.mp4",
    "0001.mp4",
    "bachata-video",
  );
  expect(bachata).not.toBe(uri);
});
it("does not replace a different same-size file or remove the original after a failed copy", async () => {
  const dest = "file:///owned/bailacue-numbered/v/0001.mp4";
  io.files.set(dest, new Uint8Array([9, 9, 9]));
  await expect(
    prepareNamedCopy("file:///owned/input.mp4", "0001.mp4", "v"),
  ).rejects.toThrow("different phone file");
  io.files.delete(dest);
  io.fail = true;
  await expect(
    prepareNamedCopy("file:///owned/input.mp4", "0001.mp4", "v"),
  ).rejects.toThrow("Disk full");
  expect(io.files.has(dest)).toBe(false);
  expect(io.files.get("file:///owned/input.mp4")).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  await expect(
    prepareNamedCopy("file:///gallery/original.mp4", "0001.mp4", "v"),
  ).rejects.toThrow("Only BailaCue");
});
