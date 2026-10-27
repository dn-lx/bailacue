import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, View } from "react-native";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { useLibrary } from "../services/store";
import { resolveVideo, RevokedAccess } from "../services/cloud/playback";
import { formatTime } from "../core/practice";
import type { Segment, Video } from "../core/types";
import { useTheme } from "./theme";
import { Button, Chip, Row, Txt, layout } from "./ui";
import { VideoArea } from "./VideoArea";
import Timeline from "./Timeline";
import { seek, setRate } from "../services/playback";
import YouTubeEmbed from "./YouTubeEmbed";
import type { YouTubeObservation } from "./youtubeBridge";

export type PracticeVideoProps = {
  video: Video;
  playing: boolean;
  canResume?: boolean;
  initialPosition: number;
  rate: number;
  mirror: boolean;
  onRate: (rate: number) => void;
  onMirror: () => void;
  onPlayingRequest: (playing: boolean) => void;
  onState: (state: YouTubeObservation) => void;
  onEnd: () => void;
  onDragging?: (dragging: boolean) => void;
};
export function PracticeVideo(props: PracticeVideoProps) {
  const { library, updateVideo } = useLibrary();
  const [source, setSource] = useState<VideoSource>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const { video, onState } = props;
  const [initialSeek] = useState(props.initialPosition);
  const seekRequest = useMemo(
    () => ({ seconds: initialSeek, key: 0 }),
    [initialSeek],
  );
  const latest = useRef(onState);
  useLayoutEffect(() => {
    latest.current = onState;
  }, [onState]);
  useEffect(() => {
    if (video.youtube) return;
    let alive = true;
    resolveVideo(video, library)
      .then((uri) => {
        if (alive) {
          setSource(uri);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) {
          if (e instanceof RevokedAccess)
            updateVideo(video.id, {
              offlineUri: undefined,
              thumbnail: undefined,
              storagePreference: "online",
              available: false,
            });
          setError((e as Error).message);
          latest.current({
            phase: "error",
            position: 0,
            duration: video.duration,
            error: (e as Error).message,
          });
        }
      });
    return () => {
      alive = false;
    };
    // Metadata updates must not reopen a playing source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.uri, video.offlineUri, video.storagePreference, retry]);
  if (video.youtube && props.canResume === false)
    return <Txt>Video paused for your break or completed focus session.</Txt>;
  if (video.youtube)
    return (
      <View style={{ gap: 12 }}>
        <YouTubeEmbed
          videoId={video.youtube.id}
          enforcePause
          playing={props.playing}
          seekRequest={seekRequest}
          onState={(state) => {
            props.onState(state);
            if (state.phase === "paused" && props.playing)
              props.onPlayingRequest(false);
          }}
          onEnd={props.onEnd}
        />
        <Button
          variant="soft"
          onPress={() => {
            props.onPlayingRequest(false);
            void Linking.openURL(
              `https://www.youtube.com/watch?v=${video.youtube!.id}`,
            );
          }}
        >
          Open in YouTube
        </Button>
      </View>
    );
  if (error)
    return (
      <View style={{ gap: 12 }}>
        <Txt accessibilityRole="alert">{error}</Txt>
        <Button variant="soft" onPress={() => setRetry((n) => n + 1)}>
          Retry video
        </Button>
      </View>
    );
  if (!source) return <Txt>Opening your practice video…</Txt>;
  return <NativePracticeVideo {...props} uri={source} />;
}
function NativePracticeVideo(props: PracticeVideoProps & { uri: VideoSource }) {
  const t = useTheme();
  const [time, setTime] = useState(props.initialPosition),
    [ready, setReady] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [loop, setLoop] = useState<Segment>();
  const live = useRef(props),
    loopRef = useRef(loop),
    started = useRef(false);
  useLayoutEffect(() => {
    live.current = props;
    loopRef.current = loop;
  }, [props, loop]);
  const player = useVideoPlayer(props.uri, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.preservesPitch = true;
    p.currentTime = props.initialPosition;
  });
  useEffect(() => {
    const observe = (phase: YouTubeObservation["phase"], error?: string) =>
      live.current.onState({
        phase,
        position: player.currentTime,
        duration: player.duration || live.current.video.duration,
        error,
      });
    const start = () => {
      setReady(true);
      setRate(player, live.current.rate);
      if (live.current.playing) player.play();
    };
    if (player.status === "readyToPlay") start();
    const status = player.addListener("statusChange", (e) => {
      setReady(e.status === "readyToPlay");
      if (e.status === "readyToPlay") start();
      else if (e.status === "loading") observe("buffering");
      else if (e.status === "error")
        observe("error", e.error?.message ?? "This video could not play.");
    });
    const playing = player.addListener("playingChange", (e) => {
      if (e.isPlaying !== player.playing) return;
      if (e.isPlaying) {
        started.current = true;
        observe("playing");
      } else if (player.status === "loading") observe("buffering");
      else {
        observe("paused");
        if (
          started.current &&
          live.current.playing &&
          player.currentTime <
            (player.duration || live.current.video.duration) - 0.25
        )
          live.current.onPlayingRequest(false);
      }
    });
    const time = player.addListener("timeUpdate", (e) => {
      setTime(e.currentTime);
      if (loopRef.current && e.currentTime >= loopRef.current.end)
        seek(player, loopRef.current.start);
      observe(
        player.playing
          ? "playing"
          : player.status === "loading"
            ? "buffering"
            : "paused",
      );
    });
    const end = player.addListener("playToEnd", () => {
      if (loopRef.current) {
        seek(player, loopRef.current.start);
        if (live.current.playing) player.play();
      } else live.current.onEnd();
    });
    return () => {
      status.remove();
      playing.remove();
      time.remove();
      end.remove();
      player.pause();
    };
  }, [player]);
  useEffect(() => {
    if (props.playing && ready) player.play();
    else player.pause();
  }, [props.playing, ready, player]);
  useEffect(() => {
    setRate(player, props.rate);
  }, [player, props.rate]);
  const surface = (
    <VideoView
      player={player}
      surfaceType="textureView"
      style={{
        width: "100%",
        height: "100%",
        transform: [{ scaleX: props.mirror ? -1 : 1 }],
      }}
      nativeControls={false}
      contentFit="contain"
    />
  );
  const controls = (
    <View style={{ gap: 12, padding: 12, backgroundColor: t.surface }}>
      <Txt>
        {formatTime(time)} /{" "}
        {formatTime(player.duration || props.video.duration)}
        {loop ? ` · Loop: ${loop.name}` : ""}
      </Txt>
      <Timeline
        duration={player.duration || props.video.duration}
        position={time}
        disabled={!ready}
        onSeek={(seconds) => seek(player, seconds)}
        onDragging={props.onDragging}
      />
      <Row style={{ justifyContent: "center" }}>
        <Button
          variant="soft"
          onPress={() => seek(player, Math.max(0, time - 5))}
        >
          −5 sec
        </Button>
        <Button
          disabled={!ready}
          onPress={() => props.onPlayingRequest(!props.playing)}
        >
          {props.playing ? "Pause video" : "Play video"}
        </Button>
        <Button
          variant="soft"
          onPress={() =>
            seek(
              player,
              Math.min(player.duration || props.video.duration, time + 5),
            )
          }
        >
          +5 sec
        </Button>
      </Row>
      <View style={layout.wrap}>
        {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
          <Chip
            key={rate}
            selected={props.rate === rate}
            onPress={() => props.onRate(rate)}
          >
            {rate}×
          </Chip>
        ))}
        <Chip selected={props.mirror} onPress={props.onMirror}>
          Mirror
        </Chip>
        <Chip onPress={() => setFullscreen(!fullscreen)}>
          {fullscreen ? "Close full screen" : "Full screen"}
        </Chip>
      </View>
      {props.video.segments.length ? (
        <View style={layout.wrap}>
          <Chip selected={!loop} onPress={() => setLoop(undefined)}>
            Continuous play
          </Chip>
          {props.video.segments.map((s) => (
            <Chip
              key={s.id}
              selected={loop?.id === s.id}
              onPress={() => {
                setLoop(s);
                seek(player, s.start);
              }}
            >
              Loop {s.name}
            </Chip>
          ))}
        </View>
      ) : null}
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      <VideoArea onDragging={props.onDragging ?? (() => {})}>
        {!fullscreen ? surface : null}
      </VideoArea>
      {!fullscreen ? controls : null}
      <Modal visible={fullscreen} onRequestClose={() => setFullscreen(false)}>
        <View
          style={{ flex: 1, backgroundColor: "#080D18", paddingVertical: 30 }}
        >
          <View style={{ flex: 1 }}>{fullscreen ? surface : null}</View>
          {controls}
        </View>
      </Modal>
    </View>
  );
}
