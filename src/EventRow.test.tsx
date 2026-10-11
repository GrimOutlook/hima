// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EventRow } from "./EventRow";
import type { LeaveEvent, Pool } from "./model";
import * as model from "./model";

it("reuses row derivations across selection and balance changes and invalidates edited inputs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const total = vi.spyOn(model, "eventTotalHours");
  const shares = vi.spyOn(model, "eventPoolHours");
  const dates = vi.spyOn(model, "eventDateRangeLabel");
  const pools: Pool[] = [{ id: 1, name: "Annual", additions: [], recurring: [], caps: [] }];
  const event: LeaveEvent = { id: 2, name: "Trip", days: [
    { date: "2026-02-02", allocations: [{ pool_id: 1, hours: 8 }] },
    { date: "2026-02-01", allocations: [{ pool_id: 1, hours: 4 }] },
  ] };
  const container = document.createElement("div");
  const root = createRoot(container);
  const callbacks = { onSelect: vi.fn(), onZoom: vi.fn(), onEdit: vi.fn() };
  try {
    const render = async (shown = event, full = event, currentPools = pools, balanceDate = "2026-01-01", selected = false) => {
      await act(async () => root.render(<EventRow event={shown} fullEvent={full} pools={currentPools}
        balanceDate={balanceDate} selected={selected} zoomed={selected} {...callbacks} />));
    };
    await render();
    await render(event, event, pools, "2026-02-01", true);
    expect(total).toHaveBeenCalledTimes(1);
    expect(shares).toHaveBeenCalledTimes(1);
    expect(dates).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".event-status")?.textContent).toBe("Partly included");
    const filtered = { ...event, days: event.days.slice(1) };
    await render(filtered);
    expect(container.querySelector(".event-amount")?.textContent).toBe("−4 h");
    expect(shares).toHaveBeenCalledTimes(1);
    const renamedPools = pools.map((pool) => ({ ...pool, name: "Renamed", color: "#ff0000" }));
    await render(filtered, event, renamedPools);
    expect(container.querySelector(".event-pool-bar")?.getAttribute("aria-label")).toBe("Renamed: 12 hours (100.0%)");
    expect(total).toHaveBeenCalledTimes(2);
    const edited = { ...event, days: [{ date: "2026-03-01", allocations: [{ pool_id: 1, hours: 3 }] }] };
    await render(edited, edited, renamedPools);
    expect(container.querySelector(".event-amount")?.textContent).toBe("−3 h");
    expect(container.querySelector(".event-month")?.textContent).toBe(model.monthLabel("2026-03-01"));
    expect(total).toHaveBeenCalledTimes(3);
    expect(shares).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("keeps filtered hours separate from whole-event shares and buttons separate from row selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pools: Pool[] = [1, 2].map((id) => ({ id, name: `Pool ${id}`, additions: [], recurring: [], caps: [] }));
  const fullEvent: LeaveEvent = { id: 3, name: "Trip", days: [
    { date: "2026-01-01", allocations: [{ pool_id: 1, hours: 2 }, { pool_id: 2, hours: 6 }] },
    { date: "2026-01-02", allocations: [{ pool_id: 1, hours: 8 }] },
  ] };
  const event = { ...fullEvent, days: fullEvent.days.map((day) => ({
    ...day, allocations: day.allocations.filter((allocation) => allocation.pool_id === 2),
  })).filter((day) => day.allocations.length > 0) };
  const onSelect = vi.fn();
  const onZoom = vi.fn();
  const onEdit = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EventRow event={event} fullEvent={fullEvent} pools={pools}
      balanceDate="2026-01-01" selected={false} zoomed={false}
      onSelect={onSelect} onZoom={onZoom} onEdit={onEdit} />));
    expect(container.querySelector(".event-amount")?.textContent).toBe("−6 h");
    expect(container.querySelector(".event-status")?.textContent).toBe("Included in balance");
    const bar = container.querySelector(".event-pool-bar")!;
    expect(bar.getAttribute("aria-label")).toBe("Pool 1: 10 hours (62.5%), Pool 2: 6 hours (37.5%)");
    expect(Array.from(bar.children, (node) => (node as HTMLElement).style.width)).toEqual(["62.5%", "37.5%"]);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Edit Trip"]')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zoom to Trip"]')!.click());
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onZoom).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLElement>(".event-date-block")!.click());
    expect(onSelect).toHaveBeenCalledOnce();
    await act(async () => root.render(<EventRow event={fullEvent} fullEvent={fullEvent} pools={pools}
      balanceDate="2026-01-01" selected zoomed onSelect={onSelect} onZoom={onZoom} onEdit={onEdit} />));
    expect(container.querySelector(".event-amount")?.textContent).toBe("−16 h");
    expect(container.querySelector(".event-status-partial")?.textContent).toBe("Partly included");
    expect(container.querySelector('[aria-label="Widen timeline around Trip"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
