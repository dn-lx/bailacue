import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useLibrary } from "../services/store";
import {
  stateKey,
  syncSheet,
  type SheetSyncState,
} from "../services/sheets/sync";
import { configureBackgroundSync } from "../services/sheets/background";
/** Foreground polling also observes changes made in Sheets on another device. */
export function SheetSync() {
  const { ready, repository, profileId, library, getLibrary, commit } =
    useLibrary();
  const lastAttempt = useRef(0);
  useEffect(() => {
    if (!ready || !repository) return;
    let closed = false;
    async function run() {
      if (
        closed ||
        AppState.currentState === "background" ||
        Date.now() - lastAttempt.current < 15000
      )
        return;
      lastAttempt.current = Date.now();
      const state = await repository!.getState<SheetSyncState>(
        stateKey(profileId),
      );
      if (state?.enabled)
        await syncSheet({
          repository: repository!,
          profileId,
          get: getLibrary,
          commit,
        });
    }
    const start = setTimeout(() => void run().catch(() => {}), 3000);
    const poll = setInterval(() => void run().catch(() => {}), 45000);
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void run().catch(() => {});
    });
    return () => {
      closed = true;
      clearTimeout(start);
      clearInterval(poll);
      listener.remove();
    };
  }, [ready, repository, profileId, library, getLibrary, commit]);
  useEffect(() => {
    if (!ready || !repository) return;
    void (async () => {
      const profiles = await repository.profiles();
      const states = await Promise.all(
        profiles.map((p) =>
          repository.getState<SheetSyncState>(stateKey(p.id)),
        ),
      );
      await configureBackgroundSync(states.some((s) => s?.enabled));
    })().catch(() => {});
  }, [ready, repository]);
  return null;
}
