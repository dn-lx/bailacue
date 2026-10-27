import type { BackupEnvelope, PortableLibrary } from "../../core/backups";
import {
  applyEdits,
  libraryFingerprint,
  tablesFor,
  titles,
  versionRows,
  type Tables,
  type Cell,
} from "./codec";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
export type SheetBook = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties: { title: string };
  sheets: {
    properties: {
      sheetId: number;
      title: string;
      gridProperties: { rowCount: number; columnCount: number };
    };
  }[];
};
export type SheetSnapshot = {
  backup: BackupEnvelope;
  library: PortableLibrary;
  fingerprint: string;
  book: SheetBook;
};
export function spreadsheetId(value: string) {
  const id =
    value
      .trim()
      .match(
        /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/,
      )?.[1] ?? value.trim();
  if (!/^[A-Za-z0-9_-]{15,200}$/.test(id))
    throw new Error("Paste a Google spreadsheet link or its ID.");
  return id;
}
export function sheetClient(options: {
  token: () => Promise<string>;
  parse: (raw: string) => Promise<BackupEnvelope>;
  fetch?: typeof fetch;
}) {
  const request = async (path: string, init?: RequestInit) => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await (options.fetch ?? fetch)(API + path, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + (await options.token()),
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Google Sheets access is unavailable. Enable Google Sheets API in BailaCue’s Google Cloud project and allow Drive write access for this account."
            : response.status === 401
              ? "Reconnect your Google account in Storage to sync again."
              : response.status === 429
                ? "Google Sheets is busy. Your changes are queued on this phone; sync will retry."
                : "Google Sheets could not be reached (HTTP " +
                  response.status +
                  "). Your phone library is kept.",
        );
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };
  const inspect = (id: string): Promise<SheetBook> =>
    request(
      "/" +
        spreadsheetId(id) +
        "?fields=spreadsheetId,spreadsheetUrl,properties(title),sheets(properties)",
    );
  async function read(id: string): Promise<SheetSnapshot> {
    const book = await inspect(id);
    if (
      titles.some(
        (title) => !book.sheets.some((s) => s.properties.title === title),
      )
    )
      throw new Error(
        "This spreadsheet is missing a BailaCue tab. Restore the tab or connect a new spreadsheet.",
      );
    const query = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    for (const title of titles.filter((t) => t !== "BailaCue Versions"))
      query.append("ranges", "'" + title + "'!A1:G50002");
    const data = await request("/" + id + "/values:batchGet?" + query);
    const tables: Partial<Tables> = {};
    titles
      .filter((t) => t !== "BailaCue Versions")
      .forEach((title, i) => {
        tables[title] = data.valueRanges?.[i]?.values ?? [];
      });
    if (
      tables["BailaCue Info"]?.[0]?.[0] !== "BailaCue metadata" ||
      String(tables["BailaCue Info"]?.[0]?.[1]) !== "1"
    )
      throw new Error(
        "This is not a supported BailaCue spreadsheet. Nothing has been changed.",
      );
    const parts = tables["BailaCue Recovery"]?.slice(1) ?? [];
    if (
      !parts.length ||
      parts.some(
        (row, i) => Number(row[0]) !== i + 1 || typeof row[1] !== "string",
      )
    )
      throw new Error("Spreadsheet recovery data is incomplete.");
    const backup = await options.parse(parts.map((row) => row[1]).join(""));
    const library = applyEdits(backup, tables);
    return { book, backup, library, fingerprint: libraryFingerprint(library) };
  }
  function updates(
    book: SheetBook,
    backup: BackupEnvelope,
    previous?: BackupEnvelope,
  ) {
    const tables = tablesFor(backup),
      requests: any[] = [];
    for (const title of titles) {
      const tab = book.sheets.find(
        (s) => s.properties.title === title,
      )?.properties;
      if (!tab) throw new Error("A BailaCue tab is missing.");
      const rows = tables[title];
      if (title === "BailaCue Versions") {
        const history = [
          ...(previous ? versionRows(previous) : []),
          ...versionRows(backup),
        ];
        requests.push({
          appendCells: {
            sheetId: tab.sheetId,
            rows: history.map(rowData),
            fields: "userEnteredValue",
          },
        });
        continue;
      }
      const rowCount = Math.max(tab.gridProperties.rowCount, rows.length + 10),
        columnCount = Math.max(tab.gridProperties.columnCount, 7);
      if (
        rowCount !== tab.gridProperties.rowCount ||
        columnCount !== tab.gridProperties.columnCount
      )
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: tab.sheetId,
              gridProperties: { rowCount, columnCount },
            },
            fields: "gridProperties(rowCount,columnCount)",
          },
        });
      // Providing a range clears stale userEnteredValues below the supplied rows
      // in the same atomic batch. Explicit stringValue prevents formula injection.
      requests.push({
        updateCells: {
          range: {
            sheetId: tab.sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
          rows: rows.map(rowData),
          fields: "userEnteredValue",
        },
      });
    }
    return requests;
  }
  async function write(
    id: string,
    backup: BackupEnvelope,
    expected: string,
    previous?: BackupEnvelope,
  ) {
    const current = await read(id);
    if (current.fingerprint !== expected)
      throw new Error(
        "The spreadsheet changed during sync. Your changes are queued; sync again to review the latest version.",
      );
    await request("/" + id + ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: updates(current.book, backup, previous),
      }),
    });
    const verified = await read(id);
    if (
      verified.backup.id !== backup.id ||
      verified.fingerprint !== libraryFingerprint(backup.library)
    )
      throw new Error(
        "The spreadsheet changed while saving. Both saved versions are retained in its history; review before retrying.",
      );
    return verified;
  }
  async function initialize(book: SheetBook, backup: BackupEnvelope) {
    if (book.sheets.some((s) => titles.includes(s.properties.title as any)))
      throw new Error(
        "This spreadsheet already contains BailaCue tabs. Connect it to review its library instead of initializing it.",
      );
    let nextId =
      Math.max(-1, ...book.sheets.map((s) => s.properties.sheetId)) + 1;
    const tabs = titles.map((title) => ({
      properties: {
        sheetId: nextId++,
        title,
        gridProperties: { rowCount: 1000, columnCount: 7 },
      },
    }));
    const prepared = { ...book, sheets: [...book.sheets, ...tabs] };
    const tables = tablesFor(backup);
    await request("/" + book.spreadsheetId + ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          ...tabs.map((s) => ({ addSheet: s })),
          {
            updateCells: {
              start: {
                sheetId: tabs[5].properties.sheetId,
                rowIndex: 0,
                columnIndex: 0,
              },
              rows: [rowData(tables["BailaCue Versions"][0])],
              fields: "userEnteredValue",
            },
          },
          ...updates(prepared, backup),
        ],
      }),
    });
    return read(book.spreadsheetId);
  }
  async function create(backup: BackupEnvelope) {
    const book: SheetBook = await request("", {
      method: "POST",
      body: JSON.stringify({
        properties: { title: "BailaCue · practice library" },
      }),
    });
    return initialize(await inspect(book.spreadsheetId), backup);
  }
  async function history(id: string) {
    const data = await request(
      "/" +
        spreadsheetId(id) +
        "/values/" +
        encodeURIComponent("'BailaCue Versions'!A2:F50002") +
        "?valueRenderOption=UNFORMATTED_VALUE",
    );
    const rows: Cell[][] = data.values ?? [];
    const versions = new Map<
      string,
      { id: string; savedAt: string; rows: Cell[][] }
    >();
    for (const row of rows) {
      const key = String(row[0] ?? "");
      if (!key) continue;
      const entry = versions.get(key) ?? {
        id: key,
        savedAt: String(row[1]),
        rows: [],
      };
      entry.rows.push(row);
      versions.set(key, entry);
    }
    return [...versions.values()]
      .reverse()
      .slice(0, 100)
      .map((v) => ({
        id: v.id,
        savedAt: v.savedAt,
        load: async () => {
          const sorted = v.rows.sort((a, b) => Number(a[3]) - Number(b[3]));
          if (
            sorted.length !== Number(sorted[0][4]) ||
            sorted.some((r, i) => Number(r[3]) !== i + 1)
          )
            throw new Error(
              "This history version is incomplete. Choose another version.",
            );
          return options.parse(sorted.map((r) => r[5]).join(""));
        },
      }));
  }
  return { inspect, read, write, initialize, create, history };
}
function rowData(row: Cell[]) {
  return {
    values: row.map((value) => ({
      userEnteredValue:
        typeof value === "number"
          ? { numberValue: value }
          : typeof value === "boolean"
            ? { boolValue: value }
            : { stringValue: value },
    })),
  };
}
