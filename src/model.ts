// Compatibility facade. Implementations depend on focused modules, never on
// this barrel, keeping normalization, mutation, and ledger replay independent.
export * from "./types";
export { STORAGE_KEY } from "./browserStorage";
export {
  MIN_YEAR, MAX_YEAR, MIN_DATE, MAX_DATE, formatDateParts,
  compareDates, compareDated, compareStartDates, firstDate, isValidDate,
  todayDate, addDays, addMonths, prettyDate, monthLabel, dayLabel, nthWeekdayInMonth,
} from "./dates";
export { hasCentPrecision, parseHours, formatHours, formatSignedHours } from "./hours";
export { isHexColor, emptyStore, allocateIds, capRangesOverlap } from "./store";
export { normalizeStore, parseStoreJson } from "./normalize";
export { reduceStore, storeActionError } from "./reducer";
export { cadenceLabel, recurringScheduleDescription } from "./schedules";
export { dayTotalHours, dayPoolHours, eventPoolHours, eventTotalHours, sortDays, eventDateRangeLabel } from "./events";
export { totalsOn, poolTotalsOn, eventBalanceWarnings } from "./ledger";
export { MAX_HISTORY_POINTS, balanceHistoryDates, balanceHistoryForDates } from "./history";
