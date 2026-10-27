import type { Video } from "./types";
export function isUnrated(video: Video) {
  if (
    !Number.isFinite(video.importance) ||
    video.importance < 1 ||
    video.importance > 5
  )
    return true;
  if (video.ratingSet === true) return false;
  return (
    video.ratingSet === false ||
    // Older folder scans assigned 3 automatically without recording a rating.
    (video.ratingSet === undefined && !!video.remote && video.importance === 3)
  );
}
export const effectiveRating = (video: Video) =>
  isUnrated(video) ? 5 : video.importance;
export const ratingCaption = (video: Video) =>
  isUnrated(video) ? "Unrated · treated as 5★" : `★ ${video.importance}`;
