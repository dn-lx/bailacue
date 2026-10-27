import { DancePicker } from "../../components/DancePicker";
import { ImportPreview } from "../../components/ImportPreview";
import { SaveDestinationPicker } from "../../components/SaveDestinationPicker";
import { phoneDestination, uploadDestination } from "../../core/destination";
import { LabelPicker } from "../../components/LabelPicker";
import { libraryLabels } from "../../core/labels";
import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Txt,
  Button,
  Row,
  Field,
  Chip,
  Badge,
  Icon,
} from "../../components/ui";
import { useTheme } from "../../components/theme";
import { useLibrary } from "../../services/store";
import { importMedia, recordMedia, deleteMedia } from "../../services/media";
import type { ImportedMedia } from "../../services/media.native";
import { uid, type DanceStyle } from "../../core/types";
import { formatTime } from "../../core/practice";
export default function Upload() {
  const t = useTheme();
  const { library, update } = useLibrary();
  const [destination, setDestination] = useState(phoneDestination);
  const [media, setMedia] = useState<ImportedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState<DanceStyle>("Bachata");
  const [labels, setLabels] = useState<string[]>([]);
  const [teacher, setTeacher] = useState("");
  const [className, setClassName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [importance, setImportance] = useState(5);
  const [ratingSet, setRatingSet] = useState(false);
  const saved = useRef(false);
  async function pick(record = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await (record ? recordMedia() : importMedia());
      if (next) {
        if (media) {
          await deleteMedia(media.uri);
          if (media.thumbnail?.startsWith("file:"))
            await deleteMedia(media.thumbnail);
        }
        setMedia(next);
        setTitle(next.name.replace(/\.[^.]+$/, ""));
        saved.current = false;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!media || !title.trim() || saved.current) return;
    try {
      if (destination.mode === "cloud")
        uploadDestination(library, destination.sourceId);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    saved.current = true;
    const id = uid();
    const now = new Date().toISOString();
    update((l) => ({
      ...l,
      videos: [
        {
          id,
          title: title.trim(),
          ...media,
          style,
          styleSet: true,
          danceId: l.danceTypes?.find((d) => d.name === style)?.id,
          labels,
          importance,
          ratingSet,
          status: "To learn",
          teacher,
          className,
          location,
          lessonDate: date,
          createdAt: now,
          resume: 0,
          segments: [],
          bookmarks: [],
          notes: notes.trim()
            ? [{ id: uid(), text: notes.trim(), createdAt: now }]
            : [],
          available: true,
          source: "device",
        },
        ...l.videos,
      ],
    }));
    setMedia(null);
    setTitle("");
    setNotes("");
    if (destination.mode === "cloud")
      router.push({
        pathname: "/transfer/[id]",
        params: {
          id,
          destination: destination.sourceId,
          keepCopy: destination.keepCopy ? "1" : "0",
          autoUpload: "1",
        },
      });
    else router.push({ pathname: "/video/[id]", params: { id } });
  }
  return (
    <Screen
      title="Make room for a move"
      subtitle="A moment from class. A little inspiration. Yours to keep."
    >
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <View
          style={{ backgroundColor: t.soft, padding: 18, borderRadius: 22 }}
        >
          <Icon name="plus" size={32} color={t.primary} />
        </View>
        <Txt size={23} weight="display">
          Bring your videos along
        </Txt>
        <Txt color={t.muted} style={{ textAlign: "center" }}>
          Choose a video from your files or record a fresh practice. Choose this
          phone or a cloud folder before saving.
        </Txt>
        <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <Button icon="folder" onPress={() => pick()} loading={busy}>
            Choose a video
          </Button>
          <Button
            variant="soft"
            icon="camera"
            onPress={() => pick(true)}
            disabled={busy}
          >
            Record
          </Button>
        </Row>
      </Card>
      <Card>
        <Txt size={22} weight="display">
          YouTube videos & playlists
        </Txt>
        <Txt>
          Preview a public link or choose an optional beginner playlist.
        </Txt>
        <Button variant="soft" onPress={() => router.push("/youtube")}>
          Add from YouTube
        </Button>
      </Card>
      {error ? (
        <Card>
          <Txt color={t.primary} accessibilityRole="alert">
            {error}
          </Txt>
        </Card>
      ) : null}
      {media ? (
        <View style={{ gap: 20 }}>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Badge tone="accent">READY TO ADD</Badge>
              <Txt size={12} color={t.muted}>
                {formatTime(media.duration)} ·{" "}
                {(media.size / 1048576).toFixed(1)} MB
              </Txt>
            </Row>
            <Txt>{media.name}</Txt>
          </Card>
          <ImportPreview key={media.uri} uri={media.uri} />
          <Field label="Video title" value={title} onChangeText={setTitle} />
          <DancePicker value={style} onChange={setStyle} />
          <LabelPicker
            value={labels}
            options={libraryLabels(library)}
            onChange={setLabels}
          />
          <Txt weight="bold">Your rating · Daily Picks priority</Txt>
          {!ratingSet ? (
            <Txt size={13}>
              Unrated videos count as 5★ until you choose a rating.
            </Txt>
          ) : null}
          <Row style={{ justifyContent: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                selected={ratingSet && n === importance}
                onPress={() => {
                  setImportance(n);
                  setRatingSet(true);
                }}
              >
                {n} ★
              </Chip>
            ))}
          </Row>
          <Field
            label="Teacher (optional)"
            value={teacher}
            onChangeText={setTeacher}
          />
          <Field
            label="Class or event (optional)"
            value={className}
            onChangeText={setClassName}
          />
          <Field
            label="Location (optional)"
            value={location}
            onChangeText={setLocation}
          />
          <Field
            label="Lesson date (optional)"
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
          />
          <Field
            label="A note to yourself"
            multiline
            value={notes}
            onChangeText={setNotes}
          />
          <SaveDestinationPicker
            value={destination}
            onChange={setDestination}
          />
          <Button icon="check" disabled={!title.trim()} onPress={save}>
            {destination.mode === "cloud"
              ? "Upload & add to library"
              : "Add to my library"}
          </Button>
          <Button
            variant="ghost"
            onPress={async () => {
              try {
                await deleteMedia(media.uri);
                if (media.thumbnail?.startsWith("file:"))
                  await deleteMedia(media.thumbnail);
                setMedia(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Discard selected copy
          </Button>
        </View>
      ) : (
        <Card>
          <Badge tone="soft">YOUR STORAGE, YOUR CHOICE</Badge>
          <Txt size={21} weight="display">
            One library. Different places.
          </Txt>
          <Txt color={t.muted}>
            Connect your own Google Drive or Dropbox folders. Stream online or
            download videos to your phone.
          </Txt>
          <Button variant="ghost" onPress={() => router.push("/storage")}>
            View storage setup
          </Button>
        </Card>
      )}
    </Screen>
  );
}
