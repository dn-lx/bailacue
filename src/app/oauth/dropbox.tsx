import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Screen, Button, Txt } from "../../components/ui";
WebBrowser.maybeCompleteAuthSession();
export default function DropboxCallback() {
  return (
    <Screen title="Returning to BailaCue">
      <Txt>Complete the connection in the window where you started.</Txt>
      <Button onPress={() => router.replace("/storage")}>
        Return to storage
      </Button>
    </Screen>
  );
}
