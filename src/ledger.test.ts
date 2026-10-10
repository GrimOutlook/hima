import { describe, expect, it } from "vitest";
import { poolDayFiguresOn, poolLedgerForDates, poolTotalsOn, totalsOn } from "./ledger";
import { emptyStore } from "./model";
import type { LeaveEvent, Pool } from "./types";

describe("cached ledger queries", () => {
  it("supports unsorted dates, later queries, bounds and isolated returned snapshots", () => {
    const pool: Pool = { id: 1, name: "Leave", caps: [], additions: [], recurring: [
      { id: 2, cadence: "Monthly", start_date: "2024-01-31", amount: 2 },
    ] };
    const events: LeaveEvent[] = [];
    expect(poolLedgerForDates(pool, events, ["2024-03-31", "2024-02-28", "2024-02-29", "1900-01-01", "invalid"]).map((snapshot) => snapshot.balance))
      .toEqual([6, 2, 4, 0, 0]);
    const last = poolLedgerForDates(pool, events, ["2200-12-31"])[0]!;
    expect(last.balance).toBe(177 * 12 * 2);
    last.balance = -999;
    expect(poolLedgerForDates(pool, events, ["2200-12-31"])[0]!.balance).toBe(4248);
  });

  it("invalidates for immutable pool and event changes without replaying unchanged inputs", () => {
    let credits = 0;
    let scans = 0;
    const pool: Pool = { id: 1, name: "Leave", caps: [], additions: [], recurring: [
      { id: 2, cadence: "Weekly", start_date: "2026-01-01", end_date: "2026-01-31", get amount() { credits += 1; return 2; } },
    ] };
    const events: LeaveEvent[] = [{ id: 3, name: "Leave", get days() {
      scans += 1;
      return [{ date: "2026-01-02", allocations: [{ pool_id: 1, hours: 1 }] }];
    } }];
    const store = { ...emptyStore(), pools: [pool], events };
    expect(totalsOn(store, "2026-01-31").balance).toBe(9);
    const builtCredits = credits;
    for (let index = 0; index < 1000; index += 1) {
      poolTotalsOn(store, 1, "2026-01-02");
      totalsOn(store, "2026-01-31");
      expect(poolDayFiguresOn(store, 1, "2026-01-02")).toEqual({ dayHours: 1, startingBalance: 2 });
      poolLedgerForDates(pool, events, ["2026-01-01", "2026-01-31"]);
    }
    expect(credits).toBe(builtCredits);
    expect(scans).toBe(1);
    const edited = { ...pool, additions: [{ id: 4, date: "2026-01-03", amount: 3 }] };
    expect(poolTotalsOn({ ...store, pools: [edited] }, 1, "2026-01-31").balance).toBe(12);
    expect(scans).toBe(1);
    expect(poolTotalsOn({ ...store, events: [] }, 1, "2026-01-31").balance).toBe(10);
    expect(poolTotalsOn(store, 1, "2026-01-31").balance).toBe(9);
  });

  it("keeps capped holiday and reset starting balances correct without alternate event ledgers", () => {
    const pool: Pool = { id: 1, name: "Holiday", recurring: [], caps: [
      { id: 2, start_date: "2026-01-01", max_balance: 10 },
    ], additions: [
      { id: 3, date: "2026-01-01", amount: 8 },
      { id: 4, date: "2026-01-02", amount: 8, expires_same_day: true },
      { id: 5, date: "2026-01-04", amount: 7, reset: true },
    ] };
    const store = { ...emptyStore(), pools: [pool], events: [{ id: 6, name: "Leave", days: [
      { date: "2026-01-02", allocations: [{ pool_id: 1, hours: 1 }] },
      { date: "2026-01-04", allocations: [{ pool_id: 1, hours: 3 }] },
    ] }] };
    expect(poolDayFiguresOn(store, 1, "2026-01-02")).toEqual({ dayHours: 1, startingBalance: 10 });
    expect(poolTotalsOn(store, 1, "2026-01-03").balance).toBe(8);
    expect(poolDayFiguresOn(store, 1, "2026-01-03")).toEqual({ dayHours: 0, startingBalance: 8 });
    expect(poolDayFiguresOn(store, 1, "2026-01-04")).toEqual({ dayHours: 3, startingBalance: 7 });
  });
});
