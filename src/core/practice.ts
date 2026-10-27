export function validateSegment(
  start: number,
  end: number,
  duration: number,
): void {
  if (
    ![start, end, duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > duration ||
    end - start < 0.25
  )
    throw new Error(
      "Choose a section of at least 0.25 seconds within the video.",
    );
}
export function loopSeek(
  time: number,
  start: number,
  end: number,
  duration: number,
): number | undefined {
  validateSegment(start, end, duration);
  return time < start || time >= end ? start : undefined;
}
export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function parseTime(value: string): number {
  if (!/^\d+(\.\d+)?$|^\d+:\d{1,2}(\.\d+)?$/.test(value.trim())) return NaN;
  const parts = value.trim().split(":").map(Number);
  return parts.length === 1
    ? parts[0]
    : parts[1] < 60
      ? parts[0] * 60 + parts[1]
      : NaN;
}
export function weekStart(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
