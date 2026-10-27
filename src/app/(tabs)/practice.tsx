import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Screen,
  Card,
  Txt,
  Button,
  Chip,
  Row,
  layout,
} from "../../components/ui";
import { LabelPicker } from "../../components/LabelPicker";
import { PracticeVideo } from "../../components/PracticeVideo";
import { useLibrary } from "../../services/store";
import { useTheme } from "../../components/theme";
import { danceTypes } from "../../core/dances";
import { libraryLabels } from "../../core/labels";
import { formatTime } from "../../core/practice";
import {
  beginPractice,
  practiceDefaults,
  practiceQueue,
  practiceRandom,
  savePractice,
  tickPractice,
  playbackContext,
  matchesPlayback,
  movePractice,
  recordPlayback,
  type PlaybackContext,
  type ActivePractice,
  type PracticePreferences,
} from "../../core/practiceQueue";
import type { YouTubeObservation } from "../../components/youtubeBridge";

export default function Practice() {
  const { library, update } = useLibrary(),
    t = useTheme();
  const [queueSeed, setQueueSeed] = useState(() =>
    Math.floor(Math.random() * 4294967296),
  );
  const [preferences, setPreferences] = useState(() =>
    practiceDefaults(library),
  );
  const [active, setActive] = useState<ActivePractice | undefined>(() =>
    library.activePractice
      ? { ...library.activePractice, running: false }
      : undefined,
  );
  const [editing, setEditing] = useState(false),
    [exhausted, setExhausted] = useState(false),
    [error, setError] = useState("");
  const [phase, setPhase] = useState<YouTubeObservation["phase"]>("ready"),
    [rate, setRateState] = useState(1),
    [mirror, setMirror] = useState(false),
    [dragging, setDragging] = useState(false);
  const live = useRef(active),
    playing = useRef(false),
    lastTick = useRef(0),
    lastPersist = useRef(0),
    focused = useRef(true);
  // The event handlers own live.current. Copying render snapshots back here can
  // resurrect pre-pause or pre-navigation state while native events are queued.
  const preview = useMemo(
    () => practiceQueue(library, preferences, practiceRandom(queueSeed)),
    [library, preferences, queueSeed],
  );
  const persist = useCallback(
    (state: ActivePractice | undefined) =>
      update((l) => ({
        ...l,
        activePractice: state ? { ...state, running: false } : undefined,
      })),
    [update],
  );
  const write = useCallback(
    (state: ActivePractice | undefined, save = false) => {
      live.current = state;
      setActive(state);
      if (save) persist(state);
    },
    [persist],
  );
  const accrue = useCallback(() => {
    const now = performance.now(),
      delta = now - lastTick.current;
    lastTick.current = now;
    const state = live.current;
    if (!state) return;
    const next = tickPractice(state, delta, playing.current && focused.current);
    if (next !== state) write(next);
    return next;
  }, [write]);
  const pause = useCallback(() => {
    const state = accrue() ?? live.current;
    playing.current = false;
    if (state) write({ ...state, running: false }, true);
  }, [accrue, write]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      lastTick.current = performance.now();
      return () => {
        pause();
        focused.current = false;
      };
    }, [pause]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") pause();
      lastTick.current = performance.now();
    });
    return () => subscription.remove();
  }, [pause]);
  useEffect(() => {
    const timer = setInterval(() => {
      const state = accrue();
      if (state && performance.now() - lastPersist.current > 5000) {
        lastPersist.current = performance.now();
        persist(state);
        const id = state.queue[state.index];
        update((l) => ({
          ...l,
          videos: l.videos.map((v) =>
            v.id === id ? { ...v, resume: state.position } : v,
          ),
        }));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [accrue, persist, update]);
  function requestPlaying(run: boolean, source?: PlaybackContext) {
    if (source && !matchesPlayback(live.current, source)) return;
    const state = accrue() ?? live.current;
    if (!state) return;
    lastTick.current = performance.now();
    if (!run) playing.current = false;
    write({ ...state, running: run }, true);
  }
  function observation(source: PlaybackContext, state: YouTubeObservation) {
    if (!matchesPlayback(live.current, source)) return;
    const wasPlaying = playing.current;
    accrue();
    const current = live.current;
    if (!matchesPlayback(current, source)) return;
    playing.current = current.running && state.phase === "playing";
    lastTick.current = performance.now();
    setPhase(state.phase);
    const id = current.queue[current.index];
    const next = recordPlayback(
      current,
      source,
      state.position,
      state.phase === "playing",
    );
    if (playing.current && !wasPlaying)
      update((l) => ({
        ...l,
        videos: l.videos.map((v) =>
          v.id === id ? { ...v, lastPractisedAt: new Date().toISOString() } : v,
        ),
      }));
    write(next);
    if (state.phase === "error") {
      setError(
        state.error ?? "Playback is unavailable. Try Next or retry this video.",
      );
      write({ ...next, running: false }, true);
      if (state.code && [100, 101, 150].includes(state.code))
        update((l) => ({
          ...l,
          videos: l.videos.map((v) =>
            v.id === id && v.youtube
              ? {
                  ...v,
                  available: false,
                  youtube: {
                    ...v.youtube,
                    embedAllowed: false,
                    unavailableReason: state.error,
                  },
                }
              : v,
          ),
        }));
    }
  }
  function advance(delta: number, source?: PlaybackContext) {
    if (source && !matchesPlayback(live.current, source)) return;
    const state = accrue() ?? live.current;
    if (!state) return;
    const result = movePractice(state, delta);
    playing.current = false;
    setError("");
    setPhase("buffering");
    setExhausted(result.exhausted);
    write(result.state, true);
  }
  function repeat() {
    const state = live.current;
    if (!state) return;
    let next = practiceQueue(library, state.preferences);
    if (next.length > 1 && next[0] === state.queue[state.index])
      next = [...next.slice(1), next[0]];
    if (!next.length) {
      setError("No eligible videos are available now.");
      return;
    }
    write(
      {
        ...state,
        queue: [...state.queue, ...next],
        index: state.queue.length,
        position: 0,
        cycle: state.cycle + 1,
        playbackEpoch: (state.playbackEpoch ?? 0) + 1,
        running: true,
      },
      true,
    );
    setExhausted(false);
    setError("");
  }
  function finish() {
    const state = accrue() ?? live.current;
    playing.current = false;
    if (state) update((l) => savePractice(l, state));
    live.current = undefined;
    setActive(undefined);
    setExhausted(false);
    setError("");
    setEditing(false);
    setQueueSeed(Math.floor(Math.random() * 4294967296));
  }
  function change(changes: Partial<PracticePreferences>) {
    setPreferences((p) => ({ ...p, ...changes }));
  }
  const source = active ? playbackContext(active) : undefined;
  const current =
    active && library.videos.find((v) => v.id === active.queue[active.index]);
  return (
    <Screen
      scrollEnabled={!dragging}
      title="Your practice flow"
      subtitle="Choose your focus. Keep moving at your own pace."
    >
      {active ? (
        <Card>
          <Txt size={13} weight="bold">
            {active.stage === "break" ? "BREATHE & RESET" : "TIME TO PRACTISE"}
          </Txt>
          <Txt size={48} weight="display">
            {formatTime(Math.ceil(active.remainingMs / 1000))}
          </Txt>
          <Txt>
            {Math.floor(active.activeMs / 1000)} active seconds · cycle{" "}
            {active.cycle}
          </Txt>
          <Row>
            {active.remainingMs > 0 ? (
              <Button
                onPress={() => {
                  const state = live.current;
                  if (state) requestPlaying(!state.running);
                }}
              >
                {active.running ? "Pause practice" : "Resume practice"}
              </Button>
            ) : (
              <>
                {active.stage === "focus" &&
                active.preferences.breakMinutes > 0 ? (
                  <Button
                    variant="soft"
                    onPress={() =>
                      write(
                        {
                          ...active,
                          stage: "break",
                          remainingMs: active.preferences.breakMinutes * 60000,
                          running: true,
                        },
                        true,
                      )
                    }
                  >
                    Start break
                  </Button>
                ) : null}
                <Button
                  onPress={() => {
                    setExhausted(false);
                    write(
                      {
                        ...active,
                        stage: "focus",
                        remainingMs: active.preferences.minutes * 60000,
                        running: true,
                      },
                      true,
                    );
                  }}
                >
                  Continue focus
                </Button>
              </>
            )}
            <Button variant="soft" onPress={finish}>
              Finish & save
            </Button>
          </Row>
          <Txt size={12}>
            Focus time counts only while your video plays. Pauses, loading,
            breaks and leaving the app do not count. Returning never starts
            playback automatically.
          </Txt>
        </Card>
      ) : null}
      {active && current ? (
        <View style={{ gap: 16 }}>
          <Txt size={23} weight="display">
            {current.title}
          </Txt>
          <Txt>
            {current.style} · video {active.index + 1} of {active.queue.length}
          </Txt>
          <PracticeVideo
            key={`${active.id}:${active.playbackEpoch ?? 0}:${active.index}:${current.id}`}
            video={current}
            playing={
              active.running &&
              active.stage === "focus" &&
              active.remainingMs > 0
            }
            canResume={active.stage === "focus" && active.remainingMs > 0}
            initialPosition={active.position}
            rate={rate}
            mirror={mirror}
            onRate={setRateState}
            onMirror={() => setMirror((x) => !x)}
            onPlayingRequest={(run) => requestPlaying(run, source!)}
            onState={(state) => observation(source!, state)}
            onEnd={() => {
              if (
                matchesPlayback(live.current, source!) &&
                live.current.running
              )
                advance(1, source!);
            }}
            onDragging={setDragging}
          />
          <Row>
            <Button
              variant="soft"
              disabled={active.index === 0}
              onPress={() => advance(-1, source!)}
            >
              Previous video
            </Button>
            <Button onPress={() => advance(1, source!)}>Next video</Button>
            <Button
              variant="ghost"
              onPress={() => {
                pause();
                router.push({
                  pathname: "/video/[id]",
                  params: { id: current.id },
                });
              }}
            >
              Open video details
            </Button>
          </Row>
          {active.running && active.stage === "focus" && phase !== "playing" ? (
            <Txt accessibilityLiveRegion="polite">
              Waiting for playback · timer paused
            </Txt>
          ) : null}
          {dragging ? <Txt size={12}>Resizing video</Txt> : null}
        </View>
      ) : active ? (
        <Card>
          <Txt>
            This queued video is no longer available. Your practice time is
            kept.
          </Txt>
          <Button onPress={() => advance(1, source!)}>
            Skip missing video
          </Button>
          <Button variant="soft" onPress={finish}>
            Finish & save
          </Button>
        </Card>
      ) : null}
      {error ? (
        <Card>
          <Txt accessibilityRole="alert">{error}</Txt>
          <Button variant="ghost" onPress={() => setError("")}>
            Dismiss
          </Button>
        </Card>
      ) : null}
      {exhausted ? (
        <Card>
          <Txt weight="bold">You reached the end of this practice mix</Txt>
          <Txt>
            Repeat eligible videos with a fresh order, or save your session.
          </Txt>
          <Button onPress={repeat}>Repeat eligible videos</Button>
          <Button variant="soft" onPress={finish}>
            Finish & save
          </Button>
        </Card>
      ) : null}
      {active ? (
        <Button
          variant="soft"
          onPress={() => {
            pause();
            setEditing(!editing);
          }}
        >
          {editing ? "Cancel queue changes" : "Edit remaining queue"}
        </Button>
      ) : null}
      {!active || editing ? (
        <Card>
          <Txt size={23} weight="display">
            Choose your practice
          </Txt>
          <Txt weight="bold">Focus session</Txt>
          <View style={layout.wrap}>
            {[5, 10, 15, 20, 30].map((minutes) => (
              <Chip
                key={minutes}
                selected={preferences.minutes === minutes}
                onPress={() => change({ minutes })}
              >
                {minutes} min
              </Chip>
            ))}
          </View>
          <Txt weight="bold">Break between sessions</Txt>
          <View style={layout.wrap}>
            {[0, 1, 2, 5].map((breakMinutes) => (
              <Chip
                key={breakMinutes}
                selected={preferences.breakMinutes === breakMinutes}
                onPress={() => change({ breakMinutes })}
              >
                {breakMinutes ? `${breakMinutes} min` : "No break"}
              </Chip>
            ))}
          </View>
          <Txt weight="bold">Dance types</Txt>
          <View style={layout.wrap}>
            {danceTypes(library).map((d) => (
              <Chip
                key={d.id}
                selected={preferences.styles.includes(d.name)}
                onPress={() =>
                  change({
                    styles: preferences.styles.includes(d.name)
                      ? preferences.styles.filter((x) => x !== d.name)
                      : [...preferences.styles, d.name],
                  })
                }
              >
                {d.name}
              </Chip>
            ))}
          </View>
          <Txt size={12}>No selected dance means all dances.</Txt>
          <Txt weight="bold">Sources</Txt>
          <View style={layout.wrap}>
            <Chip
              selected={!preferences.sourceIds.length}
              onPress={() => change({ sourceIds: [] })}
            >
              All sources
            </Chip>
            {[
              { id: "phone", name: "On my phone" },
              ...library.sources,
              ...(library.youtubeSources ?? []),
            ].map((s) => (
              <Chip
                key={s.id}
                selected={preferences.sourceIds.includes(s.id)}
                onPress={() =>
                  change({
                    sourceIds: preferences.sourceIds.includes(s.id)
                      ? preferences.sourceIds.filter((x) => x !== s.id)
                      : [...preferences.sourceIds, s.id],
                  })
                }
              >
                {s.name}
              </Chip>
            ))}
          </View>
          <LabelPicker
            label="Practice keywords"
            value={preferences.labels}
            options={libraryLabels(library)}
            onChange={(labels) => change({ labels })}
          />
          <View style={layout.wrap}>
            {(["any", "all"] as const).map((labelMatch) => (
              <Chip
                key={labelMatch}
                selected={preferences.labelMatch === labelMatch}
                onPress={() => change({ labelMatch })}
              >
                Match {labelMatch} label
              </Chip>
            ))}
          </View>
          <Txt weight="bold">Minimum star rating</Txt>
          <View style={layout.wrap}>
            {[1, 2, 3, 4, 5].map((minRating) => (
              <Chip
                key={minRating}
                selected={preferences.minRating === minRating}
                onPress={() => change({ minRating })}
              >
                {minRating}★ or higher
              </Chip>
            ))}
          </View>
          <Row>
            <Txt>Phone copies only</Txt>
            <Switch
              accessibilityLabel="Phone copies only"
              value={preferences.offlineOnly}
              onValueChange={(offlineOnly) => change({ offlineOnly })}
              trackColor={{ true: t.primary, false: t.border }}
              thumbColor={t.onPrimary}
            />
          </Row>
          <Row>
            <Txt>Include YouTube videos online</Txt>
            <Switch
              accessibilityLabel="Include YouTube videos in Practice"
              value={!!preferences.includeYouTube}
              onValueChange={(includeYouTube) => change({ includeYouTube })}
              trackColor={{ true: t.primary, false: t.border }}
              thumbColor={t.onPrimary}
            />
          </Row>
          <Txt size={13}>
            Higher ratings appear earlier more often. Unrated counts as 5★. Your
            dances take balanced turns; no video repeats within a queue cycle.
          </Txt>
          <Txt weight="bold">Queue preview · {preview.length} videos</Txt>
          {preview.slice(0, 3).map((id) => (
            <Txt key={id}>{library.videos.find((v) => v.id === id)?.title}</Txt>
          ))}
          {editing && active ? (
            <>
              <Txt>
                Apply only to the remaining queue. The current video and timer
                are kept.
              </Txt>
              <Button
                disabled={!preview.length}
                onPress={() => {
                  const history = active.queue.slice(0, active.index + 1);
                  write(
                    {
                      ...active,
                      preferences,
                      queue: [
                        ...history,
                        ...preview.filter((id) => !history.includes(id)),
                      ],
                      running: false,
                    },
                    true,
                  );
                  update((l) => ({ ...l, practicePreferences: preferences }));
                  setEditing(false);
                  setError("");
                }}
              >
                Apply remaining queue
              </Button>
            </>
          ) : (
            <Button
              disabled={!preview.length}
              icon="play"
              onPress={() => {
                try {
                  const next = {
                    ...beginPractice(library, preferences),
                    queue: preview,
                    running: true,
                  };
                  playing.current = false;
                  lastTick.current = performance.now();
                  write(next, true);
                  update((l) => ({ ...l, practicePreferences: preferences }));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Start practice
            </Button>
          )}
          {!preview.length ? (
            <Txt>
              No available videos match. Adjust the dance, label, source or
              minimum stars.
            </Txt>
          ) : null}
        </Card>
      ) : null}
      <Txt size={23} weight="display">
        Your practice journal
      </Txt>
      {library.sessions.length ? (
        library.sessions.slice(0, 10).map((s) => (
          <Card key={s.id}>
            <Txt weight="bold">{formatTime(s.seconds)} practised</Txt>
            <Txt>
              {new Date(s.startedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              · {s.videoIds?.length ?? (s.videoId ? 1 : 0)} videos
            </Txt>
          </Card>
        ))
      ) : (
        <Txt>Your first saved session will appear here.</Txt>
      )}
    </Screen>
  );
}
