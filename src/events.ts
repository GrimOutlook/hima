import { compareDated, prettyDate } from "./dates";
import type { LeaveDay, LeaveEvent } from "./types";

export function dayTotalHours(day: LeaveDay): number {
  return day.allocations.reduce((total, allocation) => total + allocation.hours, 0);
}

export function dayPoolHours(day: LeaveDay, poolId: number): number {
  return day.allocations.filter((allocation) => allocation.pool_id === poolId)
    .reduce((total, allocation) => total + allocation.hours, 0);
}

export function eventPoolHours(event: Pick<LeaveEvent, "days">, poolId: number): number {
  return event.days.reduce((total, day) => total + dayPoolHours(day, poolId), 0);
}

export function eventTotalHours(event: Pick<LeaveEvent, "days">): number {
  return event.days.reduce((total, day) => total + dayTotalHours(day), 0);
}

export function sortDays(days: LeaveDay[]): LeaveDay[] {
  return [...days].sort(compareDated);
}

export function eventDateRangeLabel(event: LeaveEvent): string {
  const dates = event.days.map((day) => day.date).sort();
  const first = prettyDate(dates[0] ?? "");
  const last = prettyDate(dates.at(-1) ?? "");
  return first === last ? first : `${first} – ${last}`;
}
