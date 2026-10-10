import { MONTH_NAMES, type Cadence, type RecurringAddition } from "./types";

export function cadenceLabel(cadence: Cadence): string {
  switch (cadence) {
    case "Weekly": return "week";
    case "Fortnightly": return "fortnight";
    case "Monthly": return "month";
    case "Yearly":
    case "YearlyNthWeekday": return "year";
  }
}

export function recurringScheduleDescription(rule: RecurringAddition): string {
  if (rule.cadence === "YearlyNthWeekday" && rule.month !== undefined && rule.nth_weekday && rule.weekday) {
    const month = MONTH_NAMES[rule.month - 1];
    if (month) return `on the ${rule.nth_weekday.toLowerCase()} ${rule.weekday} of ${month} each year`;
  }
  return `every ${cadenceLabel(rule.cadence)}`;
}
