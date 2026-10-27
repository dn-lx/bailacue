import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { openLocalRepository } from "../local/repository";
import { syncSheet, stateKey, type SheetSyncState } from "./sync";
const TASK = "bailacue-spreadsheet-sync";
TaskManager.defineTask(TASK, async () => {
  try {
    const repository = await openLocalRepository();
    for (const profile of await repository.profiles()) {
      const state = await repository.getState<SheetSyncState>(
        stateKey(profile.id),
      );
      if (!state?.enabled) continue;
      const library = await repository.read(profile.id);
      await syncSheet({
        repository,
        profileId: profile.id,
        get: () => library,
      });
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
export async function configureBackgroundSync(enabled: boolean) {
  if (enabled) {
    if (
      (await BackgroundTask.getStatusAsync()) !==
      BackgroundTask.BackgroundTaskStatus.Available
    )
      return false;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    return true;
  }
  if (await TaskManager.isTaskRegisteredAsync(TASK))
    await BackgroundTask.unregisterTaskAsync(TASK);
  return false;
}
