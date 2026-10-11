import { isValidDate, parseHours, type Cadence, type EventDayInput, type NthWeekday, type Pool, type Weekday } from "./model";

export interface CapDraft {
  amount: string;
  date: string;
  endDate: string;
}

export function validatePoolDraft({ name, openingAmount, openingDate }: {
  name: string; openingAmount: string; openingDate: string;
}, editing: boolean): string | null {
  if (!name.trim()) return "Add a name for this pool.";
  if (!editing && openingAmount.trim() !== "" && parseHours(openingAmount, true) === null) {
    return "Enter a starting balance with up to two decimal places.";
  }
  if (!editing && !isValidDate(openingDate)) return "Choose a valid starting date.";
  return null;
}

export function validateCapDraft({ amount, date, endDate }: CapDraft): string | null {
  if (amount.trim() === "" || parseHours(amount, true) === null) {
    return "Enter a maximum balance of zero or more with up to two decimal places.";
  }
  if (!isValidDate(date) || (endDate && !isValidDate(endDate))) {
    return "Choose a valid start date and, if provided, end date.";
  }
  if (endDate && endDate < date) return "A cap's end date must be on or after its start date.";
  return null;
}

export interface AdditionDraft extends CapDraft {
  reset: boolean;
  recurring: boolean;
  cadence: Cadence;
  month: number;
  nthWeekday: NthWeekday;
  weekday: Weekday;
  batchAdding: boolean;
  selectedDates: string[];
}

export function parseAdditionAmount(amount: string, reset: boolean): number | null {
  return reset && amount.trim() === "" ? 0 : parseHours(amount, reset);
}

export function validateAdditionDraft({ amount, reset, date, recurring, cadence, month, nthWeekday, weekday,
  endDate, batchAdding, selectedDates }: AdditionDraft): string | null {
  if (parseAdditionAmount(amount, reset) === null) {
    return reset
      ? "Enter a reset balance of zero or more with up to two decimal places."
      : "Enter an amount greater than zero with up to two decimal places.";
  }
  if (!batchAdding && !isValidDate(date)) return "Choose a valid date.";
  if (recurring && cadence === "YearlyNthWeekday" &&
    (!Number.isInteger(month) || month < 1 || month > 12 || !nthWeekday || !weekday)) {
    return "Choose a valid occurrence, weekday, and month.";
  }
  if (recurring && endDate && !isValidDate(endDate)) return "Choose a valid end date.";
  if (recurring && endDate && endDate < date) return "The end date must be on or after the schedule's start date.";
  if (batchAdding && (selectedDates.length === 0 || selectedDates.some((selected) => !isValidDate(selected)))) {
    return "Choose at least one valid date.";
  }
  return null;
}

export function validateEventDraft(name: string, days: EventDayInput[], pools: Pick<Pool, "id">[],
  validateAllocations = true): string | null {
  if (!name.trim()) return "Give this event a name.";
  if (days.length === 0) return "Add at least one day to this event.";
  // Creation's first step only collects the name and dates; hours are entered next.
  if (!validateAllocations) return null;
  const uniqueDates = new Set<string>();
  for (const day of days) {
    if (!isValidDate(day.date)) return "Choose a valid date for each event day.";
    if (uniqueDates.has(day.date)) return "Each event day must have a different date.";
    uniqueDates.add(day.date);
    if (day.allocations.length === 0) return "Choose at least one pool for each event day.";
    const uniquePools = new Set<number>();
    for (const allocation of day.allocations) {
      if (uniquePools.has(allocation.pool_id)) return "Choose each pool only once per day.";
      uniquePools.add(allocation.pool_id);
      if (!pools.some((pool) => pool.id === allocation.pool_id)) return "Choose an existing pool for each event day.";
      if (parseHours(allocation.hours) === null) {
        return "Enter positive hours with up to two decimal places for each pool allocation.";
      }
    }
  }
  return null;
}
