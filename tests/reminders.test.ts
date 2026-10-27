import { beforeEach, describe, expect, it, vi } from "vitest";
const notifications = vi.hoisted(() => ({
  permission: true,
  scheduled: [] as { identifier: string }[],
  setNotificationHandler: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  ...notifications,
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { WEEKLY: "weekly" },
}));
import {
  syncReminders,
  requestReminderPermission,
} from "../src/services/reminders.native";
import { defaultReminders } from "../src/core/reminders";
beforeEach(() => {
  vi.clearAllMocks();
  notifications.permission = true;
  notifications.scheduled = [];
  notifications.getAllScheduledNotificationsAsync.mockImplementation(
    async () => [...notifications.scheduled],
  );
  notifications.getPermissionsAsync.mockImplementation(async () => ({
    granted: notifications.permission,
  }));
  notifications.requestPermissionsAsync.mockImplementation(async () => ({
    granted: notifications.permission,
  }));
  notifications.cancelScheduledNotificationAsync.mockImplementation(
    async (id) => {
      notifications.scheduled = notifications.scheduled.filter(
        (n) => n.identifier !== id,
      );
    },
  );
  notifications.scheduleNotificationAsync.mockImplementation(async (value) => {
    notifications.scheduled.push({ identifier: value.identifier });
  });
});
describe("native notification lifecycle with mocked OS", () => {
  it("cancels the old schedule on preference change without duplicate identifiers", async () => {
    await syncReminders({
      ...defaultReminders(),
      enabled: true,
      weekdays: [2, 4],
    });
    await syncReminders({
      ...defaultReminders(),
      enabled: true,
      weekdays: [4],
      time: "19:00",
    });
    expect(notifications.scheduled).toEqual([
      { identifier: "bailacue-practice-4" },
    ]);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "bailacue-practice-2",
    );
    expect(
      notifications.scheduleNotificationAsync.mock.calls.at(-1)?.[0].trigger,
    ).toMatchObject({ weekday: 4, hour: 19, minute: 0 });
  });
  it("immediately cancels reminders when disabled and respects denied notification permission", async () => {
    await syncReminders({ ...defaultReminders(), enabled: true });
    await syncReminders({ ...defaultReminders(), enabled: false });
    expect(notifications.scheduled).toEqual([]);
    notifications.permission = false;
    await syncReminders({ ...defaultReminders(), enabled: true });
    expect(notifications.scheduled).toEqual([]);
    expect(await requestReminderPermission()).toBe(false);
  });
  it("serialises simultaneous updates, preserving unrelated scheduled identifiers", async () => {
    notifications.scheduled = [{ identifier: "unrelated" }];
    await Promise.all([
      syncReminders({ ...defaultReminders(), enabled: true }),
      syncReminders({ ...defaultReminders(), enabled: false }),
    ]);
    expect(notifications.scheduled).toEqual([{ identifier: "unrelated" }]);
  });
});
