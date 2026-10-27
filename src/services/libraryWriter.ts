import { ensureDailyPick } from "../core/recommendations";
import { normalizeSourceTitles } from "../core/numbering";
import { emptyLibrary, type Library } from "../core/types";
import { libraryLabels } from "../core/labels";
// Every mutation has one serialized durable write. commit rejects on write failure
// so callers never delete a phone file before its online reference is saved.
export function createLibraryWriter(
  persist: (library: Library) => Promise<void>,
  changed: (library: Library) => void,
  failed: () => void,
) {
  let current = emptyLibrary(),
    tail = Promise.resolve(),
    closed = false;
  const apply = (action: (l: Library) => Library) => {
    if (closed)
      return Promise.reject(new Error("This device library is closing."));
    const previous = current;
    const edited = action(current);
    const next = ensureDailyPick(
      normalizeSourceTitles({ ...edited, labels: libraryLabels(edited) }),
    );
    current = next;
    changed(next);
    const write = tail.then(() => persist(next));
    tail = write.catch(() => {
      failed();
    });
    return write
      .then(() => next)
      .catch((error) => {
        // No newer edit depends on this state: restore its saved references for retry.
        if (current === next) {
          current = previous;
          changed(previous);
        }
        throw error;
      });
  };
  return {
    get: () => current,
    hydrate: (library: Library) => {
      current = normalizeSourceTitles(library);
      changed(current);
    },
    update: (action: (l: Library) => Library) => {
      void apply(action).catch(() => {});
    },
    commit: apply,
    close: async () => {
      closed = true;
      await tail;
    },
  };
}
