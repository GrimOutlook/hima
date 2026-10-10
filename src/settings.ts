import { createContext } from "react";
import { addDays, type Weekday } from "./model";

export const TIMELINE_PRESETS = ["all time", "±6 month", "YTD", "6 month", "3 month", "1 year", "5 year", "Previous Year", "YFD", "future 6 month", "future 3 month", "future 1 year", "future 5 year", "Next Year"] as const;
export type TimelinePreset = typeof TIMELINE_PRESETS[number];

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
