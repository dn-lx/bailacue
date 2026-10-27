import type { MediaAddress } from "./download.native";
export async function downloadVideo(
  _address: MediaAddress,
  _size: number,
  _wifi: boolean,
  _progress: (fraction: number) => void,
  _signal?: AbortSignal,
): Promise<{
  uri: string;
  duration: number;
  size: number;
  thumbnail?: string;
}> {
  throw new Error(
    "Download phone copies in the Android or iOS app. Browser previews can stream compatible Dropbox videos.",
  );
}
