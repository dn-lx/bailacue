import { useColorScheme } from "react-native";
import { useLibrary } from "../services/store";
export const palettes = {
  light: {
    background: "#F4F7FC",
    surface: "#FFFFFF",
    soft: "#E8EFFA",
    ink: "#080D18",
    muted: "#54647B",
    border: "#C4D0E0",
    primary: "#145BE0",
    onPrimary: "#FFFFFF",
    brandBlue: "#1465FF",
    brandBlack: "#080D18",
    onBrand: "#FFFFFF",
    accent: "#C7DCFF",
    onAccent: "#081A38",
    heroStart: "#123570",
    heroMuted: "#CCD9EF",
    videoSalsa: "#17448C",
    videoBachata: "#152846",
  },
  dark: {
    background: "#080D18",
    surface: "#121B2B",
    soft: "#1D2B42",
    ink: "#F7F9FF",
    muted: "#B5C3D9",
    border: "#34445F",
    primary: "#8AB6FF",
    onPrimary: "#080D18",
    brandBlue: "#1465FF",
    brandBlack: "#080D18",
    onBrand: "#FFFFFF",
    accent: "#C7DCFF",
    onAccent: "#081A38",
    heroStart: "#123570",
    heroMuted: "#CCD9EF",
    videoSalsa: "#17448C",
    videoBachata: "#152846",
  },
};
export function useTheme() {
  const system = useColorScheme();
  const { library } = useLibrary();
  const mode =
    library.preferences.theme === "system"
      ? (system ?? "light")
      : library.preferences.theme;
  return { ...palettes[mode], dark: mode === "dark" };
}
