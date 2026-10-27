import type { ReminderPreferences } from "../core/reminders";
export async function requestReminderPermission() {
  throw new Error("Enable reminders in the Android or iOS app.");
}
export async function syncReminders(_preferences: ReminderPreferences) {}
export function listenReminders(_open: (route: "/" | "/practice") => void) {
  return () => {};
}
