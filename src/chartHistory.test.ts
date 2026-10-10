import { describe, expect, it, vi } from "vitest";
import { createChartHistorySelector } from "./chartHistory";
import * as history from "./history";
import { emptyStore, type Store } from "./model";

function fixture(): Store {
  return { ...emptyStore(), pools: [1, 2].map((id) => ({
    id, name: `Pool ${id}`, additions: [{ id: id + 2, amount: 40, date: "2025-01-01" }], recurring: [], caps: [],
  })) };
}

describe("chart history memoization", () => {
  it("does no date or series work for settings, ordering, visibility and cosmetic changes", () => {
    const dates = vi.spyOn(history, "balanceHistoryDates");
    const series = vi.spyOn(history, "balanceHistoryForDates");
    const select = createChartHistorySelector();
    const store = fixture();
    const first = select(store, "2025-02-01");
    dates.mockClear(); series.mockClear();
    const updated = { ...store, next_id: 100, pools: [...store.pools].reverse().map((pool) => ({
      ...pool, name: "Renamed", color: "#123456", hidden_from_graph: true, hidden_from_total: true,
      new_additions_expire_same_day: true,
    })) };
    expect(select(updated, "2025-02-01")).toEqual(first);
    expect(select(updated, "2025-02-01").poolHistories).toBe(first.poolHistories);
    expect(dates).not.toHaveBeenCalled(); expect(series).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("refreshes only changed ledgers until dates, events or today change", () => {
    const select = createChartHistorySelector();
    let store = fixture();
    let old = select(store, "2025-02-01");
    const edits = [
      { additions: [{ id: 3, amount: 60, date: "2025-01-01" }] },
      { recurring: [{ id: 5, amount: 2, cadence: "Monthly" as const, start_date: "2025-01-01" }] },
      { caps: [{ id: 6, max_balance: 45, start_date: "2025-01-01" }] },
    ];
    for (const edit of edits) {
      store = { ...store, pools: store.pools.map((pool, index) => index ? pool : { ...pool, ...edit }) };
      const next = select(store, "2025-02-01");
      expect(next.historyDates).toBe(old.historyDates);
      expect(next.poolHistories[1]).not.toBe(old.poolHistories[1]);
      expect(next.poolHistories[2]).toBe(old.poolHistories[2]);
      expect(next.poolHistories[1]).toEqual(history.balanceHistoryForDates(store, "2025-02-01", next.historyDates, 1));
      old = next;
    }
    store = { ...store, events: [{ id: 10, name: "Leave", days: [{ date: "2025-02-01", allocations: [{ pool_id: 1, hours: 8 }] }] }] };
    const used = select(store, "2025-02-01");
    expect(used.poolHistories[1]?.find((point) => point.date === "2025-02-01")?.balance).toBe(37);
    expect(used.poolHistories[2]).not.toBe(old.poolHistories[2]);
    const tomorrow = select(store, "2025-02-02");
    expect(tomorrow.poolHistories[1]?.find((point) => point.date === "2025-02-02")?.projected).toBe(false);
    store = { ...store, pools: store.pools.map((pool, index) => index ? pool : { ...pool, additions: [{ id: 3, amount: 50, date: "2020-01-01" }] }) };
    const extended = select(store, "2025-02-02");
    expect(extended.historyDates[0]).toBe("2020-01-01");
    expect(extended.poolHistories[2]).not.toBe(tomorrow.poolHistories[2]);
    expect(select({ ...store, pools: [store.pools[1]!] }, "2025-02-02").poolHistories[1]).toBeUndefined();
    expect(select(fixture(), "2025-02-02").poolHistories[1]?.[0]?.balance).toBe(0);
  });

  it("includes hidden pool dates without changing the document and matches uncached histories", () => {
    const store = fixture();
    store.pools[0] = { ...store.pools[0]!, hidden_from_graph: true, additions: [{ id: 3, amount: 20, date: "2020-01-01" }] };
    const before = structuredClone(store);
    const result = createChartHistorySelector()(store, "2025-02-01");
    expect(result.historyDates[0]).toBe("2020-01-01");
    for (const pool of store.pools) expect(result.poolHistories[pool.id]).toEqual(history.balanceHistoryForDates(store, "2025-02-01", result.historyDates, pool.id));
    expect(store).toEqual(before);
  });
});
