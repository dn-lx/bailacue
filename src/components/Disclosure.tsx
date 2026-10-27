import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "./theme";
import { Txt } from "./ui";
export function Disclosure({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen),
    t = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          padding: 16,
          minHeight: 48,
          borderRadius: 16,
          backgroundColor: t.soft,
        }}
      >
        <Txt weight="bold">
          {title} {open ? "−" : "+"}
        </Txt>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
