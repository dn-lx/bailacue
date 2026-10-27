import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { useLibrary } from "../services/store";
import { resolveVideo } from "../services/cloud/playback";
import { Button, Card, Chip, Field, Screen, Txt, Row } from "../components/ui";
import { useTheme } from "../components/theme";
import { seek, setRate, mute } from "../services/playback";
function ComparePlayers({
  left,
  right,
}: {
  left: VideoSource;
  right: VideoSource;
}) {
  const a = useVideoPlayer(left, (player) => {
    player.timeUpdateEventInterval = 0.2;
  });
  const b = useVideoPlayer(right, (player) => {
    player.muted = true;
  });
  useFocusEffect(
    useCallback(
      () => () => {
        a.pause();
        b.pause();
      },
      [a, b],
    ),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        a.pause();
        b.pause();
      }
    });
    return () => sub.remove();
  }, [a, b]);
  const [offset, setOffset] = useState("0");
  const [time, setTime] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [mutedA, setMutedA] = useState(false);
  const [mutedB, setMutedB] = useState(true);
  const [error, setError] = useState("");
  const position = useRef(0);
  useEffect(() => {
    const subscription = a.addListener("timeUpdate", (event) => {
      position.current = event.currentTime;
      setTime(event.currentTime);
    });
    const errors = [a, b].map((player) =>
      player.addListener("statusChange", (event) => {
        if (event.status === "error")
          setError(event.error?.message ?? "This format could not be played.");
      }),
    );
    return () => {
      subscription.remove();
      errors.forEach((s) => s.remove());
    };
  }, [a, b]);
  function align() {
    const shift = Number(offset);
    if (!Number.isFinite(shift) || Math.abs(shift) > 3600) {
      setError("Use an offset in seconds between -3600 and 3600.");
      return false;
    }
    seek(
      b,
      Math.max(0, Math.min(b.duration || Infinity, position.current + shift)),
    );
    return true;
  }
  return (
    <>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt weight="bold">Reference</Txt>
          <VideoView
            player={a}
            surfaceType="textureView"
            style={{ height: 230, width: "100%", backgroundColor: "#080D18" }}
            contentFit="contain"
            nativeControls={false}
          />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt weight="bold">Your practice</Txt>
          <View style={{ transform: [{ scaleX: mirror ? -1 : 1 }] }}>
            <VideoView
              player={b}
              surfaceType="textureView"
              style={{ height: 230, width: "100%", backgroundColor: "#080D18" }}
              contentFit="contain"
              nativeControls={false}
            />
          </View>
        </View>
      </View>
      <Card>
        <Txt>{time.toFixed(1)} seconds · Manual alignment</Txt>
        <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <Button
            onPress={() => {
              if (align()) {
                a.play();
                b.play();
              }
            }}
          >
            Play both
          </Button>
          <Button
            variant="soft"
            onPress={() => {
              a.pause();
              b.pause();
            }}
          >
            Pause both
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              a.pause();
              b.pause();
              seek(a, 0);
              position.current = 0;
              align();
            }}
          >
            Restart
          </Button>
        </Row>
        <Field
          label="Practice offset in seconds"
          value={offset}
          onChangeText={setOffset}
          keyboardType="numbers-and-punctuation"
        />
        <Txt size={12}>
          Positive offset starts your practice further into its video. Tap Align
          after seeking or changing the offset. This is manual comparison; exact
          synchronisation is not guaranteed.
        </Txt>
        <Button variant="soft" onPress={align}>
          Align practice now
        </Button>
        <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
          {[0.5, 0.75, 1].map((rate) => (
            <Chip
              key={rate}
              onPress={() => {
                setRate(a, rate);
                setRate(b, rate);
              }}
            >
              {rate}× both
            </Chip>
          ))}
          <Chip selected={mirror} onPress={() => setMirror(!mirror)}>
            Mirror practice
          </Chip>
          <Chip
            selected={mutedA}
            onPress={() => {
              mute(a, !mutedA);
              setMutedA(!mutedA);
            }}
          >
            Mute reference
          </Chip>
          <Chip
            selected={mutedB}
            onPress={() => {
              mute(b, !mutedB);
              setMutedB(!mutedB);
            }}
          >
            Mute practice
          </Chip>
        </Row>
        {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      </Card>
    </>
  );
}
export default function Comparison() {
  const { reference } = useLocalSearchParams<{ reference?: string }>();
  const { library } = useLibrary();
  const t = useTheme();
  const [leftId, setLeftId] = useState(reference ?? "");
  const [rightId, setRightId] = useState("");
  const [sources, setSources] = useState<{
    key: string;
    left: VideoSource;
    right: VideoSource;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    const left = library.videos.find((v) => v.id === leftId),
      right = library.videos.find((v) => v.id === rightId);
    if (!left || !right) return;
    setBusy(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        resolveVideo(left, library),
        resolveVideo(right, library),
      ]);
      setSources({ key: `${leftId}-${rightId}`, left: a, right: b });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="See your progress"
      subtitle="A reference. Your practice. Side by side."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      }
    >
      {sources ? (
        <>
          <ComparePlayers
            key={sources.key}
            left={sources.left}
            right={sources.right}
          />
          <Button variant="ghost" onPress={() => setSources(undefined)}>
            Choose different videos
          </Button>
        </>
      ) : (
        <>
          <Card>
            <Txt size={21} weight="display">
              Choose a reference
            </Txt>
            {library.videos
              .filter((v) => !v.youtube)
              .map((v) => (
                <Chip
                  key={v.id}
                  selected={leftId === v.id}
                  onPress={() => setLeftId(v.id)}
                >
                  {v.title}
                </Chip>
              ))}
          </Card>
          <Card>
            <Txt size={21} weight="display">
              Choose your practice
            </Txt>
            {library.videos
              .filter((v) => v.id !== leftId && !v.youtube)
              .map((v) => (
                <Chip
                  key={v.id}
                  selected={rightId === v.id}
                  onPress={() => setRightId(v.id)}
                >
                  {v.title}
                </Chip>
              ))}
            <Button
              variant="soft"
              icon="camera"
              onPress={() => router.push("/upload")}
            >
              Record or add your practice
            </Button>
            <Txt size={12} color={t.muted}>
              Your recording stays on this phone unless you explicitly upload
              it.
            </Txt>
          </Card>
          <Button
            disabled={!leftId || !rightId || leftId === rightId}
            loading={busy}
            onPress={open}
          >
            Open comparison
          </Button>
        </>
      )}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </Screen>
  );
}
