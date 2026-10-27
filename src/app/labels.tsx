import { router } from "expo-router";
import { useState } from "react";
import { Button, Card, Field, Screen, Txt } from "../components/ui";
import {
  cleanLabel,
  libraryLabels,
  removeLibraryLabel,
  uniqueLabels,
} from "../core/labels";
import { useLibrary } from "../services/store";
export default function Labels() {
  const { library, commit } = useLibrary();
  const [query, setQuery] = useState("");
  const [remove, setRemove] = useState("");
  const [notice, setNotice] = useState("");
  async function act(action: Parameters<typeof commit>[0]) {
    try {
      await commit(action);
      setNotice("Labels saved.");
      setRemove("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const labels = libraryLabels(library);
  return (
    <Screen
      title="Your labels"
      subtitle="Video types, artists and everything you want to find again."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Done
        </Button>
      }
    >
      <Card>
        <Field
          label="Find or create a label"
          value={query}
          onChangeText={setQuery}
          placeholder="Artist or video type"
        />
        {cleanLabel(query) &&
        !labels.some(
          (v) => v.toLowerCase() === cleanLabel(query).toLowerCase(),
        ) ? (
          <Button
            onPress={() =>
              void act((l) => ({
                ...l,
                labels: uniqueLabels([...libraryLabels(l), query]),
              }))
            }
          >
            Create label
          </Button>
        ) : null}
        <Txt>
          Removing a label here removes it from every video, source default and
          saved filter. Your videos and notes stay in place.
        </Txt>
      </Card>
      {notice ? <Txt accessibilityRole="alert">{notice}</Txt> : null}
      {labels
        .filter((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
        .map((name) => (
          <Card key={name}>
            <Txt weight="bold">{name}</Txt>
            <Txt>
              {
                library.videos.filter((v) =>
                  v.labels.some(
                    (x) => cleanLabel(x).toLowerCase() === name.toLowerCase(),
                  ),
                ).length
              }{" "}
              videos
            </Txt>
            {remove === name ? (
              <>
                <Txt>Remove “{name}” everywhere in this library?</Txt>
                <Button
                  onPress={() => void act((l) => removeLibraryLabel(l, name))}
                >
                  Confirm removal
                </Button>
                <Button variant="ghost" onPress={() => setRemove("")}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="soft" onPress={() => setRemove(name)}>
                Remove label {name}
              </Button>
            )}
          </Card>
        ))}
      {!labels.length ? (
        <Txt>
          No labels yet. Create one above or add labels when editing a video.
        </Txt>
      ) : null}
    </Screen>
  );
}
