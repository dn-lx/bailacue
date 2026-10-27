import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "../../components/ui";
import { useTheme } from "../../components/theme";
export default function TabLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabs: { name: string; title: string; icon: IconName }[] = [
    { name: "index", title: "Today", icon: "sun" },
    { name: "library", title: "Library", icon: "library" },
    { name: "upload", title: "Add video", icon: "plus" },
    { name: "practice", title: "Practice", icon: "practice" },
    { name: "settings", title: "Settings", icon: "settings" },
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          height: 64 + Math.max(8, insets.bottom),
          paddingTop: 7,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarLabelStyle: { fontFamily: "DMSans_500Medium", fontSize: 11 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={{
                  width: 48,
                  height: 32,
                  borderRadius: 14,
                  backgroundColor: focused ? t.soft : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={tab.icon}
                  color={typeof color === "string" ? color : undefined}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
