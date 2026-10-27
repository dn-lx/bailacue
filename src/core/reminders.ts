export type ReminderPreferences = {
  enabled: boolean;
  weekdays: number[];
  time: string;
  quietStart: string;
  quietEnd: string;
  kind: "practice" | "picks";
};
export const defaultReminders = (): ReminderPreferences => ({
  enabled: false,
  weekdays: [2, 4, 7],
  time: "18:00",
  quietStart: "22:00",
  quietEnd: "08:00",
  kind: "practice",
});
function minutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Use a time in HH:MM format, such as 18:30.");
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export function reminderSchedule(preferences: ReminderPreferences) {
  const time = minutes(preferences.time),
    start = minutes(preferences.quietStart),
    end = minutes(preferences.quietEnd);
  const quiet =
    start !== end &&
    (start < end ? time >= start && time < end : time >= start || time < end);
  let target = time;
  if (quiet) target = start > end && time >= start ? 1440 + end : end;
  const dayOffset = Math.floor(target / 1440);
  return [...new Set(preferences.weekdays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .map((day) => ({
      id: `bailacue-${preferences.kind}-${day}`,
      weekday: ((day - 1 + dayOffset) % 7) + 1,
      hour: Math.floor((target % 1440) / 60),
      minute: target % 60,
    }));
}
