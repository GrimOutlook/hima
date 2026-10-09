// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";
import { emptyStore, STORAGE_KEY, type BalancePoint } from "./model";

vi.mock("./BalanceChart", () => ({ BalanceChart: (props: {
  zoomToSelectedEvent?: boolean; widenSelectedEvent?: boolean;
  historyDates: string[]; poolHistories: Record<number, BalancePoint[]>;
}) =>
  <div data-testid="chart" data-zoom={String(props.zoomToSelectedEvent)} data-wide={String(props.widenSelectedEvent)}
    data-dates={JSON.stringify(props.historyDates)} data-histories={JSON.stringify(props.poolHistories)} /> }));

it.each([
  [false, false, "100", "122.8 h", "22.8 h"],
  [true, false, "100", "122.8 h", "22.8 h"],
  [false, true, "0", "22.8 h", "22.8 h"],
  [true, true, "0", "22.8 h", "22.8 h"],
])("keeps graph visibility (%s) independent of total exclusion (%s) and avoids negative zero", async (hiddenGraph, hiddenTotal, balance, accrued, used) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-01-15T12:00:00"));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const previousScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(), next_id: 6,
    pools: [
      { id: 1, name: "Vacation", additions: [], caps: [], recurring: [
        { id: 3, amount: 7.6, cadence: "Weekly", start_date: "2026-01-01", end_date: "2026-01-15" },
      ] },
      { id: 2, name: "Reserve", hidden_from_graph: hiddenGraph, hidden_from_total: hiddenTotal,
        additions: [{ id: 4, amount: 100, date: "2020-01-01" }], recurring: [], caps: [] },
    ],
    events: [{ id: 5, name: "Trip", days: [{ date: "2026-01-15", allocations: [{ pool_id: 1, hours: 22.8 }] }] }],
  }));
  try {
    await act(async () => root.render(<App />));
    const number = container.querySelector(".balance-number")!;
    expect(number.textContent).toBe(`${balance}hours`);
    expect(number.classList.contains("is-negative")).toBe(false);
    expect(Array.from(container.querySelectorAll(".breakdown-item strong"), (node) => node.textContent)).toEqual([accrued, used]);
    const chart = container.querySelector<HTMLElement>('[data-testid="chart"]')!;
    const dates: string[] = JSON.parse(chart.dataset.dates!);
    const histories: Record<number, BalancePoint[]> = JSON.parse(chart.dataset.histories!);
    expect(dates[0]).toBe("2020-01-01");
    for (const history of Object.values(histories)) {
      expect(history.map((point) => point.date)).toEqual(dates);
    }
    expect(histories[1]?.find((point) => point.date === "2026-01-15")?.balance).toBe(0);
    expect(histories[2]?.find((point) => point.date === "2026-01-15")?.balance).toBe(100);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.useRealTimers();
    HTMLElement.prototype.scrollTo = previousScrollTo;
    vi.unstubAllGlobals();
  }
});

it("keeps pool actions outside the reorder button and activates keyboard dragging only on the handle", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const pool = (id: number, name: string) => ({ id, name, additions: [], recurring: [], caps: [] });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(), pools: [pool(1, "Vacation"), pool(2, "Holiday")], next_id: 3 }));
  const key = async (target: HTMLElement, code: string) => {
    await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: code === "Space" ? " " : code, code, bubbles: true, cancelable: true })));
  };
  try {
    await act(async () => root.render(<App />));
    const card = container.querySelector("article.pool-card")!;
    expect(card.hasAttribute("role")).toBe(false);
    expect(card.hasAttribute("tabindex")).toBe(false);
    const handle = card.querySelector<HTMLButtonElement>('[aria-label="Reorder Vacation"]')!;
    expect(handle.tagName).toBe("BUTTON");
    expect(handle.querySelector("button")).toBeNull();
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();
    const select = card.querySelector<HTMLButtonElement>(".pool-select-button")!;
    await key(select, "Space");
    expect(container.querySelector(".pool-card-dragging")).toBeNull();
    await act(async () => select.click());
    expect(select.getAttribute("aria-pressed")).toBe("true");
    await act(async () => handle.focus());
    await key(handle, "Space");
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".pool-card-dragging")).not.toBeNull();
    await key(handle, "Escape");
    expect(handle.getAttribute("aria-pressed")).not.toBe("true");
    await act(async () => card.querySelector<HTMLButtonElement>('[aria-label="View information for Vacation"]')!.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Vacation information");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("does not offer reordering for a single pool", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(), pools: [{ id: 1, name: "Vacation", additions: [], recurring: [], caps: [] }], next_id: 2 }));
  try {
    await act(async () => root.render(<App />));
    expect(container.querySelector(".pool-drag-handle")).toBeNull();
    expect(container.querySelector("article")?.hasAttribute("tabindex")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("highlights events immediately and switches zoom modes with a visible button", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const previousScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyStore(),
    pools: [{ id: 1, name: "Vacation", additions: [], recurring: [], caps: [] }],
    events: [{ id: 2, name: "Trip", days: [{ date: "2026-10-12", allocations: [{ pool_id: 1, hours: 8 }] }] }], next_id: 3,
  }));
  try {
    await act(async () => root.render(<App />));
    const highlight = container.querySelector<HTMLButtonElement>('[aria-label="Highlight Trip in graph"]')!;
    await act(async () => highlight.click());
    expect(highlight.getAttribute("aria-pressed")).toBe("true");
    await act(async () => highlight.click());
    expect(highlight.getAttribute("aria-pressed")).toBe("false");
    const zoom = container.querySelector<HTMLButtonElement>('[aria-label="Zoom to Trip"]')!;
    expect(zoom.textContent).toBe("Zoom");
    await act(async () => zoom.click());
    expect(highlight.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="chart"]')?.getAttribute("data-zoom")).toBe("true");
    expect(zoom.textContent).toBe("Widen");
    await act(async () => zoom.click());
    expect(container.querySelector('[data-testid="chart"]')?.getAttribute("data-wide")).toBe("true");
    expect(zoom.textContent).toBe("Zoom");
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollTo = previousScrollTo;
    vi.unstubAllGlobals();
  }
});
