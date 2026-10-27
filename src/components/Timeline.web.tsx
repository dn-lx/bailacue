import type { CSSProperties } from "react";
import type { TimelineProps } from "./Timeline";
import { useTheme } from "./theme";
import { formatTime } from "../core/practice";
import { moveTrimHandle } from "../core/editing";
export default function Timeline({
  duration,
  position,
  disabled,
  onSeek,
  trim,
}: TimelineProps) {
  const t = useTheme();
  const handleStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: 44,
    margin: 0,
    background: "transparent",
    pointerEvents: "none",
    appearance: "none",
  };
  return (
    <div
      style={{ position: "relative", height: 48, paddingInline: trim ? 22 : 0 }}
    >
      <input
        type="range"
        aria-label="Video position"
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(duration, Math.max(0, position))}
        disabled={disabled}
        onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
        style={{
          width: "100%",
          height: 44,
          minHeight: 44,
          margin: 0,
          accentColor: t.primary,
          colorScheme: t.dark ? "dark" : "light",
          cursor: disabled ? "wait" : "pointer",
        }}
      />
      {trim ? (
        <div
          style={{
            position: "absolute",
            left: 22,
            right: 22,
            top: 0,
            height: 44,
            pointerEvents: "none",
          }}
        >
          <style>{`.bailacue-trim::-webkit-slider-thumb { appearance: none; pointer-events: auto; cursor: ew-resize; width: 16px; height: 38px; border-radius: 4px; border: 2px solid ${t.ink}; background: ${t.accent}; } .bailacue-trim::-moz-range-thumb { pointer-events: auto; cursor: ew-resize; width: 16px; height: 38px; border-radius: 4px; border: 2px solid ${t.ink}; background: ${t.accent}; }`}</style>
          <div
            style={{
              position: "absolute",
              top: 19,
              height: 6,
              left: `${(trim.start / (duration || 1)) * 100}%`,
              width: `${((trim.end - trim.start) / (duration || 1)) * 100}%`,
              background: t.accent,
              opacity: 0.65,
            }}
          />
          {(["start", "end"] as const).map((edge) => (
            <input
              key={edge}
              className="bailacue-trim"
              type="range"
              aria-label={`Trim ${edge}`}
              aria-valuetext={`${trim[edge].toFixed(2)} seconds`}
              min={0}
              max={duration}
              step={0.01}
              value={trim[edge]}
              disabled={disabled}
              onChange={(event) =>
                trim.onChange(
                  moveTrimHandle(
                    duration,
                    trim,
                    edge,
                    event.currentTarget.valueAsNumber,
                  ),
                  edge,
                )
              }
              style={handleStyle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
