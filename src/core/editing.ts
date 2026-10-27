export type TrimRange = { start: number; end: number };
const bound = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
/** Keep both handles inside the video, with the exporter's minimum gap. */
export function trimRange(
  duration: number,
  start: number,
  end: number,
): TrimRange {
  const length = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const gap = Math.min(0.25, length);
  const a = bound(Number.isFinite(start) ? start : 0, 0, length - gap);
  return {
    start: a,
    end: bound(Number.isFinite(end) ? end : length, a + gap, length),
  };
}
export function moveTrimHandle(
  duration: number,
  range: TrimRange,
  edge: "start" | "end",
  value: number,
): TrimRange {
  const safe = trimRange(duration, range.start, range.end);
  if (!Number.isFinite(value)) return safe;
  const gap = Math.min(0.25, Math.max(0, duration));
  return edge === "start"
    ? { ...safe, start: bound(value, 0, safe.end - gap) }
    : { ...safe, end: bound(value, safe.start + gap, Math.max(0, duration)) };
}
export function videoAreaHeight(height: number, viewport: number): number {
  return bound(height, 150, Math.max(150, Math.min(700, viewport * 0.75)));
}
