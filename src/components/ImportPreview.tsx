import { useCallback, useEffect, useState } from "react";
import { useEvent } from "expo";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { resolveMedia } from "../services/media";
import { Button, Card, Txt } from "./ui";

// A separate player instance is disposed when the selected file changes.
export function ImportPreview({ uri }: { uri: string }) {
  const [resolved, setResolved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    resolveMedia(uri)
      .then((value) => {
        if (alive) setResolved(value);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [uri]);
  return resolved ? (
    <PreviewPlayer key={resolved} uri={resolved} />
  ) : (
    <Card>
      <Txt>{error || "Preparing video preview…"}</Txt>
    </Card>
  );
}
function PreviewPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status, error } = useEvent(player, "statusChange", {
    status: player.status,
  });
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return (
    <Card>
      <Txt weight="bold">Preview before saving</Txt>
      <Txt size={13}>
        Watch the video, then choose its dance type and destination folder
        below.
      </Txt>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={{
          height: 240,
          width: "100%",
          backgroundColor: "#080D18",
          borderRadius: 16,
        }}
      />
      <Button
        icon="play"
        disabled={status !== "readyToPlay"}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      >
        {isPlaying ? "Pause preview" : "Play preview"}
      </Button>
      {error ? (
        <Txt accessibilityRole="alert">
          This preview could not play: {error.message}. Try a supported MP4
          video.
        </Txt>
      ) : null}
    </Card>
  );
}
