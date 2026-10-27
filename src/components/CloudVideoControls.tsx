import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Button, Card, Txt, Badge, Row } from "./ui";
import { useTheme } from "./theme";
import { useLibrary } from "../services/store";
import type { Video } from "../core/types";
import { provider } from "../services/cloud/provider";
import { downloadVideo } from "../services/cloud/download";
import { prepareNamedCopy } from "../services/phoneCopies";
import { deleteMedia, saveToPhotos, shareMedia } from "../services/media";
export function CloudVideoControls({
  video,
  onChange,
}: {
  video: Video;
  onChange?: () => void;
}) {
  const { library, updateVideo, commit } = useLibrary();
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function act(action: () => Promise<void>) {
    try {
      setMessage("");
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function download() {
    if (!video.remote || busy) return;
    const connection = library.connections.find(
      (c) => c.id === video.remote!.connectionId,
    );
    if (!connection) return;
    controller.current = new AbortController();
    setBusy(true);
    setProgress(0);
    await act(async () => {
      if (!video.remote?.canDownload)
        throw new Error("The owner does not allow downloads.");
      if (video.sharedGrantId)
        throw new Error(
          "Reconnect this older shared video from its storage folder first.",
        );
      const address = await provider(connection).playback(video.remote.fileId);
      const copy = await downloadVideo(
        address,
        video.size,
        library.cloudSettings.wifiOnly,
        setProgress,
        controller.current!.signal,
      );
      const numberedUri = video.remote.fileName
        ? await prepareNamedCopy(copy.uri, video.remote.fileName, video.id)
        : copy.uri;
      await commit((l) => ({
        ...l,
        videos: l.videos.map((v) =>
          v.id === video.id
            ? {
                ...v,
                offlineUri: numberedUri,
                storagePreference: "offline",
                duration: copy.duration,
                thumbnail: copy.thumbnail,
                size: copy.size,
              }
            : v,
        ),
      }));
      if (numberedUri !== copy.uri) await deleteMedia(copy.uri);
      setMessage(
        "Phone copy ready. You can practise offline or export a new trimmed clip.",
      );
      onChange?.();
    });
    setBusy(false);
  }
  return (
    <Card>
      <Badge tone={video.offlineUri || !video.remote ? "accent" : "soft"}>
        {video.remote
          ? video.offlineUri && video.storagePreference === "offline"
            ? "PHONE COPY"
            : "ONLINE VIDEO"
          : "ON THIS DEVICE"}
      </Badge>
      <Txt size={21} weight="display">
        Your video. Your choice.
      </Txt>
      {video.remote ? (
        <>
          <Txt weight="bold">
            {library.sources
              .filter((source) => video.remote!.sourceIds.includes(source.id))
              .map((source) => source.name)
              .join(" · ") || "Connected storage"}
          </Txt>
          <Txt color={t.muted}>
            {video.source === "dropbox" ? "Dropbox" : "Google Drive"} ·{" "}
            {(video.size / 1048576).toFixed(1)} MB. Streaming uses data. Phone
            copies remain inside BailaCue until removed.
          </Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Button
              variant={
                video.storagePreference === "online" ? "primary" : "soft"
              }
              onPress={() => {
                updateVideo(video.id, { storagePreference: "online" });
                onChange?.();
              }}
              disabled={busy}
            >
              Stream online
            </Button>
            {video.offlineUri ? (
              <Button
                variant={
                  video.storagePreference === "offline" ? "primary" : "soft"
                }
                onPress={() => {
                  updateVideo(video.id, { storagePreference: "offline" });
                  onChange?.();
                }}
              >
                Use phone copy
              </Button>
            ) : (
              <Button
                icon="download"
                onPress={download}
                disabled={!video.remote.canDownload || busy}
              >
                {busy
                  ? `Downloading ${Math.round(progress * 100)}%`
                  : "Download to phone"}
              </Button>
            )}
          </Row>
          {busy ? (
            <Button variant="ghost" onPress={() => controller.current?.abort()}>
              Cancel download
            </Button>
          ) : null}
          {video.offlineUri ? (
            <>
              <Button
                variant="soft"
                onPress={() =>
                  act(async () => {
                    await saveToPhotos(video.offlineUri!);
                    setMessage("Saved a copy to Photos.");
                  })
                }
              >
                Save phone copy to Photos
              </Button>
              <Button
                variant="ghost"
                onPress={() =>
                  act(async () => {
                    await deleteMedia(video.offlineUri!);
                    updateVideo(video.id, {
                      offlineUri: undefined,
                      thumbnail: undefined,
                      storagePreference: "online",
                    });
                    onChange?.();
                  })
                }
              >
                Remove phone download
              </Button>
            </>
          ) : null}
          <Txt size={12} color={t.muted}>
            Downloads cannot be remotely revoked while this phone is offline.
            Access is checked again online. To trim a cloud video, download it
            first.
          </Txt>
        </>
      ) : (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            <Button
              variant="soft"
              onPress={() =>
                act(async () => {
                  await saveToPhotos(video.uri);
                  setMessage("Saved to Photos.");
                })
              }
            >
              Save video to Photos
            </Button>
            <Button
              variant="soft"
              onPress={() =>
                act(async () => {
                  await shareMedia(video.uri);
                })
              }
            >
              Share / Save file
            </Button>
          </Row>
          <Button
            icon="folder"
            onPress={() =>
              router.push({
                pathname: "/transfer/[id]",
                params: { id: video.id },
              })
            }
          >
            Upload to my storage
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        onPress={() =>
          router.push({ pathname: "/compare", params: { reference: video.id } })
        }
      >
        Compare with my practice
      </Button>
      {message ? (
        <Txt accessibilityRole="alert" color={t.primary}>
          {message}
        </Txt>
      ) : null}
    </Card>
  );
}
