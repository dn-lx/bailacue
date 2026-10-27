import { describe, expect, it, vi, afterEach } from "vitest";
import {
  saveCloudBackup,
  listCloudBackups,
  readCloudBackup,
  utf8Size,
} from "../src/services/cloud/backup";
import type { Connection, CloudFolder } from "../src/core/types";
vi.mock("../src/services/cloud/accounts", () => ({
  accessToken: async () => "provider-token",
}));
vi.mock("../src/services/cloud/provider", () => ({
  provider: () => ({
    inspectFolder: async () => ({ name: "Metadata", writable: true }),
  }),
}));
const connection: Connection = {
  id: "g",
  accountId: "a",
  provider: "google-drive",
  name: "Me",
  email: "me@example.com",
  connected: true,
  writable: true,
};
const source: CloudFolder = {
  id: "s",
  connectionId: "g",
  provider: "google-drive",
  folderId: "chosen-folder",
  name: "Metadata",
  defaultStyle: "",
  defaultLabels: [],
  writable: true,
};
afterEach(() => vi.unstubAllGlobals());
describe("user-owned cloud backup files", () => {
  it("uploads a UTF-8 JSON string through a resumable Drive session into the exact selected folder", async () => {
    const content = JSON.stringify({ labels: ["Désirée 💃"] }),
      calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return calls.length === 1
          ? new Response("", {
              headers: {
                Location:
                  "https://www.googleapis.com/upload/drive/v3/files?upload_id=example",
              },
            })
          : Response.json({ id: "saved" });
      }),
    );
    await saveCloudBackup(connection, source, "BailaCue-test.json", content);
    expect(JSON.parse(String(calls[0].init?.body)).parents).toEqual([
      source.folderId,
    ]);
    expect(calls[1].init?.body).toBe(content);
    expect(
      (calls[1].init?.headers as Record<string, string>)["Content-Range"],
    ).toBe(
      `bytes 0-${Buffer.byteLength(content) - 1}/${Buffer.byteLength(content)}`,
    );
    expect(utf8Size(content)).toBe(Buffer.byteLength(content));
  });
  it("uses Dropbox add/autorename with ASCII-safe headers and a separate recovery folder", async () => {
    const fetcher = vi.fn(async () => Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", fetcher);
    await saveCloudBackup(
      { ...connection, provider: "dropbox" },
      { ...source, provider: "dropbox", folderId: "/Désirée" },
      "BailaCue-test.json",
      '{"labels":["Artist"]}',
    );
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1],
      header = (init.headers as Record<string, string>)["Dropbox-API-Arg"];
    expect(header).not.toMatch(/[^\x00-\x7f]/);
    expect(JSON.parse(header)).toMatchObject({
      path: "/Désirée/BailaCue-test.json",
      mode: "add",
      autorename: true,
    });
  });
  it("refuses foreign upload session hosts, permissions and files moved out of the reviewed folder", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("", {
          headers: { Location: "https://untrusted.example/upload" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      saveCloudBackup(connection, source, "BailaCue-test.json", "{}"),
    ).rejects.toThrow("unexpected");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      saveCloudBackup({ ...connection, writable: false }, source, "test", "{}"),
    ).rejects.toThrow("write access");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ files: [] })),
    );
    expect(await listCloudBackups(connection, source)).toEqual([]);
    await expect(
      readCloudBackup(connection, source, {
        id: "moved",
        name: "BailaCue-test.json",
        size: 10,
        modifiedAt: "",
      }),
    ).rejects.toThrow("no longer");
  });
});
