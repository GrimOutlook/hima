import { compareStartDates, isValidDate } from "./dates";
import { sortDays } from "./events";
import { isFiniteHours, roundHours } from "./hours";
import { isHexColor, largestStoreId } from "./store";
import {
  NTH_WEEKDAYS, WEEKDAYS, STORE_VERSION,
  type Cadence, type LeaveDay, type LeaveEvent, type OneTimeAddition,
  type Pool, type PoolAllocation, type PoolCap, type RecurringAddition, type Store,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function amountValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return isFiniteHours(parsed) ? roundHours(parsed) : 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function cadenceValue(value: unknown): Cadence {
  switch (value) {
    case "Weekly":
    case "weekly": return "Weekly";
    case "Fortnightly":
    case "fortnightly": return "Fortnightly";
    case "Yearly":
    case "yearly": return "Yearly";
    case "YearlyNthWeekday":
    case "yearly_nth_weekday": return "YearlyNthWeekday";
    default: return "Monthly";
  }
}

// Keep the first valid entry for each ID within a collection. Report every
// ignored entry, including nested entries, before the import is confirmed.
function normalizeEntries<T>(values: unknown, normalize: (value: unknown) => T | null, label: string, warnings: string[]): T[] {
  if (!Array.isArray(values)) return [];
  const ids = new Set<number>();
  let dropped = 0;
  const entries = values.flatMap((value) => {
    const normalized = normalize(value);
    const id = (normalized as { id?: number } | null)?.id;
    if (!normalized || (id !== undefined && ids.has(id))) {
      dropped += 1;
      return [];
    }
    if (id !== undefined) ids.add(id);
    return [normalized];
  });
  if (dropped) warnings.push(`Ignored ${dropped} ${label} (invalid or duplicate).`);
  return entries;
}

function additionFlags(source: Record<string, unknown>): Pick<OneTimeAddition, "reset" | "expires_same_day"> {
  if (source.reset === true) return { reset: true };
  return source.expires_same_day === true ? { expires_same_day: true } : {};
}

function normalizeAddition(value: unknown): OneTimeAddition | null {
  const addition = record(value);
  const id = numberValue(addition.id);
  const date = stringValue(addition.date);
  const amount = amountValue(addition.amount);
  const reset = addition.reset === true;
  return id && isValidDate(date) && (reset || amount > 0)
    ? { id, date, amount: reset ? Math.max(0, amount) : amount, ...additionFlags(addition) }
    : null;
}

function normalizeRecurring(value: unknown): RecurringAddition | null {
  const rule = record(value);
  const id = numberValue(rule.id);
  const startDate = stringValue(rule.start_date);
  const endDate = stringValue(rule.end_date);
  const amount = amountValue(rule.amount);
  const cadence = cadenceValue(rule.cadence);
  const nthWeekday = NTH_WEEKDAYS.find((occurrence) => occurrence === rule.nth_weekday) ?? null;
  const weekday = WEEKDAYS.find((weekday) => weekday === rule.weekday) ?? null;
  const month = numberValue(rule.month);
  const validNthWeekdayRule = cadence !== "YearlyNthWeekday" ||
    (nthWeekday !== null && weekday !== null && month >= 1 && month <= 12);
  const reset = rule.reset === true;
  if (!id || !isValidDate(startDate) || (!reset && amount <= 0) ||
    (endDate && !isValidDate(endDate)) || !validNthWeekdayRule) return null;
  return {
    id, amount: reset ? Math.max(0, amount) : amount, ...additionFlags(rule),
    start_date: startDate, cadence,
    ...(isValidDate(endDate) ? { end_date: endDate } : {}),
    ...(cadence === "YearlyNthWeekday" ? { month, nth_weekday: nthWeekday!, weekday: weekday! } : {}),
  };
}

function normalizeCap(value: unknown): PoolCap | null {
  const cap = record(value);
  const id = numberValue(cap.id);
  const rawMaxBalance = cap.max_balance;
  const maxBalance = amountValue(rawMaxBalance);
  const hasValidMaxBalance = (typeof rawMaxBalance === "number" ||
    (typeof rawMaxBalance === "string" && rawMaxBalance.trim() !== "")) && Number.isFinite(Number(rawMaxBalance));
  const startDate = stringValue(cap.start_date);
  const endDate = stringValue(cap.end_date);
  return id && hasValidMaxBalance && maxBalance >= 0 && isValidDate(startDate) &&
    (!endDate || (isValidDate(endDate) && startDate <= endDate))
    ? { id, max_balance: maxBalance, start_date: startDate, ...(endDate ? { end_date: endDate } : {}) }
    : null;
}

function normalizePool(value: unknown, warnings: string[]): Pool | null {
  const pool = record(value);
  const id = numberValue(pool.id);
  const name = stringValue(pool.name).trim();
  if (!id || !name) return null;
  const additions = normalizeEntries(pool.additions, normalizeAddition, "one-time additions", warnings);
  const recurring = normalizeEntries(pool.recurring, normalizeRecurring, "recurring additions", warnings);
  const capCandidates = normalizeEntries(pool.caps, normalizeCap, "caps", warnings);
  const caps: PoolCap[] = [];
  for (const cap of capCandidates.sort(compareStartDates)) {
    const previous = caps.at(-1);
    if (!previous || (previous.end_date && previous.end_date < cap.start_date)) caps.push(cap);
    else warnings.push("Ignored 1 overlapping cap.");
  }
  return {
    id, name, additions, recurring, caps,
    ...(pool.new_additions_expire_same_day === true ? { new_additions_expire_same_day: true } : {}),
    ...(isHexColor(pool.color) ? { color: pool.color } : {}),
    ...(pool.hidden_from_graph === true ? { hidden_from_graph: true } : {}),
    ...(pool.hidden_from_total === true ? { hidden_from_total: true } : {}),
  };
}

function normalizeAllocation(value: unknown, fallbackPoolId: number): PoolAllocation | null {
  const allocation = record(value);
  const poolId = numberValue(allocation.pool_id, fallbackPoolId) || fallbackPoolId;
  const hours = amountValue(allocation.hours);
  return poolId > 0 && hours > 0 ? { pool_id: poolId, hours } : null;
}

function normalizeDay(value: unknown, legacyPoolId: number, poolIds: Set<number>, warnings: string[], legacy: boolean): LeaveDay | null {
  const day = record(value);
  const date = stringValue(day.date);
  if (!isValidDate(date)) return null;
  const dayPoolId = legacy ? numberValue(day.pool_id, legacyPoolId) || legacyPoolId : 0;
  const rawAllocations = Array.isArray(day.allocations) ? day.allocations : [];
  const allocations = rawAllocations.length
    ? normalizeEntries(rawAllocations, (value) => {
        const allocation = normalizeAllocation(value, dayPoolId);
        return allocation && poolIds.has(allocation.pool_id) ? allocation : null;
      }, "allocations (invalid or missing pool)", warnings)
    : legacy && amountValue(day.hours) > 0 && poolIds.has(dayPoolId)
      ? [{ pool_id: dayPoolId, hours: amountValue(day.hours) }]
      : [];
  return allocations.length ? { date, allocations } : null;
}

function normalizeEvent(value: unknown, poolIds: Set<number>, warnings: string[], legacy: boolean): LeaveEvent | null {
  const event = record(value);
  const id = numberValue(event.id);
  const name = stringValue(event.name).trim();
  if (!id || !name) return null;
  const legacyPoolId = legacy ? numberValue(event.pool_id) : 0;
  let days = normalizeEntries(event.days,
    (value) => normalizeDay(value, legacyPoolId, poolIds, warnings, legacy), "event days", warnings);
  if (legacy && !Array.isArray(event.days) && isValidDate(stringValue(event.date)) &&
    amountValue(event.amount) > 0 && poolIds.has(legacyPoolId)) {
    days = [{ date: stringValue(event.date), allocations: [{ pool_id: legacyPoolId, hours: amountValue(event.amount) }] }];
  }
  return days.length ? { id, name, days: sortDays(days) } : null;
}

export function normalizeStore(value: unknown, warnings: string[] = []): Store {
  const source = record(value);
  // Only unversioned saves use historical event fallbacks.
  const legacy = source.version === undefined;
  if (!legacy && source.version !== STORE_VERSION) {
    throw new Error(`Unsupported data schema version: ${String(source.version)}. This app supports version ${STORE_VERSION}.`);
  }
  const pools = normalizeEntries(source.pools, (value) => normalizePool(value, warnings), "pools", warnings);
  const poolIds = new Set(pools.map((pool) => pool.id));
  const events = normalizeEntries(source.events,
    (value) => normalizeEvent(value, poolIds, warnings, legacy), "events", warnings);
  const storedNextId = numberValue(source.next_id, 1);
  return { version: STORE_VERSION, pools, events, next_id: Math.max(storedNextId, largestStoreId({ pools, events }) + 1, 1) };
}

export function parseStoreJson(json: string, warnings: string[] = []): Store {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This file does not contain a hima data export.");
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.pools) || !Array.isArray(source.events)) {
    throw new Error("This file does not contain a hima data export.");
  }
  return normalizeStore(source, warnings);
}
