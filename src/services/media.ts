// TypeScript's fallback; Metro selects .native.ts or .web.ts on the target platform.
export {
  importMedia,
  resolveMedia,
  deleteMedia,
  exportClip,
  saveToPhotos,
  shareMedia,
  recordMedia,
} from "./media.native";
