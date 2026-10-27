import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uid } from "../core/types";
import {
  handleYouTubeMessage,
  youtubeHtml,
  type YouTubeEmbedProps,
} from "./youtubeBridge";
export default function YouTubeEmbed(props: YouTubeEmbedProps) {
  const frame = useRef<HTMLIFrameElement>(null),
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
        typeof window === "undefined"
          ? "https://app.bailacue.mobile"
          : window.location.origin,
        props.enforcePause,
      ),
    [token, props.videoId, props.playlistId, props.enforcePause],
  );
  const command = useCallback(() => {
    const p = latest.current;
    frame.current?.contentWindow?.postMessage(
      {
        kind: "command",
        token,
        command: { playing: p.playing, rate: p.rate, seek: p.seekRequest },
      },
      window.location.origin,
    );
  }, [token]);
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        handleYouTubeMessage(event.data, token, latest.current);
        if (event.data?.kind === "state" && event.data.phase === "ready")
          command();
      } catch {}
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [token, command]);
  useEffect(() => {
    command();
  }, [props.playing, props.rate, props.seekRequest, command]);
  return (
    <iframe
      ref={frame}
      srcDoc={html}
      title="YouTube lesson player"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{
        border: 0,
        width: "100%",
        height: props.fill ? "100%" : 280,
        minHeight: 200,
        background: "#080D18",
      }}
    />
  );
}
