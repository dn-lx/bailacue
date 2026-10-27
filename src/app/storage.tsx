import { danceTypes } from "../core/dances";
import { DancePicker } from "../components/DancePicker";
import { LabelPicker } from "../components/LabelPicker";
import { libraryLabels } from "../core/labels";
import { useEffect, useRef, useState } from "react";
import { View, Switch } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { GoogleDriveSetupError } from "../services/cloud/googleError";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  Chip,
  Badge,
  Row,
  layout,
} from "../components/ui";
import { useTheme } from "../components/theme";
import { useLibrary } from "../services/store";
import { connectAccount, disconnectAccount } from "../services/cloud/accounts";
import { provider } from "../services/cloud/provider";
import { sourceRenamePreview, sourceStyle } from "../core/numbering";
import { scanSource } from "../services/cloud/scan";
import { parseFolder } from "../core/sources";
import {
  uid,
  type CloudFolder,
  type Connection,
  type DanceStyle,
  type SourceRenameProgress,
} from "../core/types";
import { deleteMedia } from "../services/media";
export default function Storage() {
  const { library, update, commit, getLibrary } = useLibrary();
  const t = useTheme();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [googleSetupError, setGoogleSetupError] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("");
  const [style, setStyle] = useState<DanceStyle>("Bachata");
  const [labels, setLabels] = useState<string[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [editId, setEditId] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState("");
  const [removeFolder, setRemoveFolder] = useState("");
  const [setup, setSetup] = useState(false);
  const [appKey, setAppKey] = useState(library.cloudSettings.dropboxAppKey);
  const [renamePreview, setRenamePreview] =
    useState<ReturnType<typeof sourceRenamePreview>>();
  const [renameProgress, setRenameProgress] = useState<{
    sourceId: string;
    progress: SourceRenameProgress;
  }>();
  const [pausing, setPausing] = useState(false);
  const renameController = useRef<AbortController | null>(null);
  useEffect(() => () => renameController.current?.abort(), []);
  const selected = library.connections.find((c) => c.id === accountId);
  async function run(id: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(id);
    setError("");
    setGoogleSetupError(false);
    try {
      await action();
    } catch (e) {
      setGoogleSetupError(e instanceof GoogleDriveSetupError);
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function connect(kind: Connection["provider"], write = false) {
    await run(kind, async () => {
      const connection = await connectAccount(
        kind,
        library.cloudSettings.dropboxAppKey,
        write,
      );
      update((l) => ({
        ...l,
        connections: [
          ...l.connections.filter((c) => c.id !== connection.id),
          connection,
        ],
      }));
      setAccountId(connection.id);
      setFolders([]);
    });
  }
  async function refresh(source: CloudFolder) {
    await scanSource({ commit, getLibrary }, source.id);
  }
  async function previewNames(source: CloudFolder) {
    await refresh(source);
    setRenamePreview(sourceRenamePreview(getLibrary(), source.id));
  }
  async function applyNames() {
    if (!renamePreview) return;
    const reviewed = renamePreview;
    setRenamePreview(undefined);
    setPausing(false);
    const controller = new AbortController();
    renameController.current = controller;
    setRenameProgress({
      sourceId: reviewed.sourceId,
      progress: {
        phase: "scanning",
        total: 0,
        processed: 0,
        renamed: 0,
        alreadyNamed: 0,
        pending: 0,
        failures: [],
      },
    });
    try {
      await scanSource({ commit, getLibrary }, reviewed.sourceId, {
        rename: true,
        fileIds: reviewed.items.map((item) => item.fileId),
        signal: controller.signal,
        onProgress: (progress) =>
          setRenameProgress({ sourceId: reviewed.sourceId, progress }),
      });
    } catch (error) {
      setRenameProgress(undefined);
      throw error;
    } finally {
      renameController.current = null;
      setPausing(false);
    }
  }
  function edit(source: CloudFolder) {
    setAccountId(source.connectionId);
    setFolder(source.folderId);
    setName(source.name);
    setStyle(source.defaultStyle);
    setLabels(source.defaultLabels);
    setEditId(source.id);
  }
  async function saveSource() {
    if (!selected) throw new Error("Choose a connected storage account first.");
    const folderId = parseFolder(selected.provider, folder);
    if (
      library.sources.some(
        (s) =>
          s.connectionId === selected.id &&
          s.folderId === folderId &&
          s.id !== editId,
      )
    )
      throw new Error(
        "This folder is already connected. Edit its name or defaults below.",
      );
    const adapter = provider(selected);
    const info = await adapter.inspectFolder(folderId);
    const source: CloudFolder = {
      id: editId || uid(),
      connectionId: selected.id,
      provider: selected.provider,
      folderId,
      name: name.trim() || info.name,
      defaultStyle: style,
      defaultDanceId: danceTypes(library).find((d) => d.name === style)?.id,
      defaultLabels: labels,
      writable: info.writable,
      numbering: editId
        ? library.sources.find((s) => s.id === editId)?.numbering
        : undefined,
      numberUploads: editId
        ? library.sources.find((s) => s.id === editId)?.numberUploads === true
        : false,
      renameResult: editId
        ? library.sources.find((s) => s.id === editId)?.renameResult
        : undefined,
    };
    if (editId) {
      const old = library.sources.find((s) => s.id === editId)!;
      if (old.connectionId !== source.connectionId || old.folderId !== folderId)
        throw new Error(
          "To choose a different account or folder, add a new source. Existing video associations are preserved.",
        );
    }
    await commit((l) => ({
      ...l,
      sources: [...l.sources.filter((s) => s.id !== source.id), source],
    }));
    await scanSource({ commit, getLibrary }, source.id);
    setFolder("");
    setName("");
    setEditId("");
    setFolders([]);
  }
  async function detach(source: CloudFolder) {
    const orphaned = library.videos.filter(
      (v) =>
        v.remote?.sourceIds.includes(source.id) &&
        v.remote.sourceIds.length === 1 &&
        !v.sharedGrantId,
    );
    for (const video of orphaned) {
      if (video.offlineUri) await deleteMedia(video.offlineUri);
      if (video.thumbnail?.startsWith("file:"))
        await deleteMedia(video.thumbnail);
    }
    const ids = new Set(orphaned.map((v) => v.id));
    update((l) => ({
      ...l,
      sources: l.sources.filter((s) => s.id !== source.id),
      videos: l.videos.map((v) =>
        v.remote?.sourceIds.includes(source.id)
          ? {
              ...v,
              available: ids.has(v.id) ? false : v.available,
              offlineUri: ids.has(v.id) ? undefined : v.offlineUri,
              thumbnail: ids.has(v.id) ? undefined : v.thumbnail,
              remote: {
                ...v.remote,
                sourceIds: v.remote.sourceIds.filter((s) => s !== source.id),
              },
            }
          : v,
      ),
    }));
    setRemoveFolder("");
    if (editId === source.id) setEditId("");
  }
  async function disconnect(connection: Connection) {
    for (const video of library.videos.filter(
      (v) => v.remote?.connectionId === connection.id && v.offlineUri,
    )) {
      await deleteMedia(video.offlineUri!);
      if (video.thumbnail?.startsWith("file:"))
        await deleteMedia(video.thumbnail);
    }
    await disconnectAccount(connection.id);
    update((l) => ({
      ...l,
      connections: l.connections.map((c) =>
        c.id === connection.id ? { ...c, connected: false } : c,
      ),
      videos: l.videos.map((v) =>
        v.remote?.connectionId === connection.id
          ? {
              ...v,
              offlineUri: undefined,
              thumbnail: undefined,
              available: false,
              storagePreference: "online",
            }
          : v,
      ),
    }));
    setConfirmDisconnect("");
  }
  return (
    <Screen
      title="Your video homes"
      subtitle="Choose your accounts. Keep your videos where you want them."
      action={
        <Button variant="ghost" onPress={() => router.back()}>
          Done
        </Button>
      }
    >
      <Card>
        <Badge tone="accent">YOUR ACCOUNTS · YOUR FOLDERS</Badge>
        <Txt size={23} weight="display">
          Connect a video home
        </Txt>
        <Txt color={t.muted}>
          Sign in to your own Google or Dropbox account. BailaCue lists videos
          directly inside the folders you choose. Videos start online; download
          only the ones you want on your phone.
        </Txt>
        <Row style={{ flexWrap: "wrap" }}>
          <Button
            icon="folder"
            loading={busy === "google-drive"}
            disabled={!!busy}
            onPress={() => connect("google-drive", true)}
          >
            Connect Google Drive
          </Button>
          <Button
            variant="soft"
            loading={busy === "dropbox"}
            disabled={!!busy}
            onPress={() => connect("dropbox")}
          >
            Connect Dropbox
          </Button>
        </Row>
        <Txt size={12} color={t.muted}>
          You can also use Add video → Choose a video to import from Drive,
          Dropbox or another provider available in your phone’s Files picker.
        </Txt>
      </Card>
      {error ? (
        <Card>
          {googleSetupError ? (
            <Txt size={22} weight="display">
              Google Drive needs app setup
            </Txt>
          ) : null}
          <Txt accessibilityRole="alert" color={t.primary}>
            {error}
          </Txt>
          {googleSetupError ? (
            <>
              <Button icon="folder" onPress={() => router.push("/upload")}>
                Import from Files
              </Button>
              <Button
                variant="soft"
                onPress={() =>
                  run("setup-help", () =>
                    WebBrowser.openBrowserAsync(
                      "https://github.com/dn-lx/BailaCue/blob/feat/bailacue-mobile-foundation/docs/CLOUD-STORAGE.md#google-drive-registration",
                    ).then(() => undefined),
                  )
                }
              >
                Connection setup help
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
      {library.connections.map((connection) => (
        <Card key={connection.id}>
          <Badge tone={connection.connected ? "accent" : "soft"}>
            {connection.provider === "google-drive"
              ? "GOOGLE DRIVE"
              : "DROPBOX"}
          </Badge>
          <Txt weight="bold">{connection.email}</Txt>
          <Txt color={t.muted}>
            {connection.connected
              ? "Connected on this device"
              : "Disconnected · notes and ratings preserved"}
          </Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Button
              variant="soft"
              disabled={!!busy}
              onPress={() => {
                setAccountId(connection.id);
                setFolders([]);
                setEditId("");
                setFolder("");
              }}
            >
              Choose this account
            </Button>
            <Button
              variant="ghost"
              disabled={!!busy}
              onPress={() => connect(connection.provider, connection.writable)}
            >
              Reconnect
            </Button>
          </Row>
          {connection.provider === "google-drive" && !connection.writable ? (
            <Button
              variant="ghost"
              onPress={() => connect("google-drive", true)}
              disabled={!!busy}
            >
              Allow uploads to my Drive
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onPress={() => setConfirmDisconnect(connection.id)}
          >
            Disconnect & remove phone copies
          </Button>
          {confirmDisconnect === connection.id ? (
            <>
              <Txt>
                This removes this account’s downloads from BailaCue and
                disconnects storage. Your notes, ratings and original online
                files are kept.
              </Txt>
              <Row>
                <Button
                  onPress={() =>
                    run("disconnect", () => disconnect(connection))
                  }
                  disabled={!!busy}
                >
                  Confirm disconnect
                </Button>
                <Button variant="soft" onPress={() => setConfirmDisconnect("")}>
                  Keep connected
                </Button>
              </Row>
            </>
          ) : null}
        </Card>
      ))}
      {selected ? (
        <Card>
          <Badge tone="soft">{editId ? "EDIT FOLDER" : "ADD FOLDER"}</Badge>
          <Txt weight="bold">{selected.email}</Txt>
          <Button
            variant="soft"
            disabled={!!busy || !selected.connected}
            loading={busy === "browse"}
            onPress={() =>
              run("browse", async () =>
                setFolders(await provider(selected).folders()),
              )
            }
          >
            Browse my folders
          </Button>
          {folders.length ? (
            <View style={layout.wrap}>
              {folders.slice(0, 100).map((f) => (
                <Chip
                  key={f.id}
                  selected={folder === f.id}
                  onPress={() => {
                    setFolder(f.id);
                    if (!name) setName(f.name);
                    setStyle(
                      sourceStyle({
                        name: f.name,
                        defaultStyle: style,
                        defaultDanceId: danceTypes(library).find(
                          (d) => d.name === style,
                        )?.id,
                      } as CloudFolder),
                    );
                  }}
                >
                  {f.name}
                </Chip>
              ))}
            </View>
          ) : null}
          <Field
            label={
              selected.provider === "google-drive"
                ? "Drive folder link or ID"
                : "Dropbox folder path"
            }
            placeholder={
              selected.provider === "google-drive"
                ? "https://drive.google.com/drive/folders/…"
                : "/Dance/Salsa"
            }
            value={folder}
            editable={!busy}
            onChangeText={setFolder}
            autoCapitalize="none"
          />
          <Field
            label="Folder name in BailaCue"
            placeholder="Tuesday Salsa"
            value={name}
            editable={!busy}
            onChangeText={setName}
          />
          <DancePicker value={style} onChange={setStyle} />
          <LabelPicker
            label="Default labels for new videos"
            value={labels}
            options={libraryLabels(library)}
            onChange={setLabels}
          />
          <Txt size={12} color={t.muted}>
            New videos start unrated (counting as 5★) with these labels.
            Connecting and refreshing keep the filenames in your storage.
            Numbered names are optional in the source controls below. Labels,
            ratings and notes stay with each video. Browse shows top-level
            Dropbox folders; enter a path to choose a nested folder.
          </Txt>
          <Button
            onPress={() => run("source", saveSource)}
            disabled={!!busy || !selected.connected}
            loading={busy === "source"}
          >
            {editId ? "Save folder changes" : "Connect folder & find videos"}
          </Button>
          {editId ? (
            <Button
              variant="ghost"
              onPress={() => {
                setEditId("");
                setFolder("");
                setName("");
              }}
            >
              Cancel editing
            </Button>
          ) : null}
        </Card>
      ) : null}
      {library.sources.length ? (
        <Txt size={13} color={t.muted}>
          New files added outside BailaCue are discovered when you reopen the
          app, then every five minutes while it is active. Use Refresh videos to
          check now. Use Rename existing videos to choose numbered filenames.
        </Txt>
      ) : null}
      {library.sources.map((source) => (
        <Card key={source.id}>
          <Txt size={21} weight="display">
            {source.name}
          </Txt>
          <Row>
            <Badge
              tone={
                source.writable &&
                library.connections.some(
                  (c) =>
                    c.id === source.connectionId && c.connected && c.writable,
                )
                  ? "accent"
                  : "soft"
              }
            >
              {!library.connections.some(
                (c) => c.id === source.connectionId && c.connected,
              )
                ? "DISCONNECTED"
                : source.writable &&
                    library.connections.some(
                      (c) => c.id === source.connectionId && c.writable,
                    )
                  ? "WRITABLE"
                  : "READ ONLY"}
            </Badge>
            <Txt size={12} color={t.muted}>
              {source.provider === "dropbox" ? "Dropbox" : "Google Drive"}
            </Txt>
          </Row>
          <Txt color={t.muted}>
            {
              library.videos.filter((v) =>
                v.remote?.sourceIds.includes(source.id),
              ).length
            }{" "}
            videos · {sourceStyle(source)} · {source.defaultLabels.join(", ")}
          </Txt>
          <Txt size={12} color={t.muted}>
            {source.lastSyncedAt
              ? `Last refreshed ${new Date(source.lastSyncedAt).toLocaleString()}`
              : "Not refreshed yet"}
          </Txt>
          {source.error ? (
            <Txt size={13} accessibilityRole="alert" color={t.primary}>
              {source.error}
            </Txt>
          ) : null}
          <View style={{ gap: 10 }}>
            <Button
              variant="soft"
              disabled={!!busy}
              loading={busy === source.id}
              onPress={() => run(source.id, () => refresh(source))}
            >
              Refresh videos
            </Button>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt weight="bold" style={{ flex: 1 }}>
                Number new uploads
              </Txt>
              <Switch
                accessibilityLabel={`Number new uploads to ${source.name}`}
                value={source.numberUploads === true}
                disabled={!!busy}
                onValueChange={(value) =>
                  run(`policy-${source.id}`, async () => {
                    await commit((l) => ({
                      ...l,
                      sources: l.sources.map((s) =>
                        s.id === source.id ? { ...s, numberUploads: value } : s,
                      ),
                    }));
                  })
                }
              />
            </Row>
            <Txt size={12} color={t.muted}>
              Off by default. Enable to give future uploads names like 0001.mp4.
              Existing and externally added files change only with the rename
              action.
            </Txt>
            <Button
              variant="soft"
              disabled={
                !!busy ||
                !source.writable ||
                !library.connections.some(
                  (c) =>
                    c.id === source.connectionId && c.connected && c.writable,
                )
              }
              loading={busy === `preview-${source.id}`}
              onPress={() =>
                run(`preview-${source.id}`, () => previewNames(source))
              }
            >
              Rename existing videos…
            </Button>
            {renamePreview?.sourceId === source.id ? (
              <Card>
                <Txt weight="bold">Preview numbered filenames</Txt>
                <Txt>
                  {renamePreview.changes} of {renamePreview.items.length} cloud
                  filenames will change in {source.name}.
                </Txt>
                <Txt size={12} color={t.muted}>
                  The video extension is kept. Matching BailaCue phone copies
                  will be renamed too. Labels, ratings and notes stay attached.
                  Newly discovered files after this preview wait for your next
                  rename action.
                </Txt>
                {renamePreview.items
                  .filter((item) => item.from !== item.to)
                  .slice(0, 3)
                  .map((item) => (
                    <Txt key={item.fileId} size={13}>
                      {item.from} → {item.to}
                    </Txt>
                  ))}
                <Button
                  disabled={!!busy}
                  onPress={() => run(`rename-${source.id}`, applyNames)}
                >
                  Apply numbered filenames
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onPress={() => setRenamePreview(undefined)}
                >
                  Keep current filenames
                </Button>
              </Card>
            ) : null}
            {(() => {
              const result =
                renameProgress?.sourceId === source.id
                  ? renameProgress.progress
                  : source.renameResult;
              if (!result) return null;
              return (
                <Card>
                  <Txt weight="bold">
                    {result.phase === "scanning"
                      ? "Checking source…"
                      : result.phase === "renaming"
                        ? "Renaming videos…"
                        : result.phase === "paused"
                          ? "Renaming paused"
                          : "Rename results"}
                  </Txt>
                  <Txt>
                    {result.processed} / {result.total} checked ·{" "}
                    {result.renamed} renamed · {result.alreadyNamed} already
                    numbered
                  </Txt>
                  {result.pending ? (
                    <Txt size={13}>
                      {result.pending} unfinished uploads kept at their saved
                      names. Resume them before retrying.
                    </Txt>
                  ) : null}
                  {result.failures.map((failure, index) => (
                    <Txt
                      key={`${failure.fileId}-${index}`}
                      size={13}
                      color={t.primary}
                    >
                      {failure.fileName}: {failure.message}
                    </Txt>
                  ))}
                  {busy === `rename-${source.id}` ? (
                    <Button
                      variant="soft"
                      disabled={pausing}
                      onPress={() => {
                        setPausing(true);
                        renameController.current?.abort();
                      }}
                    >
                      {pausing
                        ? "Pausing after current video…"
                        : "Pause after current video"}
                    </Button>
                  ) : null}
                  {result.phase === "paused" ||
                  result.failures.length ||
                  result.pending ? (
                    <Button
                      variant="soft"
                      disabled={!!busy}
                      onPress={() =>
                        run(`preview-${source.id}`, () => previewNames(source))
                      }
                    >
                      Review remaining renames
                    </Button>
                  ) : null}
                </Card>
              );
            })()}
            <Row>
              <Button variant="ghost" onPress={() => edit(source)}>
                Edit folder
              </Button>
              <Button
                variant="ghost"
                onPress={() => setRemoveFolder(source.id)}
              >
                Disconnect folder
              </Button>
            </Row>
          </View>
          {removeFolder === source.id ? (
            <>
              <Txt>
                Disconnect this folder and remove downloads used only by it?
                Notes and ratings stay in your library. Online originals remain
                in storage.
              </Txt>
              <Row>
                <Button
                  disabled={!!busy}
                  onPress={() => run("detach", () => detach(source))}
                >
                  Confirm folder disconnect
                </Button>
                <Button variant="soft" onPress={() => setRemoveFolder("")}>
                  Keep folder
                </Button>
              </Row>
            </>
          ) : null}
        </Card>
      ))}
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt weight="bold" style={{ flex: 1 }}>
            Download only on Wi-Fi
          </Txt>
          <Switch
            accessibilityLabel="Download only on Wi-Fi"
            value={library.cloudSettings.wifiOnly}
            onValueChange={(wifiOnly) =>
              update((l) => ({
                ...l,
                cloudSettings: { ...l.cloudSettings, wifiOnly },
              }))
            }
          />
        </Row>
        <Txt color={t.muted}>
          {library.videos.filter((v) => !!v.offlineUri).length} phone downloads
          ·{" "}
          {(
            library.videos
              .filter((v) => v.offlineUri || v.source === "device")
              .reduce((n, v) => n + v.size, 0) / 1048576
          ).toFixed(1)}{" "}
          MB in BailaCue
        </Txt>
        <Txt size={12} color={t.muted}>
          Streaming needs an internet connection. Downloaded copies cannot be
          remotely revoked while offline. Disconnecting removes BailaCue’s
          copies; files already saved to Photos or shared elsewhere stay there.
        </Txt>
      </Card>
      <Card>
        <Button variant="ghost" onPress={() => setSetup(!setup)}>
          App connection setup
        </Button>
        {setup ? (
          <>
            <Txt color={t.muted}>
              These public identifiers register BailaCue with the provider. They
              do not select a user’s account. Users always sign in themselves.
            </Txt>
            <Field
              label="Dropbox app key"
              value={appKey}
              autoCapitalize="none"
              onChangeText={setAppKey}
            />
            <Button
              variant="soft"
              onPress={() => {
                update((l) => ({
                  ...l,
                  cloudSettings: {
                    ...l.cloudSettings,
                    dropboxAppKey: appKey.trim(),
                  },
                }));
                setError(
                  "Dropbox app key saved. You can connect your own account above.",
                );
                setGoogleSetupError(false);
              }}
            >
              Save app key
            </Button>
            <Txt size={12} color={t.muted}>
              Register callback bailacue://oauth/dropbox in the Dropbox app
              console. Drive Android sign-in requires app.bailacue.mobile and
              the APK’s certificate fingerprint registered in Google Cloud. See
              docs/CLOUD-STORAGE.md for setup.
            </Txt>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
