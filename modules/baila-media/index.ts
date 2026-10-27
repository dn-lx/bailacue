import { requireOptionalNativeModule } from "expo";
export type MediaInfo = {
  duration: number;
  thumbnail?: string;
  width: number;
  height: number;
};
export type ExportResult = { uri: string; duration: number };
export type BailaMedia = {
  getInfoAsync(uri: string): Promise<MediaInfo>;
  trimAsync(uri: string, start: number, end: number): Promise<ExportResult>;
  cancelExport(): void;
};
export function nativeMedia(): BailaMedia {
  const module = requireOptionalNativeModule<BailaMedia>("BailaMedia");
  if (!module)
    throw new Error(
      "Video editing needs a BailaCue development build. It is not available in Expo Go.",
    );
  return module;
}
