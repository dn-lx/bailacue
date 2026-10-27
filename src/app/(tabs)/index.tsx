import { ProgressBar } from "../../components/motion";
import { RatingStars } from "../../components/VideoDetails";
import { useEffect } from "react";
import { View, AppState } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Screen,
  Txt,
  Row,
  Mark,
  Badge,
  Button,
  Card,
  Empty,
  Icon,
} from "../../components/ui";
import { useTheme } from "../../components/theme";
import { VideoCard } from "../../components/VideoCard";
import { useLibrary } from "../../services/store";
import { localDay, weekStart } from "../../core/practice";
import {
  ensureDailyPick,
  rankCandidates,
  refreshDailyPicks,
  minimumPickRating,
  dailySlots,
  belongsToSlot,
} from "../../core/recommendations";
export default function Today() {
  const { library, update } = useLibrary();
  const t = useTheme();
  useEffect(() => {
    update((l) => ensureDailyPick(l));
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") update((l) => ensureDailyPick(l));
    });
    return () => listener.remove();
  }, [update]);
  const weekly =
    library.sessions
      .filter((s) => new Date(s.startedAt) >= weekStart())
      .reduce((sum, s) => sum + s.seconds, 0) / 60;
  const pick = library.picks.find((p) => p.day === localDay());
  const videos = pick?.skipped
    ? []
    : library.videos.filter(
        (v) => pick?.videoIds.includes(v.id) && v.available,
      );
  return (
    <Screen
      title="BailaCue."
      subtitle="Watch. Practise. Repeat."
      action={
        <View
          style={{
            padding: 6,
          }}
        >
          <Mark />
        </View>
      }
    >
      <LinearGradient
        colors={[t.heroStart, t.brandBlack]}
        style={{ padding: 22, borderRadius: 22, overflow: "hidden", gap: 14 }}
      >
        <View
          style={{
            position: "absolute",
            right: -10,
            top: 12,
            opacity: 0.1,
            transform: [{ rotate: "-18deg" }],
          }}
        >
          <Mark size={190} onDark />
        </View>
        <Badge tone="accent">A LITTLE EVERY DAY</Badge>
        <Txt
          size={30}
          color="#FFFFFF"
          weight="display"
          style={{ maxWidth: 300, lineHeight: 36 }}
        >
          Find your rhythm.
        </Txt>
        <Txt color={t.heroMuted} style={{ maxWidth: 290 }}>
          {library.videos.length
            ? `${library.videos.length} videos in your library. A little practice, every day.`
            : "Keep your class videos, find your next move and make a little time to dance."}
        </Txt>
        <Button
          variant="accent"
          icon={library.videos.length ? "play" : "plus"}
          style={{ alignSelf: "flex-start" }}
          onPress={() =>
            library.videos.length
              ? router.push("/practice")
              : router.push("/upload")
          }
        >
          {library.videos.length ? "Start practice" : "Add your first video"}
        </Button>
      </LinearGradient>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <Icon name="practice" color={t.primary} />
            <Txt weight="bold">Your weekly rhythm</Txt>
          </Row>
          <Txt size={13} color={t.muted}>
            {Math.floor(weekly)} / {library.preferences.weeklyMinutes} min
          </Txt>
        </Row>
        <ProgressBar
          value={weekly / library.preferences.weeklyMinutes}
          color={t.primary}
          trackColor={t.soft}
          label={`${Math.floor(weekly)} of ${library.preferences.weeklyMinutes} weekly minutes`}
        />
        <Txt size={13} color={t.muted}>
          {weekly >= library.preferences.weeklyMinutes
            ? "Your goal is complete. Keep the good feeling going."
            : "Small sessions. Moves that stay with you."}
        </Txt>
      </Card>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Txt size={24} weight="display">
            Your Daily Picks
          </Txt>
          <Txt size={13} color={t.muted}>
            {library.preferences.onePerStyle !== false
              ? library.preferences.pickMix === "source"
                ? "One per selected source · unrated counts as 5★"
                : "One per dance · unrated counts as 5★"
              : "Your highest-rated eligible videos"}
          </Txt>
        </View>
        <Icon name="spark" color={t.primary} />
      </Row>
      {library.preferences.picksEnabled &&
      !pick?.skipped &&
      library.preferences.onePerStyle !== false
        ? dailySlots(library)
            .filter((slot) => !videos.some((v) => belongsToSlot(v, slot)))
            .map((slot) => (
              <Card key={slot.key}>
                <Txt weight="bold">Your {slot.name} pick is waiting</Txt>
                <Txt size={13} color={t.muted}>
                  Add or refresh an available video in {slot.name}, rated{" "}
                  {minimumPickRating(library)}★ or higher to complete your daily
                  mix.
                </Txt>
                <Button variant="soft" onPress={() => router.push("/upload")}>
                  Add a {slot.style} video
                </Button>
              </Card>
            ))
        : null}
      {library.preferences.picksEnabled ? (
        <Button
          variant="soft"
          onPress={() => update((l) => refreshDailyPicks(l))}
        >
          Update today’s picks
        </Button>
      ) : null}
      {!library.preferences.picksEnabled ? (
        <Empty
          title="Picks are taking a break"
          body="Turn on Daily Picks in Settings whenever you’d like a little inspiration."
        />
      ) : videos.length ? (
        videos.map((video) => (
          <View key={video.id} style={{ gap: 12 }}>
            {dailySlots(library).find((slot) => belongsToSlot(video, slot))
              ?.sourceId ? (
              <Txt weight="bold">
                {
                  dailySlots(library).find((slot) => belongsToSlot(video, slot))
                    ?.name
                }{" "}
                · Daily Pick
              </Txt>
            ) : null}
            <VideoCard video={video} featured />
            <Txt size={13} color={t.muted}>
              {
                rankCandidates(library, new Date(), true).find(
                  (c) => c.video.id === video.id,
                )?.reason
              }
            </Txt>
            <RatingStars video={video} />
          </View>
        ))
      ) : (
        <Empty
          title={
            pick?.skipped
              ? "A rest day counts, too."
              : "Your next favourite move awaits"
          }
          body={
            pick?.skipped
              ? "Today’s pick is paused. Your preferences haven’t changed."
              : "Add a video and choose a few labels. Your personal practice picks start here."
          }
          action={
            !pick?.skipped ? (
              <Button icon="plus" onPress={() => router.push("/upload")}>
                Add a dance video
              </Button>
            ) : undefined
          }
        />
      )}
      {videos.length ? (
        <Button
          variant="ghost"
          onPress={() =>
            update((l) => ({
              ...l,
              picks: l.picks.map((p) =>
                p.day === localDay() ? { ...p, skipped: true } : p,
              ),
            }))
          }
        >
          Skip today
        </Button>
      ) : null}
      <Row>
        <Icon name="lock" size={16} color={t.muted} />
        <Txt size={12} color={t.muted}>
          Your local videos stay on this device.
        </Txt>
      </Row>
    </Screen>
  );
}
