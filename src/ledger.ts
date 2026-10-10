import { addDays, addMonths, compareDates, firstDate, isValidDate, nthWeekdayInMonth } from "./dates";
import { dayPoolHours } from "./events";
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

export function poolLedgerForDates(pool: Pool, events: LeaveEvent[], dates: string[]): PoolLedgerSnapshot[] {
  const throughDate = dates.at(-1);
  if (!throughDate || !isValidDate(throughDate)) return dates.map(emptySnapshot);

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
    while (true) {
      let occurrenceDate: string | null;
      if (rule.cadence === "YearlyNthWeekday") {
        const occurrenceYear = Number(rule.start_date.slice(0, 4)) + occurrenceIndex;
        if (occurrenceYear > Number(recurringEnd.slice(0, 4))) break;
        occurrenceDate = nthWeekdayInMonth(occurrenceYear, rule.month!, rule.nth_weekday!, rule.weekday!);
        occurrenceIndex += 1;
        if (!occurrenceDate || occurrenceDate < rule.start_date) continue;
      } else {
        occurrenceDate = rule.cadence === "Weekly"
          ? addDays(rule.start_date, occurrenceIndex * 7)
          : rule.cadence === "Fortnightly"
            ? addDays(rule.start_date, occurrenceIndex * 14)
            : addMonths(rule.start_date, occurrenceIndex * (rule.cadence === "Monthly" ? 1 : 12));
      }
      if (!isValidDate(occurrenceDate) || occurrenceDate > recurringEnd || occurrenceDate <= previousOccurrence) break;
      if (rule.reset) actionForDate(occurrenceDate).reset = rule.amount;
      else postCredit(occurrenceDate, rule.amount, rule.expires_same_day);
      previousOccurrence = occurrenceDate;
      if (rule.cadence !== "YearlyNthWeekday") occurrenceIndex += 1;
    }
  }

  for (const event of events) {
    for (const day of event.days) {
      if (!isValidDate(day.date) || day.date > throughDate) continue;
      const hours = dayPoolHours(day, pool.id);
      if (hours > 0) actionForDate(day.date).used += hours;
    }
  }

  const orderedActions = [...actions.entries()].sort(([left], [right]) => compareDates(left, right));
  let actionIndex = 0;
  let balance = 0;
  let accrued = 0;
  let used = 0;
  let expiringBalance = 0;
  return dates.map((date) => {
    while (true) {
      const action = orderedActions[actionIndex];
      if (!action || action[0] > date) break;
      const [actionDate, daily] = action;
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
      actionIndex += 1;
    }
    return { accrued, used, balance };
  });
}
