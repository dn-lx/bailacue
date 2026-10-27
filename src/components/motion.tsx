import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  type PressableProps,
} from "react-native";
const Reduced = createContext(true);
export function MotionProvider({ children }: React.PropsWithChildren) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return <Reduced.Provider value={reduced}>{children}</Reduced.Provider>;
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const reduced = useContext(Reduced),
    [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (reduced) {
      scale.stopAnimation();
      scale.setValue(1);
    }
  }, [reduced, scale]);
  const change = (value: number) => {
    if (!reduced)
      Animated.spring(scale, {
        toValue: value,
        speed: 36,
        bounciness: 0,
        useNativeDriver: true,
      }).start();
  };
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        setPressed(true);
        change(0.98);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        change(1);
        onPressOut?.(e);
      }}
      style={[
        typeof style === "function" ? style({ pressed }) : style,
        { transform: [{ scale }] },
      ]}
    />
  );
}
export function Entrance({ children }: React.PropsWithChildren) {
  const reduced = useContext(Reduced),
    [value] = useState(() => new Animated.Value(1));
  const animated = useRef(false);
  useEffect(() => {
    if (reduced) {
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    if (animated.current) return;
    animated.current = true;
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, value]);
  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function ProgressBar({
  value,
  color,
  trackColor,
  label,
}: {
  value: number;
  color: string;
  trackColor: string;
  label: string;
}) {
  const reduced = useContext(Reduced),
    target = Math.min(1, Math.max(0, value));
  const [progress] = useState(() => new Animated.Value(target));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (reduced) {
      progress.stopAnimation();
      progress.setValue(target);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: target,
      duration: 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [target, progress, reduced]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height: 8,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: trackColor,
      }}
    >
      <Animated.View
        style={{
          height: 8,
          width: "100%",
          borderRadius: 8,
          backgroundColor: color,
          transform: [
            {
              translateX: Animated.multiply(
                Animated.subtract(progress, 1),
                width / 2,
              ),
            },
            { scaleX: progress },
          ],
        }}
      />
    </Animated.View>
  );
}
