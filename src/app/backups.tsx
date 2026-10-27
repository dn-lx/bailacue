import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  Screen,
  Txt,
  layout,
} from "../components/ui";
import { View } from "react-native";
import { mergeBackup, type BackupEnvelope } from "../core/backups";
import { parseFolder } from "../core/sources";
import type { CloudFolder } from "../core/types";
import { provider } from "../services/cloud/provider";
import { metadataSnapshot } from "../core/sync";
import { backupFileName, makeBackup, parseBackup } from "../services/backup";
import { exportBackupFile, pickBackupFile } from "../services/backupFiles";
import {
  listCloudBackups,
  readCloudBackup,
  saveCloudBackup,
  type CloudBackupFile,
} from "../services/cloud/backup";
import type { Checkpoint } from "../services/local/types";
import { useLibrary } from "../services/store";
export default function Backups() {
  const {
    library,
    getLibrary,
    commit,
    repository,
    profileId,
    profiles,
    selectProfile,
  } = useLibrary();
  const [sourceId, setSourceId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupEnvelope>();
  const [files, setFiles] = useState<CloudBackupFile[]>([]);
  const [points, setPoints] = useState<Checkpoint[]>([]);
  const [mode, setMode] = useState<"missing" | "backup">("missing");
  const [backupFolder, setBackupFolder] = useState<CloudFolder>();
  const [accountId, setAccountId] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void repository
      ?.getState<CloudFolder>("backup-folder:" + profileId)
      .then((folder) => {
        if (folder) {
          setBackupFolder(folder);
          setSourceId(folder.id);
        }
      });
  }, [repository, profileId]);
  useEffect(() => {
    void repository?.checkpoints(profileId).then(setPoints);
  }, [repository, profileId, preview]);
  const source =
    sourceId === backupFolder?.id
      ? backupFolder
      : library.sources.find((s) => s.id === sourceId);
  const selectedAccount = library.connections.find((c) => c.id === accountId);
  const connection = library.connections.find(
    (c) => c.id === source?.connectionId,
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Backups & recovery"
      subtitle="Your library on this phone. Recovery copies in storage you choose."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Done
        </Button>
      }
    >
      {notice ? (
        <Card>
          <Txt accessibilityRole="alert">{notice}</Txt>
        </Card>
      ) : null}
      <Card>
        <Txt size={21} weight="display">
          Saved on your device
        </Txt>
        <Txt>
          SQLite keeps videos’ labels, ratings, notes and settings on this
          phone. No BailaCue account is needed. A backup contains metadata; keep
          your original video files too.
        </Txt>
        {profiles.length > 1 ? (
          <>
            <Txt weight="bold">Separate recovered libraries</Txt>
            {profiles.map((p) => (
              <Button
                key={p.id}
                variant={profileId === p.id ? "primary" : "soft"}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await selectProfile(p.id);
                    router.replace("/");
                  })
                }
              >
                {p.name}
              </Button>
            ))}
            <Txt>
              Old account libraries remain separate. Switching opens Today and
              does not erase any library.
            </Txt>
          </>
        ) : null}
        <Button
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const b = await makeBackup(getLibrary());
              await exportBackupFile(backupFileName(b), JSON.stringify(b));
              setNotice(
                "Backup prepared. Keep it in a safe folder using your phone’s sharing options.",
              );
            })
          }
        >
          Export backup file
        </Button>
        <Button
          variant="soft"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const raw = await pickBackupFile();
              if (raw) {
                setPreview(await parseBackup(raw));
                setMode("missing");
              }
            })
          }
        >
          Import backup file
        </Button>
        <Button variant="soft" onPress={() => router.push("/sheets")}>
          Google Sheets sync
        </Button>
        <Button variant="ghost" onPress={() => router.push("/labels")}>
          Manage labels
        </Button>
      </Card>
      <Card>
        <Txt size={21} weight="display">
          A recovery folder you own
        </Txt>
        <Txt>
          Choose a connected Drive or Dropbox folder. Each save creates a
          separate dated backup. Video files and sign-in credentials are
          excluded.
        </Txt>
        <View style={layout.wrap}>
          {library.sources.map((s) => (
            <Chip
              key={s.id}
              selected={sourceId === s.id}
              onPress={() => {
                setSourceId(s.id);
                setFiles([]);
              }}
            >
              {s.name} · {s.provider === "dropbox" ? "Dropbox" : "Drive"}
            </Chip>
          ))}
        </View>
        <Button variant="ghost" onPress={() => router.push("/storage")}>
          Connect or choose folders
        </Button>
        <Txt weight="bold">
          {source
            ? "Selected: " + source.name
            : "Choose a folder above, or connect a separate metadata folder below."}
        </Txt>
        {backupFolder ? (
          <Chip
            selected={sourceId === backupFolder.id}
            onPress={() => setSourceId(backupFolder.id)}
          >
            {backupFolder.name} · recovery folder
          </Chip>
        ) : null}
        <Txt weight="bold">Separate metadata folder</Txt>
        <Txt>
          This folder is used only for backups. Its contents do not become video
          sources or Daily Picks.
        </Txt>
        <View style={layout.wrap}>
          {library.connections
            .filter((c) => c.connected)
            .map((c) => (
              <Chip
                key={c.id}
                selected={accountId === c.id}
                onPress={() => {
                  setAccountId(c.id);
                  setFolders([]);
                }}
              >
                {c.email || c.name}
              </Chip>
            ))}
        </View>
        <Field
          label="Metadata folder link or path"
          value={folderInput}
          onChangeText={setFolderInput}
          autoCapitalize="none"
          placeholder="Drive folder link or Dropbox /folder"
        />
        <Button
          variant="soft"
          disabled={busy || !selectedAccount}
          onPress={() =>
            void run(async () => {
              if (selectedAccount)
                setFolders(await provider(selectedAccount).folders());
            })
          }
        >
          Browse metadata folders
        </Button>
        {folders.map((folder) => (
          <Button
            key={folder.id}
            variant="ghost"
            onPress={() => setFolderInput(folder.id)}
          >
            {folder.name}
          </Button>
        ))}
        <Button
          variant="soft"
          disabled={busy || !selectedAccount || !folderInput.trim()}
          onPress={() =>
            void run(async () => {
              if (!selectedAccount || !repository) return;
              const folderId = parseFolder(
                selectedAccount.provider,
                folderInput,
              );
              const info =
                await provider(selectedAccount).inspectFolder(folderId);
              const folder: CloudFolder = {
                id: "backup:" + selectedAccount.id + ":" + folderId,
                connectionId: selectedAccount.id,
                provider: selectedAccount.provider,
                folderId,
                name: info.name,
                defaultStyle: "",
                defaultLabels: [],
                writable: info.writable,
              };
              await repository.setState("backup-folder:" + profileId, folder);
              setBackupFolder(folder);
              setSourceId(folder.id);
              setFiles([]);
              setNotice("Metadata recovery folder selected.");
            })
          }
        >
          Use this metadata folder
        </Button>
        <Button
          disabled={busy || !source || !connection}
          onPress={() =>
            void run(async () => {
              if (!source || !connection) return;
              const b = await makeBackup(getLibrary());
              await saveCloudBackup(
                connection,
                source,
                backupFileName(b),
                JSON.stringify(b),
              );
              setNotice("Recovery copy saved to " + source.name + ".");
              setFiles(await listCloudBackups(connection, source));
            })
          }
        >
          Save backup to selected folder
        </Button>
        <Button
          variant="soft"
          disabled={busy || !source || !connection}
          onPress={() =>
            void run(async () => {
              if (source && connection)
                setFiles(await listCloudBackups(connection, source));
            })
          }
        >
          Find recovery copies
        </Button>
        {files.slice(0, 50).map((file) => (
          <Button
            key={file.id}
            variant="ghost"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (source && connection) {
                  setPreview(
                    await parseBackup(
                      await readCloudBackup(connection, source, file),
                    ),
                  );
                  setMode("missing");
                }
              })
            }
          >
            Review {file.name}
          </Button>
        ))}
      </Card>
      {preview ? (
        <Card>
          <Txt size={21} weight="display">
            Review recovery
          </Txt>
          <Txt>
            {preview.library.videos.length} videos ·{" "}
            {preview.library.labels?.length ?? 0} labels ·{" "}
            {preview.library.playlists.length} collections
          </Txt>
          <Txt>
            Saved {new Date(preview.createdAt).toLocaleString()}. Phone copies
            are preserved. Cloud accounts may need reconnecting; local video
            files need to be present on this phone.
          </Txt>
          <View style={layout.wrap}>
            <Chip
              selected={mode === "missing"}
              onPress={() => setMode("missing")}
            >
              Add missing items
            </Chip>
            <Chip
              selected={mode === "backup"}
              onPress={() => setMode("backup")}
            >
              Use backup’s matching metadata
            </Chip>
          </View>
          <Button
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (!repository) return;
                await repository.checkpoint(
                  profileId,
                  "Before recovery",
                  getLibrary(),
                );
                await commit((l) => mergeBackup(preview.library, l, mode));
                setPreview(undefined);
                setNotice(
                  "Recovery saved on this phone. Your previous library is kept as a recovery point.",
                );
                setPoints(await repository.checkpoints(profileId));
              })
            }
          >
            Confirm recovery
          </Button>
          <Button variant="ghost" onPress={() => setPreview(undefined)}>
            Cancel recovery
          </Button>
        </Card>
      ) : null}
      {points.length ? (
        <Card>
          <Txt size={21} weight="display">
            Recent phone recovery points
          </Txt>
          {points.map((point) => (
            <Button
              key={point.id}
              variant="soft"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!repository) return;
                  const saved = await repository.readCheckpoint(
                    profileId,
                    point.id,
                  );
                  const b = await makeBackup(saved);
                  setPreview({ ...b, library: metadataSnapshot(saved) });
                  setMode("backup");
                })
              }
            >
              {point.name} · {new Date(point.createdAt).toLocaleString()}
            </Button>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
