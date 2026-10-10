// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EventRow } from "./EventRow";
import type { LeaveEvent, Pool } from "./model";

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
