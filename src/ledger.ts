import { addDays, compareDates, firstDate, formatDateParts, isValidDate, MAX_DATE, nthWeekdayInMonth } from "./dates";
import { roundHours } from "./hours";
import type { LeaveDay, LeaveEvent, Pool, Store } from "./types";

export interface PoolLedgerSnapshot {
  accrued: number;
  used: number;
  balance: number;
}

function emptySnapshot(): PoolLedgerSnapshot {
  return { accrued: 0, used: 0, balance: 0 };
}

export function totalsOn(store: Store, date: string): PoolLedgerSnapshot {
  const ledgers = store.pools.filter((pool) => !pool.hidden_from_total)
    .map((pool) => poolLedgerForDates(pool, store.events, [date])[0]);
  const accrued = ledgers.reduce((total, ledger) => total + (ledger?.accrued ?? 0), 0);
  const used = ledgers.reduce((total, ledger) => total + (ledger?.used ?? 0), 0);
  const balance = ledgers.reduce((total, ledger) => total + (ledger?.balance ?? 0), 0);
  return { accrued: roundHours(accrued), used: roundHours(used), balance: roundHours(balance) };
}

export function poolTotalsOn(store: Store, poolId: number, date: string): PoolLedgerSnapshot {
  const pool = store.pools.find((candidate) => candidate.id === poolId);
  return (pool ? poolLedgerForDates(pool, store.events, [date])[0] : undefined) ?? emptySnapshot();
}

export function eventBalanceWarnings(store: Store, days: LeaveDay[], replacingEventId?: number): Array<{ poolId: number; date: string; balance: number }> {
  const start = firstDate(days);
  if (!start) return [];
  const events = [...store.events.filter((event) => event.id !== replacingEventId), { id: store.next_id, name: "Event preview", days }];
  const affectedPoolIds = new Set(days.flatMap((day) => day.allocations.map((allocation) => allocation.pool_id)));
  const dates = [...new Set(events.flatMap((event) => event.days.map((day) => day.date)))].filter((date) => date >= start).sort();
  return store.pools.filter((pool) => affectedPoolIds.has(pool.id)).flatMap((pool) => {
    const balances = poolLedgerForDates(pool, events, dates);
    const index = balances.findIndex((ledger) => ledger.balance < 0);
    const date = dates[index];
    const ledger = balances[index];
    return date === undefined || !ledger ? [] : [{ poolId: pool.id, date, balance: ledger.balance }];
  });
}

interface PoolDailyActions {
  accrued: number;
  expiring?: number;
  used: number;
  reset?: number;
}

interface LedgerIndex {
  dates: string[];
  snapshots: PoolLedgerSnapshot[];
  dayFigures: Map<string, { dayHours: number; startingBalance: number }>;
}

// Store updates replace pools/events immutably. Weak keys release old planners;
// all consumers (including charts and previews) share the same running ledger.
// Expand through the supported maximum once, so later/future queries never
// replay recurrence. Query results are copies to keep snapshots private.
const ledgerCache = new WeakMap<LeaveEvent[], WeakMap<Pool, LedgerIndex>>();
const eventCache = new WeakMap<LeaveEvent[], Map<number, Map<string, number>>>();

function indexedEventHours(events: LeaveEvent[]): Map<number, Map<string, number>> {
  const cached = eventCache.get(events);
  if (cached) return cached;
  const indexed = new Map<number, Map<string, number>>();
  for (const event of events) {
    for (const day of event.days) {
      const hoursByPool = new Map<number, number>();
      for (const allocation of day.allocations) {
        hoursByPool.set(allocation.pool_id, (hoursByPool.get(allocation.pool_id) ?? 0) + allocation.hours);
      }
      for (const [poolId, hours] of hoursByPool) {
        if (hours <= 0) continue;
        const days = indexed.get(poolId) ?? new Map<string, number>();
        days.set(day.date, (days.get(day.date) ?? 0) + hours);
        indexed.set(poolId, days);
      }
    }
  }
  eventCache.set(events, indexed);
  return indexed;
}

export function poolDayFiguresOn(store: Store, poolId: number, date: string): { dayHours: number; startingBalance: number } {
  const totals = poolTotalsOn(store, poolId, date);
  const pool = store.pools.find((candidate) => candidate.id === poolId);
  const figures = pool && ledgerCache.get(store.events)?.get(pool)?.dayFigures.get(date);
  return figures ? { ...figures } : { dayHours: 0, startingBalance: totals.balance };
}

export function poolLedgerForDates(pool: Pool, events: LeaveEvent[], dates: string[]): PoolLedgerSnapshot[] {
  if (dates.length === 0) return [];
  let pools = ledgerCache.get(events);
  if (!pools) {
    pools = new WeakMap();
    ledgerCache.set(events, pools);
  }
  let ledger = pools.get(pool);
  if (!ledger) {
    ledger = buildLedger(pool, indexedEventHours(events).get(pool.id));
    pools.set(pool, ledger);
  }
  return dates.map((date) => {
    if (!isValidDate(date)) return emptySnapshot();
    let low = 0;
    let high = ledger.dates.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ledger.dates[middle]! <= date) low = middle + 1;
      else high = middle;
    }
    return { ...(ledger.snapshots[low - 1] ?? emptySnapshot()) };
  });
}

function buildLedger(pool: Pool, eventHours: Map<string, number> | undefined): LedgerIndex {
  const throughDate = MAX_DATE;

  const actions = new Map<string, PoolDailyActions>();
  const actionForDate = (date: string): PoolDailyActions => {
    const existing = actions.get(date);
    if (existing) return existing;
    const created: PoolDailyActions = { accrued: 0, used: 0 };
    actions.set(date, created);
    return created;
  };
  const postCredit = (date: string, amount: number, expires: boolean | undefined) => {
    const daily = actionForDate(date);
    daily.accrued += amount;
    if (expires) {
      daily.expiring = (daily.expiring ?? 0) + amount;
      // Include the next day even when no other ledger actions happen then.
      const expiryDate = addDays(date, 1);
      if (expiryDate <= throughDate) actionForDate(expiryDate);
    }
  };

  for (const addition of pool.additions) {
    if (isValidDate(addition.date) && addition.date <= throughDate) {
      if (addition.reset) actionForDate(addition.date).reset = addition.amount;
      else postCredit(addition.date, addition.amount, addition.expires_same_day);
    }
  }

  for (const rule of pool.recurring) {
    if (!isValidDate(rule.start_date) || (rule.end_date && !isValidDate(rule.end_date))) continue;
    if (rule.cadence === "YearlyNthWeekday" &&
      (rule.month === undefined || !rule.nth_weekday || !rule.weekday)) continue;
    const recurringEnd = rule.end_date && rule.end_date < throughDate ? rule.end_date : throughDate;
    if (rule.start_date > recurringEnd) continue;

    let occurrenceIndex = 0;
    let previousOccurrence = "";
    const startYear = Number(rule.start_date.slice(0, 4));
    const startMonth = Number(rule.start_date.slice(5, 7)) - 1;
    const startDay = Number(rule.start_date.slice(8, 10));
    const startTime = Date.UTC(startYear, startMonth, startDay);
    while (true) {
      let occurrenceDate: string | null;
      if (rule.cadence === "YearlyNthWeekday") {
        const occurrenceYear = Number(rule.start_date.slice(0, 4)) + occurrenceIndex;
        if (occurrenceYear > Number(recurringEnd.slice(0, 4))) break;
        occurrenceDate = nthWeekdayInMonth(occurrenceYear, rule.month!, rule.nth_weekday!, rule.weekday!);
        occurrenceIndex += 1;
        if (!occurrenceDate || occurrenceDate < rule.start_date) continue;
      } else {
        if (rule.cadence === "Weekly" || rule.cadence === "Fortnightly") {
          const occurrence = new Date(startTime + occurrenceIndex * (rule.cadence === "Weekly" ? 7 : 14) * 86400000);
          occurrenceDate = formatDateParts(occurrence.getUTCFullYear(), occurrence.getUTCMonth() + 1, occurrence.getUTCDate());
        } else {
          const month = startMonth + occurrenceIndex * (rule.cadence === "Monthly" ? 1 : 12);
          const occurrence = new Date(Date.UTC(startYear, month, 1));
          const lastDay = new Date(Date.UTC(startYear, month + 1, 0)).getUTCDate();
          occurrenceDate = formatDateParts(occurrence.getUTCFullYear(), occurrence.getUTCMonth() + 1, Math.min(startDay, lastDay));
        }
      }
      if (occurrenceDate > recurringEnd || occurrenceDate <= previousOccurrence) break;
      if (rule.reset) actionForDate(occurrenceDate).reset = rule.amount;
      else postCredit(occurrenceDate, rule.amount, rule.expires_same_day);
      previousOccurrence = occurrenceDate;
      if (rule.cadence !== "YearlyNthWeekday") occurrenceIndex += 1;
    }
  }

  for (const [date, hours] of eventHours ?? []) actionForDate(date).used += hours;

  const orderedActions = [...actions.entries()].sort(([left], [right]) => compareDates(left, right));
  let balance = 0;
  let accrued = 0;
  let used = 0;
  let expiringBalance = 0;
  const dayFigures = new Map<string, { dayHours: number; startingBalance: number }>();
  const snapshots = orderedActions.map(([actionDate, daily]) => {
    // Only the unused portion of the previous day's temporary credit expires.
    balance = roundHours(balance - expiringBalance);
    expiringBalance = 0;
    const activeCap = pool.caps.find(
      (cap) => cap.start_date <= actionDate && (!cap.end_date || actionDate <= cap.end_date),
    );
    // Cap each credit when posted; same-day leave use is applied after accrual.
    const acceptedAccrual = activeCap
      ? Math.min(daily.accrued, Math.max(0, activeCap.max_balance - balance))
      : daily.accrued;
    dayFigures.set(actionDate, { dayHours: daily.used, startingBalance: daily.reset ?? roundHours(balance + acceptedAccrual) });
    balance = roundHours(balance + acceptedAccrual - daily.used);
    // Permanent credits are posted first when a cap limits same-day accrual.
    const acceptedExpiring = Math.max(0, acceptedAccrual - (daily.accrued - (daily.expiring ?? 0)));
    expiringBalance = roundHours(Math.max(0, acceptedExpiring - daily.used));
    accrued = roundHours(accrued + acceptedAccrual);
    used = roundHours(used + daily.used);
    // Reset dates replace the remaining balance at the end of the day.
    if (daily.reset !== undefined) {
      balance = daily.reset;
      expiringBalance = 0;
    }
    return { accrued, used, balance };
  });
  return { dates: orderedActions.map(([date]) => date), snapshots, dayFigures };
}
