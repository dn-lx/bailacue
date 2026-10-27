import { effectiveRating, isUnrated } from "./ratings";
import { sourceStyle } from "./numbering";
import { matchesLabels } from "./labels";
import { localDay } from "./practice";
import type { Library, Video } from "./types";
const DAY = 86400000;
export const minimumPickRating = (library: Library) =>
  Math.max(1, Math.min(5, library.preferences.minPickRating ?? 1));
const eligible = (library: Library, video: Video) =>
  video.available &&
  library.preferences.styles.includes(video.style) &&
  (!video.youtube ||
    (library.preferences.includeYouTube && video.youtube.embedAllowed)) &&
  effectiveRating(video) >= minimumPickRating(library) &&
  (!library.preferences.requirePickLabels ||
    matchesLabels(
      video.labels,
      library.preferences.labels,
      library.preferences.labelMatch,
    )) &&
  (!library.preferences.pickSourceIds?.length ||
    library.preferences.pickSourceIds.some(
      (id) =>
        video.remote?.sourceIds.includes(id) ||
        video.youtube?.sourceIds.includes(id),
    ));
const selectionKey = (library: Library) => {
  const p = library.preferences;
  const sources = dailySlots(library)
    .map((s) => `${s.key}:${s.style}`)
    .sort()
    .join(",");
  return `dance-rating-v3:${p.onePerStyle !== false ? [...new Set(p.styles)].sort().join(",") : `total-${p.count}`}:${minimumPickRating(library)}:${sources}:${p.pickMix ?? "dance"}:${(p.pickSourceIds ?? []).slice().sort().join(",")}:${p.labels.slice().sort().join(",")}:${p.labelMatch ?? "any"}:${!!p.requirePickLabels}:${!!p.includeYouTube}`;
};
export function rankCandidates(
  library: Library,
  now = new Date(),
  ignoreCooldown = false,
): { video: Video; score: number; reason: string }[] {
  const { preferences: p } = library;
  const recentlyPicked = new Set(
    library.picks
      .filter(
        (pick) =>
          (now.getTime() - new Date(`${pick.day}T12:00:00`).getTime()) / DAY <
            p.cooldownDays && pick.day !== localDay(now),
      )
      .flatMap((x) => x.videoIds),
  );
  return library.videos
    .filter(
      (v) =>
        eligible(library, v) && (ignoreCooldown || !recentlyPicked.has(v.id)),
    )
    .map((video) => {
      const matches = video.labels.filter((l) =>
        p.labels.some((pref) => pref.toLowerCase() === l.toLowerCase()),
      );
      const styleMatch = p.styles.includes(video.style);
      const lastPractice = video.lastPractisedAt
        ? Date.parse(video.lastPractisedAt)
        : NaN;
      const daysSince = Number.isFinite(lastPractice)
        ? Math.max(0, (now.getTime() - lastPractice) / DAY)
        : 30;
      // This score only breaks ties within the same star rating.
      const score =
        matches.length * 12 +
        (styleMatch ? 8 : 0) +
        (!video.lastPractisedAt ? 6 : 0) +
        Math.min(daysSince, 30) / 3;
      return {
        video,
        score,
        reason: `${isUnrated(video) ? "Unrated (counts as 5-star)" : `${video.importance}-star`} ${video.style} · ${matches.length ? `Matches your ${matches[0].toLowerCase()} preference.` : "Chosen for your practice mix and recency."}`,
      };
    })
    .sort(
      (a, b) =>
        effectiveRating(b.video) - effectiveRating(a.video) ||
        b.score - a.score ||
        a.video.id.localeCompare(b.video.id),
    );
}
export type DailySlot = {
  key: string;
  name: string;
  style: Video["style"];
  sourceId?: string;
};
export function dailySlots(library: Library): DailySlot[] {
  return [...new Set(library.preferences.styles)].flatMap<DailySlot>(
    (style) => {
      if (library.preferences.pickMix !== "source")
        return [{ key: `style:${style}`, name: style, style }];
      const sources = [
        ...library.sources.map((s) => ({ ...s, style: sourceStyle(s) })),
        ...(library.youtubeSources ?? []).map((s) => ({
          ...s,
          style: s.defaultStyle,
        })),
      ].filter(
        (s) =>
          s.style === style &&
          (!library.preferences.pickSourceIds?.length ||
            library.preferences.pickSourceIds.includes(s.id)),
      );
      return sources.length
        ? sources.map((source) => ({
            key: `source:${source.id}`,
            name: source.name,
            style,
            sourceId: source.id,
          }))
        : [{ key: `style:${style}`, name: style, style }];
    },
  );
}
export const belongsToSlot = (video: Video, slot: DailySlot) =>
  slot.sourceId
    ? !!video.remote?.sourceIds.includes(slot.sourceId) ||
      !!video.youtube?.sourceIds.includes(slot.sourceId)
    : video.style === slot.style;
export function choosePicks(library: Library, now = new Date()): string[] {
  let candidates = rankCandidates(library, now);
  if (library.preferences.onePerStyle !== false) {
    const fallback = rankCandidates(library, now, true);
    const chosen: string[] = [];
    for (const slot of dailySlots(library)) {
      const matches = (candidate: { video: Video }) =>
        belongsToSlot(candidate.video, slot) &&
        !chosen.includes(candidate.video.id);
      const next = candidates.find(matches) ?? fallback.find(matches);
      if (next) chosen.push(next.video.id);
    }
    return chosen;
  }
  if (!candidates.length) candidates = rankCandidates(library, now, true);
  const chosen: string[] = [];
  const usedStyles = new Set<string>();
  const usedLabels = new Set<string>();
  while (chosen.length < library.preferences.count && candidates.length) {
    candidates.sort(
      (a, b) =>
        effectiveRating(b.video) - effectiveRating(a.video) ||
        b.score -
          (usedStyles.has(b.video.style) ? 5 : 0) -
          b.video.labels.filter((x) => usedLabels.has(x)).length * 4 -
          (a.score -
            (usedStyles.has(a.video.style) ? 5 : 0) -
            a.video.labels.filter((x) => usedLabels.has(x)).length * 4) ||
        a.video.id.localeCompare(b.video.id),
    );
    const next = candidates.shift()!.video;
    chosen.push(next.id);
    usedStyles.add(next.style);
    next.labels.forEach((x) => usedLabels.add(x));
  }
  return chosen;
}
export function refreshDailyPicks(library: Library, now = new Date()): Library {
  const day = localDay(now);
  return {
    ...library,
    picks: [
      ...library.picks.filter((p) => p.day !== day).slice(-89),
      {
        day,
        videoIds: choosePicks(library, now),
        skipped: false,
        selectionKey: selectionKey(library),
      },
    ],
  };
}
export function ensureDailyPick(library: Library, now = new Date()): Library {
  if (!library.preferences.picksEnabled) return library;
  const day = localDay(now);
  const saved = library.picks.find((p) => p.day === day);
  if (saved?.skipped) return library;
  const slots = dailySlots(library);
  const usedSlots = new Set<string>();
  const slotsValid =
    library.preferences.onePerStyle === false ||
    !saved ||
    saved.videoIds.every((id) => {
      const video = library.videos.find((v) => v.id === id);
      const slot =
        video &&
        slots.find((s) => !usedSlots.has(s.key) && belongsToSlot(video, s));
      if (!slot) return false;
      usedSlots.add(slot.key);
      return true;
    });
  if (
    slotsValid &&
    saved?.selectionKey === selectionKey(library) &&
    saved.videoIds.every((id) =>
      library.videos.some((v) => v.id === id && eligible(library, v)),
    )
  ) {
    if (library.preferences.onePerStyle !== false && saved.videoIds.length) {
      const existing = library.videos.filter((v) =>
        saved.videoIds.includes(v.id),
      );
      const missingSlots = dailySlots(library).filter(
        (slot) => !existing.some((v) => belongsToSlot(v, slot)),
      );
      const additions = choosePicks(library, now).filter(
        (id) =>
          !saved.videoIds.includes(id) &&
          missingSlots.some((slot) =>
            belongsToSlot(
              library.videos.find((v) => v.id === id)!,
              slot,
            ),
          ),
      );
      if (additions.length)
        return {
          ...library,
          picks: library.picks.map((p) =>
            p.day === day
              ? { ...p, videoIds: [...p.videoIds, ...additions] }
              : p,
          ),
        };
    }
    if (
      saved.videoIds.length ||
      !library.videos.some((v) => eligible(library, v))
    )
      return library;
  }
  return refreshDailyPicks(library, now);
}
