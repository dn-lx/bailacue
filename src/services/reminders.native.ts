import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { Platform } from "react-native";
import { reminderSchedule, type ReminderPreferences } from "../core/reminders";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
export async function requestReminderPermission() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("practice", {
      name: "Practice reminders",
      importance: AndroidImportance.DEFAULT,
    });
  const result = await Notifications.requestPermissionsAsync();
  return (
    result.granted || result.ios?.status === IosAuthorizationStatus.PROVISIONAL
  );
}
let queue = Promise.resolve();
export function syncReminders(preferences: ReminderPreferences) {
  const work = queue
    .catch(() => {})
    .then(async () => {
      // Cancel our previous plan before adding the replacement, including when disabled.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const entry of scheduled.filter((n) =>
        n.identifier.startsWith("bailacue-"),
      ))
        await Notifications.cancelScheduledNotificationAsync(entry.identifier);
      if (!preferences.enabled) return;
      const permission = await Notifications.getPermissionsAsync();
      if (
        !permission.granted &&
        permission.ios?.status !== IosAuthorizationStatus.PROVISIONAL
      )
        return;
      for (const entry of reminderSchedule(preferences))
        await Notifications.scheduleNotificationAsync({
          identifier: entry.id,
          content: {
            title:
              preferences.kind === "picks"
                ? "Your next move is waiting"
                : "A little time for your dance",
            body:
              preferences.kind === "picks"
                ? "Open BailaCue to see your Daily Picks."
                : "Take a moment to practise a favourite move.",
            data: { route: preferences.kind === "picks" ? "/" : "/practice" },
            sound: false,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: entry.weekday,
            hour: entry.hour,
            minute: entry.minute,
            channelId: "practice",
          },
        });
    });
  queue = work;
  return work;
}
export function listenReminders(open: (route: "/" | "/practice") => void) {
  const route = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const value = response.notification.request.content.data?.route;
    if (value === "/" || value === "/practice") open(value);
    void Notifications.clearLastNotificationResponseAsync();
  };
  const subscription =
    Notifications.addNotificationResponseReceivedListener(route);
  void Notifications.getLastNotificationResponseAsync().then(route);
  return () => subscription.remove();
}
