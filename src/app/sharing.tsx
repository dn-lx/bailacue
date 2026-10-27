import { router } from "expo-router";
import { Screen, Card, Txt, Button } from "../components/ui";
export default function SharingScreen() {
  return (
    <Screen
      title="Share through your storage"
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      }
    >
      <Card>
        <Txt weight="bold">Your folders control access</Txt>
        <Txt>
          Share a Drive or Dropbox folder with another person using that
          provider’s sharing options. They can connect the folder in their own
          BailaCue library.
        </Txt>
        <Txt>
          Sharing by BailaCue username has been retired. Your saved collections
          and personal notes stay in your local library.
        </Txt>
        <Button icon="folder" onPress={() => router.push("/storage")}>
          Manage video storage
        </Button>
      </Card>
    </Screen>
  );
}
