import { useState } from "react";
import { View } from "react-native";
import { addDanceType, danceTypes } from "../core/dances";
import { useLibrary } from "../services/store";
import { Button, Chip, Field, Txt, layout } from "./ui";

export function DancePicker({
  value,
  onChange,
  label = "Dance type",
}: {
  value: string;
  onChange: (style: string) => void;
  label?: string;
}) {
  const { library, commit } = useLibrary();
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  return (
    <View style={{ gap: 10 }}>
      <Txt size={13} weight="bold">
        {label}
      </Txt>
      <View style={layout.wrap}>
        {danceTypes(library).map((d) => (
          <Chip
            key={d.id}
            selected={value === d.name}
            onPress={() => onChange(d.name)}
          >
            {d.name}
          </Chip>
        ))}
        <Chip onPress={() => setCreating(!creating)}>Add dance type</Chip>
      </View>
      {creating ? (
        <View style={{ gap: 8 }}>
          <Field
            label="New dance type"
            placeholder="Tango"
            value={name}
            onChangeText={setName}
          />
          <Button
            variant="soft"
            disabled={!name.trim()}
            loading={saving}
            onPress={async () => {
              setSaving(true);
              try {
                const result = addDanceType(library, name);
                await commit((l) => addDanceType(l, name).library);
                onChange(result.dance.name);
                setName("");
                setCreating(false);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Create dance type
          </Button>
        </View>
      ) : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
    </View>
  );
}
