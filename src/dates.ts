import { NTH_WEEKDAYS, WEEKDAYS, type NthWeekday, type Weekday } from "./types";

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;
export const MIN_DATE = `${MIN_YEAR}-01-01`;
export const MAX_DATE = `${MAX_YEAR}-12-31`;

export function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function compareDates(left: string, right: string): number {
  return left.localeCompare(right);
}

export function compareDated(left: { date: string }, right: { date: string }): number {
  return compareDates(left.date, right.date);
}

export function compareStartDates(left: { start_date: string }, right: { start_date: string }): number {
  return compareDates(left.start_date, right.start_date);
}

export function firstDate(days: readonly { date: string }[]): string | undefined {
  return days.reduce<string | undefined>((first, day) =>
    first === undefined || day.date < first ? day.date : first, undefined);
}

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  if (Number(year) < MIN_YEAR || Number(year) > MAX_YEAR) return false;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

export function todayDate(): string {
  const today = new Date();
  return formatDateParts(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

export function dateFromParts(value: string): Date | null {
  if (!isValidDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function dateString(date: Date): string {
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(value: string, days: number): string {
  const date = dateFromParts(value);
  if (!date) return todayDate();
  date.setUTCDate(date.getUTCDate() + days);
  return dateString(date);
}

export function addMonths(value: string, months: number): string {
  const date = dateFromParts(value);
  if (!date) return todayDate();
  const day = date.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return dateString(firstOfTarget);
}

export function prettyDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = dateFromParts(value);
  return date ? new Intl.DateTimeFormat("en-US", {
    month: "short", day: "2-digit", year: "numeric", timeZone: "UTC", ...options,
  }).format(date) : value;
}

export function monthLabel(value: string): string {
  const date = dateFromParts(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase() : "";
}

export function dayLabel(value: string): string {
  const date = dateFromParts(value);
  return date ? String(date.getUTCDate()).padStart(2, "0") : "";
}

export function nthWeekdayInMonth(year: number, month: number, nthWeekday: NthWeekday, weekday: Weekday): string | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const weekdayIndex = WEEKDAYS.indexOf(weekday);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day: number;
  if (nthWeekday === "Last") {
    const lastWeekday = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
    day = daysInMonth - ((lastWeekday - weekdayIndex + 7) % 7);
  } else {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const occurrence = NTH_WEEKDAYS.indexOf(nthWeekday) + 1;
    day = 1 + ((weekdayIndex - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
    if (day > daysInMonth) return null;
  }
  return formatDateParts(year, month, day);
}
