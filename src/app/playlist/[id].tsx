import { useLocalSearchParams, router } from "expo-router";
import { Screen, Button, Card, Txt, Row, Empty } from "../../components/ui";
import { useLibrary } from "../../services/store";
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { library, update } = useLibrary();
  const playlist = library.playlists.find((p) => p.id === id);
  if (!playlist)
    return (
      <Screen title="Collection unavailable">
        <Button onPress={() => router.back()}>Go back</Button>
      </Screen>
    );
  function change(ids: string[]) {
    update((l) => ({
      ...l,
      playlists: l.playlists.map((p) =>
        p.id === id ? { ...p, videoIds: ids } : p,
      ),
    }));
  }
  return (
    <Screen
      title={playlist.name}
      subtitle="A little collection of moves to make your own."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      }
    >
      <Button
        variant="soft"
        onPress={() =>
          router.push({
            pathname: "/sharing",
            params: { playlist: playlist.id },
          })
        }
      >
        Share collection
      </Button>
      {playlist.videoIds.length ? (
        playlist.videoIds.map((videoId, index) => {
          const video = library.videos.find((v) => v.id === videoId);
          if (!video) return null;
          return (
            <Card key={videoId}>
              <Txt size={20} weight="display">
                {index + 1}. {video.title}
              </Txt>
              <Row style={{ flexWrap: "wrap" }}>
                <Button
                  icon="play"
                  onPress={() =>
                    router.push({
                      pathname: "/video/[id]",
                      params: { id: videoId },
                    })
                  }
                >
                  Play
                </Button>
                <Button
                  variant="soft"
                  disabled={index === 0}
                  onPress={() => {
                    const ids = [...playlist.videoIds];
                    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                    change(ids);
                  }}
                >
                  Move up
                </Button>
                <Button
                  variant="ghost"
                  onPress={() =>
                    change(playlist.videoIds.filter((x) => x !== videoId))
                  }
                >
                  Remove
                </Button>
              </Row>
            </Card>
          );
        })
      ) : (
        <Empty
          title="A fresh collection"
          body="Choose videos from your library below."
        />
      )}
      <Txt size={22} weight="display">
        Add from your library
      </Txt>
      {library.videos
        .filter((v) => !playlist.videoIds.includes(v.id))
        .map((v) => (
          <Card key={v.id}>
            <Txt weight="bold">{v.title}</Txt>
            <Button
              variant="soft"
              onPress={() => change([...playlist.videoIds, v.id])}
            >
              Add to collection
            </Button>
          </Card>
        ))}
    </Screen>
  );
}
