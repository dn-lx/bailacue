import { MotionPressable } from "./motion";
import { ratingCaption } from "../core/ratings";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { type Video } from "../core/types";
import { formatTime } from "../core/practice";
import { Badge, Icon, Txt } from "./ui";
import { useTheme } from "./theme";
export function VideoCard({
  video,
  featured = false,
}: {
  video: Video;
  featured?: boolean;
}) {
  const t = useTheme();
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${video.title}`}
      onPress={() =>
        router.push({ pathname: "/video/[id]", params: { id: video.id } })
      }
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 20,
        flexDirection: featured ? "column" : "row",
        alignItems: featured ? undefined : "stretch",
        overflow: "hidden",
        backgroundColor: t.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          height: featured ? 176 : undefined,
          minHeight: featured ? 176 : 124,
          width: featured ? "100%" : 104,
          backgroundColor:
            video.style === "Bachata" ? t.videoBachata : t.videoSalsa,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {video.thumbnail ? (
          <Image
            source={{ uri: video.thumbnail }}
            style={{ position: "absolute", width: "100%", height: "100%" }}
          />
        ) : null}
        <View
          style={{
            backgroundColor: "#080D18DD",
            padding: featured ? 14 : 8,
            borderRadius: 40,
          }}
        >
          <Icon name="play" color="#FFFFFF" size={26} />
        </View>
        <View style={{ position: "absolute", top: 10, left: 10 }}>
          {featured ? (
            <Badge tone={video.style === "Bachata" ? "accent" : "primary"}>
              {video.style.toUpperCase()}
            </Badge>
          ) : null}
        </View>
        <View
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            backgroundColor: "#080D18E6",
            borderRadius: 7,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Txt size={12} color="#FFFFFF">
            {formatTime(video.duration)}
          </Txt>
        </View>
      </View>
      <View
        style={{
          padding: 14,
          gap: 6,
          flex: featured ? undefined : 1,
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <Txt size={featured ? 20 : 17} weight="display" numberOfLines={2}>
          {video.title}
        </Txt>
        <Txt size={12} color={t.primary}>
          {ratingCaption(video)}
        </Txt>
        <Txt size={12} color={t.muted} numberOfLines={2}>
          {[
            (video.youtube ? "YouTube · online" : "") ||
              video.teacher ||
              (video.remote
                ? video.offlineUri && video.storagePreference === "offline"
                  ? "Phone copy"
                  : video.source === "dropbox"
                    ? "Dropbox · online"
                    : "Drive · online"
                : "On this device"),
            video.youtube?.channelTitle,
            video.labels.slice(0, 2).join(" · "),
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Txt>
      </View>
    </MotionPressable>
  );
}
