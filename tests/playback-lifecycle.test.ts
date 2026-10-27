import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import {
  type ActivePractice,
  matchesPlayback,
  movePractice,
  playbackContext,
  practiceQueue,
  practiceRandom,
  recordPlayback,
  tickPractice,
} from "../src/core/practiceQueue";
import { emptyLibrary, type Video } from "../src/core/types";
import { youtubeHtml } from "../src/components/youtubeBridge";
const session = (): ActivePractice => ({
  id: "session",
  startedAt: "2026-10-20",
  preferences: {
    minutes: 10,
    breakMinutes: 2,
    styles: [],
    sourceIds: [],
    labels: [],
    labelMatch: "any",
    minRating: 1,
    offlineOnly: false,
  },
  queue: ["first", "second", "third"],
  index: 0,
  visited: [],
  remainingMs: 600000,
  activeMs: 0,
  stage: "focus",
  running: true,
  cycle: 1,
  position: 0,
});
describe("queued native playback events", () => {
  it("ignores an old end-position event after Next instead of starting the new video at EOF", () => {
    const initial = session(),
      old = playbackContext(initial);
    const next = movePractice(initial, 1).state;
    expect(recordPlayback(next, old, 6, true)).toBe(next);
    expect(next.position).toBe(0);
    expect(next.visited).toEqual([]);
    const now = recordPlayback(next, playbackContext(next), 1, true);
    expect(now.index).toBe(1);
    expect(now.visited).toEqual(["second"]);
  });
  it("rejects an earlier mount even after Previous returns to the same video and index", () => {
    const initial = session(),
      old = playbackContext(initial);
    const back = movePractice(movePractice(initial, 1).state, -1).state;
    expect(back.queue[back.index]).toBe("first");
    expect(matchesPlayback(back, old)).toBe(false);
    expect(recordPlayback(back, old, 5, true)).toBe(back);
  });
  it("cannot turn a manual pause into a resume through late playing observations", () => {
    const paused = { ...session(), running: false };
    const observed = recordPlayback(paused, playbackContext(paused), 2, true);
    expect(observed.running).toBe(false);
    expect(observed.visited).toEqual([]);
    expect(tickPractice(observed, 5000, true).activeMs).toBe(0);
  });
  it("keeps the preview order stable when only notes, resume and history change", () => {
    const l = emptyLibrary();
    l.videos = Array.from(
      { length: 8 },
      (_, i) =>
        ({
          title: String(i),
          duration: 6,
          size: 1024,
          status: "To learn",
          teacher: "",
          className: "",
          location: "",
          lessonDate: "",
          createdAt: "2026-10-20",
          resume: 0,
          segments: [],
          bookmarks: [],
          notes: [],
          id: String(i),
          style: i % 2 ? "Bachata" : "Salsa",
          importance: (i % 5) + 1,
          ratingSet: true,
          available: true,
          labels: [],
          source: "device",
          uri: "file:///sample.mp4",
        }) satisfies Video,
    );
    const p = session().preferences;
    const first = practiceQueue(l, p, practiceRandom(123));
    const changed = {
      ...l,
      videos: l.videos.map((v) => ({
        ...v,
        resume: 3,
        notes: [{ id: "n", text: "Note", createdAt: "2026-10-20" }],
      })),
    };
    expect(practiceQueue(changed, p, practiceRandom(123))).toEqual(first);
    expect(practiceQueue(changed, p, practiceRandom(456))).not.toEqual(first);
  });
  it("pauses at queue exhaustion while preserving real history and rejecting another session", () => {
    const state = { ...session(), index: 2, visited: ["first", "second"] };
    const end = movePractice(state, 1);
    expect(end.exhausted).toBe(true);
    expect(end.state.running).toBe(false);
    expect(end.state.index).toBe(2);
    expect(end.state.visited).toEqual(state.visited);
    expect(
      matchesPlayback(end.state, {
        ...playbackContext(state),
        sessionId: "another",
      }),
    ).toBe(false);
  });
});
type Events = {
  onReady: () => void;
  onStateChange: (event: { data: number }) => void;
};
function playerBridge(enforcePause: boolean) {
  const messages: Record<string, unknown>[] = [],
    counts = { pause: 0, play: 0 };
  let events: Events | undefined;
  let nativeState = 2;
  const player = {
    getCurrentTime: () => 0,
    getDuration: () => 10,
    getPlaylist: () => [],
    getAvailablePlaybackRates: () => [1],
    getPlayerState: () => nativeState,
    pauseVideo: () => {
      counts.pause++;
    },
    playVideo: () => {
      counts.play++;
    },
    setPlaybackRate: () => {},
    seekTo: () => {},
    destroy: () => {},
  };
  const window: Record<string, unknown> = { addEventListener: () => {} };
  const context = {
    window,
    parent: {
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
    document: { createElement: () => ({}), head: { appendChild: () => {} } },
    YT: {
      Player: function (_id: string, config: { events: Events }) {
        events = config.events;
        return player;
      },
    },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const html = youtubeHtml(
      "token",
      "Zb2lLo90a14",
      undefined,
      undefined,
      enforcePause,
    ),
    script = html.match(/<script>([\s\S]+)<\/script>/)![1];
  runInNewContext(script, context, { timeout: 1000 });
  (window.onYouTubeIframeAPIReady as () => void)();
  events!.onReady();
  return {
    counts,
    messages,
    state: (data: number) => {
      nativeState = data;
      events!.onStateChange({ data });
    },
    command: window.bailacueCommand as (command: { playing: boolean }) => void,
  };
}
describe("official iframe pause policy", () => {
  it("suppresses a delayed playing event while Practice is paused and permits explicit resume", () => {
    const p = playerBridge(true);
    p.command({ playing: false });
    p.messages.length = 0;
    p.state(1);
    expect(p.counts.pause).toBe(2);
    expect(p.messages.some((m) => m.phase === "playing")).toBe(false);
    p.command({ playing: true });
    p.state(1);
    expect(p.counts.play).toBe(1);
    expect(p.messages.some((m) => m.phase === "playing")).toBe(true);
  });
  it("keeps ordinary preview player controls available outside a timed session", () => {
    const p = playerBridge(false);
    p.command({ playing: false });
    p.messages.length = 0;
    p.state(1);
    expect(p.counts.pause).toBe(0);
    expect(p.messages.some((m) => m.phase === "playing")).toBe(true);
    p.command({ playing: false });
    expect(p.counts.pause).toBe(1);
  });
});
