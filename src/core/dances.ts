import { cleanLabel, uniqueLabels } from "./labels";
import { sourceStyle } from "./numbering";
import { type DanceType, type Library, uid } from "./types";

export const danceKey = (name: string) => cleanLabel(name).toLocaleLowerCase();
export const defaultDanceTypes: DanceType[] = [
  { id: "dance:salsa", name: "Salsa" },
  { id: "dance:bachata", name: "Bachata" },
];
export function danceTypes(library: Library): DanceType[] {
  const known = [...(library.danceTypes ?? defaultDanceTypes)];
  for (const name of uniqueLabels([
    ...library.sources.map((s) => s.defaultStyle),
    ...(library.youtubeSources ?? []).map((s) => s.defaultStyle),
    ...library.videos.map((v) => v.style),
  ])) {
    if (danceKey(name) === "other" || !name) continue;
    if (!known.some((d) => danceKey(d.name) === danceKey(name)))
      known.push({ id: `dance:legacy:${danceKey(name)}`, name });
  }
  return known.filter(
    (d, i, all) =>
      danceKey(d.name) !== "other" &&
      all.findIndex((x) => danceKey(x.name) === danceKey(d.name)) === i,
  );
}
export function addDanceType(
  library: Library,
  value: string,
): { library: Library; dance: DanceType } {
  const name = cleanLabel(value).slice(0, 60);
  if (!name || danceKey(name) === "other")
    throw new Error("Choose a dance name, such as Tango.");
  const types = danceTypes(library);
  const existing = types.find((d) => danceKey(d.name) === danceKey(name));
  const dance = existing ?? { id: uid(), name };
  return {
    dance,
    library: { ...library, danceTypes: existing ? types : [...types, dance] },
  };
}

/** Non-destructive, idempotent upgrade of existing v1 libraries. */
export function migrateLibrary(library: Library): Library {
  const types = danceTypes(library);
  const idFor = (name: string) =>
    types.find((d) => danceKey(d.name) === danceKey(name))?.id;
  return {
    ...library,
    schemaRevision: 2,
    danceTypes: types,
    preferences: {
      ...library.preferences,
      pickMix: library.preferences.pickMix ?? "dance",
    },
    sources: library.sources.map((s) => {
      const style = s.defaultDanceId ? s.defaultStyle : sourceStyle(s);
      return {
        ...s,
        defaultStyle: style,
        defaultDanceId: s.defaultDanceId ?? idFor(style),
      };
    }),
    videos: library.videos.map((v) => {
      const inferred =
        !v.styleSet && v.remote
          ? [
              ...new Set(
                library.sources
                  .filter((s) => v.remote!.sourceIds.includes(s.id))
                  .map(sourceStyle),
              ),
            ]
          : [];
      const style = inferred.length === 1 ? inferred[0] : v.style;
      const notes = [...(v.notes ?? [])];
      for (const bookmark of v.bookmarks ?? []) {
        const id = `bookmark:${bookmark.id}`;
        if (!notes.some((n) => n.id === id))
          notes.push({
            id,
            text: bookmark.name,
            time: bookmark.time,
            kind: "moment",
            createdAt: v.createdAt,
          });
      }
      return {
        ...v,
        style,
        danceId: v.danceId ?? idFor(style),
        notes,
        bookmarks: [],
      };
    }),
  };
}
