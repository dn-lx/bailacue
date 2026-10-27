import { describe, expect, it } from "vitest";
import { emptyLibrary, type Video } from "../src/core/types";
import { addDanceType, migrateLibrary } from "../src/core/dances";
import { filterVideos, sortVideos } from "../src/core/library";
import { matchesLabels } from "../src/core/labels";
import {
  beginPractice,
  practiceDefaults,
  practiceQueue,
  savePractice,
  tickPractice,
} from "../src/core/practiceQueue";
import { choosePicks, ensureDailyPick } from "../src/core/recommendations";
import {
  importYouTube,
  parseYouTubeLink,
  beginnerYouTube,
} from "../src/core/youtube";
import { metadataSnapshot, restoreSnapshot } from "../src/core/sync";
import {
  handleYouTubeMessage,
  youtubeHtml,
} from "../src/components/youtubeBridge";
const video = (id: string, changes: Partial<Video> = {}): Video => ({
  id,
  title: id,
  uri: `file:///${id}.mp4`,
  duration: 10,
  size: 100,
  style: "Salsa",
  labels: [],
  importance: 5,
  ratingSet: true,
  status: "To learn",
  teacher: "",
  className: "",
  location: "",
  lessonDate: "",
  createdAt: "2026-10-20T10:00:00Z",
  resume: 0,
  segments: [],
  bookmarks: [],
  notes: [],
  available: true,
  source: "device",
  ...changes,
});
describe("library upgrades", () => {
  it("migrates bookmarks exactly once and preserves free notes, IDs and times", () => {
    const l = emptyLibrary();
    l.videos = [
      video("v", {
        bookmarks: [{ id: "b", name: "Turn", time: 2 }],
        notes: [{ id: "n", text: "Note", createdAt: "2020-01-01" }],
      }),
    ];
    const m = migrateLibrary(l);
    expect(migrateLibrary(m)).toEqual(m);
    expect(m.videos[0].notes.map((n) => n.id)).toEqual(["n", "bookmark:b"]);
    expect(m.videos[0].notes[1].time).toBe(2);
    expect(l.videos[0].bookmarks).toHaveLength(1);
  });
  it("keeps custom dances stable and deduplicates whitespace/case", () => {
    const added = addDanceType(emptyLibrary(), "  Tango  ");
    const again = addDanceType(added.library, "tango");
    expect(again.dance.id).toBe(added.dance.id);
    expect(again.library.danceTypes).toHaveLength(3);
    expect(() => addDanceType(again.library, "Other")).toThrow();
  });
  it("uses an explicit source dance after a folder rename", () => {
    const l = emptyLibrary();
    l.sources = [
      {
        id: "s",
        connectionId: "c",
        provider: "google-drive",
        folderId: "f",
        name: "Salsa",
        defaultStyle: "Bachata",
        defaultDanceId: "dance:bachata",
        defaultLabels: [],
        writable: true,
      },
    ];
    l.videos = [
      video("v", {
        style: "Bachata",
        remote: {
          connectionId: "c",
          fileId: "f",
          sourceIds: ["s"],
          canDownload: true,
        },
      }),
    ];
    expect(migrateLibrary(l).videos[0].style).toBe("Bachata");
  });
});
describe("filters and sorting", () => {
  const videos = [
    video("one", { importance: 1 }),
    video("three", { importance: 3 }),
    video("unrated", { importance: 5, ratingSet: false }),
    video("five"),
  ];
  it("combines exact ratings separately from Unrated", () => {
    expect(filterVideos(videos, { ratings: [1, 3] }).map((v) => v.id)).toEqual([
      "one",
      "three",
    ]);
    expect(
      filterVideos(videos, { ratings: [1], includeUnrated: true }).map(
        (v) => v.id,
      ),
    ).toEqual(["one", "unrated"]);
    expect(
      filterVideos(videos, { includeUnrated: true }).map((v) => v.id),
    ).toEqual(["unrated"]);
    expect(filterVideos(videos, {})).toHaveLength(4);
  });
  it("matches suggested aliases without rewriting original labels", () => {
    expect(
      matchesLabels(
        ["Footwork", "Daniel & Désirée"],
        ["Footwork / Shines", "daniel & désirée"],
        "all",
      ),
    ).toBe(true);
    expect(matchesLabels(["Sensual"], ["Sensual", "Partnerwork"], "all")).toBe(
      false,
    );
  });
  it("sorts numbers numerically, unnumbered last and ties consistently", () => {
    const items = [
      video("b", { title: "0010" }),
      video("z", { title: "0002" }),
      video("a", { title: "0002" }),
      video("n", { title: "Warmup" }),
    ];
    expect(sortVideos(items, "number-up").map((v) => v.id)).toEqual([
      "a",
      "z",
      "b",
      "n",
    ]);
    expect(sortVideos(items, "number-down").map((v) => v.id)).toEqual([
      "b",
      "a",
      "z",
      "n",
    ]);
    expect(items[0].id).toBe("b");
  });
  it("sorts added time independently of a numeric title", () => {
    expect(
      sortVideos([
        video("old", { title: "9999", createdAt: "2020-01-01" }),
        video("new", { title: "0001" }),
      ]).map((v) => v.id),
    ).toEqual(["new", "old"]);
  });
});
describe("daily mix", () => {
  it("defaults to two dance slots even with multiple folders of one dance", () => {
    const l = emptyLibrary();
    l.videos = [
      video("s1"),
      video("s2"),
      video("b", { style: "Bachata", ratingSet: false }),
    ];
    expect(choosePicks(l)).toEqual(["b", "s1"]);
  });
  it("gates labels only when explicitly enabled and rechecks cached picks", () => {
    let l = emptyLibrary();
    l.videos = [video("s", { labels: ["Sensual"] })];
    l.preferences.labels = ["Partnerwork"];
    l = ensureDailyPick(l);
    expect(l.picks.at(-1)?.videoIds).toEqual(["s"]);
    l.preferences.requirePickLabels = true;
    expect(ensureDailyPick(l).picks.at(-1)?.videoIds).toEqual([]);
  });
  it("includes playable YouTube and excludes non-embeddable entries", () => {
    const l = emptyLibrary();
    l.preferences.includeYouTube = true;
    l.videos = [
      video("yt", {
        source: "youtube",
        uri: "",
        youtube: { id: "Zb2lLo90a14", sourceIds: [], embedAllowed: true },
      }),
    ];
    expect(choosePicks(l)).toEqual(["yt"]);
    l.videos[0].youtube!.embedAllowed = false;
    expect(choosePicks(l)).toEqual([]);
  });
});
describe("continuous practice", () => {
  const l = emptyLibrary();
  l.videos = [
    video("s1"),
    video("s2", { importance: 1 }),
    video("b1", { style: "Bachata" }),
    video("b2", { style: "Bachata", available: false }),
    video("yt", {
      source: "youtube",
      uri: "",
      youtube: {
        id: "Zb2lLo90a14",
        sourceIds: ["playlist"],
        embedAllowed: true,
      },
    }),
  ];
  it("makes a weighted, balanced permutation without repeats", () => {
    const p = { ...practiceDefaults(l), includeYouTube: true };
    const queue = practiceQueue(l, p, () => 0);
    expect(queue).toEqual(["s1", "b1", "s2", "yt"]);
    expect(new Set(queue).size).toBe(queue.length);
  });
  it("uses star weights to alter the draw instead of always choosing highest", () => {
    const p = { ...practiceDefaults(l), includeYouTube: true };
    p.styles = ["Salsa"];
    expect(practiceQueue(l, p, () => 0.99)[0]).toBe("yt");
    expect(practiceQueue(l, p, () => 0)[0]).toBe("s1");
  });
  it("filters offline, source, labels and minimum stars together", () => {
    const p = {
      ...practiceDefaults(l),
      includeYouTube: true,
      offlineOnly: true,
      minRating: 5,
    };
    expect(practiceQueue(l, p, () => 0)).toEqual(["s1", "b1"]);
    expect(
      practiceQueue(
        l,
        { ...p, offlineOnly: false, sourceIds: ["playlist"] },
        () => 0,
      ),
    ).toEqual(["yt"]);
    expect(practiceQueue(l, { ...p, labels: ["missing"] })).toEqual([]);
  });
  it("never starts an empty queue", () =>
    expect(() =>
      beginPractice({ ...l, videos: [] }, practiceDefaults(l)),
    ).toThrow(/No available/));
  it("excludes buffering, pause and break time from active focus time", () => {
    const state = { ...beginPractice(l, practiceDefaults(l)), running: true };
    expect(tickPractice(state, 2000, false)).toBe(state);
    const tick = tickPractice(state, 2000, true);
    expect(tick.activeMs).toBe(2000);
    expect(tickPractice({ ...tick, running: false }, 5000, true).activeMs).toBe(
      2000,
    );
    const rest = tickPractice({ ...tick, stage: "break" }, 1000, false);
    expect(rest.activeMs).toBe(2000);
    expect(rest.remainingMs).toBe(tick.remainingMs - 1000);
  });
  it("caps at focus end and saves idempotently without double counting", () => {
    const state = {
      ...beginPractice(l, practiceDefaults(l)),
      running: true,
      remainingMs: 1000,
      visited: ["s1"],
    };
    const done = tickPractice(state, 5000, true);
    expect(done.running).toBe(false);
    expect(done.activeMs).toBe(1000);
    const saved = savePractice(savePractice(l, done), done);
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].seconds).toBe(1);
    expect(saved.sessions[0].videoIds).toEqual(["s1"]);
  });
});
describe("YouTube", () => {
  it("parses single videos, shorts and playlist URLs without importing tracking parameters", () => {
    expect(parseYouTubeLink("https://youtu.be/Zb2lLo90a14?si=abc")).toEqual({
      kind: "video",
      id: "Zb2lLo90a14",
    });
    expect(parseYouTubeLink(beginnerYouTube[0].url)).toEqual({
      kind: "playlist",
      id: beginnerYouTube[0].playlistId,
    });
    expect(
      parseYouTubeLink("https://www.youtube.com/shorts/Zb2lLo90a14").kind,
    ).toBe("video");
  });
  it("requires a deliberate choice for combined video/playlist links", () => {
    const url =
      "https://www.youtube.com/watch?v=Zb2lLo90a14&list=" +
      beginnerYouTube[0].playlistId;
    expect(() => parseYouTubeLink(url)).toThrow(/Choose/);
    expect(parseYouTubeLink(url, "video").id).toBe("Zb2lLo90a14");
    expect(parseYouTubeLink(url, "playlist").id).toBe(
      beginnerYouTube[0].playlistId,
    );
  });
  it("does not add YouTube to Daily Picks or Practice until explicitly included", () => {
    const l = importYouTube(
      emptyLibrary(),
      [
        {
          id: "Zb2lLo90a14",
          title: "Lesson",
          available: true,
          embedAllowed: true,
        },
      ],
      "Bachata",
      [],
    );
    expect(choosePicks(l)).toEqual([]);
    expect(practiceQueue(l, practiceDefaults(l))).toEqual([]);
  });
  it("preserves edits when a refreshed YouTube item becomes private", () => {
    let l = importYouTube(
      emptyLibrary(),
      [
        {
          id: "Zb2lLo90a14",
          title: "Lesson",
          available: true,
          embedAllowed: true,
        },
      ],
      "Bachata",
      ["My label"],
    );
    const id = l.videos[0].id;
    l = importYouTube(
      l,
      [
        {
          id: "Zb2lLo90a14",
          title: "Private video",
          available: false,
          embedAllowed: false,
          error: "Private video",
        },
      ],
      "Bachata",
      [],
    );
    expect(l.videos[0].id).toBe(id);
    expect(l.videos[0].available).toBe(false);
    expect(l.videos[0].title).toBe("Lesson");
    expect(l.videos[0].labels).toEqual(["My label"]);
  });
  it("rejects non-YouTube, scripts and unsupported channel URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://youtube.com.evil.com/watch?v=Zb2lLo90a14",
      "https://www.youtube.com/@artist",
    ])
      expect(() => parseYouTubeLink(url)).toThrow();
  });
  it("deduplicates videos across sources while preserving personal edits and source order", () => {
    const source = {
      id: "p1",
      name: "Playlist",
      playlistId: beginnerYouTube[0].playlistId,
      defaultStyle: "Bachata",
      defaultLabels: [],
      videoIds: ["Zb2lLo90a14"],
    };
    const item = {
      id: "Zb2lLo90a14",
      title: "Original",
      available: true,
      embedAllowed: true,
    };
    let l = importYouTube(emptyLibrary(), [item], "Bachata", [], source);
    l.videos[0] = {
      ...l.videos[0],
      importance: 2,
      ratingSet: true,
      labels: ["My label"],
      notes: [{ id: "n", text: "Remember", createdAt: "2020" }],
    };
    l = importYouTube(l, [{ ...item, title: "Updated" }], "Salsa", [], {
      ...source,
      id: "p2",
    });
    expect(l.videos).toHaveLength(1);
    expect(l.videos[0].youtube?.sourceIds).toEqual(["p1", "p2"]);
    expect(l.videos[0].importance).toBe(2);
    expect(l.videos[0].style).toBe("Bachata");
    expect(l.videos[0].notes).toHaveLength(1);
    expect(l.videos[0].labels).toEqual(["My label"]);
    const refreshed = importYouTube(l, [], "Bachata", [], {
      ...source,
      videoIds: [],
    });
    expect(refreshed.videos[0].youtube?.sourceIds).toEqual(["p2"]);
  });
  it("syncs memberships and dance catalog without API keys, local paths or active-session state", () => {
    let l = importYouTube(
      migrateLibrary(emptyLibrary()),
      [
        {
          id: "Zb2lLo90a14",
          title: "Test",
          available: true,
          embedAllowed: true,
        },
      ],
      "Bachata",
      [],
    );
    l.youtubeSettings = { apiKey: "PRIVATE_DEVICE_KEY" };
    const snapshot = metadataSnapshot(l);
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_DEVICE_KEY");
    const restored = restoreSnapshot(snapshot, emptyLibrary());
    expect(restored.videos[0].available).toBe(true);
    expect(restored.videos[0].youtube?.id).toBe("Zb2lLo90a14");
    expect(restored.youtubeSettings).toBeUndefined();
  });
  it("validates bridge identity and playlist IDs, and never embeds a supplied URL", () => {
    let ids: string[] = [];
    handleYouTubeMessage(
      { token: "wrong", kind: "playlist", ids: ["Zb2lLo90a14"] },
      "right",
      { onPlaylist: (x) => (ids = x) },
    );
    expect(ids).toEqual([]);
    handleYouTubeMessage(
      {
        token: "right",
        kind: "playlist",
        ids: ["Zb2lLo90a14", "bad", "Zb2lLo90a14"],
      },
      "right",
      { onPlaylist: (x) => (ids = x) },
    );
    expect(ids).toEqual(["Zb2lLo90a14"]);
    expect(() => youtubeHtml("token", "<script>bad</script>")).toThrow();
    expect(youtubeHtml("token", "Zb2lLo90a14")).toContain(
      "https://www.youtube.com/iframe_api",
    );
  });
});
