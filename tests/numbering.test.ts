import { expect, it } from "vitest";
import {
  numberedName,
  planNumbering,
  reserveUploadNumber,
  stagedUploadNames,
  sourceRenamePreview,
} from "../src/core/numbering";
import { createLibraryWriter } from "../src/services/libraryWriter";
import { emptyLibrary, type CloudFolder } from "../src/core/types";
import { reconcileSource } from "../src/core/sources";
import { metadataSnapshot, restoreSnapshot } from "../src/core/sync";
const source: CloudFolder = {
  id: "s",
  connectionId: "c",
  provider: "google-drive",
  folderId: "folder",
  name: "Salsa",
  defaultStyle: "Bachata",
  defaultLabels: [],
  writable: true,
};
const file = (fileId: string, name = fileId + ".mp4") => ({
  fileId,
  name,
  mimeType: "video/mp4",
  size: 10,
  duration: 6,
  modifiedAt: "",
  canDownload: true,
});
it("assigns deterministic per-source numbers and never reuses removed identities", () => {
  let plan = planNumbering(source, [file("z"), file("a")]);
  expect(plan.names.get("a")).toBe("0001.mp4");
  expect(plan.names.get("z")).toBe("0002.mp4");
  plan = planNumbering({ ...source, numbering: plan.numbering }, [
    file("z"),
    file("outside"),
  ]);
  expect(plan.names.get("z")).toBe("0002.mp4");
  expect(plan.names.get("outside")).toBe("0003.mp4");
  expect(
    planNumbering({ ...source, id: "b", numbering: undefined }, [
      file("b"),
    ]).names.get("b"),
  ).toBe("0001.mp4");
});
it("adopts existing numeric prefixes and repairs duplicates without renumbering existing files", () => {
  const plan = planNumbering(source, [
    file("a", "0020 — Turn.mp4"),
    file("b", "0020 — Step.mp4"),
    file("c", "Fresh.mp4"),
  ]);
  expect(
    new Set(Object.values(plan.numbering.files).map((e) => e.number)).size,
  ).toBe(3);
  expect(
    Math.max(...Object.values(plan.numbering.files).map((e) => e.number)),
  ).toBe(22);
  const again = planNumbering({ ...source, numbering: plan.numbering }, [
    file("c"),
    file("b"),
    file("a"),
  ]);
  expect(again.numbering).toEqual(plan.numbering);
});
it("pins a reserved upload number across retry and advances the next external discovery", () => {
  const a = reserveUploadNumber(source, "job", "Turn.mp4");
  const retry = reserveUploadNumber(
    { ...source, numbering: a.numbering },
    "job",
    "Changed.mp4",
  );
  expect(retry).toEqual(a);
  const next = planNumbering({ ...source, numbering: a.numbering }, [
    file("external"),
  ]);
  expect(next.names.get("external")).toBe("0002.mp4");
});
it("retains numbers, notes and explicit ratings on refresh and metadata restore", () => {
  const l = emptyLibrary();
  l.sources = [source];
  l.connections = [
    {
      id: "c",
      provider: "google-drive",
      accountId: "account",
      name: "Dancer",
      email: "test@example.com",
      connected: true,
      writable: true,
    },
  ];
  let next = reconcileSource(l, source, [file("a")]);
  expect(sourceRenamePreview(next, source.id)).toMatchObject({
    changes: 1,
    items: [{ from: "a.mp4", to: "0001.mp4" }],
  });
  expect(next.videos[0].remote?.fileName).toBe("a.mp4");
  expect(next.videos[0]).toMatchObject({
    title: "a",
    style: "Salsa",
    importance: 5,
    ratingSet: false,
  });
  next.videos[0] = {
    ...next.videos[0],
    importance: 2,
    ratingSet: true,
    notes: [{ id: "n", text: "Keep", createdAt: "now" }],
  };
  next = reconcileSource(next, next.sources[0], [
    file("a", "0001.mp4"),
    file("outside"),
  ]);
  expect(next.videos[0]).toMatchObject({
    importance: 2,
    ratingSet: true,
    notes: [{ text: "Keep" }],
  });
  const restored = restoreSnapshot(metadataSnapshot(next), next);
  expect(restored.sources[0].numbering).toEqual(next.sources[0].numbering);
  expect(restored.videos[0].ratingSet).toBe(true);
});

it("keeps reservations separate from unverified numeric filenames", () => {
  const reserved = reserveUploadNumber(source, "job", "Turn.mp4");
  const plan = planNumbering({ ...source, numbering: reserved.numbering }, [
    file("first", reserved.name),
    file("duplicate", reserved.name),
  ]);
  expect(
    new Set([
      plan.numbering.files.first.number,
      plan.numbering.files.duplicate.number,
    ]).size,
  ).toBe(2);
  expect(plan.numbering.files["upload:job"].number).toBe(1);
  expect(plan.numbering.files.first.number).not.toBe(1);
  expect(plan.numbering.files.duplicate.number).not.toBe(1);
});

it("adopts a completed Dropbox staging file's reserved number while retaining its pending reservation", () => {
  const reserved = reserveUploadNumber(source, "job", "Turn.mp4");
  const plan = planNumbering({ ...source, numbering: reserved.numbering }, [
    file("uploaded", `job-${reserved.name}`),
  ]);
  expect(plan.numbering.files.uploaded.number).toBe(1);
  expect(plan.numbering.files["upload:job"].number).toBe(1);
  expect(plan.names.get("uploaded")).toBe("0001.mp4");
});

it("migrates descriptive numbered names without reallocating and gives outside videos the next number", () => {
  const old = {
    ...source,
    numbering: {
      next: 13,
      files: {
        a: { number: 1, originalName: "My original title.MOV" },
        removed: { number: 12, originalName: "Gone.mp4" },
      },
    },
  };
  const plan = planNumbering(old, [
    file("a", "0001 — My original title.MOV"),
    file("new", "Outside.mp4"),
  ]);
  expect([...plan.names.values()].sort()).toEqual(["0001.MOV", "0013.mp4"]);
  expect(plan.numbering.next).toBe(14);
  expect(numberedName(10000, "Another title.webm")).toBe("10000.webm");
});

it("uses the next allocation for an outside numeric filename rather than importing its number", () => {
  const first = planNumbering(source, [file("a", "Turn.mp4")]);
  const next = planNumbering({ ...source, numbering: first.numbering }, [
    file("a", "0001.mp4"),
    file("outside", "9999.mp4"),
  ]);
  expect(next.names.get("a")).toBe("0001.mp4");
  expect(next.names.get("outside")).toBe("0002.mp4");
  expect(next.numbering.next).toBe(3);
});

it("does not let an outside numeric file steal an unfinished upload's reserved number", () => {
  const reserved = reserveUploadNumber(source, "job", "Turn.mp4");
  const plan = planNumbering({ ...source, numbering: reserved.numbering }, [
    file("outside", "0001.mp4"),
    file("own-upload", "job-0001.mp4"),
  ]);
  expect(plan.numbering.files.outside.number).toBe(2);
  expect(plan.numbering.files["own-upload"].number).toBe(1);
  expect(plan.numbering.files["upload:job"].number).toBe(1);
  expect(plan.numbering.next).toBe(3);
});

it("recovers legacy staging names without letting final-name lookalikes claim the reservation", () => {
  const reserved = reserveUploadNumber(source, "job", "Turn.mp4");
  const old = { ...source, numbering: reserved.numbering };
  expect(stagedUploadNames(old).has("job-0001 — Turn.mp4")).toBe(true);
  expect(stagedUploadNames(old).has("job-0001.mp4")).toBe(true);
  const staged = planNumbering(old, [file("done", "job-0001 — Turn.mp4")]);
  expect(staged.names.get("done")).toBe("0001.mp4");
  expect(staged.numbering.files.done.number).toBe(1);
  const finished = planNumbering(old, [
    file("a", "0001 — Turn.mp4"),
    file("b", "0001.mp4"),
  ]);
  expect(
    new Set([
      finished.numbering.files.a.number,
      finished.numbering.files.b.number,
    ]).size,
  ).toBe(2);
  expect(finished.numbering.next).toBe(4);
  expect(finished.numbering.files["upload:job"].number).toBe(1);
});

it("repairs a legacy reserved-number conflict once, then keeps the confirmed allocation stable", () => {
  const old = {
    ...source,
    numbering: {
      next: 3,
      files: {
        outside: { number: 1, originalName: "0001.mp4" },
        own: { number: 2, originalName: "job-0001.mp4" },
        "upload:job": { number: 1, originalName: "Turn.mp4" },
      },
    },
  };
  const confirmed = reserveUploadNumber(old, "job", "0001 — Turn.mp4", "own");
  expect(confirmed.name).toBe("0003.mp4");
  expect(confirmed.number).toBe(3);
  const retry = reserveUploadNumber(
    { ...source, numbering: confirmed.numbering },
    "job",
    "0001 — Turn.mp4",
    "own",
  );
  expect(retry).toEqual(confirmed);
  expect(retry.numbering.files.outside.number).toBe(1);
  expect(retry.numbering.next).toBe(4);
  const registered = {
    ...source,
    numbering: {
      next: 4,
      files: {
        outside: confirmed.numbering.files.outside,
        own: { number: 3, originalName: "0003.mp4" },
      },
    },
  };
  expect(
    reserveUploadNumber(registered, "job", "0001 — Turn.mp4", "own"),
  ).toMatchObject({ number: 3, name: "0003.mp4", numbering: { next: 4 } });
});

it("uses the last observed filename offline rather than an unapplied number", async () => {
  const l = emptyLibrary();
  l.connections = [
    {
      id: "c",
      provider: "google-drive",
      accountId: "a",
      name: "Dancer",
      email: "test@example.com",
      connected: true,
      writable: true,
    },
  ];
  l.sources = [source];
  const old = reconcileSource(l, source, [file("a")]);
  old.videos[0].title = "0001 — Old descriptive title";
  const writer = createLibraryWriter(
    async () => {},
    () => {},
    () => {},
  );
  writer.hydrate(old);
  expect(writer.get().videos[0].title).toBe("a");
  await writer.commit((library) => ({
    ...library,
    videos: library.videos.map((v) => ({
      ...v,
      title: "Custom title",
      labels: ["Artist A"],
    })),
  }));
  expect(writer.get().videos[0]).toMatchObject({
    title: "a",
    labels: ["Artist A"],
  });
});
