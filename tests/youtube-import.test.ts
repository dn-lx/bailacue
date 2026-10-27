import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { readPlaylist, playlistItems } from "../src/services/youtube";
import { youtubeHtml } from "../src/components/youtubeBridge";
import { importYouTube } from "../src/core/youtube";
import { emptyLibrary } from "../src/core/types";

afterEach(() => vi.unstubAllGlobals());
const item = (id = "Zb2lLo90a14") => ({
  snippet: { title: "Bachata lesson", resourceId: { videoId: id } },
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe("playlist discovery independent of playback", () => {
  it("reads every contents page even when the separate playlist title lookup fails", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/playlists"))
        return response({ error: { message: "title unavailable" } }, 403);
      return response(
        u.searchParams.has("pageToken")
          ? { items: [item("dQw4w9WgXcQ")] }
          : { items: [item()], nextPageToken: "next" },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await readPlaylist(
      "PL2E0b6twkkHkMemtovF3zHgo95pURUUmy",
      "test-key",
      new AbortController().signal,
    );
    expect(result.items.map((x) => x.id)).toEqual([
      "Zb2lLo90a14",
      "dQw4w9WgXcQ",
    ]);
    expect(result.title).toBeUndefined();
    expect(result.complete).toBe(true);
  });
  it("rejects a malformed contents response rather than presenting an empty successful import", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ kind: "unexpected" })),
    );
    await expect(playlistItems("playlist", "test-key")).rejects.toThrow(
      /did not return playlist contents/,
    );
  });
  it("does not return partial contents as a full refresh after a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ items: [item()], nextPageToken: "next" }),
        )
        .mockResolvedValueOnce(
          response({ error: { message: "quota exceeded" } }, 403),
        ),
    );
    await expect(
      readPlaylist("playlist", "test-key", new AbortController().signal),
    ).rejects.toThrow(/quota exceeded/);
  });
  it("keeps existing source memberships and edits when only a limited player list is available", () => {
    const rows = ["Zb2lLo90a14", "dQw4w9WgXcQ"].map((id) => ({
      id,
      title: id,
      available: true,
      embedAllowed: true,
    }));
    const source = {
      id: "source",
      playlistId: "playlist",
      name: "Lessons",
      defaultStyle: "Bachata",
      defaultLabels: [],
      videoIds: rows.map((x) => x.id),
    };
    const l = importYouTube(emptyLibrary(), rows, "Bachata", [], source);
    l.videos[1].labels = ["My artist"];
    const refreshed = importYouTube(
      l,
      [rows[0]],
      "Bachata",
      [],
      { ...source, limited: true },
      false,
    );
    expect(refreshed.videos[1].youtube?.sourceIds).toEqual(["source"]);
    expect(refreshed.videos[1].labels).toEqual(["My artist"]);
    expect(refreshed.youtubeSources?.[0].videoIds).toEqual(source.videoIds);
  });
  it("cues a playlist and discovers its IDs without playing or cancelling its initial cue", () => {
    const messages: Record<string, unknown>[] = [];
    let config: {
      events: {
        onReady: () => void;
        onStateChange: (e: { data: number }) => void;
      };
    };
    let cued = false;
    const pause = vi.fn(),
      play = vi.fn(),
      cue = vi.fn(() => {
        cued = true;
      });
    const player = {
      cuePlaylist: cue,
      getPlaylist: () => (cued ? ["Zb2lLo90a14"] : []),
      getPlayerState: () => 5,
      getCurrentTime: () => 0,
      getDuration: () => 0,
      getAvailablePlaybackRates: () => [1],
      pauseVideo: pause,
      playVideo: play,
    };
    const window: Record<string, unknown> = { addEventListener: () => {} };
    const html = youtubeHtml(
      "token",
      undefined,
      "PL2E0b6twkkHkMemtovF3zHgo95pURUUmy",
    );
    runInNewContext(
      html.match(/<script>([\s\S]+)<\/script>/)![1],
      {
        window,
        parent: {
          postMessage: (m: Record<string, unknown>) => messages.push(m),
        },
        document: {
          createElement: () => ({}),
          head: { appendChild: () => {} },
        },
        YT: {
          Player: function (_id: string, c: typeof config) {
            config = c;
            return player;
          },
        },
        setInterval: () => 0,
        clearInterval: () => {},
        setTimeout: () => 0,
        clearTimeout: () => {},
      },
      { timeout: 1000 },
    );
    (window.bailacueCommand as (x: unknown) => void)({ playing: false });
    (window.onYouTubeIframeAPIReady as () => void)();
    config!.events.onReady();
    expect(cue).toHaveBeenCalledWith({
      listType: "playlist",
      list: "PL2E0b6twkkHkMemtovF3zHgo95pURUUmy",
      index: 0,
      startSeconds: 0,
    });
    expect(
      messages.some(
        (x) =>
          x.kind === "playlist" && JSON.stringify(x.ids) === '["Zb2lLo90a14"]',
      ),
    ).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });
});
