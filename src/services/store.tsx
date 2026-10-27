import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { emptyLibrary, type Library, type Video } from "../core/types";
import { createLibraryWriter } from "./libraryWriter";
import { vault } from "./cloud/vault";
import { openLocalRepository } from "./local/repository";
import { migrateDeviceLibraries } from "./local/migration";
import type { LocalProfile, LocalRepository } from "./local/types";
type Store = {
  library: Library;
  ready: boolean;
  error: string;
  profiles: LocalProfile[];
  profileId: string;
  repository: LocalRepository | null;
  selectProfile: (id: string) => Promise<void>;
  retryInitialization: () => void;
  update: (action: (l: Library) => Library) => void;
  getLibrary: () => Library;
  commit: (action: (l: Library) => Library) => Promise<Library>;
  updateVideo: (id: string, changes: Partial<Video>) => void;
};
const Context = createContext<Store | null>(null);
export function LibraryProvider({ children }: React.PropsWithChildren) {
  const [boot, setBoot] = useState<{
    repository: LocalRepository;
    profiles: LocalProfile[];
    profileId: string;
  }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retryInitialization = () => {
    setError("");
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const repository = await openLocalRepository();
      const migrated = await migrateDeviceLibraries(repository, {
        keys: () => AsyncStorage.getAllKeys(),
        get: (key) => AsyncStorage.getItem(key),
        lastSession: () => vault.get("app-session"),
        retireSession: () => vault.remove("app-session"),
      });
      if (!cancelled)
        setBoot({
          repository,
          profiles: migrated.profiles,
          profileId: migrated.activeProfileId,
        });
    })().catch((e) => {
      if (!cancelled)
        setError(
          "Your saved library could not be opened. Its original records and video files are kept. " +
            (e as Error).message,
        );
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  if (boot)
    return (
      <ProfileScope
        key={boot.profileId}
        {...boot}
        retryInitialization={retryInitialization}
        onSelect={(profileId) => setBoot({ ...boot, profileId })}
      >
        {children}
      </ProfileScope>
    );
  return (
    <Context.Provider
      value={{
        library: emptyLibrary(),
        ready: false,
        error,
        profiles: [],
        profileId: "",
        repository: null,
        retryInitialization,
        selectProfile: async () => {},
        update: () => {},
        getLibrary: emptyLibrary,
        commit: async () => {
          throw new Error("Your library is still opening.");
        },
        updateVideo: () => {},
      }}
    >
      {children}
    </Context.Provider>
  );
}
function ProfileScope({
  children,
  repository,
  profileId,
  profiles,
  onSelect,
  retryInitialization,
}: React.PropsWithChildren<{
  repository: LocalRepository;
  profileId: string;
  profiles: LocalProfile[];
  onSelect: (id: string) => void;
  retryInitialization: () => void;
}>) {
  const [library, setLibrary] = useState(emptyLibrary);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [writer] = useState(() =>
    createLibraryWriter(
      (next) => repository.write(profileId, next),
      setLibrary,
      () =>
        setError(
          "Changes could not be saved. Free some device storage and try again. Your last saved version is kept.",
        ),
    ),
  );
  useEffect(() => {
    let cancelled = false;
    repository
      .read(profileId)
      .then((saved) => {
        if (cancelled) return;
        writer.hydrate(saved);
        setReady(true);
        setError("");
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            "Your library could not be opened. Your files are kept. " +
              (e as Error).message,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, repository, writer, attempt]);
  const update = writer.update;
  const updateVideo = useCallback(
    (id: string, changes: Partial<Video>) =>
      update((l) => ({
        ...l,
        videos: l.videos.map((v) => (v.id === id ? { ...v, ...changes } : v)),
      })),
    [update],
  );
  return (
    <Context.Provider
      value={{
        library,
        ready,
        error,
        profiles,
        profileId,
        repository,
        retryInitialization: () => {
          retryInitialization();
          setAttempt((n) => n + 1);
        },
        update,
        updateVideo,
        getLibrary: writer.get,
        commit: writer.commit,
        selectProfile: async (id) => {
          if (id === profileId) return;
          if (!profiles.some((p) => p.id === id))
            throw new Error("Choose one of this phone's libraries.");
          await repository.read(id);
          await repository.setState("active-library", id);
          await writer.close();
          onSelect(id);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLibrary() {
  const context = useContext(Context);
  if (!context) throw new Error("LibraryProvider is missing.");
  return context;
}
