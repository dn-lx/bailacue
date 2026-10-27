import { MotionProvider } from "../components/motion";
import { SheetSync } from "../components/SheetSync";
import { CloudDiscovery } from "../components/CloudDiscovery";
import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { View, ActivityIndicator, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { LibraryProvider, useLibrary } from "../services/store";
import { useTheme } from "../components/theme";
import { syncReminders, listenReminders } from "../services/reminders";
import { PrivacyGate } from "../components/PrivacyGate";
import { Txt, Button } from "../components/ui";
function Shell() {
  const { ready, error, library, profileId, retryInitialization } =
    useLibrary();
  useEffect(() => {
    if (!ready) return;
    const reconcile = () => {
      void syncReminders(library.reminders).catch(() => {});
    };
    reconcile();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reconcile();
    });
    const stop = listenReminders((route) => router.push(route));
    return () => {
      subscription.remove();
      stop();
    };
  }, [ready, library.reminders]);
  const t = useTheme();
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          gap: 16,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: t.background,
        }}
      >
        {error ? (
          <>
            <Txt>{error}</Txt>
            <Button onPress={retryInitialization}>Retry opening library</Button>
          </>
        ) : (
          <ActivityIndicator color={t.primary} />
        )}
      </View>
    );
  return (
    <PrivacyGate key={profileId}>
      <CloudDiscovery />
      <SheetSync />
      <StatusBar style={t.dark ? "light" : "dark"} />
      {error ? (
        <View style={{ backgroundColor: t.soft, padding: 12 }}>
          <Txt>{error}</Txt>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="video/[id]" />
        <Stack.Screen name="playlist/[id]" />
      </Stack>
    </PrivacyGate>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Outfit_600SemiBold,
  });
  if (!loaded && !error) return null;
  return (
    <MotionProvider>
      <LibraryProvider>
        <Shell />
      </LibraryProvider>
    </MotionProvider>
  );
}
