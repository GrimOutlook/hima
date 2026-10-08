import { createContext } from "react";
import { WEEKDAYS, type Weekday } from "./model";

const STORAGE_KEY = "hima.settings.v1";

export const FirstDayOfWeekContext = createContext<Weekday>("Monday");

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

export function saveFirstDayOfWeek(firstDayOfWeek: Weekday): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ firstDayOfWeek }));
  } catch {
    // Keep settings usable when browser storage is unavailable or full.
  }
}
