import { useMemo } from "react";
import { addDays, eventPoolHours, poolBalanceOn, poolTotalsOn, type Store } from "./model";

export function usePoolCardFigures(store: Store, poolId: number, balanceDate: string) {
  return useMemo(() => {
    const totals = poolTotalsOn(store, poolId, balanceDate);
    const currentBalance = totals.balance;
    const dayAdded = totals.accrued - poolTotalsOn(store, poolId, addDays(balanceDate, -1)).accrued;
    const dayHours = store.events.reduce((total, event) => total + eventPoolHours({
      days: event.days.filter((day) => day.date === balanceDate),
    }, poolId), 0);
    const startingBalance = dayHours > 0
      ? poolBalanceOn({ ...store, events: store.events.map((event) => ({
          ...event, days: event.days.filter((day) => day.date !== balanceDate),
        })) }, poolId, balanceDate)
      : currentBalance;
    return { currentBalance, dayAdded, dayHours, startingBalance };
  }, [store, poolId, balanceDate]);
}
