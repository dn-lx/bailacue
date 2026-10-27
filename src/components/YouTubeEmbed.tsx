import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import { uid } from "../core/types";
import {
  handleYouTubeMessage,
  youtubeHtml,
  type YouTubeEmbedProps,
} from "./youtubeBridge";
export default function YouTubeEmbed(props: YouTubeEmbedProps) {
  const web = useRef<WebView<object>>(null),
    latest = useRef(props),
    [token] = useState(uid);
  useEffect(() => {
    latest.current = props;
  });
  const html = useMemo(
    () =>
      youtubeHtml(
        token,
        props.videoId,
        props.playlistId,
        undefined,
        props.enforcePause,
      ),
    [token, props.videoId, props.playlistId, props.enforcePause],
  );
  const source = useMemo(
    () => ({ html, baseUrl: "https://app.bailacue.mobile/" }),
    [html],
  );
  const command = useCallback(() => {
    const p = latest.current;
    web.current?.injectJavaScript(
      `window.bailacueCommand&&window.bailacueCommand(${JSON.stringify({ playing: p.playing, rate: p.rate, seek: p.seekRequest })});true;`,
    );
  }, []);
  useEffect(() => {
    command();
  }, [props.playing, props.rate, props.seekRequest, command]);
  return (
    <WebView<object>
      ref={web}
      source={source}
      containerStyle={props.fill ? { flex: 1 } : { flex: 0, height: 260 }}
      style={
        props.fill
          ? { flex: 1, backgroundColor: "#080D18" }
          : { height: 260, minHeight: 220, backgroundColor: "#080D18" }
      }
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      originWhitelist={["*"]}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          handleYouTubeMessage(data, token, latest.current);
          if (data.kind === "state" && data.phase === "ready") command();
        } catch {
          /* Ignore malformed bridge data. */
        }
      }}
      onError={() =>
        props.onState?.({
          phase: "error",
          position: 0,
          duration: 0,
          error: "YouTube could not load. Open it in YouTube or retry online.",
        })
      }
    />
  );
}
