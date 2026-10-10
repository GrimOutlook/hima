import { useMemo } from "react";
import { addDays, poolTotalsOn, type Store } from "./model";
import { poolDayFiguresOn } from "./ledger";

export function usePoolCardFigures(store: Store, poolId: number, balanceDate: string) {
  return useMemo(() => {
    const totals = poolTotalsOn(store, poolId, balanceDate);
    const currentBalance = totals.balance;
    const dayAdded = totals.accrued - poolTotalsOn(store, poolId, addDays(balanceDate, -1)).accrued;
    const { dayHours, startingBalance } = poolDayFiguresOn(store, poolId, balanceDate);
    return { currentBalance, dayAdded, dayHours, startingBalance };
  }, [store, poolId, balanceDate]);
}
