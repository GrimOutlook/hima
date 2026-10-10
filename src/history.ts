import { addDays, addMonths, dateFromParts, isValidDate, MAX_DATE, MIN_DATE } from "./dates";
import { roundHours } from "./hours";
import { poolLedgerForDates } from "./ledger";
import type { BalancePoint, Pool, Store } from "./types";

export const MAX_HISTORY_POINTS = 3660;

function historyPools(store: Store, poolId?: number): Pool[] {
  return store.pools.filter((pool) => poolId === undefined ? !pool.hidden_from_graph : pool.id === poolId);
}

export function balanceHistoryDates(store: Store, today: string, poolId?: number): string[] {
  if (!isValidDate(today)) return [];
  const pools = historyPools(store, poolId);
  const poolIds = new Set(pools.map((pool) => pool.id));
  const eventDates = store.events.flatMap((event) => event.days
    .filter((day) => day.allocations.some((allocation) => poolIds.has(allocation.pool_id)))
    .map((day) => day.date)).filter(isValidDate);
  const relevantDates = [
    ...pools.flatMap((pool) => [
      ...pool.additions.map((addition) => addition.date),
      ...pool.recurring.map((rule) => rule.start_date),
      ...pool.caps.map((cap) => cap.start_date),
    ]),
    ...eventDates,
  ].filter(isValidDate);
  const defaultStart = addMonths(today, -12);
  const earliestDate = relevantDates.reduce((earliest, date) => date < earliest ? date : earliest, defaultStart);
  const rawStart = eventDates.reduce((first, date) => {
    const buffered = addDays(date, -7);
    return buffered < first ? buffered : first;
  }, earliestDate);
  const rawEnd = eventDates.reduce((last, date) => {
    const buffered = addDays(date, 7);
    return buffered > last ? buffered : last;
  }, `${Number(today.slice(0, 4)) + 1}-12-31`);
  const start = rawStart < MIN_DATE ? MIN_DATE : rawStart;
  const end = rawEnd > MAX_DATE ? MAX_DATE : rawEnd;
  // Bound chart allocation independently of document validation. Long histories
  // retain both endpoints; ledger replay still includes every intervening action.
  const span = Math.round((dateFromParts(end)!.getTime() - dateFromParts(start)!.getTime()) / 86_400_000);
  const step = Math.max(1, Math.ceil(span / (MAX_HISTORY_POINTS - 1)));
  const dates: string[] = [];
  for (let offset = 0; offset < span; offset += step) dates.push(addDays(start, offset));
  dates.push(end);
  return dates;
}

// Chart series must replay their ledgers over the same dates, even when a
// different pool supplies the earliest opening balance or latest leave event.
export function balanceHistoryForDates(store: Store, today: string, dates: string[], poolId?: number): BalancePoint[] {
  if (!isValidDate(today)) return [];
  const ledgers = historyPools(store, poolId).map((pool) => poolLedgerForDates(pool, store.events, dates));
  return dates.map((date, index) => ({
    date,
    balance: roundHours(ledgers.reduce((total, ledger) => total + (ledger[index]?.balance ?? 0), 0)),
    projected: date > today,
  }));
}
