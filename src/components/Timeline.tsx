import { useLayoutEffect, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { useTheme } from "./theme";
import { formatTime } from "../core/practice";
import { moveTrimHandle, type TrimRange } from "../core/editing";
export type TimelineProps = {
  duration: number;
  position: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
  trim?: TrimRange & {
    onChange: (range: TrimRange, edge: "start" | "end") => void;
  };
  onDragging?: (active: boolean) => void;
};
function TrimHandle({
  edge,
  width,
  duration,
  trim,
  disabled,
  onDragging,
}: {
  edge: "start" | "end";
  width: number;
  duration: number;
  trim: NonNullable<TimelineProps["trim"]>;
  disabled: boolean;
  onDragging?: TimelineProps["onDragging"];
}) {
  const t = useTheme();
  const live = useRef({ width, duration, trim, onDragging, disabled });
  useLayoutEffect(() => {
    live.current = { width, duration, trim, onDragging, disabled };
  }, [width, duration, trim, onDragging, disabled]);
  const origin = useRef(trim[edge]);
  // PanResponder stores these event callbacks; refs are read only when a gesture runs.
  // eslint-disable-next-line react-hooks/refs
  const [drag] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      onPanResponderGrant: () => {
        origin.current = live.current.trim[edge];
        live.current.onDragging?.(true);
      },
      onPanResponderMove: (_, gesture) => {
        const state = live.current;
        state.trim.onChange(
          moveTrimHandle(
            state.duration,
            state.trim,
            edge,
            origin.current +
              (gesture.dx / Math.max(1, state.width)) * state.duration,
          ),
          edge,
        );
      },
      onPanResponderRelease: () => live.current.onDragging?.(false),
      onPanResponderTerminate: () => live.current.onDragging?.(false),
      onPanResponderTerminationRequest: () => false,
    }),
  );
  return (
    <View
      {...drag.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Trim ${edge}`}
      accessibilityState={{ disabled }}
      accessibilityValue={{
        min: 0,
        max: Math.round(duration * 1000),
        now: Math.round(trim[edge] * 1000),
        text: `${trim[edge].toFixed(2)} seconds`,
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (!disabled)
          trim.onChange(
            moveTrimHandle(
              duration,
              trim,
              edge,
              trim[edge] +
                (event.nativeEvent.actionName === "increment" ? 0.1 : -0.1),
            ),
            edge,
          );
      }}
      style={{
        position: "absolute",
        left: Math.max(0, Math.min(1, trim[edge] / (duration || 1))) * width,
        top: 0,
        height: 48,
        width: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 12,
          height: 34,
          borderRadius: 4,
          backgroundColor: t.accent,
          borderWidth: 2,
          borderColor: t.ink,
        }}
      />
    </View>
  );
}
export default function Timeline({
  duration,
  position,
  disabled,
  onSeek,
  trim,
  onDragging,
}: TimelineProps) {
  const t = useTheme();
  const [outerWidth, setWidth] = useState(45);
  const inset = trim ? 22 : 0;
  const width = Math.max(1, outerWidth - inset * 2);
  const change = (seconds: number) =>
    onSeek(Math.max(0, Math.min(duration, seconds)));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: 48 }}
    >
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Video position"
        accessibilityState={{ disabled }}
        disabled={disabled}
        accessibilityValue={{
          min: 0,
          max: Math.ceil(duration * 1000),
          now: Math.floor(position * 1000),
          text: `${formatTime(position)} of ${formatTime(duration)}`,
        }}
        accessibilityActions={[
          { name: "increment", label: "Forward five seconds" },
          { name: "decrement", label: "Back five seconds" },
        ]}
        onAccessibilityAction={(event) =>
          change(
            position + (event.nativeEvent.actionName === "increment" ? 5 : -5),
          )
        }
        onPress={(event) =>
          change(((event.nativeEvent.locationX - inset) / width) * duration)
        }
        style={{
          height: 48,
          justifyContent: "center",
          paddingHorizontal: inset,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            height: 8,
            borderRadius: 6,
            backgroundColor: t.soft,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 8,
              width: `${Math.max(0, Math.min(100, (position / (duration || 1)) * 100))}%`,
              backgroundColor: t.primary,
            }}
          />
          {trim ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (trim.start / (duration || 1)) * width,
                width: ((trim.end - trim.start) / (duration || 1)) * width,
                backgroundColor: t.accent,
                opacity: 0.65,
              }}
            />
          ) : null}
        </View>
      </Pressable>
      {trim
        ? (["start", "end"] as const).map((edge) => (
            <TrimHandle
              key={edge}
              {...{ edge, width, duration, trim, disabled, onDragging }}
            />
          ))
        : null}
    </View>
  );
}
