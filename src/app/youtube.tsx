import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen, Card, Txt, Button, Field, Row, Chip } from "../components/ui";
import { DancePicker } from "../components/DancePicker";
import { LabelPicker } from "../components/LabelPicker";
import YouTubeEmbed from "../components/YouTubeEmbed";
import { useLibrary } from "../services/store";
import { libraryLabels } from "../core/labels";
import {
  beginnerYouTube,
  importYouTube,
  parseYouTubeLink,
  type YouTubeLink,
  type YouTubeMetadata,
} from "../core/youtube";
import { uid } from "../core/types";
import {
  embeddedPlaylistMetadata,
  readPlaylist,
  videoMetadata,
} from "../services/youtube";

export default function YouTubeSources() {
  const { library, update, commit } = useLibrary();
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [url, setUrl] = useState(""),
    [choiceUrl, setChoiceUrl] = useState(""),
    [link, setLink] = useState<YouTubeLink>(),
    [items, setItems] = useState<YouTubeMetadata[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [previewLimit, setPreviewLimit] = useState(50);
  const [attempt, setAttempt] = useState(0);
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [saved, setSaved] = useState<{ count: number; sourceId?: string }>();
  const [title, setTitle] = useState(""),
    [style, setStyle] = useState("Bachata"),
    [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(false),
    [showSuggestions, setShowSuggestions] = useState(true);
  const [key, setKey] = useState(
    library.youtubeSettings?.apiKey ??
      process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ??
      "",
  );
  const request = useRef<AbortController | undefined>(undefined),
    loadedPlaylist = useRef(""),
    discoveryVersion = useRef(0),
    discoveredRows = useRef<YouTubeMetadata[]>([]),
    discoveryMode = useRef<"none" | "api" | "player">("none");
  useEffect(() => {
    if (!waiting) return;
    const timeout = setTimeout(() => {
      setWaiting(false);
      setError(
        "The player did not return playlist contents. Retry discovery or use a YouTube Data API v3 key for a complete import. Playing the preview is not required.",
      );
    }, 25000);
    return () => clearTimeout(timeout);
  }, [waiting]);
  useEffect(() => () => request.current?.abort(), []);
  useFocusEffect(
    useCallback(
      () => () => {
        setPreviewPlaying(false);
        request.current?.abort();
        setBusy(false);
      },
      [],
    ),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPreviewPlaying(false);
    });
    return () => sub.remove();
  }, []);
  async function preview(input = url, choice?: "video" | "playlist") {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPlaybackError("");
    setSaved(undefined);
    setComplete(false);
    discoveryVersion.current++;
    discoveryMode.current = "none";
    setAttempt((n) => n + 1);
    setLink(undefined);
    setPreviewPlaying(false);
    setChoiceUrl("");
    setMessage("");
    setItems([]);
    setPreviewLimit(50);
    setSelected([]);
    setWaiting(false);
    loadedPlaylist.current = "";
    discoveredRows.current = [];
    try {
      const parsed = parseYouTubeLink(input, choice);
      setUrl(input);
      discoveryMode.current =
        parsed.kind === "playlist" ? (key.trim() ? "api" : "player") : "none";
      setLink(parsed);
      setBusy(true);
      const existing =
        parsed.kind === "playlist"
          ? library.youtubeSources?.find((s) => s.playlistId === parsed.id)
          : undefined;
      if (existing) {
        setStyle(existing.defaultStyle);
        setLabels(existing.defaultLabels);
      }
      if (parsed.kind === "video") {
        const item = await videoMetadata(parsed.id, controller.signal);
        if (controller.signal.aborted) return;
        setItems([item]);
        setSelected([item.id]);
        setTitle(item.title);
      } else if (key.trim()) {
        try {
          const result = await readPlaylist(
            parsed.id,
            key.trim(),
            controller.signal,
            (n) => {
              if (!controller.signal.aborted)
                setMessage(`Reading playlist · ${n} videos`);
            },
          );
          if (controller.signal.aborted) return;
          setTitle(
            result.title ??
              existing?.name ??
              beginnerYouTube.find((s) => s.playlistId === parsed.id)?.title ??
              "YouTube playlist",
          );
          setItems(result.items);
          setSelected(result.items.filter((x) => x.available).map((x) => x.id));
          setComplete(true);
          setMessage(`${result.items.length} videos read in playlist order.`);
        } catch (e) {
          if (controller.signal.aborted) return;
          setTitle(
            existing?.name ??
              beginnerYouTube.find((s) => s.playlistId === parsed.id)?.title ??
              "YouTube playlist",
          );
          discoveryMode.current = "player";
          setAttempt((n) => n + 1);
          setWaiting(true);
          setError(
            `${(e as Error).message.replaceAll(key.trim(), "[API key]")} Check that the key allows YouTube Data API v3. We will also try the player's visible list below.`,
          );
        }
      } else {
        setTitle(
          existing?.name ??
            beginnerYouTube.find((s) => s.playlistId === parsed.id)?.title ??
            "YouTube playlist",
        );
        setWaiting(true);
        setMessage(
          "Reading the playlist from the official player without starting playback. Its visible list may be limited. A YouTube Data API v3 key enables complete paginated imports.",
        );
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
        if ((e as Error).message.includes("contains a video and a playlist"))
          setChoiceUrl(input);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function fromPlayer(ids: string[]) {
    if (
      discoveryMode.current !== "player" ||
      complete ||
      !link ||
      link.kind !== "playlist" ||
      loadedPlaylist.current === `${link.id}:${ids.join(",")}` ||
      !ids.length
    )
      return;
    loadedPlaylist.current = `${link.id}:${ids.join(",")}`;
    const version = ++discoveryVersion.current;
    const controller = request.current;
    if (!controller || controller.signal.aborted) return;
    setBusy(true);
    setWaiting(false);
    try {
      const rows = await embeddedPlaylistMetadata(
        ids,
        controller.signal,
        (done, total) => {
          if (
            !controller.signal.aborted &&
            version === discoveryVersion.current
          )
            setMessage(`Reading video details · ${done} / ${total}`);
        },
      );
      if (controller.signal.aborted || version !== discoveryVersion.current)
        return;
      const previous = discoveredRows.current;
      const previousIds = new Set(previous.map((x) => x.id));
      const merged = [
        ...rows,
        ...previous.filter((old) => !rows.some((x) => x.id === old.id)),
      ];
      discoveredRows.current = merged;
      setItems(merged);
      setSelected((old) => [
        ...new Set([
          ...old,
          ...rows
            .filter((x) => x.available && !previousIds.has(x.id))
            .map((x) => x.id),
        ]),
      ]);
      setError("");
      setMessage(
        `The embedded player returned ${merged.length} videos. YouTube may limit this list; an API-key refresh reads all pages.`,
      );
    } catch (e) {
      if (!controller.signal.aborted && version === discoveryVersion.current)
        setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted && version === discoveryVersion.current)
        setBusy(false);
    }
  }
  async function save() {
    if (!link || !selected.length || busy) return;
    setSaving(true);
    discoveryMode.current = "none";
    discoveryVersion.current++;
    request.current?.abort();
    const rows = items.filter(
      (item) => item.available && selected.includes(item.id),
    );
    const unavailable = items.filter((item) => !item.available);
    setBusy(true);
    setError("");
    let savedSourceId: string | undefined;
    try {
      await commit((l) => {
        const previous =
          link.kind === "playlist"
            ? l.youtubeSources?.find((s) => s.playlistId === link.id)
            : undefined;
        const source =
          link.kind === "playlist"
            ? {
                id: previous?.id ?? uid(),
                playlistId: link.id,
                name: title.trim() || "YouTube playlist",
                defaultStyle: style,
                defaultDanceId: l.danceTypes?.find((d) => d.name === style)?.id,
                defaultLabels: labels,
                videoIds: [
                  ...new Set([
                    ...rows.map((x) => x.id),
                    ...(!complete ? (previous?.videoIds ?? []) : []),
                  ]),
                ],
                limited: !complete,
                lastSyncedAt: new Date().toISOString(),
              }
            : undefined;
        savedSourceId = source?.id;
        return importYouTube(
          l,
          [
            ...rows,
            ...unavailable.filter((item) =>
              l.videos.some((v) => v.youtube?.id === item.id),
            ),
          ],
          style,
          labels,
          source,
          complete,
        );
      });
      request.current?.abort();
      discoveryMode.current = "none";
      discoveryVersion.current++;
      setItems([]);
      setLink(undefined);
      setWaiting(false);
      setSaved({ count: rows.length, sourceId: savedSourceId });
      setMessage("Existing ratings, notes and labels were kept.");
    } catch {
      setError(
        "The videos could not be saved on this phone. Free some storage and try Add again. Your selection is kept.",
      );
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }
  return (
    <Screen
      title="YouTube library"
      subtitle="Public videos and playlists, alongside your own practice videos."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Done
        </Button>
      }
    >
      {showSuggestions ? (
        <Card>
          <Txt size={23} weight="display">
            A place to begin
          </Txt>
          <Txt>
            Suggestions are optional. Preview first, add only what you like, or
            use your own links.
          </Txt>
          {beginnerYouTube
            .filter((s) => s.enabled)
            .map((s) => (
              <View key={s.id} style={{ gap: 8 }}>
                <Txt weight="bold">{s.title}</Txt>
                <Txt>
                  {s.author} · {s.style} · {s.level} · Language: {s.language}
                </Txt>
                <Txt size={13}>{s.description}</Txt>
                <Button
                  variant="soft"
                  onPress={() => {
                    setStyle(s.style);
                    setLabels(["Beginner", "Tutorial"]);
                    void preview(s.url);
                  }}
                >
                  {library.youtubeSources?.some(
                    (x) => x.playlistId === s.playlistId,
                  )
                    ? "Already added · preview playlist"
                    : "Preview beginner Bachata playlist"}
                </Button>
              </View>
            ))}
          <Button variant="ghost" onPress={() => setShowSuggestions(false)}>
            Skip suggestions
          </Button>
        </Card>
      ) : null}
      <Card>
        <Field
          label="YouTube video or public playlist URL"
          placeholder="https://www.youtube.com/playlist?list=…"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
        />
        <Button disabled={busy} onPress={() => void preview()}>
          Preview link
        </Button>
        {link ? (
          <>
            <DancePicker value={style} onChange={setStyle} />
            <LabelPicker
              value={labels}
              options={libraryLabels(library)}
              onChange={setLabels}
            />
            <Txt size={12}>
              {busy
                ? "Reading video details…"
                : waiting
                  ? "Waiting for playlist contents…"
                  : !items.length
                    ? "No videos ready to add. Retry discovery or configure the Data API key below."
                    : complete
                      ? "Complete playlist read. Choose the lessons to add."
                      : "Limited player list: existing playlist memberships will be kept. Use a Data API key to read all pages."}
            </Txt>
            {playbackError ? (
              <Txt size={12}>
                Preview: {playbackError} You can still add any loaded videos.
              </Txt>
            ) : null}
            <Button
              disabled={!selected.length || busy}
              onPress={() => void save()}
            >
              {saving
                ? "Saving to Library…"
                : busy
                  ? "Reading video details…"
                  : "Add selected videos"}
            </Button>
          </>
        ) : null}
        <Txt size={12}>
          YouTube videos stay online. Downloads, trimming, exporting, cloud
          uploads and source renaming apply to your own files only.
        </Txt>
      </Card>
      {choiceUrl ? (
        <Card>
          <Txt>Which part of this link would you like to add?</Txt>
          <Button onPress={() => void preview(choiceUrl, "video")}>
            Preview single video
          </Button>
          <Button
            variant="soft"
            onPress={() => void preview(choiceUrl, "playlist")}
          >
            Preview whole playlist
          </Button>
        </Card>
      ) : null}
      {saved ? (
        <Card>
          <Txt weight="bold">Added {saved.count} videos to your Library</Txt>
          <Button
            onPress={() => {
              update((l) => ({
                ...l,
                libraryView: { sourceId: saved.sourceId, sort: "added-new" },
              }));
              router.push("/library");
            }}
          >
            Open Library
          </Button>
        </Card>
      ) : null}
      {link ? (
        <Card>
          <Txt size={23} weight="display">
            Preview before adding
          </Txt>
          <YouTubeEmbed
            key={`${link.kind}:${link.id}:${attempt}`}
            videoId={link.kind === "video" ? link.id : undefined}
            playlistId={link.kind === "playlist" ? link.id : undefined}
            playing={previewPlaying}
            onPlaylist={(ids) => void fromPlayer(ids)}
            onState={(state) => {
              if (state.phase === "playing") setPreviewPlaying(true);
              if (state.phase === "paused" || state.phase === "ended")
                setPreviewPlaying(false);
              if (state.phase === "error")
                setPlaybackError(
                  state.error ?? "YouTube playback is unavailable.",
                );
            }}
          />
          <Button
            variant="soft"
            onPress={() =>
              void Linking.openURL(
                link.kind === "playlist"
                  ? `https://www.youtube.com/playlist?list=${link.id}`
                  : `https://www.youtube.com/watch?v=${link.id}`,
              )
            }
          >
            Open in YouTube
          </Button>
          {link.kind === "playlist" ? (
            <Field label="Library name" value={title} onChangeText={setTitle} />
          ) : (
            <Txt weight="bold">{title}</Txt>
          )}
          {link.kind === "playlist" && !busy ? (
            <Button
              variant="soft"
              onPress={() => void preview(url, "playlist")}
            >
              Retry playlist discovery
            </Button>
          ) : null}
          {items.length ? (
            <>
              <Row style={{ justifyContent: "center" }}>
                <Chip
                  onPress={() =>
                    setSelected(
                      items.filter((i) => i.available).map((i) => i.id),
                    )
                  }
                >
                  Select available videos
                </Chip>
                <Chip onPress={() => setSelected([])}>Clear selection</Chip>
              </Row>
              <Txt>{selected.length} selected · playlist order is kept</Txt>
              {items.slice(0, previewLimit).map((item, index) => (
                <View key={item.id} style={{ gap: 4 }}>
                  <Chip
                    selected={selected.includes(item.id)}
                    onPress={() =>
                      item.available &&
                      setSelected((ids) =>
                        ids.includes(item.id)
                          ? ids.filter((id) => id !== item.id)
                          : [...ids, item.id],
                      )
                    }
                  >
                    {index + 1}. {item.title}
                  </Chip>
                  {item.error ? <Txt size={12}>{item.error}</Txt> : null}
                </View>
              ))}
              {previewLimit < items.length ? (
                <Button
                  variant="soft"
                  onPress={() => setPreviewLimit((n) => n + 50)}
                >
                  Show next {Math.min(50, items.length - previewLimit)} lessons
                </Button>
              ) : null}
              <Button
                disabled={!selected.length || busy}
                onPress={() => void save()}
              >
                Add these videos
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
      {busy && !saving ? (
        <Button
          variant="soft"
          onPress={() => {
            request.current?.abort();
            setBusy(false);
            setWaiting(false);
            discoveryVersion.current++;
            setMessage("Cancelled. Your library has not changed.");
          }}
        >
          Cancel import
        </Button>
      ) : null}
      {message ? (
        <Card>
          <Txt accessibilityLiveRegion="polite">{message}</Txt>
        </Card>
      ) : null}
      {error ? (
        <Card>
          <Txt accessibilityRole="alert">{error}</Txt>
          <Txt size={12}>
            Your saved library is unchanged. Check the connection, public
            playlist visibility and YouTube Data API v3 setup, then retry. An
            invalid/restricted key or an unloaded player can prevent discovery.
          </Txt>
        </Card>
      ) : null}
      <Card>
        <Txt size={23} weight="display">
          Your YouTube playlists
        </Txt>
        {(library.youtubeSources ?? []).map((s) => (
          <View key={s.id} style={{ gap: 8 }}>
            <Txt weight="bold">{s.name}</Txt>
            <Txt>
              {s.defaultStyle} · {s.videoIds.length} videos
              {s.limited ? " · limited player list" : ""} ·{" "}
              {s.lastSyncedAt
                ? new Date(s.lastSyncedAt).toLocaleDateString()
                : "Not refreshed"}
            </Txt>
            <Row>
              <Button
                variant="soft"
                disabled={busy}
                onPress={() =>
                  void preview(
                    `https://www.youtube.com/playlist?list=${s.playlistId}`,
                  )
                }
              >
                Refresh {s.name}
              </Button>
              <Button
                variant="ghost"
                onPress={() =>
                  update((l) => ({
                    ...l,
                    youtubeSources: l.youtubeSources?.filter(
                      (x) => x.id !== s.id,
                    ),
                    videos: l.videos.map((v) =>
                      v.youtube
                        ? {
                            ...v,
                            youtube: {
                              ...v.youtube,
                              sourceIds: v.youtube.sourceIds.filter(
                                (id) => id !== s.id,
                              ),
                            },
                          }
                        : v,
                    ),
                  }))
                }
              >
                Disconnect playlist
              </Button>
            </Row>
          </View>
        ))}
        <Txt size={12}>
          Refresh previews changes before saving. Disconnect keeps your videos
          and personal notes in the library.
        </Txt>
      </Card>
      <Card>
        <Txt weight="bold">Advanced setup · YouTube Data API</Txt>
        <Field
          label="YouTube Data API key (optional)"
          value={key}
          onChangeText={setKey}
          autoCapitalize="none"
          secureTextEntry
        />
        <Txt size={12}>
          A key enables full playlist pagination. It is stored only on this
          device and excluded from account sync. Restrict its API access to
          YouTube Data API v3 in Google Cloud. A key is not needed to preview or
          play a video.
        </Txt>
        <Button
          variant="soft"
          onPress={() => {
            update((l) => ({ ...l, youtubeSettings: { apiKey: key.trim() } }));
            setMessage("YouTube setup saved on this device.");
          }}
        >
          Save YouTube setup
        </Button>
      </Card>
    </Screen>
  );
}
