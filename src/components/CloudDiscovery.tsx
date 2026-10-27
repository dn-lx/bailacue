import { useEffect } from "react";
import { AppState } from "react-native";
import { useLibrary } from "../services/store";
import { scanSource } from "../services/cloud/scan";
const INTERVAL = 5 * 60 * 1000;
// Foreground polling, not a background/push promise. Manual Refresh always scans.
export function CloudDiscovery() {
  const { library, getLibrary, commit } = useLibrary();
  const identities =
    library.sources.map((s) => `${s.id}:${s.connectionId}`).join(",") +
    library.connections
      .map((c) => `${c.id}:${c.connected}:${c.writable}`)
      .join(",");
  useEffect(() => {
    let stopped = false;
    const refresh = async (force = false) => {
      if (AppState.currentState !== "active") return;
      for (const source of getLibrary().sources) {
        if (stopped) return;
        if (
          !getLibrary().connections.some(
            (c) => c.id === source.connectionId && c.connected,
          )
        )
          continue;
        if (
          !force &&
          source.lastSyncedAt &&
          Date.now() - Date.parse(source.lastSyncedAt) < INTERVAL &&
          source.numbering
        )
          continue;
        try {
          await scanSource({ getLibrary, commit }, source.id);
        } catch (error) {
          if (!stopped)
            await commit((l) => ({
              ...l,
              sources: l.sources.map((s) =>
                s.id === source.id
                  ? { ...s, error: (error as Error).message }
                  : s,
              ),
            })).catch(() => {});
        }
      }
    };
    void refresh(true);
    const timer = setInterval(() => void refresh(), INTERVAL);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh(true);
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [getLibrary, commit, identities]);
  return null;
}
