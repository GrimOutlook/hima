import { balanceHistoryDates, balanceHistoryForDates } from "./history";
import type { BalancePoint, Pool, Store } from "./types";

function sameLedger(left: Pool, right: Pool): boolean {
  return left.id === right.id && left.additions === right.additions
    && left.recurring === right.recurring && left.caps === right.caps;
}

// One selector per planner. Keep only the current document's pools; cosmetic
// replacements retain their original ledger identity and cached chart series.
export function createChartHistorySelector() {
  let pools: Pool[] = [];
  let events: Store["events"] | undefined;
  let end: string | undefined;
  let dates: string[] = [];
  let histories: Record<number, BalancePoint[]> = {};
  return (store: Store, today: string) => {
    const previous = new Map(pools.map((pool) => [pool.id, pool]));
    const nextPools = store.pools.map((pool) => {
      const old = previous.get(pool.id);
      return old && sameLedger(old, pool) ? old : pool;
    });
    const inputsChanged = events !== store.events || end !== today
      || nextPools.length !== pools.length || nextPools.some((pool) => previous.get(pool.id) !== pool);
    if (inputsChanged) {
      const nextDates = balanceHistoryDates(store, today, undefined, true);
      const datesChanged = nextDates.length !== dates.length || nextDates.some((date, index) => date !== dates[index]);
      if (datesChanged) dates = nextDates;
      histories = Object.fromEntries(nextPools.map((pool) => [pool.id,
        !datesChanged && events === store.events && end === today && previous.get(pool.id) === pool
          ? histories[pool.id]!
          : balanceHistoryForDates({ ...store, pools: [pool] }, today, dates, pool.id),
      ]));
    }
    pools = nextPools;
    events = store.events;
    end = today;
    return { historyDates: dates, poolHistories: histories };
  };
}
