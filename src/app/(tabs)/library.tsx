import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Txt,
  Row,
  Field,
  Chip,
  Button,
  Empty,
  Card,
  layout,
} from "../../components/ui";
import { VideoCard } from "../../components/VideoCard";
import { LabelPicker } from "../../components/LabelPicker";
import { useLibrary } from "../../services/store";
import { useTheme } from "../../components/theme";
import {
  filterVideos,
  sortVideos,
  type LibraryView,
  type LibrarySort,
} from "../../core/library";
import { danceTypes } from "../../core/dances";
import { uniqueLabels } from "../../core/labels";
import { uid } from "../../core/types";
const sorts: [LibrarySort, string][] = [
  ["added-new", "Date added · newest"],
  ["added-old", "Date added · oldest"],
  ["number-up", "Number · ascending"],
  ["number-down", "Number · descending"],
  ["rating", "Rating · high to low"],
  ["rating-low", "Rating · low to high"],
  ["title-up", "Title · A–Z"],
  ["title-down", "Title · Z–A"],
];
export default function LibraryScreen() {
  const { library, update } = useLibrary();
  const t = useTheme();
  const [name, setName] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = library.libraryView ?? {};
  const set = (changes: Partial<LibraryView>) =>
    update((l) => ({ ...l, libraryView: { ...l.libraryView, ...changes } }));
  const videos = sortVideos(filterVideos(library.videos, view), view.sort);
  const active = [
    view.style,
    view.sourceId
      ? ([...library.sources, ...(library.youtubeSources ?? [])].find(
          (s) => s.id === view.sourceId,
        )?.name ??
        { phone: "On phone", online: "Online" }[view.sourceId] ??
        "Selected source")
      : undefined,
    ...(view.labels ?? []),
    ...(view.ratings ?? []).map((n) => `${n}★`),
    view.includeUnrated ? "Unrated" : "",
  ].filter(Boolean);
  return (
    <Screen
      title="Your dance library"
      subtitle={`${library.videos.length} videos. Your moves, organised.`}
      action={
        <Button
          variant="soft"
          icon="plus"
          onPress={() => router.push("/upload")}
        >
          Add
        </Button>
      }
    >
      <Field
        label="Search your moves"
        placeholder="Title, labels, teacher…"
        value={view.query ?? ""}
        onChangeText={(query) => set({ query })}
      />
      <View style={layout.wrap}>
        <Chip selected={!view.style} onPress={() => set({ style: undefined })}>
          All dances
        </Chip>
        {danceTypes(library).map((d) => (
          <Chip
            key={d.id}
            selected={view.style === d.name}
            onPress={() =>
              set({ style: view.style === d.name ? undefined : d.name })
            }
          >
            {d.name}
          </Chip>
        ))}
      </View>
      <LabelPicker
        label="Filter labels"
        suggestions={false}
        value={view.labels ?? []}
        options={uniqueLabels(library.videos.flatMap((v) => v.labels))}
        onChange={(labels) => set({ labels })}
      />
      <View style={layout.wrap}>
        {(["any", "all"] as const).map((labelMatch) => (
          <Chip
            key={labelMatch}
            selected={(view.labelMatch ?? "any") === labelMatch}
            onPress={() => set({ labelMatch })}
          >
            Match {labelMatch} label
          </Chip>
        ))}
      </View>
      <Row>
        <Button variant="soft" onPress={() => setFiltersOpen(!filtersOpen)}>
          {filtersOpen ? "Close filters" : "Filters & sort"}
        </Button>
        {active.length || view.query ? (
          <Button
            variant="ghost"
            onPress={() =>
              update((l) => ({ ...l, libraryView: { sort: view.sort } }))
            }
          >
            Clear filters
          </Button>
        ) : null}
        <Txt size={13}>{videos.length} matching videos</Txt>
      </Row>
      {active.length ? (
        <Txt size={12} color={t.muted}>
          Active: {active.join(" · ")}
        </Txt>
      ) : null}
      {filtersOpen ? (
        <Card>
          <Txt weight="bold">Ratings</Txt>
          <Txt size={12}>
            Exact stars; unrated is separate from an explicit 5★.
          </Txt>
          <View style={layout.wrap}>
            <Chip
              selected={!view.ratings?.length && !view.includeUnrated}
              onPress={() => set({ ratings: [], includeUnrated: false })}
            >
              All ratings
            </Chip>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                selected={view.ratings?.includes(n)}
                onPress={() =>
                  set({
                    ratings: view.ratings?.includes(n)
                      ? view.ratings.filter((x) => x !== n)
                      : [...(view.ratings ?? []), n],
                  })
                }
              >
                {n} ★
              </Chip>
            ))}
            <Chip
              selected={view.includeUnrated}
              onPress={() => set({ includeUnrated: !view.includeUnrated })}
            >
              Unrated
            </Chip>
          </View>
          <Txt weight="bold">Storage and source</Txt>
          <View style={layout.wrap}>
            <Chip
              selected={!view.sourceId}
              onPress={() => set({ sourceId: undefined })}
            >
              All storage
            </Chip>
            <Chip
              selected={view.sourceId === "phone"}
              onPress={() => set({ sourceId: "phone" })}
            >
              On my phone
            </Chip>
            <Chip
              selected={view.sourceId === "online"}
              onPress={() => set({ sourceId: "online" })}
            >
              Online
            </Chip>
            {[...library.sources, ...(library.youtubeSources ?? [])].map(
              (s) => (
                <Chip
                  key={s.id}
                  selected={view.sourceId === s.id}
                  onPress={() => set({ sourceId: s.id })}
                >
                  {s.name}
                </Chip>
              ),
            )}
            <Chip
              selected={view.style === "Other"}
              onPress={() => set({ style: "Other" })}
            >
              Unclassified
            </Chip>
          </View>
          <Txt weight="bold">Sort videos</Txt>
          <View style={layout.wrap}>
            {sorts.map(([sort, label]) => (
              <Chip
                key={sort}
                selected={(view.sort ?? "added-new") === sort}
                onPress={() => set({ sort })}
              >
                {label}
              </Chip>
            ))}
          </View>
        </Card>
      ) : null}
      {videos.length ? (
        videos.map((video) => <VideoCard key={video.id} video={video} />)
      ) : (
        <Empty
          title={
            library.videos.length
              ? "No moves match just yet"
              : "A home for your dance videos"
          }
          body={
            library.videos.length
              ? "Try another search or adjust your filters."
              : "Add a video or a YouTube lesson to start your collection."
          }
          action={
            !library.videos.length ? (
              <Button onPress={() => router.push("/upload")} icon="plus">
                Add a video
              </Button>
            ) : (
              <Button
                variant="soft"
                onPress={() => update((l) => ({ ...l, libraryView: {} }))}
              >
                Clear filters
              </Button>
            )
          }
        />
      )}
      <Txt size={24} weight="display">
        Collections
      </Txt>
      <Txt color={t.muted}>
        Keep a class, a combination, or your next practice together.
      </Txt>
      {library.playlists.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size={19} weight="display">
                {p.name}
              </Txt>
              <Txt size={13} color={t.muted}>
                {p.videoIds.length} videos
              </Txt>
            </View>
            <Button
              variant="soft"
              onPress={() =>
                router.push({
                  pathname: "/playlist/[id]",
                  params: { id: p.id },
                })
              }
            >
              Open
            </Button>
          </Row>
        </Card>
      ))}
      <Card>
        <Field
          label="New collection"
          placeholder="Sunday footwork"
          value={name}
          onChangeText={setName}
        />
        <Button
          variant="soft"
          disabled={!name.trim()}
          onPress={() => {
            update((l) => ({
              ...l,
              playlists: [
                ...l.playlists,
                { id: uid(), name: name.trim(), videoIds: [] },
              ],
            }));
            setName("");
          }}
        >
          Create collection
        </Button>
      </Card>
    </Screen>
  );
}
