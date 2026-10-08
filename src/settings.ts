import { createContext } from "react";
import { addDays, WEEKDAYS, type Weekday } from "./model";

const STORAGE_KEY = "hima.settings.v1";

export const TIMELINE_PRESETS = ["all time", "±6 month", "YTD", "6 month", "3 month", "1 year", "5 year", "Previous Year", "YFD", "future 6 month", "future 3 month", "future 1 year", "future 5 year", "Next Year"] as const;
export type TimelinePreset = typeof TIMELINE_PRESETS[number];

export function loadDefaultTimeline(): TimelinePreset {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return TIMELINE_PRESETS.find((preset) => preset === saved?.defaultTimeline) ?? "±6 month";
  } catch {
    return "±6 month";
  }
}

export const FirstDayOfWeekContext = createContext<Weekday>("Monday");
export const IgnoreWeekendsContext = createContext(false);

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function nextWeekday(date: string): string {
  while (isWeekend(date)) date = addDays(date, 1);
  return date;
}

export function loadIgnoreWeekends(): boolean {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return saved?.ignoreWeekends === true;
  } catch {
    return false;
  }
}

export function loadFirstDayOfWeek(): Weekday {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved !== null && typeof saved === "object" && "firstDayOfWeek" in saved) {
      return WEEKDAYS.find((day) => day === saved.firstDayOfWeek) ?? "Monday";
    }
  } catch {
    // Use the default when browser storage is unavailable or invalid.
  }
  return "Monday";
}

export function saveSettings(firstDayOfWeek: Weekday, ignoreWeekends: boolean, defaultTimeline: TimelinePreset): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ firstDayOfWeek, ignoreWeekends, defaultTimeline }));
  } catch {
    // Keep settings usable when browser storage is unavailable or full.
  }
}
