import { expect, it } from "vitest";
import {
  emptyLibrary,
  type CloudFolder,
  type Connection,
  type Video,
} from "../src/core/types";
import {
  assertUploadDestination,
  clipDestination,
  phoneDestination,
  registerUpload,
  uploadDestination,
  uploadNaming,
} from "../src/core/destination";
import { reserveUploadNumber } from "../src/core/numbering";
import type { PendingUpload } from "../src/services/cloud/uploadEngine";
import {
  moveTrimHandle,
  trimRange,
  videoAreaHeight,
} from "../src/core/editing";
import { validateSegment } from "../src/core/practice";
const connection: Connection = {
  id: "account",
  provider: "google-drive",
  accountId: "own-account",
  email: "dancer@example.com",
  name: "Dancer",
  connected: true,
  writable: true,
};
const salsa: CloudFolder = {
  id: "salsa",
  connectionId: connection.id,
  provider: connection.provider,
  folderId: "drive-salsa",
  name: "Salsa",
  writable: true,
  defaultStyle: "Salsa",
  defaultLabels: [],
};
const bachata: CloudFolder = {
  ...salsa,
  id: "bachata",
  folderId: "drive-bachata",
  name: "Bachata",
  defaultStyle: "Bachata",
};
const video: Video = {
  id: "phone",
  uri: "file:///owned/new.mp4",
  duration: 6,
  size: 100,
  title: "New clip",
  source: "device",
  style: "Salsa",
  labels: ["Artist A"],
  importance: 5,
  status: "Practising",
  teacher: "",
  className: "",
  location: "",
  lessonDate: "",
  createdAt: "now",
  resume: 0,
  segments: [],
  notes: [],
  bookmarks: [],
  available: true,
};
const library = () => ({
  ...emptyLibrary(),
  connections: [connection],
  sources: [salsa, bachata],
  videos: [video],
});
const job: PendingUpload = {
  id: "job",
  videoId: video.id,
  sourceId: bachata.id,
  folderId: bachata.folderId,
  connectionId: connection.id,
  accountId: connection.accountId,
  provider: connection.provider,
  name: "New clip.mp4",
  mimeType: "video/mp4",
  size: 100,
  fileId: "",
  offset: 0,
  status: "queued",
  keepCopy: false,
};
it.each([undefined, false, true])(
  "numbers new uploads only after explicit opt-in (%s)",
  (numberUploads) => {
    const source = { ...salsa, numberUploads };
    const naming = uploadNaming(source, "Class/turn", "mov");
    const final = naming.numberedNames
      ? reserveUploadNumber(source, "new", naming.originalName).name
      : naming.name;
    expect(final).toBe(numberUploads === true ? "0001.mov" : "Class_turn.mov");
    expect(naming.originalName).toBe("Class_turn.mov");
  },
);
it("registers the actual filename instead of claiming an unapplied numeric rename", () => {
  const next = registerUpload(
    library(),
    video.id,
    salsa,
    connection,
    {
      fileId: "new",
      name: "Original title.mp4",
      size: 100,
      mimeType: "video/mp4",
      duration: 6,
      modifiedAt: "now",
      canDownload: true,
    },
    true,
    7,
    "0007.mp4",
  );
  expect(next.videos[0]).toMatchObject({
    title: "Original title",
    remote: { fileName: "Original title.mp4" },
  });
});
it("uses the explicitly selected folder even when video style says Salsa", () => {
  expect(uploadDestination(library(), bachata.id).source.folderId).toBe(
    "drive-bachata",
  );
  expect(uploadDestination(library(), salsa.id).source.folderId).toBe(
    "drive-salsa",
  );
  expect(() => uploadDestination(library(), "")).toThrow(
    /Choose a connected folder/,
  );
});
it.each(["connection", "folder", "offline"])(
  "refuses %s upload permission failures without changing local data",
  (failure) => {
    const l = library();
    if (failure === "connection")
      l.connections[0] = { ...connection, writable: false };
    if (failure === "folder") l.sources[1] = { ...bachata, writable: false };
    if (failure === "offline")
      l.connections[0] = { ...connection, connected: false };
    expect(() => uploadDestination(l, bachata.id)).toThrow();
    expect(l.videos[0]).toEqual(video);
  },
);
it("pins resumed work to its original folder and account", () => {
  expect(() => assertUploadDestination(job, bachata, connection)).not.toThrow();
  expect(() => assertUploadDestination(job, salsa, connection)).toThrow(
    /destination changed/,
  );
  expect(() =>
    assertUploadDestination(
      job,
      { ...bachata, folderId: "different" },
      connection,
    ),
  ).toThrow();
  expect(() =>
    assertUploadDestination(job, bachata, {
      ...connection,
      id: "someone-else",
    }),
  ).toThrow();
});
it("defaults clips from online video to its sole source, requires selection for ambiguous membership, keeps phone saves separate", () => {
  const remote = {
    connectionId: connection.id,
    fileId: "original",
    canDownload: true,
    sourceIds: [bachata.id],
  };
  const online = { ...video, remote, storagePreference: "online" as const };
  expect(clipDestination(online)).toEqual({
    mode: "cloud",
    sourceId: bachata.id,
    keepCopy: false,
  });
  expect(
    clipDestination({
      ...online,
      remote: { ...remote, sourceIds: [salsa.id, bachata.id] },
    }).sourceId,
  ).toBe("");
  expect(clipDestination({ ...online, storagePreference: "offline" })).toEqual(
    phoneDestination(),
  );
  expect(clipDestination(video)).toEqual(phoneDestination());
});
it.each([true, false])(
  "registers confirmed upload only in its chosen source, retaining current metadata and references (keepCopy=%s)",
  (keepCopy) => {
    const l = library();
    l.videos[0] = {
      ...video,
      labels: ["Artist edited during upload"],
      importance: 4,
    };
    l.playlists = [
      { id: "collection", name: "My clips", videoIds: [video.id] },
    ];
    l.picks = [{ day: "today", videoIds: [video.id], skipped: false }];
    l.sessions = [
      { id: "practice", startedAt: "today", seconds: 20, videoId: video.id },
    ];
    l.feedback = { [video.id]: 3 };
    const next = registerUpload(
      l,
      video.id,
      bachata,
      connection,
      {
        fileId: "uploaded",
        name: "0007.mp4",
        size: 100,
        mimeType: "video/mp4",
        duration: 6,
        modifiedAt: "now",
        canDownload: true,
      },
      keepCopy,
      7,
      "0007.mp4",
    );
    const saved = next.videos[0];
    expect(saved).toMatchObject({
      title: "0007",
      labels: ["Artist edited during upload"],
      importance: 4,
      uri: "",
      remote: {
        sourceIds: [bachata.id],
        fileId: "uploaded",
        fileName: "0007.mp4",
      },
      storagePreference: keepCopy ? "offline" : "online",
    });
    expect(saved.offlineUri).toBe(keepCopy ? video.uri : undefined);
    expect(next.playlists[0].videoIds).toEqual([saved.id]);
    expect(next.picks[0].videoIds).toEqual([saved.id]);
    expect(next.sessions[0].videoId).toBe(saved.id);
    expect(next.feedback).toEqual({ [saved.id]: 3 });
    expect(l.videos[0].uri).toBe(video.uri);
  },
);
it("trim handles never cross and stay within exportable bounds", () => {
  let range = trimRange(6, 0, 6);
  range = moveTrimHandle(6, range, "start", 20);
  expect(range).toEqual({ start: 5.75, end: 6 });
  range = moveTrimHandle(6, range, "end", -10);
  expect(() => validateSegment(range.start, range.end, 6)).not.toThrow();
  expect(moveTrimHandle(6, range, "start", -10).start).toBe(0);
  expect(moveTrimHandle(6, range, "end", 100).end).toBe(6);
  expect(trimRange(6, NaN, NaN)).toEqual({ start: 0, end: 6 });
  expect(trimRange(0.1, 1, 2)).toEqual({ start: 0, end: 0.1 });
});
it("resizes within usable bounds, including small landscape viewports", () => {
  expect(videoAreaHeight(100, 900)).toBe(150);
  expect(videoAreaHeight(1000, 900)).toBe(675);
  expect(videoAreaHeight(480, 320)).toBe(240);
  expect(videoAreaHeight(270, 100)).toBe(150);
});

it("refuses an account switch even if a source keeps its local ID and folder name", () => {
  const other = { ...connection, id: "other", accountId: "other-account" };
  expect(() =>
    assertUploadDestination(job, { ...bachata, connectionId: other.id }, other),
  ).toThrow(/destination changed/);
});
