import { useState } from "react";
import type { Video } from "../core/types";
import { uid } from "../core/types";
import { formatTime } from "../core/practice";
import { useLibrary } from "../services/store";
import { Button, Card, Chip, Field, Row, Txt } from "./ui";

export function NotesMoments({
  video,
  time,
  onSeek,
}: {
  video: Video;
  time: number;
  onSeek: (seconds: number) => void;
}) {
  const { updateVideo } = useLibrary();
  const [text, setText] = useState(""),
    [attach, setAttach] = useState(true),
    [editing, setEditing] = useState<string>(),
    [stamp, setStamp] = useState<number>();
  const notes = [...video.notes].sort(
    (a, b) =>
      (a.time ?? Infinity) - (b.time ?? Infinity) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return (
    <Card>
      <Txt size={22} weight="display">
        Notes & moments
      </Txt>
      <Field
        label="Note or moment"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="A reminder or a name for this moment"
      />
      <Chip selected={attach} onPress={() => setAttach(!attach)}>
        Attach {formatTime(stamp ?? time)}
      </Chip>
      <Button
        variant="soft"
        disabled={!text.trim()}
        onPress={() => {
          const old = video.notes.find((n) => n.id === editing);
          updateVideo(video.id, {
            notes: [
              ...video.notes.filter((n) => n.id !== editing),
              {
                id: editing ?? uid(),
                text: text.trim(),
                time: attach ? (stamp ?? time) : undefined,
                kind: attach ? "moment" : "note",
                createdAt: old?.createdAt ?? new Date().toISOString(),
              },
            ],
          });
          setText("");
          setEditing(undefined);
          setStamp(undefined);
        }}
      >
        {editing ? "Save changes" : "Save note or moment"}
      </Button>
      {editing ? (
        <Button
          variant="ghost"
          onPress={() => {
            setEditing(undefined);
            setText("");
            setStamp(undefined);
          }}
        >
          Cancel editing
        </Button>
      ) : null}
      {notes.map((n) => (
        <Card key={n.id}>
          {n.time !== undefined ? (
            <Button variant="soft" onPress={() => onSeek(n.time!)}>
              {formatTime(n.time)} · {n.text}
            </Button>
          ) : (
            <Txt>{n.text}</Txt>
          )}
          <Row>
            <Button
              variant="ghost"
              onPress={() => {
                setEditing(n.id);
                setText(n.text);
                setAttach(n.time !== undefined);
                setStamp(n.time);
              }}
            >
              Edit note or moment
            </Button>
            <Button
              variant="ghost"
              onPress={() =>
                updateVideo(video.id, {
                  notes: video.notes.filter((x) => x.id !== n.id),
                })
              }
            >
              Remove note or moment
            </Button>
          </Row>
        </Card>
      ))}
    </Card>
  );
}
