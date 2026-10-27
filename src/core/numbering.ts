import type { CloudFolder, Library } from "./types";
import type { RemoteVideo } from "../services/providers/types";
export type NumberEntry = { number: number; originalName: string };
export type SourceNumbering = {
  next: number;
  files: Record<string, NumberEntry>;
};
const prefix = /^(\d{4,})(?:\s+[—-]\s+|(?=\.[a-z0-9]+$)|$)/i;
export function safeVideoName(name: string) {
  const cleaned = name.replace(/[\\/\x00-\x1f]/g, "_").trim();
  const extension = /\.[a-z0-9]{1,8}$/i.exec(cleaned)?.[0] ?? ".mp4";
  const stem = cleaned.endsWith(extension)
    ? cleaned.slice(0, -extension.length)
    : cleaned;
  let result = "";
  for (const c of stem) {
    if (new TextEncoder().encode(result + c + extension).length > 220) break;
    result += c;
  }
  return `${result || "video"}${extension}`;
}
export function numberedTitle(number: number) {
  return String(number).padStart(4, "0");
}
export function numberedName(number: number, original: string) {
  const extension = /\.[a-z0-9]{1,8}$/i.exec(original)?.[0] ?? ".mp4";
  return `${numberedTitle(number)}${extension}`;
}
export function sourceRenamePreview(library: Library, sourceId: string) {
  const source = library.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error("This source is no longer connected.");
  const items = library.videos
    .filter((v) => v.available && v.remote?.sourceIds.includes(sourceId))
    .map((v) => {
      const entry = source.numbering?.files[v.remote!.fileId];
      if (!entry) throw new Error("Refresh videos before previewing names.");
      return {
        fileId: v.remote!.fileId,
        from: v.remote!.fileName ?? v.title,
        to: numberedName(entry.number, entry.originalName),
        number: entry.number,
        phoneCopy: !!v.offlineUri,
      };
    })
    .sort((a, b) => a.number - b.number);
  return {
    sourceId,
    sourceName: source.name,
    items,
    changes: items.filter((item) => item.from !== item.to).length,
  };
}
// Retain recognition of pre-build12 upload sessions without changing their path.
function legacyNumberedName(number: number, original: string) {
  return safeVideoName(
    `${numberedTitle(number)} — ${original.replace(prefix, "") || "video.mp4"}`,
  );
}
function reservationNames(entry: NumberEntry) {
  return [
    numberedName(entry.number, entry.originalName),
    legacyNumberedName(entry.number, entry.originalName),
  ];
}
export function stagedUploadNames(source: CloudFolder) {
  return new Map(
    Object.entries(source.numbering?.files ?? {})
      .filter(([key]) => key.startsWith("upload:"))
      .flatMap(([key, entry]) =>
        reservationNames(entry).map(
          (name) => [safeVideoName(`${key.slice(7)}-${name}`), entry] as const,
        ),
      ),
  );
}
export function planNumbering(source: CloudFolder, files: RemoteVideo[]) {
  const state: SourceNumbering = {
    next: Math.max(1, source.numbering?.next ?? 1),
    files: { ...source.numbering?.files },
  };
  const assignedNumbers = new Set(
    Object.entries(state.files)
      .filter(([key]) => !key.startsWith("upload:"))
      .map(([, entry]) => entry.number),
  );
  const staged = stagedUploadNames(source);
  const used = new Set(Object.values(state.files).map((v) => v.number));
  for (const entry of Object.values(state.files))
    state.next = Math.max(state.next, entry.number + 1);
  // Recover existing numbered files on first connection only. Once a registry
  // exists, outside additions take the next number regardless of their old name.
  const sorted = [...files].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en") || a.fileId.localeCompare(b.fileId),
  );
  for (const file of sorted) {
    if (state.files[file.fileId]) continue;
    const stage = staged.get(file.name);
    if (stage && !assignedNumbers.has(stage.number)) {
      state.files[file.fileId] = { ...stage };
      assignedNumbers.add(stage.number);
      continue;
    }
    const match = prefix.exec(file.name);
    const number = Number(match?.[1]);
    if (
      match &&
      Number.isSafeInteger(number) &&
      number > 0 &&
      !source.numbering &&
      !used.has(number)
    ) {
      state.files[file.fileId] = {
        number,
        originalName: file.name.replace(prefix, "") || "video.mp4",
      };
      assignedNumbers.add(number);
      used.add(number);
      state.next = Math.max(state.next, number + 1);
    }
  }
  const names = new Map<string, string>();
  for (const file of sorted) {
    if (!state.files[file.fileId]) {
      state.files[file.fileId] = {
        number: state.next++,
        originalName: file.name.replace(prefix, "") || "video.mp4",
      };
    }
    const entry = state.files[file.fileId];
    names.set(file.fileId, numberedName(entry.number, entry.originalName));
  }
  return { numbering: state, names };
}
// Display the last observed filename, never an unapplied allocation. No file I/O.
export function normalizeSourceTitles(library: Library): Library {
  return {
    ...library,
    videos: library.videos.map((video) => {
      if (!video.remote) return video;
      return video.remote.fileName
        ? { ...video, title: video.remote.fileName.replace(/\.[^.]+$/, "") }
        : video;
    }),
  };
}
export function reserveUploadNumber(
  source: CloudFolder,
  jobId: string,
  name: string,
  confirmedFileId?: string,
) {
  const plan = planNumbering(source, []);
  const key = `upload:${jobId}`;
  const existing =
    plan.numbering.files[key] ??
    (confirmedFileId ? plan.numbering.files[confirmedFileId] : undefined);
  // Only a confirmed stable ID may reuse a reservation already associated with
  // a discovered file. An outside file or another job must keep its own number.
  const conflict =
    existing &&
    confirmedFileId &&
    Object.entries(plan.numbering.files).some(
      ([id, entry]) =>
        id !== key &&
        id !== confirmedFileId &&
        entry.number === existing.number,
    );
  const entry = (conflict ? undefined : existing) ?? {
    number: plan.numbering.next++,
    originalName: name.replace(prefix, "") || "video.mp4",
  };
  plan.numbering.files[key] = entry;
  return {
    numbering: plan.numbering,
    number: entry.number,
    name: numberedName(entry.number, entry.originalName),
  };
}
export function sourceStyle(source: CloudFolder) {
  if (source.defaultDanceId) return source.defaultStyle;
  const salsa = /\bsalsa\b/i.test(source.name),
    bachata = /\bbachata\b/i.test(source.name);
  return salsa !== bachata
    ? salsa
      ? ("Salsa" as const)
      : ("Bachata" as const)
    : source.defaultStyle;
}
