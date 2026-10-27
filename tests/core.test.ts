import { describe, expect, it } from "vitest";
import { emptyLibrary, type Video } from "../src/core/types";
import {
  choosePicks,
  ensureDailyPick,
  rankCandidates,
} from "../src/core/recommendations";
import {
  validateSegment,
  loopSeek,
  parseTime,
  localDay,
  weekStart,
} from "../src/core/practice";
import {
  filterVideos,
  removeVideo,
  videoFromExport,
} from "../src/core/library";
export function video(id: string, changes: Partial<Video> = {}): Video {
  return {
    id,
    title: `Move ${id}`,
    uri: `file:${id}`,
    duration: 60,
    size: 1000,
    style: "Bachata",
    labels: ["Footwork"],
    importance: 3,
    status: "To learn",
    teacher: "",
    className: "",
    location: "",
    lessonDate: "",
    createdAt: "2026-10-18T09:00:00Z",
    resume: 0,
    segments: [],
    bookmarks: [],
    notes: [],
    available: true,
    source: "device",
    ...changes,
  };
}
const now = new Date("2026-10-18T12:00:00");
describe("practice sections", () => {
  it.each([
    [0, 0, 30],
    [-1, 3, 30],
    [4, 3, 30],
    [0, 31, 30],
    [NaN, 3, 30],
    [0, 0.1, 30],
    [0, 3, Infinity],
  ])("rejects invalid bounds %s %s %s", (a, b, d) =>
    expect(() => validateSegment(a, b, d)).toThrow(),
  );
  it("seeks at both boundaries without escaping the clip", () => {
    expect(loopSeek(5, 5, 10, 30)).toBeUndefined();
    expect(loopSeek(10, 5, 10, 30)).toBe(5);
    expect(loopSeek(4, 5, 10, 30)).toBe(5);
  });
  it("accepts subsecond time and rejects malformed minutes", () => {
    expect(parseTime("1:05.25")).toBe(65.25);
    expect(parseTime("1:99")).toBeNaN();
    expect(parseTime("oops")).toBeNaN();
  });
  it("uses local calendar dates and Monday weeks", () => {
    expect(localDay(now)).toBe("2026-10-18");
    expect(weekStart(now).getDay()).toBe(1);
  });
});
describe("daily picks", () => {
  it("ranks label matches and importance without recommending unavailable files", () => {
    const l = emptyLibrary();
    l.videos = [
      video("a", { labels: [], importance: 1 }),
      video("b", { importance: 5 }),
      video("private", { available: false }),
    ];
    expect(choosePicks(l, now)).toEqual(["b"]);
  });
  it("applies cooldown, with a fallback when every candidate is exhausted", () => {
    const l = emptyLibrary();
    l.videos = [video("a", { importance: 5 }), video("b")];
    l.picks = [{ day: "2026-10-17", videoIds: ["a"], skipped: false }];
    expect(choosePicks(l, now)).toEqual(["b"]);
    l.videos = [l.videos[0]];
    expect(choosePicks(l, now)).toEqual(["a"]);
  });
  it("keeps a selection stable after preference changes, and replaces lost access", () => {
    let l = emptyLibrary();
    l.videos = [video("a"), video("b")];
    l = ensureDailyPick(l, now);
    l.feedback.a = -3;
    expect(ensureDailyPick(l, now).picks[0].videoIds).toEqual(["a"]);
    l.videos[0].available = false;
    expect(ensureDailyPick(l, now).picks[0].videoIds).toEqual(["b"]);
  });
  it("picks after the first video is added to an empty library", () => {
    let l = ensureDailyPick(emptyLibrary(), now);
    l.videos = [video("new")];
    expect(ensureDailyPick(l, now).picks.at(-1)?.videoIds).toEqual(["new"]);
  });
  it("does not interpret skip as a dislike", () => {
    let l = emptyLibrary();
    l.videos = [video("a")];
    l = ensureDailyPick(l, now);
    l.picks[0].skipped = true;
    expect(ensureDailyPick(l, now)).toBe(l);
    expect(l.feedback).toEqual({});
  });
  it("can review learned videos and disables suggestions independently", () => {
    const l = emptyLibrary();
    l.videos = [video("a", { status: "Learned" })];
    expect(rankCandidates(l, now)[0].video.id).toBe("a");
    l.preferences.picksEnabled = false;
    expect(ensureDailyPick(l, now).picks).toEqual([]);
  });
  it("uses deterministic ties and prefers variety among close scores", () => {
    const l = emptyLibrary();
    l.preferences.count = 2;
    l.preferences.labels = [];
    l.videos = [
      video("a"),
      video("b"),
      video("c", { style: "Salsa", labels: ["Partnerwork"] }),
    ];
    expect(choosePicks(l, now)).toEqual(["a", "c"]);
  });
});
it("combines library filters and removes collection references", () => {
  const l = emptyLibrary();
  l.videos = [
    video("a", { teacher: "Ana", importance: 5 }),
    video("b", { style: "Salsa" }),
  ];
  expect(
    filterVideos(l.videos, {
      query: "ana footwork",
      style: "Bachata",
      minImportance: 4,
    }),
  ).toHaveLength(1);
  l.playlists = [{ id: "p", name: "Class", videoIds: ["a", "b"] }];
  expect(removeVideo(l, "a").playlists[0].videoIds).toEqual(["b"]);
});

it("registers a new exported clip without mutating the original or inheriting invalid timestamps", () => {
  const original = video("original", {
    notes: [{ id: "n", text: "Keep this", time: 25, createdAt: "2026-10-18" }],
    segments: [{ id: "s", name: "Part", start: 10, end: 20 }],
  });
  const clip = videoFromExport(original, {
    uri: "file:new.mp4",
    duration: 4,
    size: 2048,
  });
  expect(clip.id).not.toBe(original.id);
  expect(clip.uri).toBe("file:new.mp4");
  expect(clip.parentId).toBe(original.id);
  expect(clip.duration).toBe(4);
  expect(clip.notes).toEqual([]);
  expect(clip.segments).toEqual([]);
  expect(original.uri).toBe("file:original");
  expect(original.notes).toHaveLength(1);
  expect(original.labels).toEqual(["Footwork"]);
});
