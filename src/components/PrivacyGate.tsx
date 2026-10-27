import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useLibrary } from "../services/store";
import { unlock } from "../services/lock";
import { Button, Mark, Txt } from "./ui";
import { useTheme } from "./theme";
export function PrivacyGate({ children }: React.PropsWithChildren) {
  const { library } = useLibrary();
  const t = useTheme();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") setOpened(false);
    });
    return () => subscription.remove();
  }, []);
  async function enter() {
    setBusy(true);
    try {
      await unlock();
      setOpened(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!library.deviceLock || opened) return children;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 30,
        gap: 24,
        backgroundColor: t.background,
      }}
    >
      <View style={{ padding: 12 }}>
        <Mark size={64} />
      </View>
      <Txt size={30} weight="display">
        Your moves stay personal.
      </Txt>
      <Txt>
        {error || "Unlock with your phone’s fingerprint, face or screen lock."}
      </Txt>
      <Button icon="lock" loading={busy} onPress={enter}>
        Unlock BailaCue
      </Button>
    </View>
  );
}
