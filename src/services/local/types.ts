import type { Library } from "../../core/types";

export type LocalProfile = {
  id: string;
  name: string;
  origin: "device" | "previous-account";
  createdAt: string;
};
export type Checkpoint = { id: string; name: string; createdAt: string };
export interface LocalRepository {
  profiles(): Promise<LocalProfile[]>;
  addProfile(profile: LocalProfile, library: Library): Promise<void>;
  read(profileId: string): Promise<Library>;
  write(profileId: string, library: Library): Promise<void>;
  getState<T>(key: string): Promise<T | null>;
  setState(key: string, value: unknown): Promise<void>;
  checkpoint(profileId: string, name: string, library: Library): Promise<void>;
  checkpoints(profileId: string): Promise<Checkpoint[]>;
  readCheckpoint(profileId: string, id: string): Promise<Library>;
}
