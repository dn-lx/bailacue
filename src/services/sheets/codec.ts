import {
  canonical,
  validatePortableLibrary,
  type BackupEnvelope,
  type PortableLibrary,
} from "../../core/backups";
import {
  cleanLabel,
  removeLibraryLabel,
  uniqueLabels,
} from "../../core/labels";
import { emptyLibrary } from "../../core/types";
import { metadataSnapshot, restoreSnapshot } from "../../core/sync";
export const titles = [
  "BailaCue Info",
  "BailaCue Labels",
  "BailaCue Config",
  "BailaCue Videos",
  "BailaCue Recovery",
  "BailaCue Versions",
] as const;
export type SheetTitle = (typeof titles)[number];
export type Cell = string | number | boolean;
export type Tables = Record<SheetTitle, Cell[][]>;
const chunkSize = 28000;
export function chunks(value: string) {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize)
    parts.push(value.slice(i, i + chunkSize));
  return parts;
}
export function versionRows(backup: BackupEnvelope): Cell[][] {
  const parts = chunks(JSON.stringify(backup));
  return parts.map((part, i) => [
    backup.id,
    backup.createdAt,
    backup.checksum,
    i + 1,
    parts.length,
    part,
  ]);
}
const editableConfig = [
  "theme",
  "weeklyMinutes",
  "styles",
  "labels",
  "picksEnabled",
  "onePerStyle",
  "minPickRating",
  "cooldownDays",
  "count",
  "pickMix",
  "pickSourceIds",
  "labelMatch",
  "requirePickLabels",
  "includeYouTube",
] as const;
export function tablesFor(backup: BackupEnvelope): Tables {
  const l = backup.library;
  return {
    "BailaCue Info": [
      ["BailaCue metadata", "1"],
      ["Revision", backup.id],
      ["Saved", backup.createdAt],
      [
        "Help",
        "Edit Labels, Config values or Videos title/dance/rating/labels. Keep video IDs unchanged. Other tabs are recovery data.",
      ],
      [
        "Privacy",
        "Metadata only. No video files, local paths or sign-in credentials.",
      ],
      [
        "Labels",
        "Removing a label row removes it everywhere. Add a row to create a label.",
      ],
      [
        "Videos",
        "Labels use a JSON list. Blank rating means unrated (5 stars). Video rows cannot be added/deleted here; use the app.",
      ],
      [
        "Config",
        "Values use JSON: strings in quotes, lists in brackets, true/false for switches.",
      ],
      [
        "History",
        "BailaCue Versions is append-only recovery history. Do not edit or remove it.",
      ],
    ],
    "BailaCue Labels": [["Label"], ...(l.labels ?? []).map((name) => [name])],
    "BailaCue Config": [
      ["Setting", "Value (JSON)"],
      ...editableConfig
        .filter((key) => l.preferences[key] !== undefined)
        .map((key) => [key, JSON.stringify(l.preferences[key])]),
    ],
    "BailaCue Videos": [
      [
        "ID (keep)",
        "Title",
        "Dance",
        "Rating (blank = unrated)",
        "Labels (JSON)",
        "Source",
        "Notes (view only)",
      ],
      ...l.videos.map((v) => [
        v.id,
        v.title,
        v.style,
        v.ratingSet === false ? "" : v.importance,
        JSON.stringify(v.labels),
        v.source,
        v.notes
          .map((n) => n.text)
          .join("\n")
          .slice(0, 45000),
      ]),
    ],
    "BailaCue Recovery": [
      ["Part", "Backup data (do not edit)"],
      ...chunks(JSON.stringify(backup)).map((part, i) => [i + 1, part]),
    ],
    "BailaCue Versions": [
      [
        "Revision",
        "Saved",
        "Checksum",
        "Part",
        "Total parts",
        "Backup data (do not edit)",
      ],
    ],
  };
}
export function applyEdits(
  backup: BackupEnvelope,
  tables: Partial<Tables>,
): PortableLibrary {
  let l = restoreSnapshot(backup.library, emptyLibrary());
  const labelRows = tables["BailaCue Labels"];
  if (!labelRows?.length || labelRows[0][0] !== "Label")
    throw new Error("The Labels header is missing. Restore it before syncing.");
  const labels = uniqueLabels(
    labelRows.slice(1).map((row) => String(row[0] ?? "")),
  );
  const videos = tables["BailaCue Videos"];
  if (!videos?.length || videos[0][0] !== "ID (keep)")
    throw new Error("The Videos header is missing.");
  const ids = new Set<string>();
  for (const row of videos.slice(1)) {
    const id = String(row[0] ?? "");
    if (!id) continue;
    if (ids.has(id))
      throw new Error("A video identity appears twice in the spreadsheet.");
    ids.add(id);
    const video = l.videos.find((v) => v.id === id);
    if (!video)
      throw new Error(
        "An unknown video identity was added. Add new videos in BailaCue.",
      );
    const rating =
      row[3] === "" || row[3] === undefined ? undefined : Number(row[3]);
    if (
      rating !== undefined &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    )
      throw new Error("Video ratings must be 1 to 5 or blank.");
    let assigned: unknown;
    try {
      assigned = JSON.parse(String(row[4] ?? "[]"));
    } catch {
      throw new Error(
        'Video labels must be a JSON list, for example ["Artist"].',
      );
    }
    if (!Array.isArray(assigned) || assigned.some((v) => typeof v !== "string"))
      throw new Error("Video labels must be a list of names.");
    video.title = String(row[1] ?? "");
    const dance = String(row[2] ?? "");
    if (dance !== video.style) {
      video.style = dance;
      video.styleSet = true;
      video.danceId = undefined;
    }
    if (rating === undefined) video.ratingSet = false;
    else if (rating !== video.importance || video.ratingSet === false) {
      video.importance = rating;
      video.ratingSet = true;
    }
    if (canonical(assigned) !== canonical(video.labels))
      video.labels = uniqueLabels(assigned);
    if (!video.title.trim() || !video.style.trim())
      throw new Error("Video titles and dance names cannot be blank.");
  }
  if (ids.size !== l.videos.length)
    throw new Error(
      "A video row is missing. Restore it, or remove the video inside BailaCue.",
    );
  const config = tables["BailaCue Config"];
  if (!config?.length || config[0][0] !== "Setting")
    throw new Error("The Config header is missing.");
  const keys = new Set<string>();
  for (const row of config.slice(1)) {
    const key = String(row[0] ?? "");
    if (!key) continue;
    if (!editableConfig.includes(key as any) || keys.has(key))
      throw new Error("Unknown or repeated config setting: " + key);
    keys.add(key);
    try {
      (l.preferences as any)[key] = JSON.parse(String(row[1]));
    } catch {
      throw new Error("Config value for " + key + " must be valid JSON.");
    }
  }
  for (const name of backup.library.labels ?? [])
    if (
      !labels.some(
        (v) => cleanLabel(v).toLowerCase() === cleanLabel(name).toLowerCase(),
      )
    )
      l = removeLibraryLabel(l, name);
  l.labels = uniqueLabels([...labels, ...l.videos.flatMap((v) => v.labels)]);
  return validatePortableLibrary(metadataSnapshot(l));
}
export function libraryFingerprint(library: PortableLibrary) {
  return canonical(library);
}
