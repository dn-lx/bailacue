import { openDatabaseAsync } from "expo-sqlite";
import { createSqliteRepository } from "./sqliteRepository";
import type { LocalRepository } from "./types";
let opening: Promise<LocalRepository> | undefined;
export function openLocalRepository() {
  if (!opening) {
    opening = openDatabaseAsync("bailacue-library.db").then(
      createSqliteRepository,
    );
    opening.catch(() => {
      opening = undefined;
    });
  }
  return opening;
}
