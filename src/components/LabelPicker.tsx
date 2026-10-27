import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  cleanLabel,
  labelChoices,
  labelKey,
  uniqueLabels,
  suggestedLabelGroups,
} from "../core/labels";
import { useTheme } from "./theme";
import { Button, Field, Txt, layout } from "./ui";

export function LabelPicker({
  value,
  options,
  onChange,
  label = "Labels",
  suggestions = true,
}: {
  value: string[];
  options: string[];
  onChange: (labels: string[]) => void;
  label?: string;
  suggestions?: boolean;
}) {
  const t = useTheme();
  const selected = uniqueLabels(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { matches, create } = labelChoices(
    suggestions
      ? [...options, ...Object.values(suggestedLabelGroups).flat()]
      : options,
    selected,
    query,
  );
  const choose = (name: string) => {
    onChange(uniqueLabels([...selected, name]));
    setQuery("");
  };
  return (
    <View style={{ gap: 10 }}>
      <Txt size={13} weight="bold">
        {label}
      </Txt>
      <Txt size={13} color={t.muted}>
        Tag video types, artists, or anything you want to find later.
      </Txt>
      <View style={layout.wrap}>
        {selected.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`Remove label ${name}`}
            onPress={() => onChange(selected.filter((item) => item !== name))}
            style={{
              minHeight: 44,
              padding: 12,
              borderRadius: 24,
              backgroundColor: t.soft,
              borderColor: t.border,
              borderWidth: 1,
            }}
          >
            <Txt size={13} weight="medium">
              {name} · Remove
            </Txt>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? "Done choosing labels" : "Choose labels"}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(!open);
          setQuery("");
        }}
        style={{
          minHeight: 50,
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
        }}
      >
        <Txt weight="medium">
          {open ? "Done choosing labels ▴" : "Choose or create labels ▾"}
        </Txt>
      </Pressable>
      {open ? (
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surface,
            gap: 10,
          }}
        >
          <Field
            label="Search labels"
            placeholder="Video type or artist name"
            value={query}
            onChangeText={setQuery}
            returnKeyType="done"
            onSubmitEditing={() => {
              const exact = matches.find(
                (name) =>
                  name.toLowerCase() === cleanLabel(query).toLowerCase(),
              );
              if (create || exact) choose(exact || create);
            }}
          />
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 240 }}
            contentContainerStyle={{ gap: 6 }}
          >
            {create ? (
              <Button variant="soft" icon="plus" onPress={() => choose(create)}>
                Create “{create}”
              </Button>
            ) : null}
            {(suggestions
              ? [
                  ...Object.entries(suggestedLabelGroups).map(
                    ([group, names]) =>
                      [
                        group,
                        matches.filter((name) =>
                          names.some((n) => labelKey(n) === labelKey(name)),
                        ),
                      ] as const,
                  ),
                  [
                    "Your labels & artists",
                    matches.filter(
                      (name) =>
                        !Object.values(suggestedLabelGroups)
                          .flat()
                          .some((n) => labelKey(n) === labelKey(name)),
                    ),
                  ] as const,
                ]
              : [["Your library", matches] as const]
            )
              .filter(([, names]) => names.length)
              .map(([group, names]) => (
                <View key={group} style={{ gap: 6 }}>
                  <Txt size={12} weight="bold">
                    {group}
                  </Txt>
                  {names.map((name) => (
                    <Button
                      key={name}
                      variant="ghost"
                      onPress={() => choose(name)}
                    >
                      Select {name}
                    </Button>
                  ))}
                </View>
              ))}
            {!matches.length && !create ? (
              <Txt size={13} color={t.muted}>
                {query.trim()
                  ? "This label is already selected."
                  : "Type a name to create a label."}
              </Txt>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
