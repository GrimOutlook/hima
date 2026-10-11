// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import * as model from "./model";
import { usePoolCardFigures } from "./usePoolCardFigures";

it("keeps ledger replays out of drag rerenders and refreshes figures when inputs change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const store: model.Store = { ...model.emptyStore(), pools: [
    { id: 1, name: "Capped", additions: [
      { id: 3, amount: 8, date: "2026-01-01" },
      { id: 4, amount: 8, date: "2026-01-02", expires_same_day: true },
    ], recurring: [], caps: [{ id: 5, max_balance: 10, start_date: "2026-01-01" }] },
    { id: 2, name: "Other", additions: [], recurring: [], caps: [] },
  ], events: [{ id: 6, name: "Leave", days: [{ date: "2026-01-02", allocations: [{ pool_id: 1, hours: 3 }] }] }] };
  let figures: ReturnType<typeof usePoolCardFigures>;
  function Card({ data = store, poolId = 1, date = "2026-01-02", frame = 0 }) {
    figures = usePoolCardFigures(data, poolId, date);
    return <div style={{ transform: `translateX(${frame}px)` }}>{figures.currentBalance}</div>;
  }
  const totals = vi.spyOn(model, "poolTotalsOn");
  try {
    await act(async () => root.render(<Card />));
    expect(figures!).toEqual({ currentBalance: 7, dayAdded: 2, dayHours: 3, startingBalance: 10 });
    const initial = figures!;
    totals.mockClear();
    for (let frame = 1; frame <= 10; frame++) {
      await act(async () => root.render(<Card frame={frame} />));
    }
    expect(figures!).toBe(initial);
    expect(totals).not.toHaveBeenCalled();

    await act(async () => root.render(<Card date="2026-01-03" />));
    expect(figures!).toEqual({ currentBalance: 7, dayAdded: 0, dayHours: 0, startingBalance: 7 });
    expect(totals).toHaveBeenCalledTimes(2);

    await act(async () => root.render(<Card poolId={2} />));
    expect(figures!).toEqual({ currentBalance: 0, dayAdded: 0, dayHours: 0, startingBalance: 0 });

    await act(async () => root.render(<Card data={{ ...store, events: [] }} />));
    expect(figures!).toEqual({ currentBalance: 10, dayAdded: 2, dayHours: 0, startingBalance: 10 });
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
