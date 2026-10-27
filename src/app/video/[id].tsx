import { YouTubeDetail } from "../../components/YouTubeDetail";
import { VideoDetails, VideoContext } from "../../components/VideoDetails";
import { NotesMoments } from "../../components/NotesMoments";
import { Disclosure } from "../../components/Disclosure";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvent } from "expo";
import {
  View,
  AppState,
  ScrollView,
  Alert,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { SafeAreaView } from "react-native-safe-area-context";
import { seek, setRate } from "../../services/playback";
import { useLibrary } from "../../services/store";
import {
  exportClip,
  deleteMedia,
  saveToPhotos,
  shareMedia,
} from "../../services/media";
import { nativeMedia } from "../../../modules/baila-media";
import {
  Txt,
  Row,
  Button,
  Card,
  Chip,
  Field,
  Badge,
  Icon,
} from "../../components/ui";
import { useTheme } from "../../components/theme";
import { CloudVideoControls } from "../../components/CloudVideoControls";
import { resolveVideo, RevokedAccess } from "../../services/cloud/playback";
import Timeline from "../../components/Timeline";
import { VideoArea } from "../../components/VideoArea";
import { SaveDestinationPicker } from "../../components/SaveDestinationPicker";
import { clipDestination, uploadDestination } from "../../core/destination";
import { trimRange } from "../../core/editing";
import { formatTime, parseTime, validateSegment } from "../../core/practice";
import { uid, type Video } from "../../core/types";
import { removeVideo, videoFromExport } from "../../core/library";
function Player({ video, uri }: { video: Video; uri: VideoSource }) {
  const { library, update, updateVideo } = useLibrary();
  const t = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [destination, setDestination] = useState(() => clipDestination(video));
  const [error, setError] = useState("");
  const [time, setTime] = useState(video.resume);
  const [playing, setPlaying] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [start, setStart] = useState("0:00");
  const [end, setEnd] = useState(video.duration.toFixed(2));
  const [loop, setLoop] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string>();
  const [exportedId, setExportedId] = useState<string>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lastSaved = useRef(0);
  const current = useRef(video.resume);
  const resolved = useRef(
    video.remote ? video.offlineUri : typeof uri === "string" ? uri : video.uri,
  );
  const resumeAtOpen = useRef(video.resume);
  const player = useVideoPlayer(uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.preservesPitch = true;
  });
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => sub.remove();
  }, [player]);
  const { status: playerStatus } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const playerReady = playerStatus === "readyToPlay";
  useEffect(() => {
    const loaded = player.addListener("sourceLoad", (event) => {
      if (
        Number.isFinite(event.duration) &&
        event.duration > 0 &&
        Math.abs(event.duration - video.duration) > 0.1
      ) {
        updateVideo(video.id, { duration: event.duration });
        setEnd(event.duration.toFixed(2));
      }
      seek(
        player,
        Math.min(resumeAtOpen.current, Math.max(0, video.duration - 0.1)),
      );
    });
    if (player.status === "readyToPlay")
      seek(
        player,
        Math.min(resumeAtOpen.current, Math.max(0, video.duration - 0.1)),
      );
    return () => loaded.remove();
  }, [video.duration, video.id, player, updateVideo]);

  useEffect(() => {
    const timer = player.addListener("timeUpdate", (event) => {
      current.current = event.currentTime;
      setTime(event.currentTime);
      if (loop) {
        const a = parseTime(start),
          b = parseTime(end);
        if (event.currentTime >= b || event.currentTime < a) seek(player, a);
      }
      if (Date.now() - lastSaved.current > 5000) {
        lastSaved.current = Date.now();
        updateVideo(video.id, { resume: event.currentTime });
      }
    });
    const status = player.addListener("statusChange", (event) => {
      if (event.status === "error")
        setError(
          event.error?.message ??
            "The video cannot be played. Try an H.264 MP4.",
        );
    });
    const play = player.addListener("playingChange", (event) =>
      setPlaying(event.isPlaying),
    );
    return () => {
      timer.remove();
      status.remove();
      play.remove();
    };
  }, [player, loop, start, end, video.id, updateVideo]);
  useEffect(
    () => () => {
      updateVideo(video.id, { resume: current.current });
    },
    [video.id, updateVideo],
  );
  function section() {
    const a = parseTime(start),
      b = parseTime(end);
    validateSegment(a, b, video.duration);
    return { start: a, end: b };
  }
  function enableLoop() {
    try {
      const range = section();
      if (!loop) seek(player, range.start);
      setLoop(!loop);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function trim() {
    try {
      const range = section();
      if (destination.mode === "cloud")
        uploadDestination(library, destination.sourceId);
      if (!resolved.current)
        throw new Error(
          "Download this cloud video to your phone before exporting a new clip.",
        );
      player.pause();
      setBusy(true);
      setError("");
      const result = await exportClip(
        resolved.current,
        range.start,
        range.end,
        video.duration,
      );
      const clip = videoFromExport(video, result);
      update((l) => ({ ...l, videos: [clip, ...l.videos] }));
      setExported(result.uri);
      setExportedId(clip.id);
      if (destination.mode === "cloud") {
        setExported(undefined);
        router.push({
          pathname: "/transfer/[id]",
          params: {
            id: clip.id,
            destination: destination.sourceId,
            keepCopy: destination.keepCopy ? "1" : "0",
            autoUpload: "1",
          },
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteCopy() {
    try {
      player.pause();
      await player.replaceAsync(null);
      if (video.remote) {
        if (video.offlineUri) await deleteMedia(video.offlineUri);
      } else await deleteMedia(video.uri);
      if (video.thumbnail?.startsWith("file:"))
        await deleteMedia(video.thumbnail);
      update((l) => removeVideo(l, video.id));
      router.replace("/library");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteOpen(false);
    }
  }
  const handle = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) Alert.alert("BailaCue", message);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: t.background }}
    >
      <ScrollView
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: 40,
          maxWidth: 850,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Button variant="ghost" icon="back" onPress={() => router.back()}>
              Library
            </Button>
            <Badge tone={video.style === "Bachata" ? "accent" : "primary"}>
              {video.style.toUpperCase()}
            </Badge>
          </Row>
        </View>
        <VideoArea onDragging={setDragging}>
          <View style={{ flex: 1, transform: [{ scaleX: mirror ? -1 : 1 }] }}>
            {!fullscreen ? (
              <VideoView
                player={player}
                surfaceType="textureView"
                style={{ width: "100%", height: "100%" }}
                nativeControls={false}
                contentFit="contain"
                fullscreenOptions={{ enable: true }}
              />
            ) : null}
          </View>
        </VideoArea>
        <View style={{ padding: 20, gap: 22 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt size={13} color={t.muted}>
              {formatTime(time)} / {formatTime(video.duration)}
            </Txt>
            <Txt size={12} color={t.muted}>
              {speed}× · {mirror ? "Mirrored" : "Original view"}
            </Txt>
          </Row>
          <Timeline
            duration={video.duration}
            position={time}
            disabled={!playerReady || busy}
            onDragging={setDragging}
            trim={
              trimming
                ? {
                    ...trimRange(
                      video.duration,
                      parseTime(start),
                      parseTime(end),
                    ),
                    onChange: (range, edge) => {
                      setStart(range.start.toFixed(2));
                      setEnd(range.end.toFixed(2));
                      setLoop(false);
                      player.pause();
                      seek(player, range[edge]);
                    },
                  }
                : undefined
            }
            onSeek={(seconds) => {
              setLoop(false);
              seek(player, seconds);
            }}
          />
          <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <Button
              variant={trimming ? "primary" : "soft"}
              disabled={busy}
              onPress={() => {
                if (!trimming) {
                  const range = trimRange(
                    video.duration,
                    parseTime(start),
                    parseTime(end),
                  );
                  setStart(range.start.toFixed(2));
                  setEnd(range.end.toFixed(2));
                  player.pause();
                }
                setTrimming(!trimming);
              }}
            >
              {trimming ? "Done trimming" : "Trim on timeline"}
            </Button>
          </Row>
          {trimming ? (
            <Card>
              <Txt>
                Drag the two handles on the playback line to choose your clip.
              </Txt>
              <Txt accessibilityLiveRegion="polite">
                Selected: {start}s → {end}s
              </Txt>
              <SaveDestinationPicker
                value={destination}
                onChange={setDestination}
                label="Save trimmed clip to"
              />
              <Button onPress={trim} loading={busy}>
                Save selected clip
              </Button>
            </Card>
          ) : null}
          <Row style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="soft"
              onPress={() => {
                seek(player, Math.max(0, time - 5));
              }}
            >
              −5 sec
            </Button>
            <Button
              icon={playing ? "clock" : "play"}
              disabled={!playerReady}
              onPress={() => {
                if (playing) player.pause();
                else {
                  player.play();
                  updateVideo(video.id, {
                    lastPractisedAt: new Date().toISOString(),
                  });
                }
              }}
            >
              {playing ? "Pause" : "Play"}
            </Button>
            <Button
              variant="soft"
              onPress={() => {
                seek(player, Math.min(video.duration, time + 5));
              }}
            >
              +5 sec
            </Button>
          </Row>
          <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {[0.5, 0.75, 1, 1.25].map((rate) => (
              <Chip
                key={rate}
                selected={speed === rate}
                onPress={() => {
                  setSpeed(rate);
                  setRate(player, rate);
                }}
              >
                {rate}×
              </Chip>
            ))}
            <Chip selected={mirror} onPress={() => setMirror(!mirror)}>
              Mirror
            </Chip>
            <Chip onPress={() => setFullscreen(true)}>Full screen</Chip>
          </Row>
          <VideoDetails video={video} />
          {error ? (
            <Card>
              <Txt color={t.primary} accessibilityRole="alert">
                {error}
              </Txt>
              <Button variant="ghost" onPress={() => setError("")}>
                Dismiss
              </Button>
            </Card>
          ) : null}
          <Disclosure title="Extra options">
            <Button
              variant="soft"
              onPress={() => {
                player.pause();
                router.push({
                  pathname: "/compare",
                  params: { reference: video.id },
                });
              }}
            >
              Compare with another video
            </Button>
            <CloudVideoControls video={video} />

            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt size={23} weight="display">
                  Keep the good part
                </Txt>
                <Icon name="loop" color={t.primary} />
              </Row>
              <Txt size={13} color={t.muted}>
                Choose your section. Loop it here, or export a separate MP4. The
                original stays intact.
              </Txt>
              <Row style={{ alignItems: "flex-start" }}>
                <Field
                  label="Start (m:ss or seconds)"
                  value={start}
                  onChangeText={(s) => {
                    setStart(s);
                    setLoop(false);
                  }}
                  style={{ width: "100%" }}
                />
                <Field
                  label="End (m:ss or seconds)"
                  value={end}
                  onChangeText={(s) => {
                    setEnd(s);
                    setLoop(false);
                  }}
                />
              </Row>
              <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
                <Button
                  variant="soft"
                  onPress={() => {
                    setStart(time.toFixed(2));
                    setLoop(false);
                  }}
                >
                  Set start here
                </Button>
                <Button
                  variant="soft"
                  onPress={() => {
                    setEnd(time.toFixed(2));
                    setLoop(false);
                  }}
                >
                  Set end here
                </Button>
                <Button
                  variant={loop ? "primary" : "soft"}
                  icon="loop"
                  onPress={enableLoop}
                >
                  {loop ? "Loop on" : "Loop section"}
                </Button>
              </Row>
              <Field
                label="Section name"
                placeholder="That turn from class"
                value={segmentName}
                onChangeText={setSegmentName}
              />
              <Button
                variant="soft"
                disabled={!segmentName.trim()}
                onPress={() => {
                  try {
                    const range = section();
                    updateVideo(video.id, {
                      segments: [
                        ...video.segments,
                        { id: uid(), name: segmentName.trim(), ...range },
                      ],
                    });
                    setSegmentName("");
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Save practice section
              </Button>
              {!trimming ? (
                <SaveDestinationPicker
                  value={destination}
                  onChange={setDestination}
                  label="Save trimmed clip to"
                />
              ) : null}
              <Button icon="download" onPress={trim} loading={busy}>
                Export new trimmed video
              </Button>
              {busy ? (
                <>
                  <Txt size={12} color={t.muted}>
                    Creating a new file on your device. Keep BailaCue open until
                    export finishes.
                  </Txt>
                  {Platform.OS !== "web" ? (
                    <Button
                      variant="ghost"
                      onPress={() => nativeMedia().cancelExport()}
                    >
                      Cancel export
                    </Button>
                  ) : null}
                </>
              ) : null}
              {exported ? (
                <View style={{ gap: 12 }}>
                  <Badge tone="accent">NEW CLIP READY</Badge>
                  <Txt size={13}>
                    Your new MP4 is saved in your library. You can also save a
                    copy to Photos or Files.
                  </Txt>
                  <Button
                    icon="download"
                    onPress={() =>
                      handle(
                        () => saveToPhotos(exported),
                        "Your new clip was saved to Photos.",
                      )
                    }
                  >
                    Save new clip to Photos
                  </Button>
                  <Button
                    variant="soft"
                    onPress={() => handle(() => shareMedia(exported))}
                  >
                    Share / Save file
                  </Button>
                  <Button
                    variant="soft"
                    onPress={() => {
                      if (exportedId)
                        router.push({
                          pathname: "/video/[id]",
                          params: { id: exportedId },
                        });
                    }}
                  >
                    Open new clip in library
                  </Button>
                </View>
              ) : null}
            </Card>
            {video.segments.length ? (
              <View style={{ gap: 10 }}>
                <Txt size={22} weight="display">
                  Saved sections
                </Txt>
                {video.segments.map((s) => (
                  <Card key={s.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Txt weight="bold">{s.name}</Txt>
                        <Txt size={12} color={t.muted}>
                          {formatTime(s.start)} → {formatTime(s.end)}
                        </Txt>
                      </View>
                      <Button
                        variant="soft"
                        onPress={() => {
                          setStart(String(s.start));
                          setEnd(String(s.end));
                          setLoop(true);
                          seek(player, s.start);
                          player.play();
                        }}
                      >
                        Loop
                      </Button>
                      <Button
                        variant="ghost"
                        onPress={() =>
                          updateVideo(video.id, {
                            segments: video.segments.filter(
                              (x) => x.id !== s.id,
                            ),
                          })
                        }
                      >
                        ×
                      </Button>
                    </Row>
                  </Card>
                ))}
              </View>
            ) : null}
            <VideoContext video={video} />
            <NotesMoments
              video={video}
              time={time}
              onSeek={(seconds) => {
                setLoop(false);
                seek(player, seconds);
              }}
            />
            <Button variant="ghost" onPress={() => setDeleteOpen(true)}>
              Remove this local video
            </Button>
            <Txt size={12} color={t.muted}>
              Only BailaCue’s copy and metadata are removed. Files in your
              gallery or other storage are preserved.
            </Txt>
          </Disclosure>
        </View>
      </ScrollView>
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#080D18AA",
            justifyContent: "center",
            padding: 25,
          }}
        >
          <Card>
            <Txt size={23} weight="display">
              Remove this video?
            </Txt>
            <Txt>
              This removes the local copy, notes, bookmarks and saved sections
              from BailaCue.
            </Txt>
            <Button onPress={deleteCopy}>Remove local copy</Button>
            <Button variant="soft" onPress={() => setDeleteOpen(false)}>
              Keep video
            </Button>
          </Card>
        </View>
      </Modal>
      <Modal
        visible={fullscreen}
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#080D18",
            justifyContent: "center",
          }}
        >
          {fullscreen ? (
            <VideoView
              player={player}
              surfaceType="textureView"
              style={{
                width: "100%",
                flex: 1,
                transform: [{ scaleX: mirror ? -1 : 1 }],
              }}
              nativeControls={false}
              contentFit="contain"
            />
          ) : null}
          <View style={{ padding: 12, gap: 8, backgroundColor: t.surface }}>
            <Timeline
              duration={video.duration}
              position={time}
              disabled={!playerReady}
              onSeek={(seconds) => seek(player, seconds)}
            />
            <Row style={{ justifyContent: "center" }}>
              <Button
                variant="soft"
                onPress={() => seek(player, Math.max(0, time - 5))}
              >
                −5 sec
              </Button>
              <Button
                onPress={() => (playing ? player.pause() : player.play())}
              >
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                variant="soft"
                onPress={() => seek(player, Math.min(video.duration, time + 5))}
              >
                +5 sec
              </Button>
              <Button variant="soft" onPress={() => setMirror(!mirror)}>
                Mirror {mirror ? "on" : "off"}
              </Button>
            </Row>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close full screen"
            onPress={() => setFullscreen(false)}
            style={{
              position: "absolute",
              top: 50,
              right: 20,
              padding: 16,
              backgroundColor: "#080D18",
              borderRadius: 30,
            }}
          >
            <Txt color="#FFFFFF">Close</Txt>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
export default function VideoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { library, updateVideo } = useLibrary();
  const video = library.videos.find((v) => v.id === id);
  const [source, setSource] = useState<{ key: string; uri: VideoSource }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const videoId = video?.id;
  const videoUri = video?.uri;
  const offlineUri = video?.offlineUri;
  const preference = video?.storagePreference;
  const connections = library.connections;
  const playbackKey = JSON.stringify([
    videoId,
    videoUri,
    offlineUri,
    preference,
    connections.map((c) => [c.id, c.connected]),
  ]);
  const error = failure?.key === playbackKey ? failure.message : "";
  useEffect(() => {
    let alive = true;
    if (video && videoId && !video.youtube)
      resolveVideo(video, library)
        .then((uri) => {
          if (alive) {
            setSource({ key: playbackKey, uri });
            setFailure(undefined);
          }
        })
        .catch((e) => {
          if (alive) {
            if (e instanceof RevokedAccess)
              updateVideo(videoId, {
                offlineUri: undefined,
                thumbnail: undefined,
                storagePreference: "online",
                available: false,
              });
            setFailure({ key: playbackKey, message: e.message });
          }
        });
    return () => {
      alive = false;
    };
    // Metadata edits do not reopen a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackKey]);
  if (video?.youtube) return <YouTubeDetail key={video.id} video={video} />;
  if (!video || error)
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, gap: 18 }}>
        <Txt size={24} weight="display">
          {error || "This video is unavailable"}
        </Txt>
        <Button onPress={() => router.replace("/library")}>
          Back to library
        </Button>
        {video ? <CloudVideoControls video={video} /> : null}
        <Button variant="soft" onPress={() => router.push("/storage")}>
          Manage storage
        </Button>
      </SafeAreaView>
    );
  if (!source || source.key !== playbackKey)
    return (
      <SafeAreaView style={{ flex: 1, padding: 24 }}>
        <Txt>Opening your video…</Txt>
      </SafeAreaView>
    );
  return <Player key={playbackKey} video={video} uri={source.uri} />;
}
