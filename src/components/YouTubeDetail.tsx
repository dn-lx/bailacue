import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Linking,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./theme";
import { VideoArea } from "./VideoArea";
import { router, useFocusEffect } from "expo-router";
import type { Video } from "../core/types";
import { removeVideo } from "../core/library";
import { useLibrary } from "../services/store";
import { Button, Card, Txt, Row, Chip, layout } from "./ui";
import { VideoDetails } from "./VideoDetails";
import { NotesMoments } from "./NotesMoments";
import { Disclosure } from "./Disclosure";
import YouTubeEmbed from "./YouTubeEmbed";
import { formatTime } from "../core/practice";
export function YouTubeDetail({ video }: { video: Video }) {
  const { update, updateVideo } = useLibrary();
  const t = useTheme();
  const { height } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedTitle, setExpandedTitle] = useState(false);
  const [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [position, setPosition] = useState(video.resume),
    [error, setError] = useState("");
  const [rates, setRates] = useState([1]);
  const [seekRequest, setSeek] = useState({ seconds: video.resume, key: 0 }),
    [remove, setRemove] = useState(false),
    [retry, setRetry] = useState(0);
  const time = useRef(video.resume),
    lastSave = useRef(0);
  useFocusEffect(useCallback(() => () => setPlaying(false), []));
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!fullscreen) return false;
        setFullscreen(false);
        return true;
      });
      return () => sub.remove();
    }, [fullscreen]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") setPlaying(false);
    });
    return () => {
      sub.remove();
      updateVideo(video.id, { resume: time.current });
    };
  }, [video.id, updateVideo]);
  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: t.background }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: fullscreen ? undefined : 850,
          alignSelf: "center",
          paddingHorizontal: fullscreen ? 0 : 16,
        }}
      >
        <ScrollView
          style={{
            flexGrow: 0,
            maxHeight: height < 500 ? 64 : Math.max(120, height * 0.25),
            display: fullscreen ? "none" : "flex",
          }}
          contentContainerStyle={{
            paddingVertical: 10,
            gap: 4,
          }}
        >
          <Row style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <Txt
              accessibilityRole="header"
              accessibilityLabel={video.title}
              numberOfLines={expandedTitle ? undefined : 2}
              size={20}
              weight="bold"
              style={{ flex: 1 }}
            >
              {video.title}
            </Txt>
            <Button variant="ghost" onPress={() => router.back()}>
              Back
            </Button>
          </Row>
          <Row>
            <Txt size={12} color={t.muted}>
              YouTube · online video
            </Txt>
            <Button
              variant="ghost"
              onPress={() => setExpandedTitle(!expandedTitle)}
            >
              {expandedTitle ? "Collapse title" : "Show full title"}
            </Button>
          </Row>
        </ScrollView>
        <Row style={{ justifyContent: "center", paddingVertical: 6 }}>
          <Button variant="soft" onPress={() => setFullscreen(!fullscreen)}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </Row>
        <VideoArea
          fullscreen={fullscreen}
          minHeight={200}
          maxHeight={Math.max(200, height * 0.45)}
          onDragging={() => {}}
        >
          <YouTubeEmbed
            key={retry}
            fill
            videoId={video.youtube!.id}
            playing={playing}
            rate={rate}
            onRates={setRates}
            onRate={setRate}
            seekRequest={seekRequest}
            onState={(s) => {
              time.current = s.position;
              setPosition(s.position);
              if (s.phase === "playing") setPlaying(true);
              if (s.phase === "paused" || s.phase === "ended")
                setPlaying(false);
              if (s.duration > 0 && Math.abs(s.duration - video.duration) > 1)
                updateVideo(video.id, { duration: s.duration });
              if (s.phase === "error") {
                setError(s.error ?? "Playback unavailable");
                setPlaying(false);
                if (s.code && [100, 101, 150].includes(s.code))
                  updateVideo(video.id, {
                    available: false,
                    youtube: {
                      ...video.youtube!,
                      embedAllowed: false,
                      unavailableReason: s.error,
                    },
                  });
              }
              if (Date.now() - lastSave.current > 5000) {
                lastSave.current = Date.now();
                updateVideo(video.id, { resume: s.position });
              }
            }}
            onEnd={() => setPlaying(false)}
          />
        </VideoArea>
        <ScrollView
          style={{ display: fullscreen ? "none" : "flex", flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 16, paddingBottom: 28 }}
        >
          <Row>
            <Button
              variant="soft"
              onPress={() =>
                setSeek({ seconds: Math.max(0, position - 5), key: Date.now() })
              }
            >
              −5 sec
            </Button>
            <Button onPress={() => setPlaying(!playing)}>
              {playing ? "Pause video" : "Play video"}
            </Button>
            <Button
              variant="soft"
              onPress={() =>
                setSeek({
                  seconds: Math.min(
                    video.duration || position + 5,
                    position + 5,
                  ),
                  key: Date.now(),
                })
              }
            >
              +5 sec
            </Button>
          </Row>
          <Txt>
            {formatTime(position)} / {formatTime(video.duration)}
          </Txt>
          <View style={layout.wrap}>
            {rates.map((r) => (
              <Chip key={r} selected={rate === r} onPress={() => setRate(r)}>
                {r}×
              </Chip>
            ))}
          </View>
          <VideoDetails video={video} />
          {error ? (
            <Card>
              <Txt accessibilityRole="alert">{error}</Txt>
              <Button
                variant="soft"
                onPress={() => {
                  setError("");
                  setRetry((n) => n + 1);
                }}
              >
                Retry YouTube player
              </Button>
            </Card>
          ) : null}
          <Button
            variant="soft"
            onPress={() => {
              setPlaying(false);
              void Linking.openURL(
                `https://www.youtube.com/watch?v=${video.youtube!.id}`,
              );
            }}
          >
            Open in YouTube
          </Button>
          <Disclosure title="Extra options">
            <NotesMoments
              video={video}
              time={position}
              onSeek={(seconds) => setSeek({ seconds, key: Date.now() })}
            />
            <Txt>
              Use Full screen above the picture to enlarge the player. Playback
              speed depends on this video’s supported rates. YouTube videos
              cannot be mirrored, downloaded or edited in BailaCue.
            </Txt>
            <Button variant="ghost" onPress={() => setRemove(!remove)}>
              Remove from library
            </Button>
            {remove ? (
              <Card>
                <Txt>
                  Remove this library entry and its notes? The original YouTube
                  video stays online.
                </Txt>
                <Button
                  onPress={() => {
                    update((l) => ({
                      ...removeVideo(l, video.id),
                      youtubeSources: l.youtubeSources?.map((s) => ({
                        ...s,
                        videoIds: s.videoIds.filter(
                          (id) => id !== video.youtube!.id,
                        ),
                      })),
                    }));
                    router.replace("/library");
                  }}
                >
                  Confirm remove video
                </Button>
                <Button variant="soft" onPress={() => setRemove(false)}>
                  Keep video
                </Button>
              </Card>
            ) : null}
          </Disclosure>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
