import { Entrance, MotionPressable } from "./motion";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
export function Mark({
  size = 44,
  onDark = false,
}: {
  size?: number;
  onDark?: boolean;
}) {
  const t = useTheme();
  return (
    <Image
      source={
        t.dark || onDark
          ? require("../../assets/brand/symbol-color-dark-transparent.png")
          : require("../../assets/brand/symbol-color-transparent.png")
      }
      accessible={false}
      style={{ width: size, height: size }}
    />
  );
}
export type IconName =
  | "sun"
  | "library"
  | "plus"
  | "practice"
  | "settings"
  | "play"
  | "back"
  | "check"
  | "loop"
  | "mirror"
  | "download"
  | "spark"
  | "camera"
  | "arrow"
  | "clock"
  | "lock"
  | "folder";
const paths: Record<IconName, string> = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  library: "M4 4h5v16H4zM14 4h5v16h-5zM4 8h5m5 8h5",
  plus: "M12 5v14M5 12h14",
  practice: "M12 3 5 13h6l-1 8 9-12h-7z",
  settings:
    "M9 4h6l1 3 3 1 1 6-3 2-1 4h-6l-1-3-4-2V9l3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  play: "m9 5 11 7-11 7z",
  back: "m14 5-7 7 7 7",
  check: "m5 12 4 4L19 6",
  loop: "M19 7H7a4 4 0 0 0 0 8h1m-3 2 3-2-3-2M5 17h12a4 4 0 0 0 0-8h-1m3-2-3 2 3 2",
  mirror: "M12 3v18M9 7l-6 5 6 5zM15 7l6 5-6 5z",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  spark: "m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z",
  camera: "M3 7h5l2-3h4l2 3h5v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  folder: "M3 6h7l2 3h9v11H3z",
};
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? t.ink}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
    </Svg>
  );
}
export function Txt({
  children,
  size = 15,
  color,
  weight = "regular",
  style,
  ...rest
}: React.ComponentProps<typeof Text> & {
  size?: number;
  color?: string;
  weight?: "regular" | "medium" | "bold" | "display";
}) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily:
            weight === "display"
              ? "Outfit_600SemiBold"
              : weight === "bold"
                ? "DMSans_700Bold"
                : weight === "medium"
                  ? "DMSans_500Medium"
                  : "DMSans_400Regular",
          fontSize: size,
          lineHeight: size * 1.4,
          color: color ?? t.ink,
          flexShrink: 1,
          minWidth: 0,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Card({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          minWidth: 0,
          maxWidth: "100%",
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: t.border,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  testID,
}: React.PropsWithChildren<{
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "soft" | "ghost" | "accent";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}>) {
  const t = useTheme();
  const bg =
    variant === "primary"
      ? t.primary
      : variant === "accent"
        ? t.accent
        : variant === "soft"
          ? t.soft
          : "transparent";
  const color =
    variant === "primary"
      ? t.onPrimary
      : variant === "accent"
        ? t.onAccent
        : t.ink;
  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          maxWidth: "100%",
          flexShrink: 1,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: bg,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 9,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={20} />
      ) : null}
      <Txt
        weight="bold"
        color={color}
        style={{ textAlign: "center", flexShrink: 1 }}
      >
        {children}
      </Txt>
    </MotionPressable>
  );
}
export function Chip({
  children,
  selected = false,
  onPress,
}: React.PropsWithChildren<{ selected?: boolean; onPress?: () => void }>) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        maxWidth: "100%",
        justifyContent: "center",
        paddingHorizontal: 15,
        paddingVertical: 11,
        borderRadius: 24,
        backgroundColor: selected ? t.primary : t.soft,
        borderWidth: 1,
        borderColor: selected ? t.primary : t.border,
      }}
    >
      <Txt size={13} weight="medium" color={selected ? t.onPrimary : t.ink}>
        {children}
      </Txt>
    </Pressable>
  );
}
export function Badge({
  children,
  tone = "primary",
}: React.PropsWithChildren<{ tone?: "primary" | "accent" | "soft" }>) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        borderRadius: 8,
        paddingHorizontal: 9,
        paddingVertical: 5,
        backgroundColor:
          tone === "soft"
            ? t.soft
            : tone === "primary"
              ? t.brandBlue
              : t.accent,
      }}
    >
      <Txt
        size={10}
        weight="bold"
        color={
          tone === "soft" ? t.ink : tone === "primary" ? t.onBrand : t.onAccent
        }
        style={{ letterSpacing: 1.2 }}
      >
        {children}
      </Txt>
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 7, flexGrow: 1 }}>
      <Txt size={13} weight="bold">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={[
          {
            minHeight: 50,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 14,
            padding: 14,
            color: t.ink,
            fontSize: 15,
            fontFamily: "DMSans_400Regular",
            backgroundColor: t.surface,
          },
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  action,
  scrollEnabled = true,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  scrollEnabled?: boolean;
}>) {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: t.background }}
    >
      <ScrollView
        scrollEnabled={scrollEnabled}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
          gap: 20,
          width: "100%",
          maxWidth: 850,
          alignSelf: "center",
        }}
      >
        <Entrance>
          <Row
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt size={28} weight="display">
                {title}
              </Txt>
              {subtitle ? <Txt color={t.muted}>{subtitle}</Txt> : null}
            </View>
            {action}
          </Row>
        </Entrance>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 32 }}>
      <View style={{ backgroundColor: t.soft, padding: 16, borderRadius: 20 }}>
        <Icon name="play" size={28} />
      </View>
      <Txt size={22} weight="display">
        {title}
      </Txt>
      <Txt color={t.muted} style={{ textAlign: "center", maxWidth: 360 }}>
        {body}
      </Txt>
      {action}
    </Card>
  );
}
export const layout = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  section: { gap: 12 },
});
