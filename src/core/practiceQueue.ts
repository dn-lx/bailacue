import { effectiveRating } from "./ratings";
import { matchesLabels } from "./labels";
import { videoInSource } from "./library";
import { uid, type Library } from "./types";

export type PracticePreferences = {
  minutes: number;
  breakMinutes: number;
  styles: string[];
  sourceIds: string[];
  labels: string[];
  labelMatch: "any" | "all";
  minRating: number;
  offlineOnly: boolean;
  includeYouTube?: boolean;
};
export type ActivePractice = {
  id: string;
  startedAt: string;
  preferences: PracticePreferences;
  queue: string[];
  index: number;
  visited: string[];
  remainingMs: number;
  activeMs: number;
  stage: "focus" | "break" | "complete";
  running: boolean;
  cycle: number;
  position: number;
  playbackEpoch?: number;
};
export function practiceDefaults(l: Library): PracticePreferences {
  return {
    minutes: 10,
    breakMinutes: 2,
    styles: l.preferences.styles,
    sourceIds: [],
    labels: [],
    labelMatch: "any",
    minRating: 1,
    offlineOnly: false,
    includeYouTube: false,
    ...l.practicePreferences,
  };
}
/** Weighted permutation without replacement; round-robin across dance types. */
export function practiceQueue(
  library: Library,
  p: PracticePreferences,
  random: () => number = Math.random,
): string[] {
  const groups = new Map<string, { id: string; weight: number }[]>();
  for (const v of library.videos) {
    if (
      !v.available ||
      (v.youtube && (!p.includeYouTube || !v.youtube.embedAllowed)) ||
      (p.styles.length && !p.styles.includes(v.style)) ||
      effectiveRating(v) < p.minRating ||
      !matchesLabels(v.labels, p.labels, p.labelMatch)
    )
      continue;
    if (
      p.offlineOnly &&
      v.source !== "device" &&
      !(v.offlineUri && v.storagePreference === "offline")
    )
      continue;
    if (p.sourceIds.length && !p.sourceIds.some((id) => videoInSource(v, id)))
      continue;
    const bucket = groups.get(v.style) ?? [];
    if (!bucket.some((x) => x.id === v.id))
      bucket.push({ id: v.id, weight: effectiveRating(v) });
    groups.set(v.style, bucket);
  }
  const result: string[] = [];
  while ([...groups.values()].some((g) => g.length)) {
    for (const group of groups.values()) {
      if (!group.length) continue;
      let draw =
        Math.min(0.999999999, Math.max(0, random())) *
        group.reduce((sum, x) => sum + x.weight, 0);
      let index = group.length - 1;
      for (let i = 0; i < group.length; i++) {
        draw -= group[i].weight;
        if (draw < 0) {
          index = i;
          break;
        }
      }
      result.push(group.splice(index, 1)[0].id);
    }
  }
  return result;
}
export function beginPractice(
  l: Library,
  p: PracticePreferences,
  random?: () => number,
): ActivePractice {
  const queue = practiceQueue(l, p, random);
  if (!queue.length)
    throw new Error(
      "No available videos match this practice. Adjust dances, labels, storage or minimum stars.",
    );
  return {
    id: uid(),
    startedAt: new Date().toISOString(),
    preferences: p,
    queue,
    index: 0,
    visited: [],
    remainingMs: p.minutes * 60000,
    activeMs: 0,
    stage: "focus",
    running: false,
    cycle: 1,
    position: 0,
  };
}
export function tickPractice(
  state: ActivePractice,
  elapsedMs: number,
  playing: boolean,
): ActivePractice {
  if (
    !state.running ||
    state.stage === "complete" ||
    (state.stage === "focus" && !playing)
  )
    return state;
  const delta = Math.min(Math.max(0, elapsedMs), state.remainingMs);
  const left = Math.max(0, state.remainingMs - delta);
  return {
    ...state,
    remainingMs: left,
    activeMs: state.activeMs + (state.stage === "focus" ? delta : 0),
    running: left > 0,
  };
}
export function savePractice(l: Library, state: ActivePractice): Library {
  const seconds = Math.floor(state.activeMs / 1000);
  return {
    ...l,
    activePractice: undefined,
    sessions:
      seconds > 0
        ? [
            {
              id: state.id,
              startedAt: state.startedAt,
              seconds,
              videoIds: state.visited,
            },
            ...l.sessions.filter((s) => s.id !== state.id),
          ]
        : l.sessions,
  };
}

export type PlaybackContext = {
  sessionId: string;
  epoch: number;
  index: number;
  videoId: string;
};
export function playbackContext(state: ActivePractice): PlaybackContext {
  return {
    sessionId: state.id,
    epoch: state.playbackEpoch ?? 0,
    index: state.index,
    videoId: state.queue[state.index] ?? "",
  };
}
export function matchesPlayback(
  state: ActivePractice | undefined,
  context: PlaybackContext,
): state is ActivePractice {
  return (
    !!state &&
    state.id === context.sessionId &&
    (state.playbackEpoch ?? 0) === context.epoch &&
    state.index === context.index &&
    state.queue[state.index] === context.videoId
  );
}
export function movePractice(
  state: ActivePractice,
  delta: number,
): { state: ActivePractice; exhausted: boolean } {
  const index = state.index + delta;
  if (index < 0) return { state, exhausted: false };
  if (index >= state.queue.length)
    return { state: { ...state, running: false }, exhausted: true };
  return {
    state: {
      ...state,
      index,
      position: 0,
      playbackEpoch: (state.playbackEpoch ?? 0) + 1,
    },
    exhausted: false,
  };
}
export function recordPlayback(
  state: ActivePractice,
  context: PlaybackContext,
  position: number,
  isPlaying: boolean,
): ActivePractice {
  if (!matchesPlayback(state, context)) return state;
  const id = state.queue[state.index];
  return {
    ...state,
    position: Number.isFinite(position)
      ? Math.max(0, position)
      : state.position,
    visited:
      isPlaying &&
      state.running &&
      state.stage === "focus" &&
      !state.visited.includes(id)
        ? [...state.visited, id]
        : state.visited,
  };
}

/** A fresh generator per preview calculation keeps metadata-only rerenders stable. */
export function practiceRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
