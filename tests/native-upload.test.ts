import { afterEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  size: 114.5 * 1048576,
  offset: 0,
  closed: 0,
  reads: [] as number[],
  request: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: { uri: "file:///owned/" } },
  FileMode: { ReadOnly: "r" },
  File: class {
    exists = true;
    size = io.size;
    open() {
      return {
        offset: 0,
        async readBytes(this: { offset: number }, count: number) {
          io.reads.push(count);
          const bytes = new Uint8Array(count);
          bytes[0] = this.offset % 251;
          bytes[count - 1] = (this.offset + count - 1) % 251;
          this.offset += count;
          return bytes;
        },
        close() {
          io.closed++;
        },
      };
    }
  },
}));
vi.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => io.request(...args),
}));
vi.mock("../src/services/cloud/accounts", () => ({
  accessToken: async () => "synthetic-token",
}));
vi.mock("../src/services/cloud/vault", () => ({ vault: { set: vi.fn() } }));
import { uploadVideo } from "../src/services/cloud/upload.native";
import type { PendingUpload } from "../src/services/cloud/uploadEngine";
import type { CloudFolder, Connection } from "../src/core/types";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  io.offset = 0;
  io.closed = 0;
  io.reads = [];
});
it.each(["google-drive", "dropbox"] as const)(
  "sends a 114.5 MiB %s upload in bounded byte chunks when React Native Blob rejects buffers, including lost-ack resume",
  async (provider) => {
    vi.stubGlobal(
      "Blob",
      class {
        constructor() {
          throw new Error(
            "Creating blobs from ArrayBuffer and ArrayBufferView are not supported",
          );
        }
      },
    );
    let interrupted = false,
      done = false;
    const json = (
      data: unknown,
      status = 200,
      headers?: Record<string, string>,
    ) =>
      new Response(data === null ? null : JSON.stringify(data), {
        status,
        headers,
      });
    const metadata =
      provider === "dropbox"
        ? {
            ".tag": "file",
            id: "id:reserved",
            name: "0001 — Footwork.mp4",
            size: io.size,
          }
        : {
            id: "reserved",
            name: "0001 — Footwork.mp4",
            mimeType: "video/mp4",
            size: String(io.size),
          };
    io.request.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes("generateIds")) return json({ ids: ["reserved"] });
      if (
        url.includes("get_metadata") ||
        url.includes("/drive/v3/files/reserved")
      )
        return done
          ? json(metadata)
          : json({}, provider === "dropbox" ? 409 : 404);
      if (init.method === "POST" && url.includes("uploadType"))
        return json(null, 200, {
          Location:
            "https://www.googleapis.com/upload/drive/v3/files?upload_id=test",
        });
      const arg =
        init.headers && new Headers(init.headers).get("Dropbox-API-Arg");
      if (url.includes("upload_session/start")) {
        expect(init.body).toBeInstanceOf(Uint8Array);
        return json({ session_id: "session" });
      }
      if (url.includes("upload_session/finish")) {
        done = true;
        return json(metadata);
      }
      const range = new Headers(init.headers).get("Content-Range");
      if (range?.startsWith("bytes */"))
        return json(
          null,
          308,
          io.offset ? { Range: `bytes=0-${io.offset - 1}` } : {},
        );
      const body = init.body as Uint8Array;
      expect(body).toBeInstanceOf(Uint8Array);
      expect(body.byteLength).toBeLessThanOrEqual(2 * 1048576);
      const start = arg
        ? JSON.parse(arg).cursor.offset
        : Number(/^bytes (\d+)-/.exec(range!)![1]);
      if (start !== io.offset && arg)
        return json(
          { error: { ".tag": "incorrect_offset", correct_offset: io.offset } },
          409,
        );
      expect(start).toBe(io.offset);
      expect(body[0]).toBe(start % 251);
      expect(body.at(-1)).toBe((start + body.byteLength - 1) % 251);
      io.offset += body.byteLength;
      if (!interrupted) {
        interrupted = true;
        throw new TypeError("Lost acknowledgement");
      }
      if (provider === "dropbox") return json(null);
      if (io.offset === io.size) {
        done = true;
        return json({ id: "reserved" });
      }
      return json(null, 308, { Range: `bytes=0-${io.offset - 1}` });
    });
    const connection: Connection = {
      id: "c",
      provider,
      accountId: "own",
      email: "test@example.com",
      name: "test",
      writable: true,
      connected: true,
    };
    const source: CloudFolder = {
      id: "s",
      connectionId: "c",
      provider,
      folderId: provider === "dropbox" ? "/Salsa" : "folder",
      name: "Salsa",
      defaultStyle: "Salsa",
      defaultLabels: [],
      writable: true,
    };
    let job: PendingUpload = {
      id: "job",
      videoId: "local",
      sourceId: "s",
      provider,
      name: "0001 — Footwork.mp4",
      sequenceNumber: 1,
      mimeType: "video/mp4",
      size: io.size,
      fileId: "",
      offset: 0,
      status: "queued",
      keepCopy: true,
    };
    const progress = (next: PendingUpload) => {
      job = next;
    };
    await expect(
      uploadVideo(
        job,
        "file:///owned/video.mp4",
        source,
        connection,
        progress,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Lost acknowledgement");
    expect(job.status).toBe("interrupted");
    const result = await uploadVideo(
      job,
      "file:///owned/video.mp4",
      source,
      connection,
      progress,
      new AbortController().signal,
    );
    expect(result.size).toBe(io.size);
    expect(job.status).toBe("ready");
    expect(io.offset).toBe(io.size);
    expect(Math.max(...io.reads)).toBe(2 * 1048576);
    expect(io.closed).toBe(2);
  },
);
