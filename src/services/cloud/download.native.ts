import { Directory, File, Paths } from "expo-file-system";
import * as Legacy from "expo-file-system/legacy";
import * as Network from "expo-network";
import { nativeMedia } from "../../../modules/baila-media";
import { uid } from "../../core/types";
export type MediaAddress = { uri: string; headers: Record<string, string> };
export async function downloadVideo(
  address: MediaAddress,
  expectedSize: number,
  wifiOnly: boolean,
  progress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  if (wifiOnly) {
    const state = await Network.getNetworkStateAsync();
    if (
      state.type !== Network.NetworkStateType.WIFI &&
      state.type !== Network.NetworkStateType.ETHERNET
    )
      throw new Error(
        "Wi-Fi downloads are enabled. Connect to Wi-Fi, or change this preference in Storage.",
      );
  }
  if (
    expectedSize > 0 &&
    Paths.availableDiskSpace < expectedSize + 50 * 1048576
  )
    throw new Error(
      "There is not enough free space for this video. Remove a download and try again.",
    );
  const directory = new Directory(Paths.document, "bailacue-library");
  directory.create({ idempotent: true, intermediates: true });
  const temporary = new File(directory, `${uid()}.part`);
  const destination = new File(directory, `${uid()}.mp4`);
  const task = Legacy.createDownloadResumable(
    address.uri,
    temporary.uri,
    { headers: address.headers },
    (event) =>
      progress(
        event.totalBytesExpectedToWrite > 0
          ? Math.min(
              1,
              event.totalBytesWritten / event.totalBytesExpectedToWrite,
            )
          : 0,
      ),
  );
  const cancel = () => {
    void task.cancelAsync().catch(() => {});
  };
  signal?.addEventListener("abort", cancel);
  try {
    if (signal?.aborted) throw new Error("Download cancelled.");
    const result = await task.downloadAsync();
    if (!result || signal?.aborted) throw new Error("Download cancelled.");
    if (
      result.status !== 200 ||
      !temporary.exists ||
      (expectedSize > 0 && temporary.size !== expectedSize)
    )
      throw new Error("The download was incomplete. Retry when connected.");
    await temporary.move(destination);
    const info = await nativeMedia().getInfoAsync(destination.uri);
    progress(1);
    return { uri: destination.uri, size: destination.size ?? 0, ...info };
  } catch (error) {
    if (temporary.exists) temporary.delete();
    if (destination.exists) destination.delete();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
