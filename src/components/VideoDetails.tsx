import { useState } from "react";
import { View } from "react-native";
import type { Video } from "../core/types";
import { danceTypes } from "../core/dances";
import { libraryLabels } from "../core/labels";
import { isUnrated } from "../core/ratings";
import { useLibrary } from "../services/store";
import { Button, Card, Chip, Field, Txt, layout } from "./ui";
import { DancePicker } from "./DancePicker";
import { LabelPicker } from "./LabelPicker";

export function RatingStars({ video }: { video: Video }) {
  const { updateVideo } = useLibrary();
  return (
    <View style={{ gap: 8 }}>
      <Txt size={13} weight="bold">
        Your rating · Daily Picks priority
      </Txt>
      <View style={layout.wrap}>
        {[1, 2, 3, 4, 5].map((importance) => (
          <Chip
            key={importance}
            selected={!isUnrated(video) && importance === video.importance}
            onPress={() =>
              updateVideo(video.id, { importance, ratingSet: true })
            }
          >
            {importance} ★
          </Chip>
        ))}
        <Chip
          selected={isUnrated(video)}
          onPress={() => updateVideo(video.id, { ratingSet: false })}
        >
          Unrated
        </Chip>
      </View>
      {isUnrated(video) ? (
        <Txt size={12}>Unrated counts as 5★ until you choose a rating.</Txt>
      ) : null}
    </View>
  );
}
export function VideoDetails({ video }: { video: Video }) {
  const { library, update, commit } = useLibrary();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [title, setTitle] = useState(video.title),
    [labels, setLabels] = useState(video.labels),
    [saved, setSaved] = useState(false);
  return (
    <Card>
      <Txt size={23} weight="display">
        Video details
      </Txt>
      {video.remote || video.youtube ? (
        <Txt>Source title: {video.title}</Txt>
      ) : (
        <Field label="Title" value={title} onChangeText={setTitle} />
      )}
      <DancePicker
        value={video.style}
        onChange={(style) =>
          update((l) => ({
            ...l,
            videos: l.videos.map((v) =>
              v.id === video.id
                ? {
                    ...v,
                    style,
                    styleSet: true,
                    danceId: danceTypes(l).find((d) => d.name === style)?.id,
                  }
                : v,
            ),
          }))
        }
      />
      <RatingStars video={video} />
      <LabelPicker
        value={labels}
        options={libraryLabels(library)}
        onChange={(value) => {
          setLabels(value);
          setSaved(false);
        }}
      />
      <Button
        variant="soft"
        disabled={!title.trim()}
        loading={saving}
        onPress={async () => {
          setSaving(true);
          setError("");
          try {
            await commit((l) => ({
              ...l,
              videos: l.videos.map((v) =>
                v.id === video.id
                  ? {
                      ...v,
                      title:
                        video.remote || video.youtube ? v.title : title.trim(),
                      labels,
                    }
                  : v,
              ),
            }));
            setSaved(true);
          } catch {
            setSaved(false);
            setError(
              "Details could not be saved. Your edits are kept here; please retry.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        Save details
      </Button>
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      {saved ? (
        <Txt size={12} accessibilityLiveRegion="polite">
          Details saved
        </Txt>
      ) : null}
    </Card>
  );
}

export function VideoContext({ video }: { video: Video }) {
  const { commit } = useLibrary();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [teacher, setTeacher] = useState(video.teacher),
    [className, setClassName] = useState(video.className),
    [location, setLocation] = useState(video.location),
    [lessonDate, setDate] = useState(video.lessonDate),
    [saved, setSaved] = useState(false);
  return (
    <Card>
      <Txt size={22} weight="display">
        Class & artist context
      </Txt>
      <Field
        label="Teacher or artist"
        value={teacher}
        onChangeText={setTeacher}
      />
      <Field label="Class name" value={className} onChangeText={setClassName} />
      <Field label="Location" value={location} onChangeText={setLocation} />
      <Field
        label="Lesson date"
        value={lessonDate}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      <Button
        variant="soft"
        loading={saving}
        onPress={async () => {
          setSaving(true);
          setError("");
          try {
            await commit((l) => ({
              ...l,
              videos: l.videos.map((v) =>
                v.id === video.id
                  ? {
                      ...v,
                      teacher: teacher.trim(),
                      className: className.trim(),
                      location: location.trim(),
                      lessonDate,
                    }
                  : v,
              ),
            }));
            setSaved(true);
          } catch {
            setSaved(false);
            setError("Context could not be saved. Please retry.");
          } finally {
            setSaving(false);
          }
        }}
      >
        Save context
      </Button>
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      {saved ? <Txt accessibilityLiveRegion="polite">Context saved</Txt> : null}
    </Card>
  );
}
