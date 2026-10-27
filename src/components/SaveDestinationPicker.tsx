import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useLibrary } from "../services/store";
import type { SaveDestination } from "../core/destination";
import { Button, Card, Chip, Row, Txt } from "./ui";
import { useTheme } from "./theme";

export function SaveDestinationPicker({
  value,
  onChange,
  label = "Save video to",
}: {
  value: SaveDestination;
  onChange: (value: SaveDestination) => void;
  label?: string;
}) {
  const { library } = useLibrary();
  const t = useTheme();
  return (
    <Card>
      <Txt weight="bold">{label}</Txt>
      <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
        <Chip
          selected={value.mode === "device"}
          onPress={() => onChange({ ...value, mode: "device" })}
        >
          This phone
        </Chip>
        <Chip
          selected={value.mode === "cloud"}
          onPress={() => onChange({ ...value, mode: "cloud" })}
        >
          Online storage
        </Chip>
      </Row>
      {value.mode === "cloud" ? (
        <>
          <Txt size={13} color={t.muted}>
            Choose the exact folder for this video. Salsa and Bachata folders
            are separate destinations.
          </Txt>
          {library.sources.map((source) => {
            const connection = library.connections.find(
              (c) => c.id === source.connectionId,
            );
            const writable =
              connection?.connected && connection.writable && source.writable;
            return (
              <View key={source.id} style={{ gap: 4 }}>
                <Chip
                  selected={value.sourceId === source.id}
                  onPress={() => onChange({ ...value, sourceId: source.id })}
                >
                  {source.name} ·{" "}
                  {source.provider === "dropbox" ? "Dropbox" : "Drive"}
                </Chip>
                <Txt size={12} color={t.muted}>
                  {connection?.email}
                  {writable ? "" : " · Enable uploads in Storage first"}
                </Txt>
              </View>
            );
          })}
          {!library.sources.length ? (
            <Txt>No cloud folders connected yet.</Txt>
          ) : null}
          <Row style={{ justifyContent: "space-between" }}>
            <Txt style={{ flex: 1 }}>Keep a phone copy after upload</Txt>
            <Switch
              accessibilityLabel="Keep a phone copy after upload"
              value={value.keepCopy}
              onValueChange={(keepCopy) => onChange({ ...value, keepCopy })}
            />
          </Row>
          <Txt size={12} color={t.muted}>
            Online-only saves upload to this folder, then remove the temporary
            phone file after confirmation. Failed uploads keep the phone file
            for retry.
          </Txt>
          <Button variant="ghost" onPress={() => router.push("/storage")}>
            Connect or manage folders
          </Button>
        </>
      ) : (
        <Txt size={13} color={t.muted}>
          Save a separate file on this phone. No cloud upload.
        </Txt>
      )}
    </Card>
  );
}
