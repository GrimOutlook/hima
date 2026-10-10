import { expect, it } from "vitest";
import { totalsOn, poolDayFiguresOn, poolTotalsOn } from "./ledger";
import { addDays, emptyStore, balanceHistoryForDates } from "./model";
import type { Pool } from "./types";

it("measures cold build and warm totals/cards/history on synthetic planners", () => {
  for (const [poolCount, eventCount, years] of [[4, 60, 5], [8, 300, 10], [20, 1000, 15]]) {
    const pools: Pool[] = Array.from({ length: poolCount! }, (_, index) => ({
      id: index + 1, name: "Leave", additions: [], caps: [], recurring: [
        { id: 100 + index, cadence: "Weekly", start_date: "2010-01-01", amount: 1 },
      ],
    }));
    const events = Array.from({ length: eventCount! }, (_, index) => ({
      id: 200 + index, name: "Leave", days: [{ date: addDays("2010-01-01", index * 5),
        allocations: [{ pool_id: index % poolCount! + 1, hours: 1 }] }],
    }));
    const store = { ...emptyStore(), pools, events };
    const date = `${2010 + years!}-01-01`;
    const dates = Array.from({ length: years! * 365 }, (_, index) => addDays("2010-01-01", index));
    let start = performance.now();
    const total = totalsOn(store, date);
    const cold = performance.now() - start;
    start = performance.now();
    for (let index = 0; index < 1000; index++) totalsOn(store, date);
    const warm = (performance.now() - start) / 1000;
    start = performance.now();
    for (let index = 0; index < 100; index++) for (const pool of pools) {
      poolTotalsOn(store, pool.id, date);
      poolTotalsOn(store, pool.id, addDays(date, -1));
      poolDayFiguresOn(store, pool.id, date);
    }
    const cards = (performance.now() - start) / 100;
    start = performance.now();
    const history = balanceHistoryForDates(store, date, dates);
    const chart = performance.now() - start;
    expect(history).toHaveLength(dates.length);
    expect(total.used).toBe(eventCount);
    console.log({ poolCount, eventCount, years, cold, warm, cards, chart });
  }
});
