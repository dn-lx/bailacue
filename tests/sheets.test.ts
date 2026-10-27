import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createBackup, readBackup, canonical } from "../src/core/backups";
import { emptyLibrary, type Library } from "../src/core/types";
import { metadataSnapshot } from "../src/core/sync";
import { sheetClient, type SheetBook } from "../src/services/sheets/client";
import { type Cell } from "../src/services/sheets/codec";
import {
  stateKey,
  syncSheet,
  type SheetSyncState,
} from "../src/services/sheets/sync";
import type { LocalRepository } from "../src/services/local/types";
vi.mock("../src/services/cloud/accounts", () => ({
  accessToken: async () => "test-provider-token",
}));
vi.mock("../src/services/backup", () => ({
  makeBackup: (library: Library) => createBackup(library, digest),
  parseBackup: (raw: string) => readBackup(raw, digest),
}));
const digest = async (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
const id = "sheet-abcdefghijklmnopqrst";
function google() {
  let book: SheetBook = {
    spreadsheetId: id,
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/" + id,
    properties: { title: "My recovery" },
    sheets: [
      {
        properties: {
          sheetId: 0,
          title: "My existing notes",
          gridProperties: { rowCount: 1000, columnCount: 7 },
        },
      },
    ],
  };
  let cells = new Map<string, Cell[][]>([
    ["My existing notes", [["Never overwrite"]]],
  ]);
  const batches: any[][] = [];
  let failure = 0;
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      if (failure) {
        const status = failure;
        failure = 0;
        return new Response("{}", { status });
      }
      const url = new URL(String(input));
      if (url.pathname.endsWith(":batchUpdate")) {
        const requests = JSON.parse(String(init?.body)).requests;
        const nextBook = structuredClone(book),
          nextCells = structuredClone(cells);
        for (const r of requests) {
          if (r.addSheet) {
            nextBook.sheets.push(r.addSheet);
            nextCells.set(r.addSheet.properties.title, []);
          }
          if (r.updateSheetProperties)
            nextBook.sheets.find(
              (s) =>
                s.properties.sheetId ===
                r.updateSheetProperties.properties.sheetId,
            )!.properties.gridProperties =
              r.updateSheetProperties.properties.gridProperties;
          const data = r.updateCells ?? r.appendCells;
          if (data) {
            const sheetId =
              data.sheetId ?? data.range?.sheetId ?? data.start?.sheetId;
            const title = nextBook.sheets.find(
              (s) => s.properties.sheetId === sheetId,
            )!.properties.title;
            const rows = data.rows.map((row: any) =>
              row.values.map(
                (c: any) =>
                  c.userEnteredValue.stringValue ??
                  c.userEnteredValue.numberValue ??
                  c.userEnteredValue.boolValue,
              ),
            );
            if (r.appendCells)
              nextCells.set(title, [...(nextCells.get(title) ?? []), ...rows]);
            else if (data.range) nextCells.set(title, rows);
            else {
              const current = nextCells.get(title) ?? [];
              current.splice(data.start.rowIndex, rows.length, ...rows);
              nextCells.set(title, current);
            }
          }
        }
        book = nextBook;
        cells = nextCells;
        batches.push(requests);
        return Response.json({});
      }
      if (url.pathname.endsWith("/values:batchGet"))
        return Response.json({
          valueRanges: url.searchParams
            .getAll("ranges")
            .map((range) => ({ values: cells.get(range.split("'")[1]) ?? [] })),
        });
      if (url.pathname.includes("/values/"))
        return Response.json({
          values: (cells.get("BailaCue Versions") ?? []).slice(1),
        });
      return Response.json(book);
    },
  ) as typeof fetch;
  return {
    fetcher,
    get cells() {
      return cells;
    },
    batches,
    inspect: () => book,
    fail: (status: number) => {
      failure = status;
    },
    client: sheetClient({
      token: async () => "test",
      parse: (raw) => readBackup(raw, digest),
      fetch: fetcher,
    }),
  };
}
const account = {
  id: "google-1",
  provider: "google-drive" as const,
  accountId: "1",
  email: "me@example.com",
  name: "Me",
  connected: true,
  writable: true,
};
function memory() {
  const states = new Map<string, any>();
  let library: Library = { ...emptyLibrary(), connections: [account] };
  const points: Library[] = [];
  const repo = {
    getState: async (key: string) => structuredClone(states.get(key) ?? null),
    setState: async (key: string, value: unknown) => {
      states.set(key, structuredClone(value));
    },
    checkpoint: async (_p: string, _n: string, value: Library) => {
      points.push(value);
    },
  } as unknown as LocalRepository;
  return {
    repo,
    points,
    get: () => library,
    edit: (value: Library) => {
      library = value;
    },
    commit: async (action: (l: Library) => Library) => {
      library = action(library);
      return library;
    },
  };
}
describe("Google Sheets transport", () => {
  it("initializes only its own tabs atomically, preserves existing tabs, and retains complete recovery history", async () => {
    const g = google(),
      b = await createBackup(emptyLibrary(), digest);
    await g.client.initialize(g.inspect(), b);
    expect(g.cells.get("My existing notes")).toEqual([["Never overwrite"]]);
    expect(g.batches).toHaveLength(1);
    expect(g.cells.get("BailaCue Versions")![0][0]).toBe("Revision");
    expect((await g.client.history(id))[0].id).toBe(b.id);
    expect((await (await g.client.history(id))[0].load()).library).toEqual(
      b.library,
    );
    const before = await g.client.read(id),
      next = await createBackup(
        { ...emptyLibrary(), labels: ['=HYPERLINK("x")'] },
        digest,
      );
    await g.client.write(id, next, before.fingerprint, b);
    expect(g.batches[1].some((r) => r.appendCells)).toBe(true);
    expect(
      g.batches[1].find(
        (r) =>
          r.updateCells?.range?.sheetId ===
          g
            .inspect()
            .sheets.find((s) => s.properties.title === "BailaCue Labels")!
            .properties.sheetId,
      ).updateCells.rows[1].values[0],
    ).toEqual({ userEnteredValue: { stringValue: '=HYPERLINK("x")' } });
    expect(await (await g.client.history(id))[0].load()).toEqual(next);
    await expect(g.client.initialize(g.inspect(), next)).rejects.toThrow(
      "already",
    );
  });
  it("refuses stale writes before mutation and reports unavailable API/quota without altering the phone", async () => {
    const g = google(),
      b = await createBackup(emptyLibrary(), digest);
    await g.client.initialize(g.inspect(), b);
    const stale = await g.client.read(id);
    g.cells.get("BailaCue Labels")!.push(["New from sheet"]);
    await expect(g.client.write(id, b, stale.fingerprint)).rejects.toThrow(
      "changed",
    );
    expect(g.batches).toHaveLength(1);
    g.fail(403);
    await expect(g.client.read(id)).rejects.toThrow("Enable Google Sheets API");
    g.fail(429);
    await expect(g.client.read(id)).rejects.toThrow("queued");
  });
  it("stores multi-cell recovery data without truncation", async () => {
    const g = google();
    const l = {
      ...emptyLibrary(),
      labels: Array.from({ length: 200 }, (_, i) => i + "-" + "a".repeat(300)),
    };
    const b = await createBackup(l, digest);
    await g.client.initialize(g.inspect(), b);
    expect(g.cells.get("BailaCue Recovery")!.length).toBeGreaterThan(2);
    expect((await g.client.read(id)).backup.checksum).toBe(b.checksum);
  });
});
describe("two-way Sheets coordinator", () => {
  it("pushes offline edits after retry, pulls disjoint remote settings, and avoids background overwrites", async () => {
    const g = google(),
      m = memory(),
      base = metadataSnapshot(m.get());
    await g.client.initialize(g.inspect(), await createBackup(m.get(), digest));
    vi.stubGlobal("fetch", g.fetcher);
    await m.repo.setState(stateKey("p"), {
      enabled: true,
      spreadsheetId: id,
      connectionId: account.id,
      base,
    });
    m.edit({ ...m.get(), labels: ["Offline label"] });
    g.fail(429);
    const failed = await syncSheet({
      repository: m.repo,
      profileId: "p",
      get: m.get,
      commit: m.commit,
    });
    expect(failed.pending).toBe(true);
    expect(m.get().labels).toEqual(["Offline label"]);
    const saved = await syncSheet({
      repository: m.repo,
      profileId: "p",
      get: m.get,
      commit: m.commit,
      manual: true,
    });
    expect(saved, saved.message).toHaveProperty("lastSuccess");
    g.cells.get("BailaCue Config")!.find((r) => r[0] === "weeklyMinutes")![1] =
      "90";
    await syncSheet({ repository: m.repo, profileId: "p", get: m.get });
    expect(m.get().preferences.weeklyMinutes).toBe(60);
    const pulled = await syncSheet({
      repository: m.repo,
      profileId: "p",
      get: m.get,
      commit: m.commit,
    });
    expect(pulled.conflicts).toEqual([]);
    expect(m.get().preferences.weeklyMinutes).toBe(90);
    expect(m.points.length).toBeGreaterThan(0);
    expect(m.points.at(-1)!.preferences.weeklyMinutes).toBe(60);
    expect(m.get().connections[0].connected).toBe(true);
    vi.unstubAllGlobals();
  });
  it("pauses concurrent field conflicts, preserves both versions, and applies an explicit choice", async () => {
    const g = google(),
      m = memory();
    const base = metadataSnapshot(m.get());
    await g.client.initialize(g.inspect(), await createBackup(m.get(), digest));
    vi.stubGlobal("fetch", g.fetcher);
    await m.repo.setState(stateKey("p"), {
      enabled: true,
      spreadsheetId: id,
      connectionId: account.id,
      base,
    });
    m.edit({
      ...m.get(),
      preferences: { ...m.get().preferences, weeklyMinutes: 120 },
    });
    g.cells.get("BailaCue Config")!.find((r) => r[0] === "weeklyMinutes")![1] =
      "90";
    const conflict = await syncSheet({
      repository: m.repo,
      profileId: "p",
      get: m.get,
      commit: m.commit,
    });
    expect(conflict.conflicts).toContain("preferences.weeklyMinutes");
    expect(g.batches).toHaveLength(1);
    const result = await syncSheet({
      repository: m.repo,
      profileId: "p",
      get: m.get,
      commit: m.commit,
      choice: "phone",
    });
    expect(result.conflicts, result.message).toEqual([]);
    expect((await g.client.read(id)).library.preferences.weeklyMinutes).toBe(
      120,
    );
    const histories = await g.client.history(id);
    expect(histories).toHaveLength(3);
    expect((await histories[1].load()).library.preferences.weeklyMinutes).toBe(
      90,
    );
    expect(canonical(result.base)).toBe(canonical(metadataSnapshot(m.get())));
    const disabled = { ...result, enabled: false } satisfies SheetSyncState;
    await m.repo.setState(stateKey("p"), disabled);
    const calls = vi.mocked(g.fetcher).mock.calls.length;
    await syncSheet({ repository: m.repo, profileId: "p", get: m.get });
    expect(vi.mocked(g.fetcher).mock.calls.length).toBe(calls);
    vi.unstubAllGlobals();
  });
});
