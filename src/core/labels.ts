import type { Library } from "./types";

export const suggestedLabelGroups: Record<string, string[]> = {
  Bachata: [
    "Dominicana",
    "Traditional",
    "Modern",
    "Sensual",
    "Bachazouk",
    "Fusion",
  ],
  Salsa: [
    "Cuban / Casino",
    "LA / On1",
    "New York / On2",
    "Colombian / Cali",
    "Rueda de Casino",
  ],
  "Traditions and influences": [
    "Rumba",
    "Son",
    "Afro-Cuban",
    "Cha-cha-cha",
    "Pachanga",
    "Boogaloo",
    "Mambo",
  ],
  Technique: [
    "Basic step",
    "Weight transfer",
    "Timing",
    "Rhythm",
    "Musicality",
    "Footwork / Shines",
    "Partnerwork",
    "Leading",
    "Following",
    "Frame",
    "Connection",
    "Turns",
    "Spins",
    "Balance",
    "Body movement",
    "Isolations",
    "Styling",
    "Arm styling",
    "Coordination",
    "Transition",
    "Combination",
    "Dips",
    "Waves",
    "Rolls",
  ],
  "Video type": [
    "Tutorial",
    "Class recap",
    "Demonstration",
    "Drill",
    "Warm-up",
    "Solo practice",
    "Partner practice",
    "Social dance",
    "Performance",
    "Self-recording",
    "Workshop",
    "Festival",
  ],
  Level: [
    "Absolute beginner",
    "Beginner",
    "Improver",
    "Intermediate",
    "Advanced",
  ],
};
export function labelKey(label: string) {
  const k = cleanLabel(label).toLowerCase();
  return (
    (
      {
        "footwork / shines": "footwork",
        shines: "footwork",
        dominican: "dominicana",
        "dominican / dominicana": "dominicana",
      } as Record<string, string>
    )[k] ?? k
  );
}
export function matchesLabels(
  actual: string[],
  selected: string[],
  mode: "any" | "all" = "any",
) {
  if (!selected.length) return true;
  const keys = new Set(actual.map(labelKey));
  return mode === "all"
    ? selected.every((s) => keys.has(labelKey(s)))
    : selected.some((s) => keys.has(labelKey(s)));
}

export const cleanLabel = (label: string) =>
  label.normalize("NFC").trim().replace(/\s+/g, " ");
const key = (label: string) => cleanLabel(label).toLowerCase();

/** Keep the first spelling, including accents and artist punctuation. */
export function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.map(cleanLabel).filter((label) => {
    if (!label || seen.has(key(label))) return false;
    seen.add(key(label));
    return true;
  });
}

export function libraryLabels(library: Library): string[] {
  return uniqueLabels([
    ...(library.labels ?? []),
    ...library.videos.flatMap((video) => video.labels),
    ...library.sources.flatMap((source) => source.defaultLabels),
    ...(library.youtubeSources ?? []).flatMap((source) => source.defaultLabels),
  ]).sort((a, b) => a.localeCompare(b));
}

/** Delete a catalog label and all its assignments, retaining unrelated metadata. */
export function removeLibraryLabel(library: Library, label: string): Library {
  const without = (values: string[]) =>
    values.filter((value) => key(value) !== key(label));
  return {
    ...library,
    labels: without(libraryLabels(library)),
    videos: library.videos.map((v) => ({ ...v, labels: without(v.labels) })),
    sources: library.sources.map((s) => ({
      ...s,
      defaultLabels: without(s.defaultLabels),
    })),
    youtubeSources: library.youtubeSources?.map((s) => ({
      ...s,
      defaultLabels: without(s.defaultLabels),
    })),
    preferences: {
      ...library.preferences,
      labels: without(library.preferences.labels),
    },
    libraryView: library.libraryView
      ? {
          ...library.libraryView,
          labels: without(library.libraryView.labels ?? []),
        }
      : undefined,
    activePractice: library.activePractice
      ? {
          ...library.activePractice,
          preferences: {
            ...library.activePractice.preferences,
            labels: without(library.activePractice.preferences.labels),
          },
        }
      : undefined,
    practicePreferences: library.practicePreferences
      ? {
          ...library.practicePreferences,
          labels: without(library.practicePreferences.labels),
        }
      : undefined,
  };
}

export function labelChoices(
  existing: string[],
  selected: string[],
  query: string,
) {
  const all = uniqueLabels([...existing, ...selected]);
  const selectedKeys = new Set(selected.map(key));
  const search = key(query);
  return {
    matches: all.filter(
      (label) => !selectedKeys.has(key(label)) && key(label).includes(search),
    ),
    create:
      search && !all.some((label) => key(label) === search)
        ? cleanLabel(query)
        : "",
  };
}
