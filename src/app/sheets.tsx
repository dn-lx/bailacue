import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Switch, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  Field,
  Screen,
  Txt,
  layout,
} from "../components/ui";
import { mergeBackup, type BackupEnvelope } from "../core/backups";
import { metadataSnapshot } from "../core/sync";
import { emptyLibrary } from "../core/types";
import { makeBackup } from "../services/backup";
import { spreadsheetId, type SheetBook } from "../services/sheets/client";
import { titles } from "../services/sheets/codec";
import {
  clientFor,
  stateKey,
  syncSheet,
  type SheetSyncState,
} from "../services/sheets/sync";
import { configureBackgroundSync } from "../services/sheets/background";
import { useLibrary } from "../services/store";
export default function Sheets() {
  const { library, getLibrary, commit, repository, profileId } = useLibrary();
  const [state, setState] = useState<SheetSyncState>();
  const [connectionId, setConnectionId] = useState("");
  const [url, setUrl] = useState("");
  const [book, setBook] = useState<SheetBook>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [versions, setVersions] = useState<
    { id: string; savedAt: string; load: () => Promise<BackupEnvelope> }[]
  >([]);
  const [recovery, setRecovery] = useState<BackupEnvelope>();
  useEffect(() => {
    const load = () =>
      repository
        ?.getState<SheetSyncState>(stateKey(profileId))
        .then((value) => {
          setState(value ?? undefined);
          if (value) setConnectionId(value.connectionId);
        });
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [repository, profileId]);
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
  async function save(value: SheetSyncState) {
    if (!repository) return;
    await repository.setState(stateKey(profileId), value);
    setState(value);
    const states = await Promise.all(
      (await repository.profiles()).map((p) =>
        repository.getState<SheetSyncState>(stateKey(p.id)),
      ),
    );
    await configureBackgroundSync(states.some((s) => s?.enabled));
  }
  async function sync(choice?: "phone" | "sheet") {
    if (repository)
      setState(
        await syncSheet({
          repository,
          profileId,
          get: getLibrary,
          commit,
          choice,
          manual: true,
        }),
      );
  }
  async function connected(id: string, base: SheetSyncState["base"]) {
    await save({
      enabled: true,
      spreadsheetId: id,
      connectionId,
      base,
      pending: true,
      message: "Connected. Syncing your metadata…",
    });
    await sync();
    setBook(undefined);
  }
  const accounts = library.connections.filter(
    (c) => c.provider === "google-drive" && c.connected && c.writable,
  );
  return (
    <Screen
      title="Spreadsheet sync"
      subtitle="Labels, ratings, settings and recovery history in your own Google Sheet."
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
          Your library, recoverable
        </Txt>
        <Txt>
          Changes sync while BailaCue is open and when you return. Offline
          changes stay queued in SQLite. Background sync depends on your phone’s
          battery and scheduling settings; it cannot run continuously.
        </Txt>
        <Txt>
          Editable tabs: Labels, Config and video titles, dance, ratings and
          labels. Notes and other metadata are saved in recovery data. Each
          update keeps dated versions. Video files and credentials stay outside
          the spreadsheet.
        </Txt>
      </Card>
      {state?.spreadsheetId ? (
        <Card>
          <Txt size={21} weight="display">
            Connected spreadsheet
          </Txt>
          <Txt>{state.message ?? "Ready to sync"}</Txt>
          <Txt>
            Last successful sync:{" "}
            {state.lastSuccess
              ? new Date(state.lastSuccess).toLocaleString()
              : "Waiting for first sync"}
          </Txt>
          <Txt>
            {state.pending
              ? "Phone changes or spreadsheet updates are waiting."
              : "No changes waiting at the last check."}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Txt style={{ flex: 1 }}>Automatic sync</Txt>
            <Switch
              accessibilityLabel="Automatic spreadsheet sync"
              value={state.enabled}
              disabled={busy}
              onValueChange={(enabled) =>
                void run(async () => {
                  await save({ ...state, enabled });
                  if (enabled) await sync();
                })
              }
            />
          </View>
          <Button
            disabled={busy || !state.enabled}
            loading={busy}
            onPress={() => void run(() => sync())}
          >
            Sync now
          </Button>
          <Button
            variant="soft"
            onPress={() =>
              void Linking.openURL(
                "https://docs.google.com/spreadsheets/d/" + state.spreadsheetId,
              )
            }
          >
            Open spreadsheet
          </Button>
          {state.conflicts?.length ? (
            <>
              <Txt weight="bold">Review conflicting changes</Txt>
              <Txt>
                Both versions changed {state.conflicts.slice(0, 8).join(", ")}.
                Choose which conflicting values to keep. Other edits are
                combined and versions remain recoverable.
              </Txt>
              {state.conflictDetails?.map((detail) => (
                <View key={detail.field} style={{ gap: 4 }}>
                  <Txt weight="bold">{detail.field}</Txt>
                  <Txt>Phone: {detail.phone}</Txt>
                  <Txt>Spreadsheet: {detail.sheet}</Txt>
                </View>
              ))}
              <Button
                disabled={busy}
                onPress={() => void run(() => sync("phone"))}
              >
                Keep phone’s conflicting values
              </Button>
              <Button
                disabled={busy}
                variant="soft"
                onPress={() => void run(() => sync("sheet"))}
              >
                Keep spreadsheet’s conflicting values
              </Button>
            </>
          ) : null}
          <Button
            disabled={busy}
            variant="soft"
            onPress={() =>
              void run(async () => {
                setVersions(
                  await clientFor(getLibrary(), state.connectionId).history(
                    state.spreadsheetId,
                  ),
                );
              })
            }
          >
            Find spreadsheet recovery versions
          </Button>
          {versions.map((version) => (
            <Button
              key={version.id}
              variant="ghost"
              disabled={busy}
              onPress={() =>
                void run(async () => setRecovery(await version.load()))
              }
            >
              Review {new Date(version.savedAt).toLocaleString()}
            </Button>
          ))}
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await save({ ...state, enabled: false });
                setNotice(
                  "Automatic sync paused. The spreadsheet and all recovery versions are kept.",
                );
              })
            }
          >
            Pause sync
          </Button>
        </Card>
      ) : null}
      {recovery ? (
        <Card>
          <Txt size={21} weight="display">
            Recover saved metadata
          </Txt>
          <Txt>
            {recovery.library.videos.length} videos ·{" "}
            {recovery.library.labels?.length ?? 0} labels · saved{" "}
            {new Date(recovery.createdAt).toLocaleString()}. Matching metadata
            will use this version. Existing phone copies and current-only items
            are kept.
          </Txt>
          <Button
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (!repository) return;
                await repository.checkpoint(
                  profileId,
                  "Before spreadsheet recovery",
                  getLibrary(),
                );
                await commit((l) => mergeBackup(recovery.library, l, "backup"));
                setRecovery(undefined);
                setNotice(
                  "Recovery saved on your phone. The recovered metadata will sync next.",
                );
              })
            }
          >
            Confirm recovery
          </Button>
          <Button variant="ghost" onPress={() => setRecovery(undefined)}>
            Cancel
          </Button>
        </Card>
      ) : null}
      <Card>
        <Txt size={21} weight="display">
          {state?.spreadsheetId
            ? "Choose another destination"
            : "Connect a spreadsheet"}
        </Txt>
        <Txt>
          Google Drive write permission and Google Sheets API are required. Use
          a spreadsheet owned by an account you connect here. BailaCue creates
          six named tabs; other tabs are preserved.
        </Txt>
        <View style={layout.wrap}>
          {accounts.map((c) => (
            <Chip
              key={c.id}
              selected={connectionId === c.id}
              onPress={() => {
                setConnectionId(c.id);
                setBook(undefined);
              }}
            >
              {c.email || c.name}
            </Chip>
          ))}
        </View>
        {!accounts.length ? (
          <Txt>
            Connect Google Drive and allow uploads in Video storage first.
          </Txt>
        ) : null}
        <Button variant="ghost" onPress={() => router.push("/storage")}>
          Manage Google accounts
        </Button>
        <Button
          disabled={busy || !connectionId}
          onPress={() =>
            void run(async () => {
              const b = await makeBackup(getLibrary());
              const remote = await clientFor(getLibrary(), connectionId).create(
                b,
              );
              await connected(remote.book.spreadsheetId, b.library);
            })
          }
        >
          Create my BailaCue spreadsheet
        </Button>
        <Field
          label="Existing Google spreadsheet URL or ID"
          autoCapitalize="none"
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            setBook(undefined);
          }}
          placeholder="https://docs.google.com/spreadsheets/d/…"
        />
        <Button
          variant="soft"
          disabled={busy || !connectionId || !url.trim()}
          onPress={() =>
            void run(async () => {
              setBook(
                await clientFor(getLibrary(), connectionId).inspect(
                  spreadsheetId(url),
                ),
              );
            })
          }
        >
          Review spreadsheet
        </Button>
        {book ? (
          <>
            <Txt weight="bold">{book.properties.title}</Txt>
            <Txt>
              {book.sheets.some((s) =>
                titles.includes(s.properties.title as any),
              )
                ? "Existing BailaCue data will be read and compared with your phone. Conflicting changes require review."
                : "Add BailaCue tabs and a recovery copy of this phone’s library? Existing tabs are kept."}
            </Txt>
            <Button
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const client = clientFor(getLibrary(), connectionId);
                  if (
                    book.sheets.some((s) =>
                      titles.includes(s.properties.title as any),
                    )
                  ) {
                    await client.read(book.spreadsheetId);
                    await connected(
                      book.spreadsheetId,
                      metadataSnapshot(emptyLibrary()),
                    );
                  } else {
                    const b = await makeBackup(getLibrary());
                    await client.initialize(book, b);
                    await connected(book.spreadsheetId, b.library);
                  }
                })
              }
            >
              Confirm spreadsheet connection
            </Button>
            <Button variant="ghost" onPress={() => setBook(undefined)}>
              Cancel
            </Button>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
