import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, View, useWindowDimensions } from "react-native";
import { Txt } from "./ui";
import { useTheme } from "./theme";
import { videoAreaHeight } from "../core/editing";

export function VideoArea({
  children,
  onDragging,
  fullscreen = false,
  minHeight = 150,
  maxHeight,
}: {
  children: ReactNode;
  onDragging: (active: boolean) => void;
  fullscreen?: boolean;
  minHeight?: number;
  maxHeight?: number;
}) {
  const t = useTheme();
  const { height: viewport } = useWindowDimensions();
  const [requested, setRequested] = useState(270);
  const height = Math.max(
    minHeight,
    Math.min(videoAreaHeight(requested, viewport), maxHeight ?? Infinity),
  );
  const live = useRef({ height, viewport, onDragging });
  useLayoutEffect(() => {
    live.current = { height, viewport, onDragging };
  }, [height, viewport, onDragging]);
  const origin = useRef(270);
  // PanResponder stores these event callbacks; refs are read only when a gesture runs.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origin.current = live.current.height;
        live.current.onDragging(true);
      },
      onPanResponderMove: (_, gesture) =>
        setRequested(
          videoAreaHeight(origin.current + gesture.dy, live.current.viewport),
        ),
      onPanResponderRelease: () => live.current.onDragging(false),
      onPanResponderTerminate: () => live.current.onDragging(false),
      onPanResponderTerminationRequest: () => false,
    }),
  );
  return (
    <View style={fullscreen ? { flex: 1 } : undefined}>
      <View
        testID="video-frame"
        style={{
          backgroundColor: "#080D18",
          height: fullscreen ? undefined : height,
          flex: fullscreen ? 1 : undefined,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
      <View
        {...responder.panHandlers}
        {...{
          tabIndex: 0,
          onKeyDown: (event: { key?: string; preventDefault: () => void }) => {
            if (
              ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(
                event.key ?? "",
              )
            ) {
              event.preventDefault();
              setRequested(
                videoAreaHeight(
                  height +
                    (["ArrowUp", "ArrowRight"].includes(event.key ?? "")
                      ? 40
                      : -40),
                  viewport,
                ),
              );
            }
          },
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Resize video area"
        accessibilityValue={{
          min: minHeight,
          max: Math.max(
            minHeight,
            Math.min(700, viewport * 0.75, maxHeight ?? Infinity),
          ),
          now: Math.round(height),
          text: `${Math.round(height)} pixels tall`,
        }}
        accessibilityActions={[
          { name: "increment", label: "Make video taller" },
          { name: "decrement", label: "Make video shorter" },
        ]}
        onAccessibilityAction={(event) =>
          setRequested(
            videoAreaHeight(
              height +
                (event.nativeEvent.actionName === "increment" ? 40 : -40),
              viewport,
            ),
          )
        }
        style={{
          minHeight: 44,
          display: fullscreen ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          backgroundColor: t.surface,
        }}
      >
        <View
          style={{
            width: 44,
            height: 4,
            borderRadius: 4,
            backgroundColor: t.muted,
          }}
        />
        <Txt size={11} color={t.muted}>
          Drag to resize video
        </Txt>
      </View>
    </View>
  );
}
